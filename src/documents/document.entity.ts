import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from "typeorm";

export type DocumentStatus = "processing" | "ready" | "failed";

@Entity({ name: "documents" })
export class DocumentEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index()
  @Column({ name: "user_id", type: "uuid" })
  userId: string;

  @Column({ type: "varchar" })
  filename: string;

  @Column({ name: "s3_key", type: "varchar" })
  s3Key: string;

  @Column({ name: "mime_type", type: "varchar" })
  mimeType: string;

  @Column({ name: "size_bytes", type: "bigint" })
  sizeBytes: number;

  @Column({ name: "chunk_count", type: "int", default: 0 })
  chunkCount: number;

  @Column({ type: "varchar", default: "processing" })
  status: DocumentStatus;

  @Column({ name: "error_message", type: "varchar", nullable: true })
  errorMessage: string | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;
}
