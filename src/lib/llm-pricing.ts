// Prices for the models this app uses, in dollars per million tokens
// (input, output), for cost estimates and the eval script's cost line.
// Check anthropic.com/pricing when changing models.
export const MODEL_PRICES: Record<string, { input: number; output: number }> = {
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-opus-5-5": { input: 4, output: 20 },
};

// Dollars for a call, or null for a model without a known price.
export function costUsd(model: string, inputTokens: number, outputTokens: number): number | null {
  const price = MODEL_PRICES[model];
  if (!price) return null;
  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
}

// A rough token count for text: about four characters per token in
// English. Good enough for an estimate shown as "about".
export function roughTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// What one resume comparison costs, roughly: the instructions, the
// listing, and the resume in; the result plus the model's thinking out.
// The output allowance is deliberately generous, so the estimate errs
// high rather than low.
export const COMPARISON_OVERHEAD_TOKENS = 600;
export const COMPARISON_OUTPUT_TOKENS = 2_500;

export function estimateComparisonUsd(model: string, listing: string, resume: string): number | null {
  return costUsd(model, COMPARISON_OVERHEAD_TOKENS + roughTokens(listing) + roughTokens(resume), COMPARISON_OUTPUT_TOKENS);
}
