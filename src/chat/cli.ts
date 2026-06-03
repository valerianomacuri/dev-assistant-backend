import * as readline from "readline";
import { processDirectory } from "../rag/chunker.js";
import { generateEmbeddings } from "../rag/embeddings.js";
import config from "../config.js";
import { VectorStore } from "../rag/vector-store.js";
import { resetStore } from "../rag/retriever.js";
import { DevAssistantAgent } from "../agent/agent.js";
import { ALL_TOOL_DEFINITIONS } from "../agent/tool-registry.js";

async function ingestDocs(docsPath: string): Promise<void> {
  console.log(`\nIniciando ingestión desde: ${docsPath}`);

  const chunks = await processDirectory(docsPath);

  if (chunks.length === 0) {
    console.log("No se encontraron archivos .md en ese directorio.");
    return;
  }

  console.log(`Generando embeddings para ${chunks.length} chunks...`);
  const embeddings = await generateEmbeddings(chunks.map((c) => c.content));

  const store = new VectorStore(config.dbPath);
  store.clear();

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const embedding = embeddings[i];
    if (chunk && embedding) store.insert(chunk, embedding);
  }

  console.log(`${store.size} chunks almacenados en ${config.dbPath}`);
  store.close();

  // Reiniciar el singleton
  resetStore();
  console.log("Vector store actualizado — listo para búsquedas\n");
}

export async function startCLI(): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const devAssistantAgent = new DevAssistantAgent();

  console.log("╔════════════════════════════════════════╗");
  console.log("║         DevAssistant v1.0              ║");
  console.log("║    Agente de Documentación y Código    ║");
  console.log("╚════════════════════════════════════════╝");
  console.log("");
  console.log("💬 Escribe tu pregunta y presiona Enter.");
  console.log("💡 Tip: usa /ingest para cargar documentación");
  console.log("   Comandos: /ingest [path],");
  console.log("             /clear, /stats, /tools, /exit");
  console.log("");

  const promptUser = (): void => {
    rl.question("Tú: ", async (input) => {
      const userInput = input.trim();
      if (!userInput) {
        promptUser();
        return;
      }
      if (userInput === "/stats") {
        const stats = devAssistantAgent.getStats();
        console.log(`\n📊 Estadísticas de la conversación:`);
        console.log(`   • Turnos: ${stats.turns}`);
        console.log(`   • Tokens de entrada acumulados: ${stats.inputTokens}`);
        console.log(`   • Tokens de salida acumulados: ${stats.outputTokens}`);
        console.log(
          `   • Tools Calls en último turno: ${stats.toolCallsLastTurn}`,
        );
        promptUser();
        return;
      }
      if (userInput === "/exit" || userInput === "/salida") {
        const stats = devAssistantAgent.getStats();
        console.log(`\n¡Hasta luego!`);
        console.log(
          ` Resumen: ${stats.turns} turnos ` +
            `${stats.inputTokens} tokens de entrada ` +
            `${stats.outputTokens} tokens de salida `,
        );
        rl.close();
        return;
      }
      if (userInput === "/clear" || userInput === "/limpiar") {
        devAssistantAgent.clearHistory();
        console.log("Historial del agente reiniciado\n");
        promptUser();
        return;
      }

      if (userInput === "/tools") {
        console.log(`\nTools disponibles (${ALL_TOOL_DEFINITIONS.length}):`);
        for (const tool of ALL_TOOL_DEFINITIONS) {
          const params = Object.keys(tool.input_schema.properties).join(", ");
          console.log(`   • ${tool.name}(${params})`);
          const shortDescription =
            tool.description.split(".")[0] ?? tool.description;
          console.log(`     ${shortDescription}.`);
        }
        console.log("");
        promptUser();
        return;
      }

      // ingest /docs-test
      if (userInput.startsWith("/ingest")) {
        const inputParts = userInput.split(" ");
        const docsDirectory = inputParts[1] ?? config.docsPath;
        try {
          await ingestDocs(docsDirectory);
        } catch (error) {
          const err = error as Error;
          console.error(`\nError durante la ingestión: ${err.message}`);
        }
        console.log("");
        promptUser();
        return;
      }
      try {
        process.stdout.write(`\nDevAssitantAgent: `);
        const response = await devAssistantAgent.chat(userInput, (fragment) => {
          process.stdout.write(fragment);
        });
        process.stdout.write(`\n`);
        if (response.toolsUsed.length > 0) {
          const uniqueTools = [...new Set(response.toolsUsed)];
          console.log(`\nHerramientas utilizadas: ${uniqueTools}`);
        }
        console.log("");
      } catch (error) {
        const err = error as Error;
        console.error(` Error: ${err.message}`);
      }
      promptUser();
    });
  };
  promptUser();
}
