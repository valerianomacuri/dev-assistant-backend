import * as readline from "readline";
import type { BaseMessage } from "@langchain/core/messages";
import { processDirectory } from "../rag/chunker.js";
import config from "../config.js";
import { VectorStore } from "../rag/vector-store.js";
import { resetStore } from "../rag/retriever.js";
import { DevAssistantAgent } from "../agent/agent.js";
import { closeCheckpointer } from "../agent/checkpointer.js";
import { closeStore } from "../agent/conversation-store.js";
import { extractText } from "../llm/chat-model.js";
import { TOOL_METADATA } from "../tools/index.js";
import { checkGuardrails, createRateLimiter } from "../security/guardrails.js";
import { calculateCost } from "../utils/cost-calculator.js";

/**
 * Imprime en pantalla los mensajes guardados de la conversación previa para
 * retomarla con contexto visible. Omite los mensajes de herramientas.
 */
function replayHistory(messages: BaseMessage[]): void {
  const visible = messages.filter((m) => {
    const type = m.getType();
    return type === "human" || type === "ai";
  });
  if (visible.length === 0) return;

  console.log("📜 Retomando conversación anterior:\n");
  for (const message of visible) {
    const text = extractText(message.content).trim();
    if (!text) continue;
    const speaker = message.getType() === "human" ? "Tú" : "DevAssitantAgent";
    console.log(`${speaker}: ${text}\n`);
  }
  console.log("──────────────────────────────────────────\n");
}

async function ingestDocs(docsPath: string): Promise<void> {
  console.log(`\nIniciando ingestión desde: ${docsPath}`);

  const chunks = await processDirectory(docsPath);

  if (chunks.length === 0) {
    console.log("No se encontraron archivos .md en ese directorio.");
    return;
  }

  console.log(`Generando embeddings para ${chunks.length} chunks...`);

  const store = await VectorStore.create();
  await store.clear();
  await store.addChunks(chunks);
  const size = await store.size();
  await store.close();

  console.log(`${size} chunks almacenados en Postgres`);

  // Reiniciar el singleton del retriever
  await resetStore();
  console.log("Vector store actualizado — listo para búsquedas\n");
}

export async function startCLI(): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const devAssistantAgent = await DevAssistantAgent.create();
  const rateLimiter = createRateLimiter();

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

  const history = await devAssistantAgent.loadHistory();
  replayHistory(history);

  const promptUser = (): void => {
    rl.question("Tú: ", async (input) => {
      const userInput = input.trim();
      if (!userInput) {
        promptUser();
        return;
      }
      if (userInput === "/stats") {
        const stats = devAssistantAgent.getStats();
        const sessionCost = calculateCost({
          inputTokens: stats.inputTokens,
          outputTokens: stats.outputTokens,
          model: config.anthropicModel,
        });
        console.log(`\n📊 Estadísticas de la conversación:`);
        console.log(`   • Turnos: ${stats.turns}`);
        console.log(`   • Tokens de entrada acumulados: ${stats.inputTokens}`);
        console.log(`   • Tokens de salida acumulados: ${stats.outputTokens}`);
        console.log(`   • Costo estimado de sesión: ${sessionCost.formatted}`);
        console.log(
          `   • Tools Calls en último turno: ${stats.toolCallsLastTurn}`,
        );
        promptUser();
        return;
      }
      if (userInput === "/exit" || userInput === "/salida") {
        const stats = devAssistantAgent.getStats();
        const sessionCost = calculateCost({
          inputTokens: stats.inputTokens,
          outputTokens: stats.outputTokens,
          model: config.anthropicModel,
        });
        console.log(`\n¡Hasta luego!`);
        console.log(
          ` Resumen: ${stats.turns} turnos ` +
            `${stats.inputTokens} tokens de entrada ` +
            `${stats.outputTokens} tokens de salida ` +
            `${sessionCost.formatted} costo estimado `,
        );
        await resetStore();
        await closeCheckpointer();
        await closeStore();
        rl.close();
        return;
      }
      if (userInput === "/clear" || userInput === "/limpiar") {
        await devAssistantAgent.clearHistory();
        console.log("Historial del agente reiniciado\n");
        promptUser();
        return;
      }

      if (userInput === "/tools") {
        console.log(`\nTools disponibles (${TOOL_METADATA.length}):`);
        for (const tool of TOOL_METADATA) {
          console.log(`   • ${tool.name}(${tool.paramNames.join(", ")})`);
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
        const guardrail = checkGuardrails(userInput, rateLimiter);
        if (!guardrail.safe) {
          console.log(`\n${guardrail.reason}`);
          promptUser();
          return;
        }
        const secureText = guardrail.sanitized;
        process.stdout.write(`\nDevAssitantAgent: `);
        const response = await devAssistantAgent.chat(
          secureText,
          (fragment) => {
            process.stdout.write(fragment);
          },
        );
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
