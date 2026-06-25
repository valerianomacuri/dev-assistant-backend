import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";
import type { StoredMessage } from "@langchain/core/messages";
import type { ToolCall } from "@langchain/core/messages/tool";

/** Tipo de mensaje persistido (LangChain `_getType`). */
export type ChatMessageType = "human" | "ai" | "tool" | "system";

/**
 * Un mensaje del transcript, mapeado 1:1 con los mensajes de LangChain. La
 * columna `raw` guarda el `StoredMessage` serializado completo, de modo que el
 * transcript se reconstruye con fidelidad total (pares tool_use/tool_result) al
 * reenviarlo a Claude. El resto de columnas son proyecciones para UI, búsqueda
 * y métricas.
 */
@Entity({ name: "messages" })
export class MessageEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index()
  @Column({ name: "conversation_id", type: "uuid" })
  conversationId: string;

  // Run que generó el mensaje. Null si el run se borró (ON DELETE SET NULL).
  @Index()
  @Column({ name: "run_id", type: "uuid", nullable: true })
  runId: string | null;

  // === Tipo y origen ===
  @Column({ type: "varchar" })
  type: ChatMessageType;

  // "model" o el nombre del tool.
  @Column({ type: "varchar", nullable: true })
  name: string | null;

  // "msg_016hVD..." de Anthropic.
  @Column({ name: "provider_message_id", type: "varchar", nullable: true })
  providerMessageId: string | null;

  // === Contenido ===
  // Texto plano extraído (UI / búsqueda).
  @Column({ name: "text_content", type: "text", nullable: true })
  textContent: string | null;

  // [{name, args, id, type}] en mensajes ai.
  @Column({ name: "tool_calls", type: "jsonb", nullable: true })
  toolCalls: ToolCall[] | null;

  // Tool calls malformadas.
  @Column({ name: "invalid_tool_calls", type: "jsonb", nullable: true })
  invalidToolCalls: unknown[] | null;

  // En mensajes tool: a qué llamada responde.
  @Column({ name: "tool_call_id", type: "varchar", nullable: true })
  toolCallId: string | null;

  // === Metadata del modelo ===
  @Column({ type: "varchar", nullable: true })
  model: string | null;

  @Column({ name: "model_provider", type: "varchar", nullable: true })
  modelProvider: string | null;

  // stop_reason: tool_use | end_turn | max_tokens
  @Column({ name: "finish_reason", type: "varchar", nullable: true })
  finishReason: string | null;

  @Column({ name: "service_tier", type: "varchar", nullable: true })
  serviceTier: string | null;

  // === Uso de tokens (incluye caché) ===
  @Column({ name: "input_tokens", type: "int", nullable: true })
  inputTokens: number | null;

  @Column({ name: "output_tokens", type: "int", nullable: true })
  outputTokens: number | null;

  @Column({ name: "total_tokens", type: "int", nullable: true })
  totalTokens: number | null;

  @Column({ name: "cache_read_tokens", type: "int", default: 0 })
  cacheReadTokens: number;

  @Column({ name: "cache_creation_tokens", type: "int", default: 0 })
  cacheCreationTokens: number;

  // Fidelidad total para reconstruir el objeto LangChain (StoredMessage).
  @Column({ type: "jsonb" })
  raw: StoredMessage;

  // Nº de vuelta dentro del run.
  @Column({ type: "int", nullable: true })
  iteration: number | null;

  // Orden del transcript: el servicio asigna `createdAt` estrictamente creciente
  // al persistir el lote del turno, así `ORDER BY created_at ASC` es determinista
  // (no es CreateDateColumn para poder fijar el valor explícito).
  @Column({ name: "created_at", type: "timestamptz", default: () => "now()" })
  createdAt: Date;
}
