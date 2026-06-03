import { streamClaudeWithCallback } from "../llm/streaming.js";
import type { RetrievedChunk } from "../types.js";
import { retrieveContext } from "./retriever.js";

const RAG_SYSTEM_PROMPT = `Eres DevAssistant, un asistente de documentación técnica.
Tu trabajo es responder preguntas basándote ÚNICAMENTE en la documentación que se te proporciona como contexto.
Reglas importantes:
1. Si la información está en el contexto: responde citando la fuente (nombre del archivo y sección)
2. Si la información NO está en el contexto: di claramente "No tengo esa información en la documentación disponible"
3. Nunca inventes datos técnicos, versiones, endpoints, o configuraciones
4. Usa markdown para formatear tu respuesta (código, listas, encabezados)
5. Sé conciso y directo — los developers prefieren respuestas específicas`;

function formatContext(chunks: RetrievedChunk[]): string {
  return chunks
    .map(
      (chunk) =>
        `[FUENTE: ${chunk.metadata.source} | Sección: ${chunk.metadata.heading}]\n${chunk.content}`,
    )
    .join("\n\n---\n\n");
}

export async function askWithRAG(
  question: string,
  onChunk?: (chunk: string) => void,
): Promise<string> {
  const chunks = await retrieveContext(question);
  if (chunks.length == 0) {
    const message =
      "No hay documentación disponible en le vector store.\n" +
      "Usa el comando /ingest";
    onChunk?.(message);
    return message;
  }
  const sources = [
    ...new Set(
      chunks.map(
        (chunk) => `${chunk.metadata.source} (${chunk.metadata.heading})`,
      ),
    ),
  ];
  console.log(`\nContexto recuperado de: `);
  for (const source of sources) {
    console.log(`-> ${source}`);
  }
  const formattedContext = formatContext(chunks);
  const augmentedPrompt = `Contexto recuperado de la documentación:
    ---
    ${formattedContext}
    ---
    Basándote ÚNICAMENTE en el contexto anterior, responde la siguiente pregunta.
    Si la información no está en el contexto, indica claramente que no tienes esa información.
    Cita la fuente (nombre del archivo y sección) cuando sea posible.
    Pregunta: ${question}`;
  const callback = onChunk ?? (() => undefined);
  const response = await streamClaudeWithCallback(
    augmentedPrompt,
    callback,
    RAG_SYSTEM_PROMPT,
  );
  return response;
}
