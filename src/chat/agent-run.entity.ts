import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from "typeorm";

/** Estado de una ejecución del loop del agente (un turno del usuario). */
export type AgentRunStatus = "running" | "completed" | "failed" | "max_iters";

/**
 * Una ejecución del loop del agente: un turno del usuario = un run. Materializa
 * lo que antes era implícito en el transcript. Acumula los tokens del turno
 * (incluida caché) y mide la latencia real con `finishedAt - startedAt`.
 */
@Entity({ name: "agent_runs" })
export class AgentRunEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index()
  @Column({ name: "conversation_id", type: "uuid" })
  conversationId: string;

  @Column({ type: "varchar", default: "running" })
  status: AgentRunStatus;

  // Nº de vueltas agente→tools→agente dentro del turno.
  @Column({ type: "int", default: 0 })
  iterations: number;

  // Tokens acumulados del turno (suma de los mensajes `ai` del run).
  @Column({ name: "input_tokens", type: "int", default: 0 })
  inputTokens: number;

  @Column({ name: "output_tokens", type: "int", default: 0 })
  outputTokens: number;

  @Column({ name: "total_tokens", type: "int", default: 0 })
  totalTokens: number;

  @Column({ name: "cache_read_tokens", type: "int", default: 0 })
  cacheReadTokens: number;

  @Column({ name: "cache_creation_tokens", type: "int", default: 0 })
  cacheCreationTokens: number;

  @Column({ type: "text", nullable: true })
  error: string | null;

  @CreateDateColumn({ name: "started_at", type: "timestamptz" })
  startedAt: Date;

  // Se setea al finalizar el run; con startedAt da la latencia del turno.
  @Column({ name: "finished_at", type: "timestamptz", nullable: true })
  finishedAt: Date | null;
}
