import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Query,
  Sse,
  UseGuards,
  type MessageEvent,
} from "@nestjs/common";
import { Observable, map, of } from "rxjs";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/auth.types";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import {
  checkGuardrails,
  createRateLimiter,
  RateLimiter,
} from "../security/guardrails";
import { AgentService, type ChatMessage } from "./agent.service";

@UseGuards(JwtAuthGuard)
@Controller("chat")
export class ChatController {
  // Rate limiter por usuario (en memoria). Para multi-instancia, migrar a Redis.
  private readonly limiters = new Map<string, RateLimiter>();

  constructor(private readonly agent: AgentService) {}

  private limiterFor(userId: string): RateLimiter {
    let limiter = this.limiters.get(userId);
    if (!limiter) {
      limiter = createRateLimiter();
      this.limiters.set(userId, limiter);
    }
    return limiter;
  }

  /**
   * Streaming de la respuesta del agente vía SSE.
   * El token JWT puede ir en el header Authorization o en `?token=` (necesario
   * para EventSource, que no permite headers personalizados).
   * Eventos: `token` (fragmentos de texto), `done` (metadata), `error`.
   */
  @Sse("stream")
  stream(
    @CurrentUser() user: AuthUser,
    @Query("message") message: string,
  ): Observable<MessageEvent> {
    const text = (message ?? "").trim();
    if (!text) {
      return of({
        type: "error",
        data: "Falta el parámetro 'message'",
      } as MessageEvent);
    }

    const guardrail = checkGuardrails(text, this.limiterFor(user.id));
    if (!guardrail.safe) {
      return of({
        type: "error",
        data: guardrail.reason ?? "Solicitud rechazada",
      } as MessageEvent);
    }

    return this.agent.stream(user.id, guardrail.sanitized).pipe(
      map(
        (event): MessageEvent => ({
          type: event.type,
          data: event.data,
        }),
      ),
    );
  }

  /** Carga el historial de la conversación del usuario. */
  @Get("history")
  history(@CurrentUser() user: AuthUser): Promise<ChatMessage[]> {
    return this.agent.loadHistory(user.id);
  }

  /** Limpia la conversación del usuario. */
  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  clear(@CurrentUser() user: AuthUser): Promise<void> {
    return this.agent.clear(user.id);
  }
}
