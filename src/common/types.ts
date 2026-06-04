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

export interface AgentResponse {
  text: string;
  toolsUsed: string[];
  inputTokens: number;
  outputTokens: number;
}
