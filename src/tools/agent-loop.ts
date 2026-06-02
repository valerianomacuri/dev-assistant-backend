import Anthropic from "@anthropic-ai/sdk";
import type { ToolDefinition } from "../types.js";
import { TOOL_DEFINITIONS } from "./definitions.js";
import { client } from "../llm/anthropic-client.js";
import config from "../config.js";
import { executeTool } from "./executor.js";

const MAX_ITERATIONS = 10;

export async function runWithTools(
  prompt: string,
  systemPrompt?: string,
  tools?: ToolDefinition[],
): Promise<string> {
  const messages: Anthropic.Messages.MessageParam[] = [
    { role: "user", content: prompt },
  ];
  const sdkTools = (tools ?? TOOL_DEFINITIONS) as Anthropic.Messages.Tool[];

  for (let interation = 0; interation < MAX_ITERATIONS; interation++) {
    console.log(`\nPensando... (iteración ${interation + 1})`);

    const response = await client.messages.create({
      model: config.anthropicModel,
      max_tokens: 4096,
      ...(systemPrompt && { system: systemPrompt }),
      tools: sdkTools,
      messages,
    });
    if (response.stop_reason === "end_turn") {
      const finalText = response.content
        .filter(
          (block): block is Anthropic.Messages.TextBlock =>
            block.type === "text",
        )
        .map((block) => block.text)
        .join("\n");
      console.log("Respuesta final generada\n");
      return finalText;
    }
    if (response.stop_reason === "tool_use") {
      messages.push({
        role: "assistant",
        content: response.content,
      });

      const toolUseBlocks = response.content.filter(
        (block): block is Anthropic.Messages.ToolUseBlock =>
          block.type === "tool_use",
      );

      const results = await Promise.all(
        toolUseBlocks.map(async (block) => {
          console.log(
            `Ejecutando tool: ${block.name} (${JSON.stringify(block.input)})`,
          );
          const toolOutput = await executeTool(
            block.name,
            block.input as Record<string, unknown>,
          );
          console.log(`Herramienta completada: ${block.name}`);
          return toolOutput;
        }),
      );
      const toolResultContent: Anthropic.Messages.ToolResultBlockParam[] =
        toolUseBlocks.map((block, i) => ({
          type: "tool_result" as const,
          tool_use_id: block.id,
          content: results[i] ?? "Error: resultado vacío",
        }));
      messages.push({
        role: "user",
        content: toolResultContent,
      });
      continue;
    }
    console.warn(
      `Stop reason inesperado:${response.stop_reason ?? "desconocido"}`,
    );
    const consolidateMessageText = response.content
      .filter(
        (block): block is Anthropic.Messages.TextBlock => block.type === "text",
      )
      .map((block) => block.text)
      .join("\n");

    return (
      consolidateMessageText ||
      `Sesion terminada: ${response.stop_reason ?? "razón desconocida"}`
    );
  }
  console.warn(` Límite de ${MAX_ITERATIONS} iteraciones alcanzado`);
  return (
    `Lo siento, no pude completar la tarea en ${MAX_ITERATIONS} iteraciones. ` +
    ` Intenta una pregunta más específica.`
  );
}
