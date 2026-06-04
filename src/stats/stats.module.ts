import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ChatMessageEntity } from "../chat/chat-message.entity";
import { StatsController } from "./stats.controller";
import { StatsService } from "./stats.service";

@Module({
  // Las stats se agregan desde `chat_message`; el JOIN a `conversation` se hace
  // por nombre de tabla, así que basta con registrar esta entidad.
  imports: [TypeOrmModule.forFeature([ChatMessageEntity])],
  controllers: [StatsController],
  providers: [StatsService],
})
export class StatsModule {}
