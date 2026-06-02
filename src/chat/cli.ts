import * as readline from "readline";
import { Conversation } from "./conversation.js";
import { DOCUMENTATION_ASSISTANT_PROMPT } from "../llm/prompts.js";
import { TOOL_DEFINITIONS } from "../tools/definitions.js";
import { runWithTools } from "../tools/agent-loop.js";

export async function startCLI(): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const conversation = new Conversation(DOCUMENTATION_ASSISTANT_PROMPT);
  console.log("╔════════════════════════════════════════╗");
  console.log("║         DevAssistant v0.2              ║");
  console.log("║   Asistente de Documentación IA        ║");
  console.log("║   Ahora con tools para el codebase     ║");
  console.log("╚════════════════════════════════════════╝");
  console.log("");
  console.log("💬 Escribe tu pregunta y presiona Enter.");
  console.log(
    `   Tengo acceso a ${TOOL_DEFINITIONS.length} tools: ${TOOL_DEFINITIONS.map((t) => t.name).join(", ")}`,
  );
  console.log("   Comandos: /clear, /stats, /tools, /exit");
  console.log("");

  const promptUser = (): void => {
    rl.question("Tú: ", async (input) => {
      const userInput = input.trim();
      if (!userInput) {
        promptUser();
        return;
      }
      if (userInput === "/stats") {
        const stats = conversation.getStats();
        console.log(`\n📊 Estadísticas de la conversación:`);
        console.log(`   • Turnos: ${stats.turns}`);
        console.log(`   • Tokens de entrada acumulados: ${stats.inputTokens}`);
        console.log(`   • Tokens de salida acumulados: ${stats.outputTokens}`);
        console.log(
          `   • Tokens estimados en contexto actual: ${conversation.estimateCurrentTokens()}\n`,
        );
        promptUser();
        return;
      }
      if (userInput === "/exit" || userInput === "/salida") {
        const stats = conversation.getStats();
        console.log(
          ` Resumen: ${stats.turns} turnos ` +
            `${stats.inputTokens} tokens de entrada ` +
            `${stats.outputTokens} tokens de salida `,
        );
        rl.close();
        return;
      }
      if (userInput === "/clear" || userInput === "/limpiar") {
        conversation.clear();
        promptUser();
        return;
      }

      if (userInput === "/tools") {
        console.log(`\nTools disponibles (${TOOL_DEFINITIONS.length}):`);
        for (const tool of TOOL_DEFINITIONS) {
          const params = Object.keys(tool.input_schema.properties).join(", ");
          console.log(`   • ${tool.name}(${params})`);
          console.log(`     ${tool.description.split(".")[0]}.`);
        }
        console.log("");
        promptUser();
        return;
      }
      try {
        conversation.addUserMessage(userInput);
        const response = await runWithTools(
          userInput,
          DOCUMENTATION_ASSISTANT_PROMPT,
          TOOL_DEFINITIONS,
        );
        process.stdout.write(`\nClaude: ${response}\n\n`);
        conversation.addAssistantMessage(response);
      } catch (error) {
        const err = error as Error;
        console.error(` Error: ${err.message}`);
      }
      promptUser();
    });
  };
  promptUser();
}
