import { ChatAnthropic } from "@langchain/anthropic";
import type { MessageContent } from "@langchain/core/messages";
import { ConfigService } from "@nestjs/config";
import type { Provider } from "@nestjs/common";
import type { AppEnv } from "../config/configuration";

/**
 * Token de inyección del modelo de chat compartido (LangChain ChatAnthropic).
 */
export const CHAT_MODEL = "CHAT_MODEL";

/**
 * Provider del modelo de chat. Reemplaza la instancia global de
 * `src/llm/chat-model.ts`: ahora se construye desde la configuración inyectada.
 */
export const chatModelProvider: Provider = {
  provide: CHAT_MODEL,
  inject: [ConfigService],
  useFactory: (config: ConfigService<AppEnv, true>) =>
    new ChatAnthropic({
      model: config.get("ANTHROPIC_MODEL", { infer: true }),
      maxTokens: 1024,
      apiKey: config.get("ANTHROPIC_API_KEY", { infer: true }),
    }),
};

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
