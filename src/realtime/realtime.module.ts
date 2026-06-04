import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import type { AppEnv } from "../config/configuration";
import { EventsGateway } from "./events.gateway";
import { RealtimeService } from "./realtime.service";

/**
 * WebSockets (Socket.IO) para progreso de ingestión en tiempo real.
 * Reutiliza la misma config de JWT que la autenticación HTTP para validar el
 * handshake. Exporta `RealtimeService` para que los workers emitan eventos.
 */
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppEnv, true>) => ({
        secret: config.get("JWT_SECRET", { infer: true }),
      }),
    }),
  ],
  providers: [EventsGateway, RealtimeService],
  exports: [RealtimeService],
})
export class RealtimeModule {}
