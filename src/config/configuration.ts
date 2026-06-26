import { z } from "zod";

/**
 * Esquema de validación de variables de entorno.
 * Reemplaza al antiguo `src/config.ts` (dotenv manual) por la integración
 * con @nestjs/config + validación tipada con Zod.
 */
const envSchema = z.object({
  // Gobierna el comportamiento de TypeORM: en "production" se desactiva
  // `synchronize` y se corren migraciones; en local (default) se usa synchronize.
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
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

  // === S3 (AWS) ===
  // Endpoint opcional: en AWS S3 se deja vacío (la SDK resuelve el endpoint).
  S3_ENDPOINT: z.url().optional().or(z.literal("")),
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string().default("dev-assistant"),
  // Credenciales opcionales: si se omiten, se usa la cadena por defecto del SDK
  // (rol IAM / variables de entorno / perfil).
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  // En AWS S3 real va false (virtual-hosted style).
  S3_FORCE_PATH_STYLE: z.coerce.boolean().default(false),

  // === AWS (SQS + Lambda) ===
  AWS_REGION: z.string().default("us-east-1"),
  // Endpoint opcional: en AWS real se deja vacío.
  AWS_ENDPOINT: z.url().optional().or(z.literal("")),
  // Credenciales opcionales: si se omiten, se usa la cadena por defecto del SDK.
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  // Cola de la ingesta asíncrona (extracción → troceado → embeddings).
  SQS_INGEST_QUEUE: z.string().default("doc-ingest"),
  // Lambda que genera el PDF del reporte de stats.
  LAMBDA_STATS_REPORT: z.string().default("stats-report"),

  // Tamaño máximo de archivo subido (MB)
  MAX_UPLOAD_MB: z.coerce.number().default(20),

  // Orígenes permitidos para CORS (HTTP y WebSocket).
  CORS_ORIGINS: z
    .string()
    .default("*"),
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
