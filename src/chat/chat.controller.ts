import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
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
import { AgentService } from "./agent.service";
import { ConversationService, type ChatMessage } from "./conversation.service";
import type { ConversationEntity } from "./conversation.entity";

@UseGuards(JwtAuthGuard)
@Controller("chat")
export class ChatController {
  // Rate limiter por usuario (en memoria). Para multi-instancia, migrar a Redis.
  private readonly limiters = new Map<string, RateLimiter>();

  constructor(
    private readonly agent: AgentService,
    private readonly conversations: ConversationService,
  ) {}

  private limiterFor(userId: string): RateLimiter {
    let limiter = this.limiters.get(userId);
    if (!limiter) {
      limiter = createRateLimiter();
      this.limiters.set(userId, limiter);
    }
    return limiter;
  }

  /** Crea una conversación vacía para el usuario. */
  @Post("conversations")
  createConversation(@CurrentUser() user: AuthUser): Promise<ConversationEntity> {
    return this.conversations.create(user.id);
  }

  /** Lista las conversaciones del usuario (más reciente primero). */
  @Get("conversations")
  listConversations(@CurrentUser() user: AuthUser): Promise<ConversationEntity[]> {
    return this.conversations.list(user.id);
  }

  /** Historial de una conversación del usuario. */
  @Get("conversations/:id/messages")
  async history(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<ChatMessage[]> {
    await this.conversations.getOwned(user.id, id);
    return this.agent.loadHistory(id);
  }

  /** Borra (lógicamente) una conversación del usuario. */
  @Delete("conversations/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteConversation(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.conversations.delete(user.id, id);
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
    @Query("conversationId") conversationId: string,
    @Query("message") message: string,
  ): Observable<MessageEvent> {
    const text = (message ?? "").trim();
    if (!text) {
      return of({
        type: "error",
        data: "Falta el parámetro 'message'",
      } as MessageEvent);
    }
    if (!conversationId) {
      return of({
        type: "error",
        data: "Falta el parámetro 'conversationId'",
      } as MessageEvent);
    }

    const guardrail = checkGuardrails(text, this.limiterFor(user.id));
    if (!guardrail.safe) {
      return of({
        type: "error",
        data: guardrail.reason ?? "Solicitud rechazada",
      } as MessageEvent);
    }

    return this.agent.stream(user.id, conversationId, guardrail.sanitized).pipe(
      map(
        (event): MessageEvent => ({
          type: event.type,
          data: event.data,
        }),
      ),
    );
  }
}
