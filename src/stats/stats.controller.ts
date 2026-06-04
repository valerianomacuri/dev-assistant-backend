import {
  Controller,
  Get,
  Header,
  StreamableFile,
  UseGuards,
} from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/auth.types";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { StatsReportService } from "./stats-report.service";
import {
  StatsService,
  type ConversationStat,
  type StatsSummary,
} from "./stats.service";

@UseGuards(JwtAuthGuard)
@Controller("stats")
export class StatsController {
  constructor(
    private readonly stats: StatsService,
    private readonly report: StatsReportService,
  ) {}

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

  /** PDF del reporte de stats, renderizado por la Lambda (WeasyPrint). */
  @Get("report.pdf")
  @Header("Content-Type", "application/pdf")
  @Header(
    "Content-Disposition",
    'attachment; filename="reporte-stats.pdf"',
  )
  async reportPdf(@CurrentUser() user: AuthUser): Promise<StreamableFile> {
    const pdf = await this.report.generateReport(user);
    return new StreamableFile(pdf);
  }
}
