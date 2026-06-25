import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AgentRunEntity } from "../chat/agent-run.entity";
import { MessageEntity } from "../chat/message.entity";
import { StatsReportService } from "./stats-report.service";
import { StatsController } from "./stats.controller";
import { StatsService } from "./stats.service";

@Module({
  // Las stats se agregan desde `messages` (tokens/costo) y `agent_runs`
  // (latencia/turnos); el JOIN a `conversations` se hace por nombre de tabla.
  // El LambdaClient lo provee AwsModule (global).
  imports: [TypeOrmModule.forFeature([MessageEntity, AgentRunEntity])],
  controllers: [StatsController],
  providers: [StatsService, StatsReportService],
})
export class StatsModule {}
