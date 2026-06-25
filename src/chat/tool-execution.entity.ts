import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

/** Resultado de una ejecución de tool. */
export type ToolExecutionStatus = "success" | "error";

/**
 * Registro de una invocación de tool dentro de un run: captura input/output,
 * estado y latencia. Se vincula al `MessageEntity` (ToolMessage) que contiene
 * su resultado y al run que la originó.
 */
@Entity({ name: "tool_executions" })
export class ToolExecutionEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index()
  @Column({ name: "message_id", type: "uuid" })
  messageId: string;

  @Index()
  @Column({ name: "run_id", type: "uuid", nullable: true })
  runId: string | null;

  @Column({ name: "tool_name", type: "varchar" })
  toolName: string;

  // Mismo id que en el AIMessage / ToolMessage.
  @Column({ name: "tool_call_id", type: "varchar", nullable: true })
  toolCallId: string | null;

  @Column({ type: "jsonb", nullable: true })
  input: unknown | null;

  @Column({ type: "jsonb", nullable: true })
  output: unknown | null;

  @Column({ type: "varchar" })
  status: ToolExecutionStatus;

  @Column({ type: "text", nullable: true })
  error: string | null;

  @Column({ name: "latency_ms", type: "int", nullable: true })
  latencyMs: number | null;

  @Column({ name: "created_at", type: "timestamptz", default: () => "now()" })
  createdAt: Date;
}
