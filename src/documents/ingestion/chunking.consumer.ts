import type { SQSClient } from "@aws-sdk/client-sqs";
import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { SQS_CLIENT } from "../../aws/aws.module";
import type { AppEnv } from "../../config/configuration";
import { chunkMarkdown } from "../../rag/chunker";
import { RealtimeService } from "../../realtime/realtime.service";
import { DocumentEntity } from "../document.entity";
import { S3Service } from "../s3.service";
import { extractText } from "../text-extractor";
import type { ChunkingMessage, EmbeddingsMessage } from "./messages";
import { SqsConsumer } from "./sqs-consumer.base";
import { SqsProducerService } from "./sqs-producer.service";

/**
 * Etapa 1 de la ingesta: descarga el documento de S3, extrae texto y lo
 * trocea. Sube los chunks como JSON a S3 (claim-check) y encola la etapa de
 * embeddings. Emite progreso por WebSocket.
 */
@Injectable()
export class ChunkingConsumer extends SqsConsumer<ChunkingMessage> {
  private readonly embeddingsQueue: string;

  constructor(
    @Inject(SQS_CLIENT) sqs: SQSClient,
    config: ConfigService<AppEnv, true>,
    @InjectRepository(DocumentEntity)
    private readonly documents: Repository<DocumentEntity>,
    private readonly s3: S3Service,
    private readonly producer: SqsProducerService,
    private readonly realtime: RealtimeService,
  ) {
    super(sqs, config.get("SQS_CHUNKING_QUEUE", { infer: true }), "ChunkingConsumer");
    this.embeddingsQueue = config.get("SQS_EMBEDDINGS_QUEUE", { infer: true });
  }

  protected async handle(msg: ChunkingMessage): Promise<void> {
    const { documentId, userId, s3Key, filename, mimeType } = msg;
    await this.setStatus(userId, documentId, "chunking");

    try {
      const buffer = await this.s3.download(s3Key);
      const text = await extractText(buffer, mimeType, filename);
      const chunks = chunkMarkdown(text, filename);

      if (chunks.length === 0) {
        await this.fail(userId, documentId, "El archivo no contiene texto indexable");
        return; // fallo permanente: no relanzar (se borra el mensaje)
      }

      const chunksKey = `users/${userId}/${documentId}/chunks.json`;
      await this.s3.uploadJson(chunksKey, chunks);
      await this.documents.update(
        { id: documentId, userId },
        { chunkCount: chunks.length },
      );
      this.realtime.emitDocumentStatus(userId, {
        id: documentId,
        status: "chunking",
        chunkCount: chunks.length,
      });

      const next: EmbeddingsMessage = {
        documentId,
        userId,
        chunksKey,
        count: chunks.length,
      };
      await this.producer.send(this.embeddingsQueue, next);
      this.logger.log(
        `Documento ${documentId} troceado: ${chunks.length} chunks → embeddings`,
      );
    } catch (error) {
      // Errores de extracción/troceo son permanentes (archivo corrupto, etc.).
      const message = error instanceof Error ? error.message : String(error);
      await this.fail(userId, documentId, message);
    }
  }

  private async setStatus(
    userId: string,
    documentId: string,
    status: "chunking",
  ): Promise<void> {
    await this.documents.update({ id: documentId, userId }, { status });
    this.realtime.emitDocumentStatus(userId, { id: documentId, status });
  }

  private async fail(
    userId: string,
    documentId: string,
    message: string,
  ): Promise<void> {
    this.logger.error(`Chunking falló para ${documentId}: ${message}`);
    await this.documents.update(
      { id: documentId, userId },
      { status: "failed", errorMessage: message.slice(0, 500) },
    );
    this.realtime.emitDocumentStatus(userId, {
      id: documentId,
      status: "failed",
      errorMessage: message.slice(0, 500),
    });
  }
}
