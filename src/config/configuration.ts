import { z } from "zod";

/**
 * Esquema de validación de variables de entorno.
 * Reemplaza al antiguo `src/config.ts` (dotenv manual) por la integración
 * con @nestjs/config + validación tipada con Zod.
 */
const envSchema = z.object({
  PORT: z.coerce.number().default(3000),

  // === LLM / Embeddings ===
  ANTHROPIC_API_KEY: z.string().min(1, "ANTHROPIC_API_KEY es requerida"),
  ANTHROPIC_MODEL: z.string().default("claude-sonnet-4-6"),
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY es requerida"),
  OPENAI_EMBEDDING_MODEL: z.string().default("text-embedding-3-small"),

  // === Persistencia ===
  DATABASE_URL: z
    .string()
    .default(
      "postgresql://devassistant:devassistant@localhost:5432/devassistant",
    ),
  RAG_TOP_K: z.coerce.number().default(5),

  // === Auth ===
  JWT_SECRET: z.string().min(1, "JWT_SECRET es requerida"),
  JWT_EXPIRES_IN: z.string().default("7d"),

  // === S3 / MinIO ===
  S3_ENDPOINT: z.string().default("http://localhost:9000"),
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string().default("dev-assistant"),
  S3_ACCESS_KEY: z.string().default("minioadmin"),
  S3_SECRET_KEY: z.string().default("minioadmin"),
  S3_FORCE_PATH_STYLE: z.coerce.boolean().default(true),

  // Tamaño máximo de archivo subido (MB)
  MAX_UPLOAD_MB: z.coerce.number().default(20),
});

export type AppEnv = z.infer<typeof envSchema>;

/**
 * Valida `process.env` al arrancar. @nestjs/config llama a esta función
 * (opción `validate`) y aborta el boot si falta alguna variable requerida.
 */
export function validateEnv(config: Record<string, unknown>): AppEnv {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Configuración de entorno inválida:\n${issues}`);
  }
  return parsed.data;
}
