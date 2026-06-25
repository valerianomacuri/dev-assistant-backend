import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import type { AppEnv } from "../config/configuration";
import { VectorStoreService } from "../rag/vector-store.service";
import { RealtimeService } from "../realtime/realtime.service";
import { DocumentEntity } from "./document.entity";
import type { IngestMessage } from "./ingestion/messages";
import { SqsProducerService } from "./ingestion/sqs-producer.service";
import { S3Service } from "./s3.service";
import { isSupported } from "./text-extractor";

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);
  private readonly ingestQueue: string;

  constructor(
    @InjectRepository(DocumentEntity)
    private readonly documents: Repository<DocumentEntity>,
    private readonly s3: S3Service,
    private readonly vectorStore: VectorStoreService,
    private readonly producer: SqsProducerService,
    private readonly realtime: RealtimeService,
    config: ConfigService<AppEnv, true>,
  ) {
    this.ingestQueue = config.get("SQS_INGEST_QUEUE", { infer: true });
  }

  list(userId: string): Promise<DocumentEntity[]> {
    return this.documents.find({
      where: { userId },
      order: { createdAt: "DESC" },
    });
  }

  /**
   * Sube el archivo a S3 y dispara la ingesta ASÍNCRONA: registra el documento
   * (status `queued`), lo encola en SQS (`ingest`) y retorna de inmediato.
   * El troceado y los embeddings ocurren en el worker (ver `ingestion/`), que
   * va empujando el progreso por WebSocket.
   */
  async ingest(
    userId: string,
    file: Express.Multer.File,
  ): Promise<DocumentEntity> {
    if (!file) {
      throw new BadRequestException("No se recibió ningún archivo");
    }
    if (!isSupported(file.mimetype, file.originalname)) {
      throw new BadRequestException(
        `Tipo de archivo no soportado: ${file.mimetype || file.originalname}. ` +
          `Formatos permitidos: .md, .txt, .pdf`,
      );
    }

    // 1. Registrar el documento (status queued).
    let doc = await this.documents.save(
      this.documents.create({
        userId,
        filename: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        s3Key: "",
        status: "queued",
      }),
    );

    const s3Key = `users/${userId}/${doc.id}/${file.originalname}`;

    try {
      // 2. Subir el original a S3.
      await this.s3.upload(s3Key, file.buffer, file.mimetype);
      doc.s3Key = s3Key;
      doc = await this.documents.save(doc);

      // 3. Encolar para troceado/embeddings asíncronos.
      const message: IngestMessage = {
        documentId: doc.id,
        userId,
        s3Key,
        filename: file.originalname,
        mimeType: file.mimetype,
      };
      await this.producer.send(this.ingestQueue, message);

      this.realtime.emitDocumentStatus(userId, {
        id: doc.id,
        status: "queued",
      });
      this.logger.log(`Documento ${doc.id} encolado para ingesta (user ${userId})`);
      return doc;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Fallo al encolar ${doc.id}: ${message}`);
      // Limpieza best-effort de lo subido.
      await this.safeCleanup(userId, doc.id, s3Key);
      doc.status = "failed";
      doc.errorMessage = message.slice(0, 500);
      await this.documents.save(doc);
      throw new BadRequestException(
        `No se pudo iniciar el procesamiento del archivo: ${message}`,
      );
    }
  }

  /** Borra el documento: chunks del RAG, objeto en S3 y la fila. */
  async remove(userId: string, documentId: string): Promise<void> {
    const doc = await this.documents.findOne({
      where: { id: documentId, userId },
    });
    if (!doc) {
      throw new NotFoundException("Documento no encontrado");
    }
    await this.safeCleanup(userId, documentId, doc.s3Key);
    await this.documents.remove(doc);
  }

  private async safeCleanup(
    userId: string,
    documentId: string,
    s3Key: string,
  ): Promise<void> {
    try {
      await this.vectorStore.deleteByDocument(userId, documentId);
    } catch (e) {
      this.logger.warn(`No se pudieron borrar chunks de ${documentId}: ${e}`);
    }
    if (s3Key) {
      try {
        await this.s3.delete(s3Key);
      } catch (e) {
        this.logger.warn(`No se pudo borrar S3 ${s3Key}: ${e}`);
      }
    }
  }
}
