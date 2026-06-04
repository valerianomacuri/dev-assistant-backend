import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import config from "../config.js";

/**
 * Checkpointer persistente de LangGraph sobre Postgres.
 *
 * Reemplaza al `MemorySaver` en memoria: guarda el estado completo del grafo
 * (mensajes humanos, de IA y tool calls) indexado por `thread_id`, de modo que
 * la conversación sobrevive entre reinicios del CLI.
 */
let saver: PostgresSaver | null = null;

export async function getCheckpointer(): Promise<PostgresSaver> {
  if (!saver) {
    const instance = PostgresSaver.fromConnString(config.databaseUrl);
    // Crea las tablas de checkpoints la primera vez (idempotente).
    await instance.setup();
    saver = instance;
  }
  return saver;
}

export async function closeCheckpointer(): Promise<void> {
  if (saver) {
    await saver.end();
    saver = null;
  }
}
