import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthModule } from "./auth/auth.module";
import { AwsModule } from "./aws/aws.module";
import { ChatMessageEntity } from "./chat/chat-message.entity";
import { ChatModule } from "./chat/chat.module";
import { ConversationEntity } from "./chat/conversation.entity";
import { validateEnv, type AppEnv } from "./config/configuration";
import { DocumentEntity } from "./documents/document.entity";
import { DocumentsModule } from "./documents/documents.module";
import { LlmModule } from "./llm/llm.module";
import { RagModule } from "./rag/rag.module";
import { StatsModule } from "./stats/stats.module";
import { User } from "./users/user.entity";
import { UsersModule } from "./users/users.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppEnv, true>) => ({
        type: "postgres",
        url: config.get("DATABASE_URL", { infer: true }),
        entities: [
          User,
          DocumentEntity,
          ConversationEntity,
          ChatMessageEntity,
        ],
        // synchronize solo en dev. En prod, usar migraciones.
        synchronize: true,
      }),
    }),
    AwsModule,
    LlmModule,
    RagModule,
    UsersModule,
    AuthModule,
    DocumentsModule,
    ChatModule,
    StatsModule,
  ],
})
export class AppModule {}
