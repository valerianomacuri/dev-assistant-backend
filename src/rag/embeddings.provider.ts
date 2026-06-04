import { OpenAIEmbeddings } from "@langchain/openai";
import { ConfigService } from "@nestjs/config";
import type { Provider } from "@nestjs/common";
import type { AppEnv } from "../config/configuration";

/** Token de inyección de la instancia compartida de embeddings. */
export const EMBEDDINGS = "EMBEDDINGS";

/**
 * Provider de embeddings (LangChain OpenAIEmbeddings).
 * Lo consume el PGVectorStore para generar los vectores de los chunks.
 */
export const embeddingsProvider: Provider = {
  provide: EMBEDDINGS,
  inject: [ConfigService],
  useFactory: (config: ConfigService<AppEnv, true>) =>
    new OpenAIEmbeddings({
      model: config.get("OPENAI_EMBEDDING_MODEL", { infer: true }),
      apiKey: config.get("OPENAI_API_KEY", { infer: true }),
    }),
};
