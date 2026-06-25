import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { LlmModule } from "../llm/llm.module";
import { RagModule } from "../rag/rag.module";
import { AgentService } from "./agent.service";
import { AgentRunEntity } from "./agent-run.entity";
import { ChatController } from "./chat.controller";
import { ConversationEntity } from "./conversation.entity";
import { ConversationService } from "./conversation.service";
import { MessageEntity } from "./message.entity";
import { ToolExecutionEntity } from "./tool-execution.entity";

@Module({
  imports: [
    LlmModule,
    RagModule,
    TypeOrmModule.forFeature([
      ConversationEntity,
      MessageEntity,
      AgentRunEntity,
      ToolExecutionEntity,
    ]),
  ],
  controllers: [ChatController],
  providers: [AgentService, ConversationService],
})
export class ChatModule {}
