import { ChatAnthropic } from "@langchain/anthropic";
import {
  HumanMessage,
  SystemMessage,
  type BaseMessageLike,
  type MessageContent,
} from "@langchain/core/messages";
import config from "../config.js";

/**
 * Modelo de chat compartido (LangChain ChatAnthropic).
 * Reemplaza al cliente directo del SDK de Anthropic.
 */
export const chatModel = new ChatAnthropic({
  model: config.anthropicModel,
  maxTokens: 1024,
  apiKey: config.anthropicApiKey,
});

/**
 * Extrae el texto plano del contenido de un mensaje de LangChain,
 * que puede ser un string o un arreglo de bloques de contenido.
 */
export function extractText(content: MessageContent): string {
  if (typeof content === "string") {
    return content;
  }
  return content
    .map((block) =>
      typeof block === "string"
        ? block
        : block.type === "text"
          ? block.text
          : "",
    )
    .join("");
}

function buildMessages(
  prompt: string,
  systemPrompt?: string,
): BaseMessageLike[] {
  return systemPrompt
    ? [new SystemMessage(systemPrompt), new HumanMessage(prompt)]
    : [new HumanMessage(prompt)];
}

export { buildMessages };
