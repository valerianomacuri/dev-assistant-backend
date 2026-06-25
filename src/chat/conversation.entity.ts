import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

/**
 * Una conversación de chat de un usuario. Cada usuario puede tener varias.
 * Los mensajes asociados viven en `messages`, ordenados por `created_at`.
 *
 * El borrado es lógico (`deletedAt`): TypeORM excluye automáticamente las
 * filas con `deletedAt` no nulo en los `find`/`findOne` del repositorio.
 */
@Entity({ name: "conversations" })
export class ConversationEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index()
  @Column({ name: "user_id", type: "uuid" })
  userId: string;

  // Se autogenera a partir del primer mensaje del usuario (truncado).
  @Column({ type: "varchar", default: "Nueva conversación" })
  title: string;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt: Date;

  @DeleteDateColumn({ name: "deleted_at", type: "timestamptz", nullable: true })
  deletedAt: Date | null;
}
