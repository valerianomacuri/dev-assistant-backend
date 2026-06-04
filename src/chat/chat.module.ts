import { Module } from "@nestjs/common";
import { LlmModule } from "../llm/llm.module";
import { RagModule } from "../rag/rag.module";
import { StatsModule } from "../stats/stats.module";
import { AgentService } from "./agent.service";
import { ChatController } from "./chat.controller";
import { CheckpointerService } from "./checkpointer.provider";

@Module({
  imports: [LlmModule, RagModule, StatsModule],
  controllers: [ChatController],
  providers: [AgentService, CheckpointerService],
})
export class ChatModule {}
