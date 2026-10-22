import { describe, it, expect } from "vitest";
import { z } from "zod";
import type { LlmClient, StructuredResponse } from "@/server/llm/client";
import { generateStructured, parseStructured } from "@/server/llm/structured";
import type { LlmResult } from "@/lib/llm-result";

const schema = z.object({ answer: z.number() });
const parse = (text: string) => parseStructured(text, schema);

function fakeClient(texts: string[], stopReason: StructuredResponse["stopReason"] = "end_turn") {
  let calls = 0;
  const client: LlmClient = {
    async generateStructured(): Promise<LlmResult<StructuredResponse>> {
      const text = texts[calls++] ?? "";
      return { ok: true, data: { text, stopReason, model: "test" } };
    },
  };
  return { client, calls: () => calls };
}

describe("parseStructured", () => {
  it("validates JSON with the schema, and explains failures without throwing", () => {
    expect(parse('{"answer":4}')).toEqual({ ok: true, data: { answer: 4 } });
    expect(parse("{nope")).toMatchObject({ ok: false, reason: expect.stringMatching(/^invalid JSON/) });
    expect(parse('{"answer":"four"}')).toMatchObject({ ok: false, reason: expect.stringMatching(/^schema violation/) });
  });
});

describe("generateStructured", () => {
  it("retries malformed output once and says how many calls it took", async () => {
    const fake = fakeClient(["{bad", '{"answer":4}']);
    expect(await generateStructured(fake.client, { system: "", prompt: "", schema, maxTokens: 10 }, parse, "Test")).toMatchObject({
      ok: true,
      data: { data: { answer: 4 }, calls: 2 },
    });
  });

  it("makes only one call when capped at one", async () => {
    const fake = fakeClient(["{bad", '{"answer":4}']);
    const result = await generateStructured(fake.client, { system: "", prompt: "", schema, maxTokens: 10 }, parse, "Test", 1);
    expect(result).toMatchObject({ ok: false, error: { kind: "malformed_output" } });
    expect(fake.calls()).toBe(1);
  });

  it("doesn't retry a refusal", async () => {
    const fake = fakeClient(["", ""], "refusal");
    expect(await generateStructured(fake.client, { system: "", prompt: "", schema, maxTokens: 10 }, parse, "Test")).toMatchObject({
      ok: false,
      error: { kind: "refusal" },
    });
    expect(fake.calls()).toBe(1);
  });
});
