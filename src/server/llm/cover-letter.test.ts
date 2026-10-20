import { describe, it, expect } from "vitest";
import type { LlmClient, StructuredRequest, StructuredResponse } from "@/server/llm/client";
import { buildCoverLetterRequest, writeCoverLetter, type CoverLetterInput } from "@/server/llm/cover-letter";
import type { LlmResult } from "@/lib/llm-result";
import { createSkillResolver } from "@/lib/skills/resolver";
import { resumePlainText } from "@/lib/cover-letter/sources";
import type { CoverLetterOutput } from "@/lib/schemas/cover-letter";
import { demoProfile, demoTex } from "@/test/demo-profile";

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

const reply = (value: unknown): LlmResult<StructuredResponse> => ({
  ok: true,
  data: { text: typeof value === "string" ? value : JSON.stringify(value), stopReason: "end_turn", model: "claude-test" },
});

const profile = demoProfile();
const input: CoverLetterInput = {
  company: "Acme",
  title: "Frontend Engineer",
  listing: "We build dashboards in React.",
  resumeText: resumePlainText(demoTex()),
  profile,
  resolver: createSkillResolver(profile.skills),
  tone: "direct",
  length: "short",
};

const body = (extra = "") =>
  `${"I led the rebuild of a real-time shipment tracking dashboard used by 400+ dispatchers in React and TypeScript. ".repeat(7)}${extra}`;
const letter = (paragraph: string): CoverLetterOutput => ({ greeting: "Dear Acme hiring team,", paragraphs: [paragraph], closing: "Sincerely," });

describe("writeCoverLetter", () => {
  it("returns a clean letter after one call", async () => {
    const { client, requests } = fakeClient([reply(letter(body()))]);
    const result = await writeCoverLetter(input, client);
    expect(result).toMatchObject({ ok: true, data: { warnings: [] } });
    expect(requests).toHaveLength(1);
  });

  it("retries once with the warnings, and uses the fixed letter", async () => {
    const { client, requests } = fakeClient([reply(letter(body("I deploy with Docker."))), reply(letter(body()))]);
    const result = await writeCoverLetter(input, client);
    expect(result).toMatchObject({ ok: true, data: { warnings: [] } });
    expect(requests[1]?.prompt).toContain("<checker_warnings>");
  });

  it("keeps the remaining warnings after the retry", async () => {
    const flagged = letter(body("I deploy with Docker."));
    const { client, requests } = fakeClient([reply(flagged), reply(flagged)]);
    const result = await writeCoverLetter(input, client);
    expect(result.ok && result.data.warnings.map((w) => w.kinds[0])).toEqual(["learning_claim"]);
    expect(requests).toHaveLength(2);
  });

  it("returns malformed_output after two malformed answers", async () => {
    const { client } = fakeClient([reply("nope"), reply({ greeting: "Hi", paragraphs: [" "], closing: "Bye" })]);
    expect(await writeCoverLetter(input, client)).toMatchObject({ ok: false, error: { kind: "malformed_output" } });
  });
});

describe("buildCoverLetterRequest", () => {
  it("includes the tone, target length, and Learning skills", () => {
    const { prompt } = buildCoverLetterRequest(input, null);
    expect(prompt).toContain("Tone: Direct");
    expect(prompt).toContain("about 150 words");
    expect(prompt).toContain("<learning>\nDocker\n</learning>");
  });
});
