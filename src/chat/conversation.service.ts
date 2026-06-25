import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  mapChatMessagesToStoredMessages,
  mapStoredMessagesToChatMessages,
  type AIMessage,
  type BaseMessage,
  type ToolMessage,
} from "@langchain/core/messages";
import { extractText } from "../llm/chat-model.provider";
import { ConversationEntity } from "./conversation.entity";
import { MessageEntity, type ChatMessageType } from "./message.entity";
import { AgentRunEntity, type AgentRunStatus } from "./agent-run.entity";
import {
  ToolExecutionEntity,
  type ToolExecutionStatus,
} from "./tool-execution.entity";

/** Un mensaje del historial de la conversación (vista para la UI). */
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** Tokens acumulados de un turno (run). */
export interface RunTokens {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

/** Cierre de un run con su resultado y métricas agregadas. */
export interface RunResult {
  status: AgentRunStatus;
  iterations: number;
  tokens: RunTokens;
  error?: string | null;
}

/** Registro de una ejecución de tool capturado durante el turno. */
export interface ToolExecutionLog {
  toolName: string;
  toolCallId: string | null;
  input: unknown;
  output: unknown;
  status: ToolExecutionStatus;
  error: string | null;
  latencyMs: number;
}

const DEFAULT_TITLE = "Nueva conversación";
const TITLE_MAX_LENGTH = 60;
const MODEL_PROVIDER = "anthropic";

@Injectable()
export class ConversationService {
  constructor(
    @InjectRepository(ConversationEntity)
    private readonly conversations: Repository<ConversationEntity>,
    @InjectRepository(MessageEntity)
    private readonly messages: Repository<MessageEntity>,
    @InjectRepository(AgentRunEntity)
    private readonly runs: Repository<AgentRunEntity>,
    @InjectRepository(ToolExecutionEntity)
    private readonly toolExecs: Repository<ToolExecutionEntity>,
  ) {}

  /** Crea una conversación vacía para el usuario. */
  create(userId: string, title?: string): Promise<ConversationEntity> {
    return this.conversations.save(
      this.conversations.create({
        userId,
        title: title?.trim() || DEFAULT_TITLE,
      }),
    );
  }

  /** Conversaciones del usuario, ordenadas por actividad reciente. */
  list(userId: string): Promise<ConversationEntity[]> {
    return this.conversations.find({
      where: { userId },
      order: { updatedAt: "DESC" },
    });
  }

  /**
   * Carga una conversación validando que pertenezca al usuario.
   * Las soft-deleted quedan excluidas automáticamente por TypeORM.
   */
  async getOwned(
    userId: string,
    conversationId: string,
  ): Promise<ConversationEntity> {
    const conversation = await this.conversations.findOne({
      where: { id: conversationId },
    });
    if (!conversation) {
      throw new NotFoundException("Conversación no encontrada");
    }
    if (conversation.userId !== userId) {
      throw new ForbiddenException("No tienes acceso a esta conversación");
    }
    return conversation;
  }

  /** Abre un run (turno del usuario) en estado `running`. */
  startRun(conversationId: string): Promise<AgentRunEntity> {
    return this.runs.save(this.runs.create({ conversationId, status: "running" }));
  }

  /** Cierra un run con su estado final, iteraciones y tokens agregados. */
  async finishRun(run: AgentRunEntity, result: RunResult): Promise<void> {
    run.status = result.status;
    run.iterations = result.iterations;
    run.inputTokens = result.tokens.inputTokens;
    run.outputTokens = result.tokens.outputTokens;
    run.totalTokens = result.tokens.totalTokens;
    run.cacheReadTokens = result.tokens.cacheReadTokens;
    run.cacheCreationTokens = result.tokens.cacheCreationTokens;
    run.error = result.error ?? null;
    run.finishedAt = new Date();
    await this.runs.save(run);
  }

  /**
   * Reconstruye el transcript completo como `BaseMessage[]`, en orden, a partir
   * de la columna `raw` (StoredMessage). Mantiene fidelidad total: los pares
   * tool_use/tool_result se preservan tal cual los produjo LangGraph.
   */
  async loadMessages(conversationId: string): Promise<BaseMessage[]> {
    const rows = await this.messages.find({
      where: { conversationId },
      order: { createdAt: "ASC" },
    });
    return mapStoredMessagesToChatMessages(rows.map((row) => row.raw));
  }

  /**
   * Persiste el lote de mensajes nuevos del turno con su `runId` e `iteration`.
   * Devuelve un mapa `tool_call_id → message_id` para enlazar las ejecuciones de
   * tools al `ToolMessage` que contiene su resultado. Asigna `createdAt`
   * estrictamente creciente para garantizar el orden del transcript.
   */
  async appendTurn(
    conversation: ConversationEntity,
    runId: string,
    newMessages: BaseMessage[],
    fallbackModel: string,
  ): Promise<Map<string, string>> {
    if (newMessages.length === 0) return new Map();

    const base = Date.now();
    let aiCount = 0;
    const rows = newMessages.map((message, index) => {
      const type = message.getType() as ChatMessageType;
      const iteration = type === "ai" ? ++aiCount : type === "tool" ? aiCount : 0;
      return this.messages.create(
        this.toRow(
          conversation.id,
          runId,
          message,
          iteration,
          new Date(base + index),
          fallbackModel,
        ),
      );
    });
    const saved = await this.messages.save(rows);

    // Deriva el título del primer mensaje humano si sigue por defecto.
    if (conversation.title === DEFAULT_TITLE) {
      const firstHuman = newMessages.find((m) => m.getType() === "human");
      if (firstHuman) {
        const text = extractText(firstHuman.content).trim();
        if (text) {
          conversation.title =
            text.length > TITLE_MAX_LENGTH
              ? `${text.slice(0, TITLE_MAX_LENGTH).trimEnd()}…`
              : text;
        }
      }
    }
    // save() toca updatedAt (UpdateDateColumn) aunque solo cambie el título.
    await this.conversations.save(conversation);

    const callIdToMessageId = new Map<string, string>();
    for (const row of saved) {
      if (row.type === "tool" && row.toolCallId) {
        callIdToMessageId.set(row.toolCallId, row.id);
      }
    }
    return callIdToMessageId;
  }

  /**
   * Persiste las ejecuciones de tools del turno, enlazándolas al `ToolMessage`
   * correspondiente por `tool_call_id`. Omite las que no tengan mensaje asociado
   * (la FK a `messages` es obligatoria).
   */
  async recordToolExecutions(
    runId: string,
    execs: ToolExecutionLog[],
    callIdToMessageId: Map<string, string>,
  ): Promise<void> {
    if (execs.length === 0) return;
    const rows: ToolExecutionEntity[] = [];
    for (const exec of execs) {
      const messageId = exec.toolCallId
        ? callIdToMessageId.get(exec.toolCallId)
        : undefined;
      if (!messageId) continue;
      rows.push(
        this.toolExecs.create({
          messageId,
          runId,
          toolName: exec.toolName,
          toolCallId: exec.toolCallId,
          input: exec.input ?? null,
          output: exec.output ?? null,
          status: exec.status,
          error: exec.error,
          latencyMs: exec.latencyMs,
        }),
      );
    }
    if (rows.length > 0) await this.toolExecs.save(rows);
  }

  /** Historial usuario/asistente (texto) para la UI. Omite tool calls. */
  async history(conversationId: string): Promise<ChatMessage[]> {
    const rows = await this.messages.find({
      where: { conversationId },
      order: { createdAt: "ASC" },
    });

    const history: ChatMessage[] = [];
    for (const row of rows) {
      if (row.type !== "human" && row.type !== "ai") continue;
      const text = (row.textContent ?? "").trim();
      if (!text) continue;
      history.push({
        role: row.type === "human" ? "user" : "assistant",
        content: text,
      });
    }
    return history;
  }

  /** Borrado lógico de una conversación del usuario. */
  async delete(userId: string, conversationId: string): Promise<void> {
    await this.getOwned(userId, conversationId);
    await this.conversations.softDelete(conversationId);
  }

  /** Convierte un `BaseMessage` de LangChain en una fila persistible. */
  private toRow(
    conversationId: string,
    runId: string,
    message: BaseMessage,
    iteration: number,
    createdAt: Date,
    fallbackModel: string,
  ): Partial<MessageEntity> {
    const type = message.getType() as ChatMessageType;
    const raw = mapChatMessagesToStoredMessages([message])[0];
    const base: Partial<MessageEntity> = {
      conversationId,
      runId,
      type,
      textContent: extractText(message.content) || null,
      raw,
      iteration,
      createdAt,
    };

    if (type === "ai") {
      const ai = message as AIMessage;
      const meta = (ai.response_metadata ?? {}) as Record<string, unknown>;
      const usage = ai.usage_metadata;
      const tools = ai.tool_calls;
      const invalid = ai.invalid_tool_calls;
      return {
        ...base,
        name: "model",
        providerMessageId: (meta.id as string) ?? ai.id ?? null,
        toolCalls: tools && tools.length > 0 ? tools : null,
        invalidToolCalls: invalid && invalid.length > 0 ? invalid : null,
        model: (meta.model as string) ?? fallbackModel,
        modelProvider: MODEL_PROVIDER,
        finishReason: (meta.stop_reason as string) ?? null,
        serviceTier: (meta.service_tier as string) ?? null,
        inputTokens: usage?.input_tokens ?? null,
        outputTokens: usage?.output_tokens ?? null,
        totalTokens: usage?.total_tokens ?? null,
        cacheReadTokens: usage?.input_token_details?.cache_read ?? 0,
        cacheCreationTokens: usage?.input_token_details?.cache_creation ?? 0,
      };
    }
    if (type === "tool") {
      const tool = message as ToolMessage;
      return {
        ...base,
        name: tool.name ?? null,
        toolCallId: tool.tool_call_id,
      };
    }
    return base;
  }
}
