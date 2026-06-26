import "reflect-metadata";
import { Logger as NestLogger, ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { Logger } from "nestjs-pino";
import { AppModule } from "./app.module";
import type { AppEnv } from "./config/configuration";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.flushLogs();

  const allowedOrigins =
    process.env.CORS_ORIGINS === "*"
      ? true
      : process.env.CORS_ORIGINS?.split(",").map(o => o.trim());

  app.enableCors({
    origin: allowedOrigins,
    credentials: false,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const config = app.get(ConfigService<AppEnv, true>);
  const port = config.get("PORT", { infer: true });

  await app.listen(port);
  NestLogger.log(
    `DevAssistant API escuchando en http://localhost:${port}`,
    "Bootstrap",
  );
}

void bootstrap();
