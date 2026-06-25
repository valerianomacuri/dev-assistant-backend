import { createAgent } from "langchain";
import {
  AIMessage,
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
import { computeCostUsd } from "../stats/pricing";
import {
  ConversationService,
  type ChatMessage,
  type TurnMeta,
} from "./conversation.service";
import { ConversationEntity } from "./conversation.entity";
import { AGENT_SYSTEM_PROMPT } from "./system-prompt";

export type { ChatMessage } from "./conversation.service";

const MAX_TOOL_CALLS = 8;
// Cada ciclo agente→tools→agente consume ~2 supersteps en el grafo.
const RECURSION_LIMIT = 2 * MAX_TOOL_CALLS + 1;

/** Evento SSE emitido al cliente durante el streaming. */
export interface ChatStreamEvent {
  data: string;
  type?: "token" | "done" | "error";
}

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);
  private readonly modelName: string;

  constructor(
    @Inject(CHAT_MODEL) private readonly model: BaseChatModel,
    private readonly retriever: RetrieverService,
    private readonly conversations: ConversationService,
    config: ConfigService<AppEnv, true>,
  ) {
    this.modelName = config.get("ANTHROPIC_MODEL", { infer: true });
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
    });
  }

  /**
   * Procesa un turno y emite la respuesta del agente como un stream de eventos
   * SSE: tokens de texto en vivo y un evento `done` final con metadata.
   */
  stream(
    userId: string,
    conversationId: string,
    userMessage: string,
  ): Observable<ChatStreamEvent> {
    return new Observable<ChatStreamEvent>((subscriber) => {
      let cancelled = false;

      void (async () => {
        const agent = this.buildAgent(userId);
        const toolsUsed: string[] = [];
        let inputTokens = 0;
        let outputTokens = 0;
        // Inicio del turno: medimos la espera real del usuario (incluye tools).
        const turnStart = Date.now();

        // Mensaje humano del turno: se persiste junto con lo que genere el agente.
        const humanMessage = new HumanMessage(userMessage);
        // Último estado completo emitido por el modo "values"; de él extraemos
        // el transcript final para persistirlo (sin una segunda invocación).
        let finalMessages: BaseMessage[] | null = null;

        try {
          // Validamos propiedad y cargamos el historial propio (sin checkpointer).
          const conversation = await this.conversations.getOwned(
            userId,
            conversationId,
          );
          const history = await this.conversations.loadMessages(conversationId);
          const inputMessages = [...history, humanMessage];

          const stream = await agent.stream(
            { messages: inputMessages },
            {
              recursionLimit: RECURSION_LIMIT,
              streamMode: ["messages", "values"],
            },
          );

          for await (const event of stream) {
            if (cancelled) break;
            const [mode, payload] = event as [string, unknown];

            if (mode === "messages") {
              const [message] = payload as [BaseMessage, Record<string, unknown>];
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
            } else if (mode === "values") {
              finalMessages = (payload as { messages?: BaseMessage[] }).messages ?? null;
            }
          }

          // Persiste el turno: humano + mensajes nuevos del agente (ai/tool).
          // Las métricas (tokens/costo/latencia) viajan con los mensajes `ai`.
          if (!cancelled && finalMessages) {
            const newMessages = finalMessages.slice(inputMessages.length);
            await this.persistTurn(conversation, [humanMessage, ...newMessages], {
              model: this.modelName,
              latencyMs: Date.now() - turnStart,
            });
          }

          const uniqueTools = [...new Set(toolsUsed)];
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
   * Persiste el transcript del turno. Best-effort: un fallo de persistencia
   * no debe romper el stream que ya respondió al usuario.
   */
  private async persistTurn(
    conversation: ConversationEntity | null,
    messages: BaseMessage[],
    turnMeta: TurnMeta,
  ): Promise<void> {
    if (!conversation) return;
    try {
      await this.conversations.appendTurn(conversation, messages, turnMeta);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`No se pudo guardar el turno (conv ${conversation.id}): ${message}`);
    }
  }

  /** Historial de la conversación (mensajes humanos y de IA, en orden). */
  loadHistory(conversationId: string): Promise<ChatMessage[]> {
    return this.conversations.history(conversationId);
  }
}
