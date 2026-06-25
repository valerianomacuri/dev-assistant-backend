/** Mensaje de la cola `ingest`: documento recién subido a S3, listo para procesar. */
export interface IngestMessage {
  documentId: string;
  userId: string;
  s3Key: string;
  filename: string;
  mimeType: string;
}
