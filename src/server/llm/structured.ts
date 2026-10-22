import "server-only";
import { z } from "zod";
import type { LlmClient, StructuredRequest } from "@/server/llm/client";
import { llmError, type LlmResult } from "@/lib/llm-result";

// The part every model call shares (compare, classify, tailor, cover
// letter): ask for structured output, stop on a refusal or a truncated
// answer, parse the JSON, validate it with Zod, and retry once if it was
// malformed. Refusals and truncation aren't retried: an identical request
// would very likely do the same. API errors were already retried by the
// SDK. Callers that also run a checker (tailoring, cover letters) use
// `calls` to know whether they still have a call left for a retry with
// the checker's feedback.

export type Parsed<T> = { ok: true; data: T } | { ok: false; reason: string };

// JSON text -> validated data. Never throws: a failure comes back as a
// reason string, which is logged on the server and never shown to you.
export function parseStructured<T>(text: string, schema: z.ZodType<T>): Parsed<T> {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    return { ok: false, reason: `invalid JSON: ${error instanceof Error ? error.message : String(error)}` };
  }
  const result = schema.safeParse(json);
  if (!result.success) return { ok: false, reason: `schema violation: ${z.prettifyError(result.error)}` };
  return { ok: true, data: result.data };
}

export type Generated<T> = {
  data: T;
  model: string;
  usage?: { inputTokens: number; outputTokens: number };
  // How many calls it took: 1, or 2 after a malformed first answer.
  calls: number;
};

const MAX_ATTEMPTS = 2;

export async function generateStructured<T>(
  client: LlmClient,
  request: StructuredRequest,
  parse: (text: string) => Parsed<T>,
  // For the server log, e.g. "Comparison".
  label: string,
  // 1 for a retry that's already the last call allowed.
  maxAttempts = MAX_ATTEMPTS,
): Promise<LlmResult<Generated<T>>> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const response = await client.generateStructured(request);
    if (!response.ok) return response;

    const { stopReason, text, model, usage } = response.data;
    if (stopReason === "refusal") return llmError("refusal");
    if (stopReason === "max_tokens" || stopReason === "model_context_window_exceeded") return llmError("truncated");

    const parsed = parse(text);
    if (parsed.ok) return { ok: true, data: { data: parsed.data, model, usage, calls: attempt } };
    console.warn(`${label} attempt ${attempt}/${maxAttempts} malformed: ${parsed.reason}`);
  }
  return llmError("malformed_output");
}
