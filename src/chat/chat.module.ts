import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { LlmModule } from "../llm/llm.module";
import { RagModule } from "../rag/rag.module";
import { AgentService } from "./agent.service";
import { ChatController } from "./chat.controller";
import { ChatMessageEntity } from "./chat-message.entity";
import { ConversationEntity } from "./conversation.entity";
import { ConversationService } from "./conversation.service";

@Module({
  imports: [
    LlmModule,
    RagModule,
    TypeOrmModule.forFeature([ConversationEntity, ChatMessageEntity]),
  ],
  controllers: [ChatController],
  providers: [AgentService, ConversationService],
})
export class ChatModule {}
