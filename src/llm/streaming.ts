import config from "../config.js";
import { client } from "./anthropic-client.js";

export async function streamClaude(
  prompt: string,
  systemPrompt?: string,
): Promise<string> {
  let fullResponse = "";
  const responseStream = client.messages.stream({
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
  responseStream.on("text", (chunk) => {
    process.stdout.write(chunk);
    fullResponse += chunk;
  });
  await responseStream.finalMessage();
  process.stdout.write("\n");
  return fullResponse;
}
export async function streamClaudeWithCallback(
  prompt: string,
  onChunk: (textChunk: string) => void,
  systemPrompt?: string,
): Promise<string> {
  let fullResponse = "";

  const responseStream = client.messages.stream({
    model: config.anthropicModel,
    max_tokens: 1024,
    ...(systemPrompt && { system: systemPrompt }),
    messages: [{ role: "user", content: prompt }],
  });

  responseStream.on("text", (textChunk) => {
    onChunk(textChunk);
    fullResponse += textChunk;
  });

  await responseStream.finalMessage();
  return fullResponse;
}
