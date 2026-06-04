import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AppEnv } from "../config/configuration";
import type { RetrievedChunk } from "../common/types";
import { VectorStoreService } from "./vector-store.service";

@Injectable()
export class RetrieverService {
  constructor(
    private readonly vectorStore: VectorStoreService,
    private readonly config: ConfigService<AppEnv, true>,
  ) {}

  /**
   * Recupera contexto relevante para `query` SOLO entre los documentos del
   * usuario indicado. Reemplaza al `retrieveContext` global de la CLI.
   */
  async retrieveContext(
    userId: string,
    query: string,
    topK?: number,
  ): Promise<RetrievedChunk[]> {
    const k = topK ?? this.config.get("RAG_TOP_K", { infer: true }) ?? 5;
    return this.vectorStore.search(userId, query, k);
  }
}
