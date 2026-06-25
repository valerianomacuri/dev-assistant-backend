import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { MessageEntity } from "../chat/message.entity";
import { AgentRunEntity } from "../chat/agent-run.entity";
import { computeCostUsd } from "./pricing";

/** Totales acumulados de un usuario. */
export interface StatsSummary {
  totalInputTokens: number;
  totalOutputTokens: number;
  messageCount: number;
  totalCostUsd: number;
  // KPIs con valor para el stakeholder, derivados de los mismos mensajes/runs.
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
 * Estadísticas de uso. Tras separar el modelo en cuatro tablas, las métricas ya
 * no se almacenan precalculadas: el **costo** se deriva al vuelo de los tokens y
 * el modelo de cada mensaje `ai` (agrupando por modelo, fiel a precios mixtos),
 * y la **latencia** del run con `finished_at - started_at`. Las conversaciones
 * borradas (soft-delete) se incluyen a propósito: el costo se incurrió igual.
 */
@Injectable()
export class StatsService {
  constructor(
    @InjectRepository(MessageEntity)
    private readonly messages: Repository<MessageEntity>,
    @InjectRepository(AgentRunEntity)
    private readonly runs: Repository<AgentRunEntity>,
  ) {}

  /** Agregados de uso del usuario. Devuelve ceros si no hay registros. */
  async summary(userId: string): Promise<StatsSummary> {
    // Tokens y costo por modelo (costo = Σ computeCostUsd por grupo de modelo).
    const tokenRows = await this.aiMessagesOf(userId)
      .select("m.model", "model")
      .addSelect("COALESCE(SUM(m.input_tokens), 0)", "inputTokens")
      .addSelect("COALESCE(SUM(m.output_tokens), 0)", "outputTokens")
      .groupBy("m.model")
      .getRawMany<{ model: string | null; inputTokens: string; outputTokens: string }>();

    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCostUsd = 0;
    for (const row of tokenRows) {
      const inTok = Number(row.inputTokens);
      const outTok = Number(row.outputTokens);
      totalInputTokens += inTok;
      totalOutputTokens += outTok;
      totalCostUsd += computeCostUsd(row.model ?? "", inTok, outTok);
    }

    const counts = await this.aiMessagesOf(userId)
      .select("COUNT(*)", "messageCount")
      .addSelect("COUNT(DISTINCT m.conversation_id)", "conversationCount")
      .getRawOne<{ messageCount: string; conversationCount: string }>();

    const latency = await this.runsOf(userId)
      .andWhere("r.finished_at IS NOT NULL")
      .select(
        "COALESCE(AVG(EXTRACT(EPOCH FROM (r.finished_at - r.started_at)) * 1000), 0)",
        "avgLatencyMs",
      )
      .getRawOne<{ avgLatencyMs: string }>();

    return {
      totalInputTokens,
      totalOutputTokens,
      messageCount: Number(counts?.messageCount ?? 0),
      totalCostUsd,
      conversationCount: Number(counts?.conversationCount ?? 0),
      avgLatencyMs: Math.round(Number(latency?.avgLatencyMs ?? 0)),
    };
  }

  /**
   * Desglose de uso por conversación del usuario, de la más reciente a la más
   * antigua. Tokens/costo salen de `messages`; turnos y latencia de `agent_runs`.
   */
  async byConversation(userId: string): Promise<ConversationStat[]> {
    const tokenRows = await this.aiMessagesOf(userId)
      .select("m.conversation_id", "conversationId")
      .addSelect("m.model", "model")
      .addSelect("COALESCE(SUM(m.input_tokens), 0)", "inputTokens")
      .addSelect("COALESCE(SUM(m.output_tokens), 0)", "outputTokens")
      .groupBy("m.conversation_id")
      .addGroupBy("m.model")
      .getRawMany<{
        conversationId: string;
        model: string | null;
        inputTokens: string;
        outputTokens: string;
      }>();

    // Agrega por conversación, sumando el costo por grupo de modelo.
    const byConv = new Map<
      string,
      { inputTokens: number; outputTokens: number; costUsd: number }
    >();
    for (const row of tokenRows) {
      const inTok = Number(row.inputTokens);
      const outTok = Number(row.outputTokens);
      const acc = byConv.get(row.conversationId) ?? {
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
      };
      acc.inputTokens += inTok;
      acc.outputTokens += outTok;
      acc.costUsd += computeCostUsd(row.model ?? "", inTok, outTok);
      byConv.set(row.conversationId, acc);
    }

    const runRows = await this.runsOf(userId)
      .select("r.conversation_id", "conversationId")
      .addSelect("c.title", "title")
      .addSelect("COUNT(*)", "turnCount")
      .addSelect(
        "COALESCE(AVG(EXTRACT(EPOCH FROM (r.finished_at - r.started_at)) * 1000), 0)",
        "avgLatencyMs",
      )
      .addSelect("MAX(r.started_at)", "lastActivity")
      .groupBy("r.conversation_id")
      .addGroupBy("c.title")
      .orderBy("MAX(r.started_at)", "DESC")
      .getRawMany<{
        conversationId: string;
        title: string;
        turnCount: string;
        avgLatencyMs: string;
        lastActivity: Date;
      }>();

    return runRows.map((r) => {
      const tokens = byConv.get(r.conversationId) ?? {
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
      };
      return {
        conversationId: r.conversationId,
        title: r.title,
        turnCount: Number(r.turnCount),
        inputTokens: tokens.inputTokens,
        outputTokens: tokens.outputTokens,
        costUsd: tokens.costUsd,
        avgLatencyMs: Math.round(Number(r.avgLatencyMs)),
        lastActivity: r.lastActivity,
      };
    });
  }

  /** Base común: mensajes `ai` del usuario (join a `conversations` por user_id). */
  private aiMessagesOf(userId: string) {
    return this.messages
      .createQueryBuilder("m")
      .innerJoin("conversations", "c", "c.id = m.conversation_id")
      .where("m.type = :type", { type: "ai" })
      .andWhere("c.user_id = :userId", { userId });
  }

  /** Base común: runs del usuario (join a `conversations` por user_id). */
  private runsOf(userId: string) {
    return this.runs
      .createQueryBuilder("r")
      .innerJoin("conversations", "c", "c.id = r.conversation_id")
      .where("c.user_id = :userId", { userId });
  }
}
