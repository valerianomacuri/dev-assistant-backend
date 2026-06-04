import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ChatStatEntity } from "./chat-stat.entity";
import { computeCostUsd } from "./pricing";

/** Datos de un turno a registrar. */
export interface RecordStatInput {
  userId: string;
  inputTokens: number;
  outputTokens: number;
  toolsUsed: string[];
  limitReached: boolean;
  model: string;
}

/** Totales acumulados de un usuario. */
export interface StatsSummary {
  totalInputTokens: number;
  totalOutputTokens: number;
  messageCount: number;
  totalCostUsd: number;
}

@Injectable()
export class StatsService {
  constructor(
    @InjectRepository(ChatStatEntity)
    private readonly stats: Repository<ChatStatEntity>,
  ) {}

  /** Guarda las estadísticas de un turno, calculando su costo. */
  async record(input: RecordStatInput): Promise<void> {
    const costUsd = computeCostUsd(
      input.model,
      input.inputTokens,
      input.outputTokens,
    );
    await this.stats.save(
      this.stats.create({
        userId: input.userId,
        inputTokens: input.inputTokens,
        outputTokens: input.outputTokens,
        model: input.model,
        costUsd,
        toolsUsed: input.toolsUsed,
        limitReached: input.limitReached,
      }),
    );
  }

  /** Agregados de uso del usuario. Devuelve ceros si no hay registros. */
  async summary(userId: string): Promise<StatsSummary> {
    const row = await this.stats
      .createQueryBuilder("s")
      .select("COALESCE(SUM(s.input_tokens), 0)", "totalInputTokens")
      .addSelect("COALESCE(SUM(s.output_tokens), 0)", "totalOutputTokens")
      .addSelect("COUNT(*)", "messageCount")
      .addSelect("COALESCE(SUM(s.cost_usd), 0)", "totalCostUsd")
      .where("s.user_id = :userId", { userId })
      .getRawOne<{
        totalInputTokens: string;
        totalOutputTokens: string;
        messageCount: string;
        totalCostUsd: string;
      }>();

    return {
      totalInputTokens: Number(row?.totalInputTokens ?? 0),
      totalOutputTokens: Number(row?.totalOutputTokens ?? 0),
      messageCount: Number(row?.messageCount ?? 0),
      totalCostUsd: Number(row?.totalCostUsd ?? 0),
    };
  }
}
