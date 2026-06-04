import { chatModel, buildMessages, extractText } from "./chat-model.js";

export async function streamClaude(
  prompt: string,
  systemPrompt?: string,
): Promise<string> {
  let fullResponse = "";
  const stream = await chatModel.stream(buildMessages(prompt, systemPrompt));
  for await (const chunk of stream) {
    const text = extractText(chunk.content);
    if (text) {
      process.stdout.write(text);
      fullResponse += text;
    }
  }
  process.stdout.write("\n");
  return fullResponse;
}
