// USD por 1 millón de tokens (precios a mayo 2026)
// https://platform.claude.com/docs/en/about-claude/pricing y https://developers.openai.com/api/docs/pricing
const PRICING: Record<string, { input: number; output: number }> = {
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

const FALLBACK_PRICING = PRICING["claude-sonnet-4-6"];

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  model: string;
}
export interface CostBreakdown {
  inputCost: number;
  outputCost: number;
  totalCost: number;
  model: string;
  formatted: string;
}

function formatUSD(amount: number): string {
  if (amount === 0) return `$0.00`;
  if (amount < 0.001) return `< $0.001`;
  if (amount < 0.01) return `$${amount.toFixed(4)}`;
  return `$${amount.toFixed(4)}`;
}

export function calculateCost(usage: TokenUsage): CostBreakdown {
  const pricing = PRICING[usage.model];
  if (!pricing) {
    console.warn(
      `Modelo ${usage.model} no tiene precio definido.\n` +
        `Usando Claude Sonnet como estimación. Actualiza PRICING en cost-calculator.ts`,
    );
  }
  const activePricing = pricing ?? FALLBACK_PRICING;
  const inputCost = (usage.inputTokens / 1_000_000) * activePricing!.input;
  const outputCost = (usage.outputTokens / 1_000_000) * activePricing!.output;
  const totalCost = inputCost + outputCost;
  return {
    inputCost,
    outputCost,
    totalCost,
    model: usage.model,
    formatted: formatUSD(totalCost),
  };
}
