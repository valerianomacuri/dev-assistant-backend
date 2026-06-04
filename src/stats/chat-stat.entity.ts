import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from "typeorm";

/** Estadísticas persistidas de un turno de chat (un registro por respuesta). */
@Entity({ name: "chat_stat" })
export class ChatStatEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index()
  @Column({ name: "user_id", type: "uuid" })
  userId: string;

  @Column({ name: "input_tokens", type: "int", default: 0 })
  inputTokens: number;

  @Column({ name: "output_tokens", type: "int", default: 0 })
  outputTokens: number;

  // Modelo usado en el turno; se guarda para que el costo histórico sea fiel
  // aunque luego cambie el modelo configurado o la tabla de precios.
  @Column({ type: "varchar" })
  model: string;

  @Column({ name: "cost_usd", type: "double precision", default: 0 })
  costUsd: number;

  // Nombres de las herramientas invocadas en el turno.
  @Column({ name: "tools_used", type: "jsonb", default: () => "'[]'" })
  toolsUsed: string[];

  @Column({ name: "limit_reached", type: "boolean", default: false })
  limitReached: boolean;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;
}
