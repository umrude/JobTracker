import { describe, it, expect } from "vitest";
import type {
  LlmClient,
  StructuredRequest,
  StructuredResponse,
} from "@/server/llm/client";
import {
  buildCompareRequest,
  compareResume,
  parseComparison,
} from "@/server/llm/compare";
import { llmError, type LlmResult } from "@/lib/llm-result";

// A fake LlmClient that replays queued responses in order and records the
// requests it got. No SDK, no network.
function fakeClient(responses: LlmResult<StructuredResponse>[]) {
  const requests: StructuredRequest[] = [];
  const client: LlmClient = {
    async generateStructured(request) {
      requests.push(request);
      const next = responses.shift();
      if (!next) throw new Error("fakeClient: no more queued responses");
      return next;
    },
  };
  return { client, requests };
}

function reply(
  text: string,
  stopReason: StructuredResponse["stopReason"] = "end_turn",
): LlmResult<StructuredResponse> {
  return { ok: true, data: { text, stopReason, model: "claude-test" } };
}

const VALID = {
  score: 78,
  matchedSkills: ["React", "TypeScript"],
  missingSkills: ["AWS"],
  missingKeywords: ["ECS"],
  suggestions: ["Mention the Node.js API routes you built."],
};

describe("buildCompareRequest", () => {
  it("puts the listing and resume in separate tagged sections", () => {
    const request = buildCompareRequest("LISTING TEXT", "RESUME TEXT");
    expect(request.prompt).toContain("<job_listing>\nLISTING TEXT\n</job_listing>");
    expect(request.prompt).toContain("<resume>\nRESUME TEXT\n</resume>");
  });
});

describe("parseComparison", () => {
  it("parses and validates good JSON", () => {
    expect(parseComparison(JSON.stringify(VALID))).toMatchObject({
      ok: true,
      comparison: { score: 78 },
    });
  });

  it("reports invalid JSON as a reason, without throwing", () => {
    const result = parseComparison("{not json");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/^invalid JSON/);
  });

  it("reports a schema violation with the failing field", () => {
    const result = parseComparison(JSON.stringify({ ...VALID, score: "high" }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/^schema violation/);
    expect(result.reason).toContain("score");
  });
});

describe("compareResume", () => {
  it("returns the validated comparison and the model that produced it", async () => {
    const { client, requests } = fakeClient([reply(JSON.stringify(VALID))]);
    const result = await compareResume("listing", "resume", client);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.model).toBe("claude-test");
    expect(result.data.comparison.matchedSkills).toContain("React");
    expect(requests).toHaveLength(1);
  });

  it("retries once on malformed JSON, then succeeds", async () => {
    const { client, requests } = fakeClient([
      reply('{"score": 78, "matchedSkills": ['),
      reply(JSON.stringify(VALID)),
    ]);
    const result = await compareResume("listing", "resume", client);

    expect(result.ok).toBe(true);
    expect(requests).toHaveLength(2);
  });

  it("retries once on a schema violation, then succeeds", async () => {
    const { client, requests } = fakeClient([
      reply(JSON.stringify({ ...VALID, matchedSkills: "React" })),
      reply(JSON.stringify(VALID)),
    ]);
    const result = await compareResume("listing", "resume", client);

    expect(result.ok).toBe(true);
    expect(requests).toHaveLength(2);
  });

  it("returns malformed_output when the retry is also malformed", async () => {
    const { client, requests } = fakeClient([reply("not json"), reply("still not json")]);
    const result = await compareResume("listing", "resume", client);

    expect(result).toMatchObject({ ok: false, error: { kind: "malformed_output" } });
    expect(requests).toHaveLength(2);
  });

  it("returns malformed_output after two schema violations", async () => {
    const missingField = JSON.stringify({ score: 50 });
    const { client, requests } = fakeClient([reply(missingField), reply(missingField)]);
    const result = await compareResume("listing", "resume", client);

    expect(result).toMatchObject({ ok: false, error: { kind: "malformed_output" } });
    expect(requests).toHaveLength(2);
  });

  it("never exposes a raw parser error message", async () => {
    const { client } = fakeClient([reply("{oops"), reply("{oops")]);
    const result = await compareResume("listing", "resume", client);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).not.toMatch(/JSON|position|Unexpected token|ZodError/i);
  });

  // Not retried: the same request to the same model chain is very likely
  // to be declined again, and each attempt costs money.
  it("returns refusal without retrying", async () => {
    const { client, requests } = fakeClient([reply("", "refusal")]);
    const result = await compareResume("listing", "resume", client);

    expect(result).toMatchObject({ ok: false, error: { kind: "refusal" } });
    expect(requests).toHaveLength(1);
  });

  // Not retried: the output hit max_tokens, and the same limit would very
  // likely cut it off again.
  it("returns truncated without retrying, even though the JSON is broken", async () => {
    const { client, requests } = fakeClient([reply('{"score": 78, "matc', "max_tokens")]);
    const result = await compareResume("listing", "resume", client);

    expect(result).toMatchObject({ ok: false, error: { kind: "truncated" } });
    expect(requests).toHaveLength(1);
  });

  // An imperfect-but-usable value is cleaned up by comparisonSchema rather
  // than rejected, so it doesn't cost a second API call.
  it("clamps an out-of-range score without retrying", async () => {
    const { client, requests } = fakeClient([reply(JSON.stringify({ ...VALID, score: 104 }))]);
    const result = await compareResume("listing", "resume", client);

    expect(result).toMatchObject({ ok: true, data: { comparison: { score: 100 } } });
    expect(requests).toHaveLength(1);
  });

  it("treats running out of context window as truncated", async () => {
    const { client } = fakeClient([reply('{"sco', "model_context_window_exceeded")]);
    const result = await compareResume("listing", "resume", client);

    expect(result).toMatchObject({ ok: false, error: { kind: "truncated" } });
  });

  // Not retried here: the SDK already retried rate limits, 5xx errors, and
  // connection failures before the client returned this.
  it("passes an API error through without retrying", async () => {
    const { client, requests } = fakeClient([llmError("api_error", "Rate limited.")]);
    const result = await compareResume("listing", "resume", client);

    expect(result).toEqual({
      ok: false,
      error: { kind: "api_error", message: "Rate limited." },
    });
    expect(requests).toHaveLength(1);
  });
});
