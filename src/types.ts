export interface Chunk {
  id: string;
  content: string;
  metadata: {
    source: string;
    heading: string;
    position: number;
    charCount: number;
  };
}

export interface RetrievedChunk extends Chunk {
  score: number;
}

export type ModelProvider = "anthropic" | "openai";

export interface AppConfig {
  provider: ModelProvider;
  anthropicApiKey: string;
  openaiApiKey: string;
  anthropicModel: string;
  openaiModel: string;
  openaiEmbeddingModel: string;
  docsPath: string;
  databaseUrl: string;
  ragTopK: number;
}

export interface AgentResponse {
  text: string;
  toolsUsed: string[];
  inputTokens: number;
  outputTokens: number;
}
