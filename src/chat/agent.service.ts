import { createAgent } from "langchain";
import {
  AIMessage,
  HumanMessage,
  type BaseMessage,
} from "@langchain/core/messages";
import { tool, type ToolRunnableConfig } from "@langchain/core/tools";
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
  type RunTokens,
  type ToolExecutionLog,
} from "./conversation.service";
import { ConversationEntity } from "./conversation.entity";
import { AgentRunEntity, type AgentRunStatus } from "./agent-run.entity";
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

/** Suma los tokens (incl. caché) de los mensajes `ai` de un turno. */
function sumRunTokens(messages: BaseMessage[]): RunTokens {
  const totals: RunTokens = {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
  };
  for (const message of messages) {
    if (message.getType() !== "ai") continue;
    const usage = (message as AIMessage).usage_metadata;
    if (!usage) continue;
    totals.inputTokens += usage.input_tokens ?? 0;
    totals.outputTokens += usage.output_tokens ?? 0;
    totals.totalTokens += usage.total_tokens ?? 0;
    totals.cacheReadTokens += usage.input_token_details?.cache_read ?? 0;
    totals.cacheCreationTokens += usage.input_token_details?.cache_creation ?? 0;
  }
  return totals;
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
   * Construye un agente con la tool `search_docs` acotada al `userId`. La tool
   * está instrumentada: registra cada ejecución (input/output/latencia/estado)
   * en `toolExecLog` para persistirla luego en `tool_executions`.
   */
  private buildAgent(
    userId: string,
    toolExecLog: ToolExecutionLog[],
  ): ReturnType<typeof createAgent> {
    const searchDocsTool = tool(
      async (
        input: { query: string; top_k?: number },
        _runManager?: unknown,
        config?: ToolRunnableConfig,
      ) => {
        // En runtime, el 3er argumento es el config con la tool call asociada.
        const toolCallId =
          (config as { toolCall?: { id?: string } } | undefined)?.toolCall?.id ??
          null;
        const startedAt = Date.now();
        try {
          const topK = Math.min(input.top_k ?? 5, 10);
          const chunks = await this.retriever.retrieveContext(
            userId,
            input.query,
            topK,
          );
          const output =
            chunks.length === 0
              ? "No se encontraron documentos relevantes para esta consulta. " +
                "Asegúrate de haber subido documentación a tu base de conocimiento."
              : `Se encontraron ${chunks.length} fragmentos relevantes:\n\n${chunks
                  .map((chunk) => {
                    const source = chunk.metadata.source;
                    const section = chunk.metadata.heading;
                    const score = (chunk.score * 100).toFixed(0);
                    return `[FUENTE: ${source} | Sección: ${section} | Relevancia: ${score}%\n${chunk.content}]`;
                  })
                  .join("\n\n---\n\n")}`;
          toolExecLog.push({
            toolName: "search_docs",
            toolCallId,
            input,
            output,
            status: "success",
            error: null,
            latencyMs: Date.now() - startedAt,
          });
          return output;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          toolExecLog.push({
            toolName: "search_docs",
            toolCallId,
            input,
            output: null,
            status: "error",
            error: message,
            latencyMs: Date.now() - startedAt,
          });
          throw error;
        }
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
   * Procesa un turno (un run del loop del agente) y emite la respuesta como un
   * stream de eventos SSE: tokens de texto en vivo y un evento `done` final con
   * la metadata del run (tokens, caché, iteraciones, estado).
   */
  stream(
    userId: string,
    conversationId: string,
    userMessage: string,
  ): Observable<ChatStreamEvent> {
    return new Observable<ChatStreamEvent>((subscriber) => {
      let cancelled = false;

      void (async () => {
        const toolExecLog: ToolExecutionLog[] = [];
        const agent = this.buildAgent(userId, toolExecLog);
        const humanMessage = new HumanMessage(userMessage);
        // Último estado completo emitido por el modo "values": de él sale el
        // transcript final que persistimos (sin una segunda invocación).
        let finalMessages: BaseMessage[] | null = null;
        let inputLength = 0;

        // Validamos propiedad y abrimos el run antes del loop para poder
        // cerrarlo (completed/failed/max_iters) pase lo que pase.
        let conversation: ConversationEntity;
        let run: AgentRunEntity;
        try {
          conversation = await this.conversations.getOwned(userId, conversationId);
          run = await this.conversations.startRun(conversationId);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          subscriber.next({ type: "error", data: message });
          subscriber.error(error);
          return;
        }

        try {
          const history = await this.conversations.loadMessages(conversationId);
          const inputMessages = [...history, humanMessage];
          inputLength = inputMessages.length;

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
              if (message.getType() === "ai") {
                const text = extractText(message.content);
                if (text) subscriber.next({ type: "token", data: text });
              }
            } else if (mode === "values") {
              finalMessages =
                (payload as { messages?: BaseMessage[] }).messages ?? null;
            }
          }

          const { iterations, tokens } = await this.finalizeTurn(
            conversation,
            run,
            humanMessage,
            finalMessages,
            inputLength,
            toolExecLog,
          );
          await this.conversations.finishRun(run, {
            status: "completed",
            iterations,
            tokens,
          });

          subscriber.next(
            this.doneEvent(run.id, "completed", tokens, iterations, toolExecLog),
          );
          subscriber.complete();
        } catch (error) {
          const isMaxIters =
            error instanceof Error && error.name === "GraphRecursionError";
          const status: AgentRunStatus = isMaxIters ? "max_iters" : "failed";
          const message = error instanceof Error ? error.message : String(error);

          // Persiste el transcript parcial si lo hubo y cierra el run.
          const { iterations, tokens } = await this.finalizeTurn(
            conversation,
            run,
            humanMessage,
            finalMessages,
            inputLength,
            toolExecLog,
          );
          await this.conversations
            .finishRun(run, {
              status,
              iterations,
              tokens,
              error: isMaxIters ? null : message,
            })
            .catch(() => undefined);

          if (isMaxIters) {
            // Límite de iteraciones: degradamos elegantemente con `done`.
            subscriber.next(
              this.doneEvent(run.id, "max_iters", tokens, iterations, toolExecLog),
            );
            subscriber.complete();
          } else {
            subscriber.next({ type: "error", data: message });
            subscriber.error(error);
          }
        }
      })();

      // Cleanup si el cliente cierra la conexión SSE.
      return () => {
        cancelled = true;
      };
    });
  }

  /**
   * Persiste el turno (mensajes + ejecuciones de tools). Best-effort: un fallo
   * de persistencia no debe romper el stream ya emitido. Devuelve iteraciones y
   * tokens agregados, calculados desde el transcript (fuente de verdad).
   */
  private async finalizeTurn(
    conversation: ConversationEntity,
    run: AgentRunEntity,
    humanMessage: HumanMessage,
    finalMessages: BaseMessage[] | null,
    inputLength: number,
    toolExecLog: ToolExecutionLog[],
  ): Promise<{ iterations: number; tokens: RunTokens }> {
    if (!finalMessages) {
      return { iterations: 0, tokens: sumRunTokens([]) };
    }
    const newMessages = finalMessages.slice(inputLength);
    const items = [humanMessage, ...newMessages];
    const tokens = sumRunTokens(items);
    const iterations = items.filter((m) => m.getType() === "ai").length;
    try {
      const callIdToMessageId = await this.conversations.appendTurn(
        conversation,
        run.id,
        items,
        this.modelName,
      );
      await this.conversations.recordToolExecutions(
        run.id,
        toolExecLog,
        callIdToMessageId,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `No se pudo guardar el turno (conv ${conversation.id}): ${message}`,
      );
    }
    return { iterations, tokens };
  }

  /** Construye el evento `done` con la metadata del run para la UI. */
  private doneEvent(
    runId: string,
    status: AgentRunStatus,
    tokens: RunTokens,
    iterations: number,
    toolExecLog: ToolExecutionLog[],
  ): ChatStreamEvent {
    const toolsUsed = [...new Set(toolExecLog.map((e) => e.toolName))];
    return {
      type: "done",
      data: JSON.stringify({
        toolsUsed,
        inputTokens: tokens.inputTokens,
        outputTokens: tokens.outputTokens,
        totalTokens: tokens.totalTokens,
        cacheReadTokens: tokens.cacheReadTokens,
        cacheCreationTokens: tokens.cacheCreationTokens,
        iterations,
        runId,
        runStatus: status,
        model: this.modelName,
        costUsd: computeCostUsd(
          this.modelName,
          tokens.inputTokens,
          tokens.outputTokens,
        ),
        limitReached: status === "max_iters",
      }),
    };
  }

  /** Historial de la conversación (mensajes humanos y de IA, en orden). */
  loadHistory(conversationId: string): Promise<ChatMessage[]> {
    return this.conversations.history(conversationId);
  }
}
