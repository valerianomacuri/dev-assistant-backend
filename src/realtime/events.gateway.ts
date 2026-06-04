import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import {
  OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import type { Server, Socket } from "socket.io";
import type { AppEnv } from "../config/configuration";
import type { JwtPayload } from "../auth/auth.types";

/** Nombre de la room por usuario. */
export function userRoom(userId: string): string {
  return `user:${userId}`;
}

/**
 * Gateway Socket.IO para empujar eventos en tiempo real al frontend
 * (progreso de ingestión de documentos). Autentica el handshake con el mismo
 * JWT que el resto de la API y aísla a cada usuario en su propia room.
 */
@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGINS?.split(",") ?? "*",
    credentials: true,
  },
})
export class EventsGateway implements OnGatewayConnection {
  private readonly logger = new Logger(EventsGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService<AppEnv, true>,
  ) {}

  /**
   * Valida el token del handshake (`auth.token`), une el socket a su room
   * `user:<id>` y desconecta si el token es inválido (evita filtrar eventos
   * entre usuarios).
   */
  handleConnection(client: Socket): void {
    const token =
      (client.handshake.auth?.token as string | undefined) ??
      (client.handshake.query?.token as string | undefined);

    if (!token) {
      this.logger.warn(`Conexión WS sin token: ${client.id}`);
      client.disconnect(true);
      return;
    }

    try {
      const payload = this.jwt.verify<JwtPayload>(token, {
        secret: this.config.get("JWT_SECRET", { infer: true }),
      });
      if (!payload?.sub) throw new Error("Token sin sub");
      void client.join(userRoom(payload.sub));
    } catch {
      this.logger.warn(`Token WS inválido: ${client.id}`);
      client.disconnect(true);
    }
  }
}
