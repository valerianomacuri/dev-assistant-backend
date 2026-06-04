import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ChatMessageEntity } from "../chat/chat-message.entity";

/** Totales acumulados de un usuario. */
export interface StatsSummary {
  totalInputTokens: number;
  totalOutputTokens: number;
  messageCount: number;
  totalCostUsd: number;
  // KPIs con valor para el stakeholder, derivados de los mismos mensajes.
  conversationCount: number;
  avgLatencyMs: number;
}

/** Uso agregado de una sola conversación. */
export interface ConversationStat {
  conversationId: string;
  title: string;
  turnCount: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  avgLatencyMs: number;
  lastActivity: Date;
}

/**
 * Estadísticas de uso derivadas directamente de `chat_message`: las métricas
 * (tokens/costo/latencia) viven en cada mensaje del asistente, así que el
 * transcript es la única fuente de verdad. Solo se agregan los mensajes `ai`;
 * el JOIN a `conversation` aporta el `user_id` para acotar por usuario.
 */
@Injectable()
export class StatsService {
  constructor(
    @InjectRepository(ChatMessageEntity)
    private readonly messages: Repository<ChatMessageEntity>,
  ) {}

  /** Agregados de uso del usuario. Devuelve ceros si no hay registros. */
  async summary(userId: string): Promise<StatsSummary> {
    const row = await this.aiMessagesOf(userId)
      .select("COALESCE(SUM(m.input_tokens), 0)", "totalInputTokens")
      .addSelect("COALESCE(SUM(m.output_tokens), 0)", "totalOutputTokens")
      .addSelect("COUNT(*)", "messageCount")
      .addSelect("COALESCE(SUM(m.cost_usd), 0)", "totalCostUsd")
      .addSelect("COUNT(DISTINCT m.conversation_id)", "conversationCount")
      // Promedio solo sobre mensajes con latencia medida (el último `ai` de cada
      // turno); el resto guarda 0 y se excluye con NULLIF para no sesgar el KPI.
      .addSelect("COALESCE(AVG(NULLIF(m.latency_ms, 0)), 0)", "avgLatencyMs")
      .getRawOne<{
        totalInputTokens: string;
        totalOutputTokens: string;
        messageCount: string;
        totalCostUsd: string;
        conversationCount: string;
        avgLatencyMs: string;
      }>();

    return {
      totalInputTokens: Number(row?.totalInputTokens ?? 0),
      totalOutputTokens: Number(row?.totalOutputTokens ?? 0),
      messageCount: Number(row?.messageCount ?? 0),
      totalCostUsd: Number(row?.totalCostUsd ?? 0),
      conversationCount: Number(row?.conversationCount ?? 0),
      avgLatencyMs: Math.round(Number(row?.avgLatencyMs ?? 0)),
    };
  }

  /**
   * Desglose de uso por conversación del usuario, de la más reciente a la más
   * antigua. Responde "¿cuánto cuesta y cuántos turnos lleva cada conversación?".
   */
  async byConversation(userId: string): Promise<ConversationStat[]> {
    const rows = await this.aiMessagesOf(userId)
      .select("m.conversation_id", "conversationId")
      .addSelect("c.title", "title")
      .addSelect("COUNT(*)", "turnCount")
      .addSelect("COALESCE(SUM(m.input_tokens), 0)", "inputTokens")
      .addSelect("COALESCE(SUM(m.output_tokens), 0)", "outputTokens")
      .addSelect("COALESCE(SUM(m.cost_usd), 0)", "costUsd")
      .addSelect("COALESCE(AVG(NULLIF(m.latency_ms, 0)), 0)", "avgLatencyMs")
      .addSelect("MAX(m.created_at)", "lastActivity")
      .groupBy("m.conversation_id")
      .addGroupBy("c.title")
      .orderBy("MAX(m.created_at)", "DESC")
      .getRawMany<{
        conversationId: string;
        title: string;
        turnCount: string;
        inputTokens: string;
        outputTokens: string;
        costUsd: string;
        avgLatencyMs: string;
        lastActivity: Date;
      }>();

    return rows.map((r) => ({
      conversationId: r.conversationId,
      title: r.title,
      turnCount: Number(r.turnCount),
      inputTokens: Number(r.inputTokens),
      outputTokens: Number(r.outputTokens),
      costUsd: Number(r.costUsd),
      avgLatencyMs: Math.round(Number(r.avgLatencyMs)),
      lastActivity: r.lastActivity,
    }));
  }

  /**
   * Base común: mensajes `ai` del usuario, uniendo `conversation` por su
   * `user_id`. Incluye conversaciones borradas (soft-delete) a propósito: el
   * costo se incurrió igual y el histórico debe ser estable.
   */
  private aiMessagesOf(userId: string) {
    return this.messages
      .createQueryBuilder("m")
      .innerJoin("conversation", "c", "c.id = m.conversation_id")
      .where("m.type = :type", { type: "ai" })
      .andWhere("c.user_id = :userId", { userId });
  }
}
