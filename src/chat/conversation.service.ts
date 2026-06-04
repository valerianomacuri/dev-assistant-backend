import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  AIMessage,
  HumanMessage,
  ToolMessage,
  type BaseMessage,
} from "@langchain/core/messages";
import { extractText } from "../llm/chat-model.provider";
import { computeCostUsd } from "../stats/pricing";
import { ConversationEntity } from "./conversation.entity";
import { ChatMessageEntity, type ChatMessageType } from "./chat-message.entity";

/** Un mensaje del historial de la conversación (vista para la UI). */
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** Métrica del turno que se persiste junto con los mensajes que generó. */
export interface TurnMeta {
  model: string;
  latencyMs: number;
}

const DEFAULT_TITLE = "Nueva conversación";
const TITLE_MAX_LENGTH = 60;

@Injectable()
export class ConversationService {
  constructor(
    @InjectRepository(ConversationEntity)
    private readonly conversations: Repository<ConversationEntity>,
    @InjectRepository(ChatMessageEntity)
    private readonly messages: Repository<ChatMessageEntity>,
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

  /**
   * Reconstruye el transcript completo como `BaseMessage[]`, en orden, para
   * reenviarlo al agente. Los pares tool_use/tool_result se preservan porque
   * se guardaron tal cual los produjo LangGraph.
   */
  async loadMessages(conversationId: string): Promise<BaseMessage[]> {
    const rows = await this.messages.find({
      where: { conversationId },
      order: { seq: "ASC" },
    });

    return rows.map((row) => {
      switch (row.type) {
        case "ai":
          return new AIMessage({
            content: row.content,
            tool_calls: row.toolCalls ?? [],
          });
        case "tool":
          return new ToolMessage({
            content: row.content,
            tool_call_id: row.toolCallId ?? "",
            name: row.name ?? undefined,
          });
        case "human":
        default:
          return new HumanMessage({ content: row.content });
      }
    });
  }

  /**
   * Persiste el lote de mensajes nuevos de un turno, asignando `seq`
   * consecutivo a partir del máximo actual. Actualiza `updatedAt` y, si la
   * conversación aún tiene el título por defecto, lo deriva del primer humano.
   */
  async appendTurn(
    conversation: ConversationEntity,
    newMessages: BaseMessage[],
    turnMeta: TurnMeta,
  ): Promise<void> {
    if (newMessages.length === 0) return;

    const existing = await this.messages.count({
      where: { conversationId: conversation.id },
    });

    // La latencia del turno se guarda solo en el último mensaje `ai` del lote.
    const lastAiIndex = newMessages.reduce(
      (last, m, i) => (m.getType() === "ai" ? i : last),
      -1,
    );

    const rows = newMessages.map((message, index) =>
      this.messages.create(
        this.toRow(conversation.id, message, existing + index, turnMeta, {
          isLastAi: index === lastAiIndex,
        }),
      ),
    );
    await this.messages.save(rows);

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
  }

  /** Historial usuario/asistente (texto) para la UI. Omite tool calls. */
  async history(conversationId: string): Promise<ChatMessage[]> {
    const rows = await this.messages.find({
      where: { conversationId },
      order: { seq: "ASC" },
    });

    const history: ChatMessage[] = [];
    for (const row of rows) {
      if (row.type !== "human" && row.type !== "ai") continue;
      const text = extractText(row.content).trim();
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
    message: BaseMessage,
    seq: number,
    turnMeta: TurnMeta,
    flags: { isLastAi: boolean },
  ): Partial<ChatMessageEntity> {
    const type = message.getType() as ChatMessageType;
    const base = { conversationId, seq, type, content: message.content };

    if (type === "ai") {
      const ai = message as AIMessage;
      const tools = ai.tool_calls;
      // Métricas del mensaje: tokens del propio `usage_metadata`, costo derivado
      // del modelo del turno, y la latencia del turno solo en el último `ai`.
      const usage = ai.usage_metadata;
      const inputTokens = usage?.input_tokens ?? 0;
      const outputTokens = usage?.output_tokens ?? 0;
      const cachedTokens = usage?.input_token_details?.cache_read ?? 0;
      return {
        ...base,
        toolCalls: tools && tools.length > 0 ? tools : null,
        model: turnMeta.model,
        inputTokens,
        outputTokens,
        cachedTokens,
        costUsd: computeCostUsd(turnMeta.model, inputTokens, outputTokens),
        latencyMs: flags.isLastAi ? turnMeta.latencyMs : 0,
      };
    }
    if (type === "tool") {
      const tool = message as ToolMessage;
      return {
        ...base,
        toolCallId: tool.tool_call_id,
        name: tool.name ?? null,
      };
    }
    return base;
  }
}
