import type { SQSClient } from "@aws-sdk/client-sqs";
import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { SQS_CLIENT } from "../../aws/aws.module";
import type { AppEnv } from "../../config/configuration";
import { chunkMarkdown } from "../../rag/chunker";
import { VectorStoreService } from "../../rag/vector-store.service";
import { RealtimeService } from "../../realtime/realtime.service";
import { DocumentEntity } from "../document.entity";
import { S3Service } from "../s3.service";
import { extractText } from "../text-extractor";
import type { IngestMessage } from "./messages";
import { SqsConsumer } from "./sqs-consumer.base";

/**
 * Ingesta de punta a punta: descarga el documento de S3, extrae texto, lo
 * trocea, genera los embeddings y los persiste en pgvector. Va empujando el
 * progreso (`chunking` → `embedding` → `ready`/`failed`) por WebSocket.
 */
@Injectable()
export class IngestConsumer extends SqsConsumer<IngestMessage> {
  constructor(
    @Inject(SQS_CLIENT) sqs: SQSClient,
    config: ConfigService<AppEnv, true>,
    @InjectRepository(DocumentEntity)
    private readonly documents: Repository<DocumentEntity>,
    private readonly s3: S3Service,
    private readonly vectorStore: VectorStoreService,
    private readonly realtime: RealtimeService,
  ) {
    super(sqs, config.get("SQS_INGEST_QUEUE", { infer: true }), "IngestConsumer");
  }

  protected async handle(msg: IngestMessage): Promise<void> {
    const { documentId, userId, s3Key, filename, mimeType } = msg;
    await this.setStatus(userId, documentId, "chunking");

    try {
      // 1. Extracción + troceado.
      const buffer = await this.s3.download(s3Key);
      const text = await extractText(buffer, mimeType, filename);
      const chunks = chunkMarkdown(text, filename);

      if (chunks.length === 0) {
        await this.fail(userId, documentId, "El archivo no contiene texto indexable");
        return; // fallo permanente: no relanzar (se borra el mensaje)
      }

      await this.documents.update(
        { id: documentId, userId },
        { chunkCount: chunks.length },
      );
      this.realtime.emitDocumentStatus(userId, {
        id: documentId,
        status: "chunking",
        chunkCount: chunks.length,
      });

      // 2. Embeddings + persistencia en pgvector.
      await this.setStatus(userId, documentId, "embedding", chunks.length);
      await this.vectorStore.upsertChunks(chunks, { userId, documentId });

      await this.documents.update(
        { id: documentId, userId },
        { status: "ready", chunkCount: chunks.length, errorMessage: null },
      );
      this.realtime.emitDocumentStatus(userId, {
        id: documentId,
        status: "ready",
        chunkCount: chunks.length,
      });
      this.logger.log(
        `Documento ${documentId} listo: ${chunks.length} chunks embebidos (user ${userId})`,
      );
    } catch (error) {
      // Errores de extracción/troceo/embeddings se tratan como permanentes
      // (archivo corrupto, etc.): marcar `failed` y retornar (no relanzar).
      const message = error instanceof Error ? error.message : String(error);
      await this.fail(userId, documentId, message);
    }
  }

  private async setStatus(
    userId: string,
    documentId: string,
    status: "chunking" | "embedding",
    chunkCount?: number,
  ): Promise<void> {
    await this.documents.update({ id: documentId, userId }, { status });
    this.realtime.emitDocumentStatus(userId, {
      id: documentId,
      status,
      ...(chunkCount !== undefined ? { chunkCount } : {}),
    });
  }

  private async fail(
    userId: string,
    documentId: string,
    message: string,
  ): Promise<void> {
    this.logger.error(`Ingesta falló para ${documentId}: ${message}`);
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
