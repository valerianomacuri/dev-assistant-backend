import { randomUUID } from "crypto";
import pg from "pg";
import config from "../config.js";

/**
 * Puntero de la conversación activa.
 *
 * El historial completo lo guarda el checkpointer (ver checkpointer.ts), pero
 * necesitamos recordar entre reinicios *cuál* `thread_id` es el activo para
 * retomar siempre la misma conversación. `/clear` simplemente apunta a un
 * `thread_id` nuevo; el anterior queda archivado en los checkpoints de Postgres.
 */
const TABLE_NAME = "cli_active_conversation";

let pool: pg.Pool | null = null;

function getPool(): pg.Pool {
  if (!pool) {
    pool = new pg.Pool({ connectionString: config.databaseUrl });
  }
  return pool;
}

async function ensureTable(): Promise<void> {
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
      id          INTEGER PRIMARY KEY DEFAULT 1,
      thread_id   TEXT NOT NULL,
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT single_row CHECK (id = 1)
    )
  `);
}

export async function getActiveThreadId(): Promise<string | null> {
  await ensureTable();
  const result = await getPool().query<{ thread_id: string }>(
    `SELECT thread_id FROM ${TABLE_NAME} WHERE id = 1`,
  );
  return result.rows[0]?.thread_id ?? null;
}

export async function setActiveThreadId(threadId: string): Promise<void> {
  await ensureTable();
  await getPool().query(
    `INSERT INTO ${TABLE_NAME} (id, thread_id, updated_at)
     VALUES (1, $1, now())
     ON CONFLICT (id) DO UPDATE
       SET thread_id = EXCLUDED.thread_id,
           updated_at = now()`,
    [threadId],
  );
}

/**
 * Genera un `thread_id` nuevo para una conversación limpia.
 */
export function newThreadId(): string {
  return `conv-${randomUUID()}`;
}

export async function closeStore(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
