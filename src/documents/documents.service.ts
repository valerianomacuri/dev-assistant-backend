import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { chunkMarkdown } from "../rag/chunker";
import { VectorStoreService } from "../rag/vector-store.service";
import { DocumentEntity } from "./document.entity";
import { S3Service } from "./s3.service";
import { extractText, isSupported } from "./text-extractor";

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    @InjectRepository(DocumentEntity)
    private readonly documents: Repository<DocumentEntity>,
    private readonly s3: S3Service,
    private readonly vectorStore: VectorStoreService,
  ) {}

  list(userId: string): Promise<DocumentEntity[]> {
    return this.documents.find({
      where: { userId },
      order: { createdAt: "DESC" },
    });
  }

  /**
   * Sube el archivo a S3 e ingiere su contenido en el RAG del usuario,
   * de forma síncrona. Si la ingesta falla, marca el documento como `failed`
   * y limpia lo que se haya subido/insertado.
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

    // 1. Registrar el documento (status processing).
    let doc = await this.documents.save(
      this.documents.create({
        userId,
        filename: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        s3Key: "",
        status: "processing",
      }),
    );

    const s3Key = `users/${userId}/${doc.id}/${file.originalname}`;

    try {
      // 2. Subir a S3.
      await this.s3.upload(s3Key, file.buffer, file.mimetype);
      doc.s3Key = s3Key;

      // 3. Extraer texto y 4. trocear.
      const text = await extractText(
        file.buffer,
        file.mimetype,
        file.originalname,
      );
      const chunks = chunkMarkdown(text, file.originalname);
      if (chunks.length === 0) {
        throw new BadRequestException("El archivo no contiene texto indexable");
      }

      // 5. Ingerir en el vector store del usuario.
      await this.vectorStore.addChunks(chunks, { userId, documentId: doc.id });

      doc.status = "ready";
      doc.chunkCount = chunks.length;
      doc.errorMessage = null;
      doc = await this.documents.save(doc);
      this.logger.log(
        `Documento ${doc.id} ingerido: ${chunks.length} chunks (user ${userId})`,
      );
      return doc;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Fallo al ingerir ${doc.id}: ${message}`);
      // Limpieza best-effort.
      await this.safeCleanup(userId, doc.id, s3Key);
      doc.status = "failed";
      doc.errorMessage = message.slice(0, 500);
      await this.documents.save(doc);
      throw error instanceof BadRequestException
        ? error
        : new BadRequestException(`No se pudo procesar el archivo: ${message}`);
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
