/** Mensaje de la cola `doc-chunking`: documento recién subido a S3. */
export interface ChunkingMessage {
  documentId: string;
  userId: string;
  s3Key: string;
  filename: string;
  mimeType: string;
}

/**
 * Mensaje de la cola `doc-embeddings`: puntero (claim-check) al JSON con los
 * chunks ya troceados, subido a S3 por la etapa de chunking.
 */
export interface EmbeddingsMessage {
  documentId: string;
  userId: string;
  chunksKey: string;
  count: number;
}
