import { Controller, Get, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/auth.types";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import {
  StatsService,
  type ConversationStat,
  type StatsSummary,
} from "./stats.service";

@UseGuards(JwtAuthGuard)
@Controller("stats")
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  /** Totales acumulados de uso del usuario autenticado. */
  @Get()
  summary(@CurrentUser() user: AuthUser): Promise<StatsSummary> {
    return this.stats.summary(user.id);
  }

  /** Desglose de uso por conversación del usuario autenticado. */
  @Get("conversations")
  byConversation(@CurrentUser() user: AuthUser): Promise<ConversationStat[]> {
    return this.stats.byConversation(user.id);
  }
}
