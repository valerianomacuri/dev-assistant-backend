import * as fs from "fs/promises";
import * as path from "path";
import config from "../config.js";
import { processDirectory } from "./chunker.js";
import { VectorStore } from "./vector-store.js";

const PREVIEW_JSON = path.join("./data", "chunks-preview.json");

export async function runIngest(
  docsPath: string = config.docsPath,
): Promise<void> {
  console.log("Iniciando la ingestión de documentos..");
  console.log(`Directorio: ${docsPath}`);
  console.log("");

  const chunks = await processDirectory(docsPath);
  if (chunks.length === 0) {
    console.log("No se encuentran archivos .md en el directorio");
    return;
  }
  console.log(`Total de chunks generados ${chunks.length}`);

  const preview = chunks.map((chunk) => ({
    id: chunk.id,
    content:
      chunk.content.slice(0, 200) + (chunk.content.length > 200 ? "..." : ""),
    metadata: chunk.metadata,
  }));
  await fs.mkdir(path.dirname(PREVIEW_JSON), { recursive: true });
  await fs.writeFile(PREVIEW_JSON, JSON.stringify(preview, null, 2), "utf-8");

  console.log(`\nGuardando en Postgres + pgvector: ${config.databaseUrl}`);
  const store = await VectorStore.create();
  await store.clear();
  // PGVectorStore genera los embeddings (OpenAI) en batch internamente.
  await store.addChunks(chunks);
  const size = await store.size();
  await store.close();

  console.log(`Vector store guardado ${size} chunks en Postgres`);
  console.log(`\nTotal: ${chunks.length} chunks procesados`);
  console.log(`\nPreview en: ${PREVIEW_JSON}`);
  console.log(`\nIngestión completa, listo para la búsqueda semántica`);
}

runIngest().catch((error: Error) => {
  console.error(`Error durante la ingestión ${error.message}`);
  process.exit(1);
});
