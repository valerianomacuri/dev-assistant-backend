import { Module } from "@nestjs/common";
import { LlmModule } from "../llm/llm.module";
import { RagModule } from "../rag/rag.module";
import { AgentService } from "./agent.service";
import { ChatController } from "./chat.controller";
import { CheckpointerService } from "./checkpointer.provider";

@Module({
  imports: [LlmModule, RagModule],
  controllers: [ChatController],
  providers: [AgentService, CheckpointerService],
})
export class ChatModule {}
