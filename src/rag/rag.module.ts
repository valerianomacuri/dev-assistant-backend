import { Module } from "@nestjs/common";
import { embeddingsProvider } from "./embeddings.provider";
import { RetrieverService } from "./retriever.service";
import { VectorStoreService } from "./vector-store.service";

/**
 * Núcleo RAG: embeddings, vector store (pgvector) y retriever, todos con
 * aislamiento por usuario. Exporta lo necesario para ingesta (Documents) y
 * búsqueda (Chat).
 */
@Module({
  providers: [embeddingsProvider, VectorStoreService, RetrieverService],
  exports: [VectorStoreService, RetrieverService],
})
export class RagModule {}
