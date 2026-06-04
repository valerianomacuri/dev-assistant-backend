import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import {
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AppEnv } from "../config/configuration";

/**
 * Checkpointer persistente de LangGraph sobre Postgres (singleton).
 *
 * Guarda el estado completo del grafo (mensajes humanos, de IA y tool calls)
 * indexado por `thread_id`. En la API, el `thread_id` es por usuario
 * (`conv-<userId>`), de modo que cada usuario tiene su propia conversación.
 */
@Injectable()
export class CheckpointerService implements OnModuleInit, OnModuleDestroy {
  private saver!: PostgresSaver;

  constructor(private readonly config: ConfigService<AppEnv, true>) {}

  async onModuleInit(): Promise<void> {
    this.saver = PostgresSaver.fromConnString(
      this.config.get("DATABASE_URL", { infer: true }),
    );
    // Crea las tablas de checkpoints la primera vez (idempotente).
    await this.saver.setup();
  }

  async onModuleDestroy(): Promise<void> {
    await this.saver?.end();
  }

  get(): PostgresSaver {
    return this.saver;
  }

  /** Borra la conversación de un usuario (todos sus checkpoints). */
  async deleteThread(threadId: string): Promise<void> {
    await this.saver.deleteThread(threadId);
  }
}
