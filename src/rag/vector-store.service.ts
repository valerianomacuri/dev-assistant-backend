import { PGVectorStore } from "@langchain/community/vectorstores/pgvector";
import { Document } from "@langchain/core/documents";
import {
  Inject,
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Embeddings } from "@langchain/core/embeddings";
import type { AppEnv } from "../config/configuration";
import type { Chunk, RetrievedChunk } from "../common/types";
import { EMBEDDINGS } from "./embeddings.provider";

const TABLE_NAME = "chunks";
const EMBEDDING_DIMENSIONS = 1536;

/** Identifica al dueño de un chunk dentro del vector store compartido. */
export interface ChunkOwner {
  userId: string;
  documentId: string;
}

/**
 * Vector store sobre Postgres + pgvector (PGVectorStore de LangChain).
 *
 * A diferencia de la versión CLI (tabla `chunks` global), aquí cada chunk
 * lleva `userId` y `documentId` en su metadata, y todas las operaciones se
 * filtran por usuario para garantizar el aislamiento multi-tenant.
 */
@Injectable()
export class VectorStoreService implements OnModuleInit, OnModuleDestroy {
  private store!: PGVectorStore;

  constructor(
    @Inject(EMBEDDINGS) private readonly embeddings: Embeddings,
    private readonly config: ConfigService<AppEnv, true>,
  ) { }

  async onModuleInit(): Promise<void> {
    this.store = await PGVectorStore.initialize(this.embeddings, {
      postgresConnectionOptions: {
        connectionString: this.config.get("DATABASE_URL", { infer: true }),
        ssl: this.config.get("NODE_ENV", { infer: true }) === "production"
          ? { rejectUnauthorized: false }
          : false,
      },
      tableName: TABLE_NAME,
      columns: {
        idColumnName: "id",
        contentColumnName: "content",
        metadataColumnName: "metadata",
        vectorColumnName: "embedding",
      },
      distanceStrategy: "cosine",
      // Devuelve un score normalizado 0–1 (mayor = más similar).
      scoreNormalization: "similarity",
      dimensions: EMBEDDING_DIMENSIONS,
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.store?.end();
  }

  /** Inserta los chunks de un documento, marcados con su dueño. */
  async addChunks(chunks: Chunk[], owner: ChunkOwner): Promise<void> {
    if (chunks.length === 0) return;
    const documents = chunks.map(
      (chunk) =>
        new Document({
          pageContent: chunk.content,
          metadata: {
            id: chunk.id,
            userId: owner.userId,
            documentId: owner.documentId,
            source: chunk.metadata.source,
            heading: chunk.metadata.heading,
            position: chunk.metadata.position,
            charCount: chunk.metadata.charCount,
          },
        }),
    );
    await this.store.addDocuments(documents);
  }

  /**
   * Inserta los chunks de un documento de forma idempotente: borra primero los
   * chunks previos del documento (si los hubiera) y luego los reinserta. Seguro
   * ante reentregas de SQS (at-least-once).
   */
  async upsertChunks(chunks: Chunk[], owner: ChunkOwner): Promise<void> {
    await this.deleteByDocument(owner.userId, owner.documentId);
    await this.addChunks(chunks, owner);
  }

  /** Búsqueda semántica acotada a los documentos del usuario. */
  async search(
    userId: string,
    query: string,
    topK: number,
  ): Promise<RetrievedChunk[]> {
    const results = await this.store.similaritySearchWithScore(query, topK, {
      userId,
    });
    return results.map(([doc, score]) => this.toRetrievedChunk(doc, score));
  }

  /** Elimina los chunks de un documento concreto del usuario. */
  async deleteByDocument(userId: string, documentId: string): Promise<void> {
    await this.store.pool.query(
      `DELETE FROM "${TABLE_NAME}"
       WHERE metadata->>'userId' = $1 AND metadata->>'documentId' = $2`,
      [userId, documentId],
    );
  }

  /** Cuenta cuántos chunks tiene el usuario (para diagnósticos). */
  async countByUser(userId: string): Promise<number> {
    const result = await this.store.pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM "${TABLE_NAME}"
       WHERE metadata->>'userId' = $1`,
      [userId],
    );
    return parseInt(result.rows[0]?.count ?? "0", 10);
  }

  private toRetrievedChunk(doc: Document, score: number): RetrievedChunk {
    const m = doc.metadata ?? {};
    return {
      id: String(m["id"] ?? ""),
      content: doc.pageContent,
      score,
      metadata: {
        source: String(m["source"] ?? ""),
        heading: String(m["heading"] ?? ""),
        position: Number(m["position"] ?? 0),
        charCount: Number(m["charCount"] ?? 0),
      },
    };
  }
}
