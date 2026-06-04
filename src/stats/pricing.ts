// USD por 1 millón de tokens (precios a mayo 2026)
// https://platform.claude.com/docs/en/about-claude/pricing y https://developers.openai.com/api/docs/pricing
export const PRICING: Record<string, { input: number; output: number }> = {
  // Claude models (Anthropic)
  "claude-sonnet-4-6": { input: 3.0, output: 15.0 },
  "claude-opus-4-6": { input: 5.0, output: 25.0 },
  "claude-opus-4-7": { input: 5.0, output: 25.0 },
  "claude-haiku-4-5": { input: 1.0, output: 5.0 },
  // GPT models (OpenAI)
  "gpt-4o": { input: 2.5, output: 10.0 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  // Embeddings (costo solo en input — no generan output)
  "text-embedding-3-small": { input: 0.02, output: 0 },
  "text-embedding-3-large": { input: 0.13, output: 0 },
};

export const FALLBACK_PRICING: { input: number; output: number } = {
  input: 3.0,
  output: 15.0,
};

/**
 * Calcula el costo en USD de un turno a partir de los tokens y el modelo.
 * Si el modelo no está en la tabla, usa el pricing de fallback.
 */
export function computeCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const p = PRICING[model] ?? FALLBACK_PRICING;
  return (inputTokens / 1e6) * p.input + (outputTokens / 1e6) * p.output;
}
