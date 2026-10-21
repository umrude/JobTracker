import { describe, it, expect } from "vitest";
import type { LlmClient, StructuredRequest, StructuredResponse } from "@/server/llm/client";
import { buildTailorRequest, tailorResume } from "@/server/llm/tailor";
import type { LlmResult } from "@/lib/llm-result";
import { createSkillResolver } from "@/lib/skills/resolver";
import type { TailoringProposal } from "@/lib/schemas/tailoring";
import { demoProfile, demoTex } from "@/test/demo-profile";

// A fake LlmClient replaying queued responses; no SDK, no network.
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

const reply = (value: unknown, stopReason: StructuredResponse["stopReason"] = "end_turn"): LlmResult<StructuredResponse> => ({
  ok: true,
  data: { text: typeof value === "string" ? value : JSON.stringify(value), stopReason, model: "claude-test" },
});

const profile = demoProfile();
const tex = demoTex();
const context = { profile, tex, resolver: createSkillResolver(profile.skills) };
const input = { listing: "Senior frontend role", context, comparison: null };

const senior = profile.entries.find((e) => e.title === "Senior Frontend Engineer");
if (!senior) throw new Error("demo profile changed");
const [b0, b1] = senior.bullets;
if (!b0 || !b1) throw new Error("demo profile changed");

const experience = (bullets: { bulletId: string; text: string }[]): TailoringProposal => ({
  summary: null,
  skills: [],
  sections: [{ section: "Experience", isNew: false, afterSection: null, entries: [{ entryId: `entry:${senior.id}`, bullets }] }],
  trimOrder: [],
  rationale: "Led with testing.",
});

const CLEAN = experience([
  { bulletId: `bullet:${b1.id}`, text: b1.text },
  { bulletId: `bullet:${b0.id}`, text: b0.text },
]);
// Rewords a bullet with an invented number, which the checker reverts.
const FLAGGED = experience([{ bulletId: `bullet:${b0.id}`, text: b0.text.replace("below 1%", "below 1%, cutting bugs 30%") }]);

describe("tailorResume", () => {
  it("returns a clean proposal after one call", async () => {
    const { client, requests } = fakeClient([reply(CLEAN)]);
    const result = await tailorResume(input, client);
    expect(result).toMatchObject({ ok: true, data: { proposal: CLEAN, issues: [], model: "claude-test" } });
    expect(requests).toHaveLength(1);
  });

  it("retries once with the checker's issues, and uses the fixed proposal", async () => {
    const { client, requests } = fakeClient([reply(FLAGGED), reply(CLEAN)]);
    const result = await tailorResume(input, client);
    expect(result).toMatchObject({ ok: true, data: { proposal: CLEAN, issues: [] } });
    expect(requests).toHaveLength(2);
    expect(requests[1]?.prompt).toContain("<checker_issues>");
    expect(requests[1]?.prompt).toContain('"30"');
  });

  it("keeps the first proposal, flagged, if the retry fails", async () => {
    const { client, requests } = fakeClient([reply(FLAGGED), reply("not json")]);
    const result = await tailorResume(input, client);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The flagged rewording was reverted to the original, and flagged.
    expect(result.data.proposal.sections[0]?.entries[0]?.bullets[0]?.text).toBe(b0.text);
    expect(result.data.issues).toEqual([expect.objectContaining({ kinds: ["new_number"], resolution: "kept_original" })]);
    expect(requests).toHaveLength(2);
  });

  it("never makes a third call: malformed, then flagged, returns the flags", async () => {
    const { client, requests } = fakeClient([reply("{oops"), reply(FLAGGED)]);
    const result = await tailorResume(input, client);
    expect(result).toMatchObject({ ok: true, data: { issues: [expect.objectContaining({ kinds: ["new_number"] })] } });
    expect(requests).toHaveLength(2);
  });

  it("returns malformed_output after two malformed answers", async () => {
    const { client } = fakeClient([reply("{oops"), reply({ summary: "wrong shape" })]);
    expect(await tailorResume(input, client)).toMatchObject({ ok: false, error: { kind: "malformed_output" } });
  });

  it("returns refusal and truncation without retrying", async () => {
    const refused = fakeClient([reply("", "refusal")]);
    expect(await tailorResume(input, refused.client)).toMatchObject({ ok: false, error: { kind: "refusal" } });
    expect(refused.requests).toHaveLength(1);
    const truncated = fakeClient([reply('{"summ', "max_tokens")]);
    expect(await tailorResume(input, truncated.client)).toMatchObject({ ok: false, error: { kind: "truncated" } });
  });
});

describe("buildTailorRequest", () => {
  it("puts the listing and context in tagged sections, with feedback only on a retry", () => {
    const first = buildTailorRequest("THE LISTING", "THE CONTEXT", null);
    expect(first.prompt).toContain("<job_listing>\nTHE LISTING\n</job_listing>");
    expect(first.prompt).toContain("THE CONTEXT");
    expect(first.prompt).not.toContain("<checker_issues>");
  });
});

describe("buildTailorRequest for a revision", () => {
  it("sends the draft, your decisions, notes, page count, and wording, with the rules unchanged", () => {
    const current: TailoringProposal = { summary: { text: "Mine.", sourceIds: [] }, skills: [], sections: [], trimOrder: [], rationale: "" };
    const request = buildTailorRequest("LISTING", "CONTEXT", null, {
      current,
      decisions: [{ label: "Summary", decision: "accepted" }, { label: "Remove WisePub", decision: "rejected" }],
      notes: [{ label: "Summary", now: ["Mine."], note: "Drop the last sentence" }],
      generalNote: "Keep it to one page",
      pages: 2,
      yourWording: [{ itemId: "summary", text: "Mine." }],
    });
    expect(request.prompt).toContain("<current_draft>");
    expect(request.prompt).toContain("- Rejected: Remove WisePub");
    expect(request.prompt).toContain('- On "Summary" (now: "Mine."): Drop the last sentence');
    expect(request.prompt).toContain("- On the whole draft: Keep it to one page");
    expect(request.prompt).toContain("the resume is 2 pages");
    expect(request.prompt).toContain('- summary: "Mine."');
    expect(request.prompt).toContain("a note can't add a fact");
    // The honesty rules are the same system prompt as generating.
    expect(request.system).toBe(buildTailorRequest("LISTING", "CONTEXT", null).system);
  });
});
