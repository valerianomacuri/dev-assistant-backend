import { config as loadDotenv } from "dotenv";
import { AppConfig } from "./types.js";

loadDotenv();

function getRequiredEnvVar(name: string, defaultValue?: string): string {
  const value = process.env[name] ?? defaultValue;
  if (value === undefined) {
    throw new Error(`Variable de entorno requerida no encontrada: ${name}`);
  }
  return value;
}

function validateProvider(provider: string): "anthropic" | "openai" {
  if (provider === "anthropic" || provider === "openai") {
    return provider;
  }
  throw new Error(
    `MODEL_PROVIDER inválido: ${provider}. Debe ser "anthropic" o "openai"`,
  );
}

const rawProvider = process.env["MODEL_PROVIDER"] ?? "anthropic";

export const config: AppConfig = {
  provider: validateProvider(rawProvider),
  anthropicApiKey: getRequiredEnvVar("ANTHROPIC_API_KEY", ""),
  openaiApiKey: getRequiredEnvVar("OPENAI_API_KEY", ""),
  anthropicModel: getRequiredEnvVar("ANTHROPIC_MODEL", "claude-sonnet-4-6"),
  openaiModel: getRequiredEnvVar("OPENAI_MODEL", "gpt-4o-mini"),
  openaiEmbeddingModel: getRequiredEnvVar(
    "OPENAI_EMBEDDING_MODEL",
    "text-embedding-3-small",
  ),
  docsPath: getRequiredEnvVar("DOCS_PATH", "./docs/sample-project"),
  databaseUrl: getRequiredEnvVar(
    "DATABASE_URL",
    "postgresql://devassistant:devassistant@localhost:5432/devassistant",
  ),
  ragTopK: parseInt(getRequiredEnvVar("RAG_TOP_K", "5"), 10),
};

export default config;
