import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthModule } from "./auth/auth.module";
import { AwsModule } from "./aws/aws.module";
import { AgentRunEntity } from "./chat/agent-run.entity";
import { ChatModule } from "./chat/chat.module";
import { ConversationEntity } from "./chat/conversation.entity";
import { MessageEntity } from "./chat/message.entity";
import { ToolExecutionEntity } from "./chat/tool-execution.entity";
import { validateEnv, type AppEnv } from "./config/configuration";
import { DocumentEntity } from "./documents/document.entity";
import { DocumentsModule } from "./documents/documents.module";
import { HealthModule } from "./health/health.module";
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
      useFactory: (config: ConfigService<AppEnv, true>) => {
        return {
          type: "postgres" as const,
          url: config.get("DATABASE_URL", { infer: true }),
          entities: [
            User,
            DocumentEntity,
            ConversationEntity,
            AgentRunEntity,
            MessageEntity,
            ToolExecutionEntity,
          ],
          synchronize: false,
          // Migraciones compiladas (dist/*.js) o fuente (*.ts). En el contenedor
          // de prod se ejecutan automáticamente al arrancar (migrationsRun).
          migrations: [__dirname + "/database/migrations/*.{js,ts}"],
          migrationsRun: true,
        };
      },
    }),
    AwsModule,
    LlmModule,
    RagModule,
    UsersModule,
    AuthModule,
    DocumentsModule,
    ChatModule,
    StatsModule,
    HealthModule,
  ],
})
export class AppModule { }
