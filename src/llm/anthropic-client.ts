import Anthropic from "@anthropic-ai/sdk";
import config from "../config.js";

const client = new Anthropic({ apiKey: config.anthropicApiKey });

export async function askClaude(
  prompt: string,
  systemPrompt?: string,
): Promise<string> {
  const response = await client.messages.create({
    model: config.anthropicModel,
    max_tokens: 1024,
    ...(systemPrompt && { system: systemPrompt }),
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
  });
  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude no retornó un bloque de texto en la respuesta");
  }
  return textBlock.text;
}
export { client };
