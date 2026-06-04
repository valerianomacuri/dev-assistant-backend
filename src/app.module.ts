import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthModule } from "./auth/auth.module";
import { ChatModule } from "./chat/chat.module";
import { validateEnv, type AppEnv } from "./config/configuration";
import { DocumentEntity } from "./documents/document.entity";
import { DocumentsModule } from "./documents/documents.module";
import { LlmModule } from "./llm/llm.module";
import { RagModule } from "./rag/rag.module";
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
        entities: [User, DocumentEntity],
        // synchronize solo en dev. En prod, usar migraciones.
        synchronize: true,
      }),
    }),
    LlmModule,
    RagModule,
    UsersModule,
    AuthModule,
    DocumentsModule,
    ChatModule,
  ],
})
export class AppModule {}
