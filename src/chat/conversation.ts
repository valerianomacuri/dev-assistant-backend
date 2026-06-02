import config from "../config.js";
import { client } from "../llm/anthropic-client.js";
import { Message } from "../types.js";

const CHARS_PER_TOKEN = 4;

export class Conversation {
  private messages: Message[] = [];
  private systemPrompt: string;
  private totalInputsTokens: number = 0;
  private totalOutputsTokens: number = 0;

  constructor(systemPrompt: string = "") {
    this.systemPrompt = systemPrompt;
  }
  addUserMessage(text: string): void {
    this.messages.push({ role: "user", content: text });
  }
  addAssistantMessage(text: string): void {
    this.messages.push({ role: "assistant", content: text });
  }
  async send(): Promise<string> {
    const response = await client.messages.create({
      model: config.anthropicModel,
      max_tokens: 1024,
      ...(this.systemPrompt && { system: this.systemPrompt }),
      messages: this.messages,
    });
    //TODO
    this.addUsage(response.usage.input_tokens, response.usage.output_tokens);
    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("Claude no retornó un bloque de texto en la respuesta");
    }

    const responseText = textBlock.text;
    this.addAssistantMessage(responseText);
    return responseText;
  }
  addUsage(input_tokens: number, output_tokens: number) {
    this.totalInputsTokens += input_tokens;
    this.totalOutputsTokens += output_tokens;
  }
  clear(): void {
    this.messages = [];
    this.totalInputsTokens = 0;
    this.totalOutputsTokens = 0;
    console.log(" Conversación reiniciada");
  }
  getTurnCount(): number {
    return Math.floor(this.messages.length / 2);
  }
  estimateCurrentTokens(): number {
    const totalChars = this.messages.reduce(
      (sum, msg) => sum + msg.content.length,
      0,
    );
    return Math.floor(totalChars / CHARS_PER_TOKEN);
  }
  getStats(): { inputTokens: number; outputTokens: number; turns: number } {
    return {
      inputTokens: this.totalInputsTokens,
      outputTokens: this.totalOutputsTokens,
      turns: this.getTurnCount(),
    };
  }
  getHistory(): Message[] {
    return [...this.messages];
  }
}
