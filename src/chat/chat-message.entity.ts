import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from "typeorm";
import type { ToolCall } from "@langchain/core/messages/tool";
import type { MessageContent } from "@langchain/core/messages";

/** Tipo de mensaje persistido del transcript del agente. */
export type ChatMessageType = "human" | "ai" | "tool";

/**
 * Un mensaje del transcript completo de una conversación, tal cual lo produce
 * LangGraph: incluye `AIMessage` con `tool_calls` y `ToolMessage` con sus
 * resultados, no solo el texto usuario/asistente. Esto permite reconstruir
 * `BaseMessage[]` válidos (pares tool_use/tool_result correctos) al reenviar
 * el historial a Claude en cada turno.
 */
@Entity({ name: "chat_message" })
export class ChatMessageEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index()
  @Column({ name: "conversation_id", type: "uuid" })
  conversationId: string;

  // Orden dentro de la conversación. Lo asigna el servicio al persistir el
  // lote del turno; ordenar por `seq` asc evita colisiones de timestamp.
  @Column({ type: "int" })
  seq: number;

  @Column({ type: "varchar" })
  type: ChatMessageType;

  // String o bloques estructurados (el contenido de Claude puede ser array).
  @Column({ type: "jsonb" })
  content: MessageContent;

  // Solo para `ai`: tool calls solicitadas en ese mensaje.
  @Column({ name: "tool_calls", type: "jsonb", nullable: true })
  toolCalls: ToolCall[] | null;

  // Solo para `tool`: id de la tool call que responde y nombre de la tool.
  @Column({ name: "tool_call_id", type: "varchar", nullable: true })
  toolCallId: string | null;

  @Column({ type: "varchar", nullable: true })
  name: string | null;

  // === Métricas del turno (solo en mensajes `ai`; 0/null en human/tool) ===
  // Las stats se agregan desde estas columnas: el transcript y sus métricas son
  // la misma fila, así que no pueden desincronizarse.

  // Modelo que generó el mensaje; se guarda para que el costo histórico sea fiel
  // aunque luego cambie el modelo configurado o la tabla de precios.
  @Column({ type: "varchar", nullable: true })
  model: string | null;

  @Column({ name: "input_tokens", type: "int", default: 0 })
  inputTokens: number;

  @Column({ name: "output_tokens", type: "int", default: 0 })
  outputTokens: number;

  // Tokens leídos de caché de prompt; queda en 0 hasta activar prompt caching.
  @Column({ name: "cached_tokens", type: "int", default: 0 })
  cachedTokens: number;

  @Column({ name: "cost_usd", type: "double precision", default: 0 })
  costUsd: number;

  // Latencia del TURNO completo (ms), guardada solo en el último mensaje `ai`
  // del turno. Mide la espera real del usuario, incluidas las tools.
  @Column({ name: "latency_ms", type: "int", default: 0 })
  latencyMs: number;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;
}
