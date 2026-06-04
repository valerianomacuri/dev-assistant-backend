import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { retrieveContext } from "../rag/retriever.js";

async function searchDocs(params: {
  query: string;
  top_k?: number;
}): Promise<string> {
  try {
    const topK = Math.min(params.top_k ?? 5, 10);
    const chunks = await retrieveContext(params.query, topK);
    if (chunks.length === 0) {
      return (
        "No se encontraron documentos relevantes para esta consulta" +
        "Asegúrate de haber ingestado documentación con el comando /ingest"
      );
    }
    const results = chunks
      .map((chunk) => {
        const source = chunk.metadata.source;
        const section = chunk.metadata.heading;
        const score = (chunk.score * 100).toFixed(0);
        return `[FUENTE: ${source} | Sección: ${section} | Relevancia: ${score}%\n${chunk.content}]`;
      })
      .join("\n\n---\n\n");
    return `Se encontraron ${chunks.length} fragmentos relevantes:\n\n${results}`;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `Error al buscar en la documentación: ${message}`;
  }
}

export const searchDocsTool = tool(async (input) => searchDocs(input), {
  name: "search_docs",
  description:
    "Busca información en la documentación ingestada usando búsqueda semántica. " +
    "Úsala cuando el usuario pregunta sobre cómo usar una API, conceptos del sistema, " +
    "o cualquier información que podría estar en los docs técnicos del proyecto. " +
    "Requiere que los documentos estén cargados con el comando /ingest. " +
    "Retorna los fragmentos más relevantes con su fuente y sección.",
  schema: z.object({
    query: z
      .string()
      .describe("La pregunta o tema a buscar en la documentación."),
    top_k: z
      .number()
      .optional()
      .describe("Número de fragmentos a recuperar (default: 5, máximo: 10)."),
  }),
});
