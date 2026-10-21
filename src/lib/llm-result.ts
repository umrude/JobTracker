// The result type every LLM function returns. It lives in lib/ (not
// server/llm/) because the UI imports it to render errors, and client
// code can't import "server-only" modules.

export type LlmErrorKind =
  | "missing_api_key"
  | "out_of_credits"
  | "api_error"
  | "malformed_output"
  | "refusal"
  | "truncated";

export type LlmError = { kind: LlmErrorKind; message: string };

export type LlmResult<T> = { ok: true; data: T } | { ok: false; error: LlmError };

// Default user-facing messages. Callers can pass a more specific one.
export const LLM_ERROR_MESSAGES: Record<LlmErrorKind, string> = {
  missing_api_key:
    "No Anthropic API key is configured. Set ANTHROPIC_API_KEY in .env to run comparisons.",
  out_of_credits:
    "Your Anthropic account is out of credits. Add credits at console.anthropic.com (Settings, Billing), then try again.",
  api_error: "The Anthropic API request failed. Try again in a moment.",
  malformed_output:
    "The model's response didn't match the expected format, even after a retry. Try running it again.",
  refusal: "The model declined to process this request.",
  truncated:
    "The model's response was cut off before it finished. Try a shorter listing or resume.",
};

export function llmError(kind: LlmErrorKind, message?: string): LlmResult<never> {
  return { ok: false, error: { kind, message: message ?? LLM_ERROR_MESSAGES[kind] } };
}
