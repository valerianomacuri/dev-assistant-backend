import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import * as path from "path";
import * as fs from "fs";
import type { Chunk, SearchResult } from "../types.js";

interface ChunkRow {
  id: string;
  content: string;
  source: string;
  heading: string;
  position: number;
  char_count: number;
}
interface SearchRow extends ChunkRow {
  distance: number;
}
function serializeEmbedding(embedding: number[]): Buffer {
  const float32 = new Float32Array(embedding);
  return Buffer.from(float32.buffer);
}

export class VectorStore {
  private db: Database.Database;
  constructor(dbPath: string) {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this.db = new Database(dbPath);
    sqliteVec.load(this.db);

    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = NORMAL");

    this.createTables();
  }
  private createTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chunks(
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        source TEXT NOT NULL,
        heading TEXT NOT NULL,
        position INTEGER NOT NULL,
        char_count INTEGER NOT NULL
      )
      `);

    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS chunk_embeddings USING vec0(
        chunk_id TEXT PARTITION KEY,
        embedding float[1536]
      )
      `);
  }
  insert(chunk: Chunk, embedding: number[]): void {
    const insertChunk = this.db.prepare(`
      INSERT OR REPLACE INTO chunks
      (id,content,source,heading,position,char_count)
      VALUES(?,?,?,?,?,?)
      `);
    insertChunk.run(
      chunk.id,
      chunk.content,
      chunk.metadata.source,
      chunk.metadata.heading,
      chunk.metadata.position,
      chunk.metadata.charCount,
    );

    const insertEmbedding = this.db.prepare(
      `
      INSERT OR REPLACE INTO chunk_embeddings
      (chunk_id,embedding)
      VALUES(?,?)
      `,
    );
    insertEmbedding.run(chunk.id, serializeEmbedding(embedding));
  }
  search(queryEmbedding: number[], topk: number): SearchResult[] {
    const stmt = this.db.prepare(`
      SELECT c.id, c.content, c.source, c.heading, c.position, c.char_count, e.distance
      FROM chunk_embeddings e
      JOIN chunks c ON c.id = e.chunk_id
      WHERE e.embedding MATCH ?
      AND k = ?
      ORDER BY e.distance
      `);
    const rows = stmt.all(
      serializeEmbedding(queryEmbedding),
      topk,
    ) as SearchRow[];
    return rows.map((row) => ({
      chunk: {
        id: row.id,
        content: row.content,
        metadata: {
          source: row.source,
          heading: row.heading,
          position: row.position,
          charCount: row.char_count,
        },
      },
      score: 1 - row.distance / 2,
    }));
  }
  clear(): void {
    this.db.exec("DELETE FROM chunk_embeddings");
    this.db.exec("DELETE FROM chunks");
  }
  get size(): number {
    const row = this.db
      .prepare(`SELECT COUNT(*) as count FROM chunks`)
      .get() as { count: number };
    return row.count;
  }
  close(): void {
    this.db.close();
  }
}
