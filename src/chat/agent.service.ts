import { createAgent } from "langchain";
import { GraphRecursionError } from "@langchain/langgraph";
import {
  HumanMessage,
  type AIMessageChunk,
  type BaseMessage,
  type ToolMessage,
} from "@langchain/core/messages";
import { tool } from "@langchain/core/tools";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Observable } from "rxjs";
import { z } from "zod";
import type { AppEnv } from "../config/configuration";
import { extractText, CHAT_MODEL } from "../llm/chat-model.provider";
import { RetrieverService } from "../rag/retriever.service";
import { StatsService } from "../stats/stats.service";
import { computeCostUsd } from "../stats/pricing";
import { CheckpointerService } from "./checkpointer.provider";
import { AGENT_SYSTEM_PROMPT } from "./system-prompt";

const MAX_TOOL_CALLS = 8;
// Cada ciclo agente→tools→agente consume ~2 supersteps en el grafo.
const RECURSION_LIMIT = 2 * MAX_TOOL_CALLS + 1;

/** Evento SSE emitido al cliente durante el streaming. */
export interface ChatStreamEvent {
  data: string;
  type?: "token" | "done" | "error";
}

/** Un mensaje del historial de la conversación. */
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);
  private readonly modelName: string;

  constructor(
    @Inject(CHAT_MODEL) private readonly model: BaseChatModel,
    private readonly retriever: RetrieverService,
    private readonly checkpointer: CheckpointerService,
    private readonly stats: StatsService,
    config: ConfigService<AppEnv, true>,
  ) {
    this.modelName = config.get("ANTHROPIC_MODEL", { infer: true });
  }

  private threadId(userId: string): string {
    return `conv-${userId}`;
  }

  /**
   * Persiste las estadísticas del turno. Best-effort: un fallo de persistencia
   * no debe romper el stream que ya respondió al usuario.
   */
  private async persistStats(
    userId: string,
    inputTokens: number,
    outputTokens: number,
    toolsUsed: string[],
    limitReached: boolean,
  ): Promise<void> {
    try {
      await this.stats.record({
        userId,
        inputTokens,
        outputTokens,
        toolsUsed,
        limitReached,
        model: this.modelName,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`No se pudieron guardar las stats (user ${userId}): ${message}`);
    }
  }

  /**
   * Construye un agente con la tool `search_docs` acotada al `userId`.
   * Las tools de LangChain son estáticas, así que la creamos por usuario
   * capturando su id en el closure (aislamiento del RAG).
   */
  private buildAgent(userId: string): ReturnType<typeof createAgent> {
    const searchDocsTool = tool(
      async (input: { query: string; top_k?: number }) => {
        const topK = Math.min(input.top_k ?? 5, 10);
        const chunks = await this.retriever.retrieveContext(
          userId,
          input.query,
          topK,
        );
        if (chunks.length === 0) {
          return (
            "No se encontraron documentos relevantes para esta consulta. " +
            "Asegúrate de haber subido documentación a tu base de conocimiento."
          );
        }
        const results = chunks
          .map((chunk) => {
            const source = chunk.metadata.source;
            const section = chunk.metadata.heading;
            const score = (chunk.score * 100).toFixed(0);
            return `[FUENTE: ${source} | Sección: ${section} | Relevancia: ${score}%\n${chunk.content}]`;
          })
          .join("\n\n---\n\n");
        return `Se encontraron ${chunks.length} fragmentos relevantes:\n\n${results}`;
      },
      {
        name: "search_docs",
        description:
          "Busca información en la documentación del usuario usando búsqueda semántica. " +
          "Úsala cuando el usuario pregunta sobre conceptos, APIs o cualquier información " +
          "que podría estar en los documentos que subió. " +
          "Retorna los fragmentos más relevantes con su fuente y sección.",
        schema: z.object({
          query: z
            .string()
            .describe("La pregunta o tema a buscar en la documentación."),
          top_k: z
            .number()
            .optional()
            .describe(
              "Número de fragmentos a recuperar (default: 5, máximo: 10).",
            ),
        }),
      },
    );

    return createAgent({
      model: this.model,
      tools: [searchDocsTool],
      systemPrompt: AGENT_SYSTEM_PROMPT,
      checkpointer: this.checkpointer.get(),
    });
  }

  /**
   * Procesa un turno y emite la respuesta del agente como un stream de eventos
   * SSE: tokens de texto en vivo y un evento `done` final con metadata.
   */
  stream(userId: string, userMessage: string): Observable<ChatStreamEvent> {
    return new Observable<ChatStreamEvent>((subscriber) => {
      let cancelled = false;

      void (async () => {
        const agent = this.buildAgent(userId);
        const toolsUsed: string[] = [];
        let inputTokens = 0;
        let outputTokens = 0;

        try {
          const stream = await agent.stream(
            { messages: [new HumanMessage(userMessage)] },
            {
              configurable: { thread_id: this.threadId(userId) },
              recursionLimit: RECURSION_LIMIT,
              streamMode: "messages",
            },
          );

          for await (const event of stream) {
            if (cancelled) break;
            const [message] = event as [BaseMessage, Record<string, unknown>];
            const type = message.getType();

            if (type === "ai") {
              const usage = (message as AIMessageChunk).usage_metadata;
              if (usage) {
                inputTokens += usage.input_tokens ?? 0;
                outputTokens += usage.output_tokens ?? 0;
              }
              const text = extractText(message.content);
              if (text) {
                subscriber.next({ type: "token", data: text });
              }
            } else if (type === "tool") {
              toolsUsed.push((message as ToolMessage).name ?? "desconocida");
            }
          }

          const uniqueTools = [...new Set(toolsUsed)];
          await this.persistStats(
            userId,
            inputTokens,
            outputTokens,
            uniqueTools,
            false,
          );
          subscriber.next({
            type: "done",
            data: JSON.stringify({
              toolsUsed: uniqueTools,
              inputTokens,
              outputTokens,
              model: this.modelName,
              costUsd: computeCostUsd(this.modelName, inputTokens, outputTokens),
            }),
          });
          subscriber.complete();
        } catch (error) {
          if (error instanceof GraphRecursionError) {
            subscriber.next({
              type: "token",
              data:
                `He alcanzado el límite de ${MAX_TOOL_CALLS} llamadas a herramientas por turno. ` +
                `Para completar esta tarea, intenta dividirla en preguntas más específicas.`,
            });
            const uniqueTools = [...new Set(toolsUsed)];
            await this.persistStats(
              userId,
              inputTokens,
              outputTokens,
              uniqueTools,
              true,
            );
            subscriber.next({
              type: "done",
              data: JSON.stringify({
                toolsUsed: uniqueTools,
                inputTokens,
                outputTokens,
                model: this.modelName,
                costUsd: computeCostUsd(
                  this.modelName,
                  inputTokens,
                  outputTokens,
                ),
                limitReached: true,
              }),
            });
            subscriber.complete();
            return;
          }
          const message = error instanceof Error ? error.message : String(error);
          subscriber.next({ type: "error", data: message });
          subscriber.error(error);
        }
      })();

      // Cleanup si el cliente cierra la conexión SSE.
      return () => {
        cancelled = true;
      };
    });
  }

  /**
   * Devuelve el historial de la conversación del usuario (mensajes humanos y
   * de IA, en orden), leído del estado persistido por el checkpointer.
   * Vacío si la conversación es nueva o fue limpiada.
   */
  async loadHistory(userId: string): Promise<ChatMessage[]> {
    const agent = this.buildAgent(userId);
    const state = (await agent.getState({
      configurable: { thread_id: this.threadId(userId) },
    })) as { values?: { messages?: unknown } };

    const messages = state.values?.messages;
    if (!Array.isArray(messages)) return [];

    const history: ChatMessage[] = [];
    for (const message of messages as BaseMessage[]) {
      const type = message.getType();
      if (type !== "human" && type !== "ai") continue;
      const text = extractText(message.content).trim();
      if (!text) continue;
      history.push({
        role: type === "human" ? "user" : "assistant",
        content: text,
      });
    }
    return history;
  }

  /** Limpia la conversación del usuario (borra sus checkpoints). */
  async clear(userId: string): Promise<void> {
    await this.checkpointer.deleteThread(this.threadId(userId));
  }
}
