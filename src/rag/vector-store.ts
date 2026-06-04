import { PGVectorStore } from "@langchain/community/vectorstores/pgvector";
import { Document } from "@langchain/core/documents";
import config from "../config.js";
import { embeddings } from "./embeddings.js";
import type { Chunk, RetrievedChunk } from "../types.js";

const TABLE_NAME = "chunks";
const EMBEDDING_DIMENSIONS = 1536;

function toDocument(chunk: Chunk): Document {
  return new Document({
    pageContent: chunk.content,
    metadata: {
      id: chunk.id,
      source: chunk.metadata.source,
      heading: chunk.metadata.heading,
      position: chunk.metadata.position,
      charCount: chunk.metadata.charCount,
    },
  });
}

function documentToChunk(doc: Document): Chunk {
  const m = doc.metadata ?? {};
  return {
    id: String(m["id"] ?? ""),
    content: doc.pageContent,
    metadata: {
      source: String(m["source"] ?? ""),
      heading: String(m["heading"] ?? ""),
      position: Number(m["position"] ?? 0),
      charCount: Number(m["charCount"] ?? 0),
    },
  };
}

/**
 * Vector store sobre Postgres + pgvector usando PGVectorStore de LangChain.
 * Reemplaza la implementación previa basada en SQLite + sqlite-vec.
 *
 * PGVectorStore genera los embeddings internamente, así que `addChunks`
 * y `search` reciben texto y delegan el embedding en la instancia compartida.
 */
export class VectorStore {
  private constructor(private readonly store: PGVectorStore) {}

  static async create(): Promise<VectorStore> {
    const store = await PGVectorStore.initialize(embeddings, {
      postgresConnectionOptions: { connectionString: config.databaseUrl },
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
    return new VectorStore(store);
  }

  async addChunks(chunks: Chunk[]): Promise<void> {
    if (chunks.length === 0) return;
    // No pasamos ids: la columna id es UUID autogenerada por PGVectorStore.
    // El id lógico del chunk se conserva en metadata.id.
    const documents = chunks.map(toDocument);
    await this.store.addDocuments(documents);
  }

  async search(query: string, topk: number): Promise<RetrievedChunk[]> {
    const results = await this.store.similaritySearchWithScore(query, topk);
    return results.map(([doc, score]) => ({
      ...documentToChunk(doc),
      score,
    }));
  }

  async clear(): Promise<void> {
    await this.store.pool.query(`DELETE FROM "${this.store.tableName}"`);
  }

  async size(): Promise<number> {
    const result = await this.store.pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM "${this.store.tableName}"`,
    );
    return parseInt(result.rows[0]?.count ?? "0", 10);
  }

  async close(): Promise<void> {
    await this.store.end();
  }
}
