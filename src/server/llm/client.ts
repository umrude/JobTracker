import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { env } from "@/server/env";
import { llmError, type LlmResult } from "@/lib/llm-result";

// The one place that talks to the Anthropic SDK. Feature code (compare,
// later cover letters) depends on the small LlmClient interface below,
// never on the SDK directly, so tests can pass a fake client and no test
// ever reaches the network.

export type StructuredRequest = {
  system: string;
  prompt: string;
  // Sent to the API as a JSON Schema via structured outputs, so the model
  // is constrained to produce JSON of this shape. It must not contain
  // .transform(): Zod can't express transforms as JSON Schema and
  // zodOutputFormat throws.
  schema: z.ZodType;
  maxTokens: number;
  // How hard the model thinks. Defaults to "medium"; simple, high-volume
  // tasks (email classification) use "low".
  effort?: "low" | "medium" | "high";
};

export type StructuredResponse = {
  // "end_turn" means the JSON is complete. "max_tokens" means it was cut
  // off mid-object; "refusal" means the model (and any fallback) declined.
  stopReason: Anthropic.Beta.BetaStopReason | null;
  // The raw JSON text. Deliberately unparsed: the caller validates it.
  text: string;
  // The model that actually answered, which can differ from the requested
  // one if a refusal fallback ran. Stored with each saved result.
  model: string;
  // Tokens billed for the call, for the eval script's cost report.
  usage?: { inputTokens: number; outputTokens: number };
};

export interface LlmClient {
  generateStructured(
    request: StructuredRequest,
  ): Promise<LlmResult<StructuredResponse>>;
}

// Returns a missing_api_key error instead of throwing, so the UI can show
// a clear message. Only live mode calls this; demo mode never builds a
// client at all.
// The model defaults to ANTHROPIC_MODEL; the email classifier passes its
// own (ANTHROPIC_CLASSIFIER_MODEL).
export function getLlmClient(model: string = env.ANTHROPIC_MODEL): LlmResult<LlmClient> {
  if (!env.ANTHROPIC_API_KEY) return llmError("missing_api_key");
  return {
    ok: true,
    data: createAnthropicClient(new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }), model),
  };
}

// Server-side refusal fallback isn't available on every model: Haiku
// has none, and sending the parameter to it is a 400.
export function supportsServerFallback(model: string): boolean {
  return !model.startsWith("claude-haiku");
}

export function createAnthropicClient(sdk: Anthropic, model: string): LlmClient {
  return {
    async generateStructured(request) {
      try {
        const response = await sdk.beta.messages.create({
          model,
          max_tokens: request.maxTokens,
          system: request.system,
          messages: [{ role: "user", content: request.prompt }],
          output_config: {
            format: zodOutputFormat(request.schema),
            // Opus 5.5 defaults to "medium"; set explicitly so a model
            // change doesn't silently change cost or quality.
            effort: request.effort ?? "medium",
          },
          // If a safety classifier declines, the API re-runs the request
          // on a fallback model it picks, inside the same call.
          ...(supportsServerFallback(model)
            ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
            : {}),
        });

        const text = response.content
          .map((block) => (block.type === "text" ? block.text : ""))
          .join("");
        return {
          ok: true,
          data: {
            stopReason: response.stop_reason,
            text,
            model: response.model,
            usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens },
          },
        };
      } catch (error) {
        if (isOutOfCredits(error)) return llmError("out_of_credits");
        return llmError("api_error", apiErrorMessage(error));
      }
    },
  };
}

// Anthropic answers an empty balance with a 400 whose message says "Your
// credit balance is too low...". Worth its own error: unlike a passing
// failure, retrying won't help until you add credits.
export function isOutOfCredits(error: unknown): boolean {
  return error instanceof Anthropic.APIError && /credit balance/i.test(error.message);
}

// The SDK has already retried rate limits, 5xx errors, and connection
// failures (twice by default) before throwing. What's left is worth
// telling the user about, without leaking raw API error text.
function apiErrorMessage(error: unknown): string | undefined {
  if (error instanceof Anthropic.AuthenticationError) {
    return "The Anthropic API key was rejected. Check ANTHROPIC_API_KEY.";
  }
  if (error instanceof Anthropic.RateLimitError) {
    return "Rate limited by the Anthropic API. Wait a minute and try again.";
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return "Couldn't reach the Anthropic API. Check your connection.";
  }
  console.error("Anthropic API call failed", error);
  return undefined;
}
