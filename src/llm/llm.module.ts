import { Module } from "@nestjs/common";
import { CHAT_MODEL, chatModelProvider } from "./chat-model.provider";

/**
 * Expone el modelo de chat compartido (ChatAnthropic) al resto de la app.
 */
@Module({
  providers: [chatModelProvider],
  exports: [CHAT_MODEL],
})
export class LlmModule {}
