import { OpenAIEmbeddings } from "@langchain/openai";
import config from "../config.js";

/**
 * Instancia compartida de embeddings (LangChain OpenAIEmbeddings).
 * La usa tanto el PGVectorStore como las funciones helper de abajo.
 */
export const embeddings = new OpenAIEmbeddings({
  model: config.openaiEmbeddingModel,
  apiKey: config.openaiApiKey,
});
