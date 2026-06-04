import type { SQSClient } from "@aws-sdk/client-sqs";
import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { SQS_CLIENT } from "../../aws/aws.module";
import type { Chunk } from "../../common/types";
import type { AppEnv } from "../../config/configuration";
import { RealtimeService } from "../../realtime/realtime.service";
import { VectorStoreService } from "../../rag/vector-store.service";
import { DocumentEntity } from "../document.entity";
import { S3Service } from "../s3.service";
import type { EmbeddingsMessage } from "./messages";
import { SqsConsumer } from "./sqs-consumer.base";

/**
 * Etapa 2 de la ingesta: descarga los chunks (claim-check en S3), genera sus
 * embeddings y los persiste en pgvector. Marca el documento `ready`/`failed`
 * y emite el estado por WebSocket.
 */
@Injectable()
export class EmbeddingsConsumer extends SqsConsumer<EmbeddingsMessage> {
  constructor(
    @Inject(SQS_CLIENT) sqs: SQSClient,
    config: ConfigService<AppEnv, true>,
    @InjectRepository(DocumentEntity)
    private readonly documents: Repository<DocumentEntity>,
    private readonly s3: S3Service,
    private readonly vectorStore: VectorStoreService,
    private readonly realtime: RealtimeService,
  ) {
    super(
      sqs,
      config.get("SQS_EMBEDDINGS_QUEUE", { infer: true }),
      "EmbeddingsConsumer",
    );
  }

  protected async handle(msg: EmbeddingsMessage): Promise<void> {
    const { documentId, userId, chunksKey, count } = msg;
    await this.documents.update(
      { id: documentId, userId },
      { status: "embedding" },
    );
    this.realtime.emitDocumentStatus(userId, {
      id: documentId,
      status: "embedding",
      chunkCount: count,
    });

    try {
      const raw = await this.s3.download(chunksKey);
      const chunks = JSON.parse(raw.toString("utf-8")) as Chunk[];
      await this.vectorStore.addChunks(chunks, { userId, documentId });

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
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Embeddings falló para ${documentId}: ${message}`);
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
}
