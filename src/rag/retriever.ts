import config from "../config.js";
import type { RetrievedChunk } from "../types.js";
import { VectorStore } from "./vector-store.js";

// Se cachea la PROMESA para no abrir múltiples pools de conexión a Postgres.
let vectorStorePromise: Promise<VectorStore> | null = null;

function getStore(): Promise<VectorStore> {
  if (!vectorStorePromise) {
    vectorStorePromise = VectorStore.create();
  }
  return vectorStorePromise;
}

export async function retrieveContext(
  query: string,
  topK: number = config.ragTopK,
): Promise<RetrievedChunk[]> {
  const store = await getStore();
  if ((await store.size()) === 0) {
    console.log(
      "Vector store vacío - usa /ingest para cargar la documentación",
    );
    return [];
  }
  const chunks = await store.search(query, topK);
  const preview = query.length > 50 ? query.slice(0, 50) + "..." : query;
  console.log(`Buscando: "${preview}" -> ${chunks.length} chunks recuperados`);
  return chunks;
}

export async function resetStore(): Promise<void> {
  if (vectorStorePromise) {
    const store = await vectorStorePromise;
    await store.close();
    vectorStorePromise = null;
  }
}
