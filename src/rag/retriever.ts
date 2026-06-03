import config from "../config.js";
import type { RetrievedChunk } from "../types.js";
import { generateEmbedding } from "./embeddings.js";
import { VectorStore } from "./vector-store.js";

let vectorStoreInstance: VectorStore | null = null;
function getStore(): VectorStore {
  if (!vectorStoreInstance) {
    vectorStoreInstance = new VectorStore(config.dbPath);
  }
  return vectorStoreInstance;
}
export async function retrieveContext(
  query: string,
  topK: number = config.ragTopK,
): Promise<RetrievedChunk[]> {
  const store = getStore();
  if (store.size === 0) {
    console.log(
      "Vector store vacío - usa /ingest para cargar la documentación",
    );
    return [];
  }
  const queryVector = await generateEmbedding(query);
  const topSearchResults = store.search(queryVector, topK);
  const chunks: RetrievedChunk[] = topSearchResults.map((result) => ({
    ...result.chunk,
    score: result.score,
  }));
  const preview = query.length > 50 ? query.slice(0, 50) + "..." : query;
  console.log(`Buscando: "${preview}" -> ${chunks.length} chunks recuperados`);
  return chunks;
}
export function resetStore(): void {
  if (vectorStoreInstance) {
    vectorStoreInstance.close();
    vectorStoreInstance = null;
  }
}
