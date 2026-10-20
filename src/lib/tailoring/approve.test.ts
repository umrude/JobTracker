import { describe, it, expect } from "vitest";
import { parseResumeLatex } from "@/lib/latex/resume";
import { createSkillResolver } from "@/lib/skills/resolver";
import { buildApproval, trimApproval } from "@/lib/tailoring/approve";
import { currentAsProposal, listChanges } from "@/lib/tailoring/changes";
import { checkProposal } from "@/lib/tailoring/check";
import { getDemoTailoring, resolveDemoProposal } from "@/server/llm/tailor-demo";
import { DEMO_TEX, demoProfile, demoTex } from "@/test/demo-profile";

const profile = demoProfile();
const tex = demoTex();
const resolver = createSkillResolver(profile.skills);
const proposed = checkProposal(
  resolveDemoProposal(getDemoTailoring("https://careers.northwindrobotics.example/jobs/1821"), profile, tex),
  { profile, tex, resolver },
).proposal;
const current = currentAsProposal(profile, tex, resolver);
if (!current.ok) throw new Error(current.message);
const allChanges = listChanges(current.proposal, proposed, profile, tex).map((c) => c.id);
const base = { proposed, profile, tex, latexSource: DEMO_TEX, resolver };

describe("buildApproval", () => {
  it("produces LaTeX edits and the tailored .tex", () => {
    const result = buildApproval({ ...base, accepted: allChanges });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.approval.tex).toContain("Trail Conditions Map (Volunteer)");
    expect(result.approval.edits.sections?.[0]).toMatchObject({ title: "Notable Projects" });
  });

  it("refuses accepted ids that aren't changes in this proposal", () => {
    const result = buildApproval({ ...base, accepted: [...allChanges, "entry_add:entry:999"] });
    expect(result).toMatchObject({ ok: false });
  });
});

describe("trimApproval", () => {
  const approved = buildApproval({ ...base, accepted: allChanges });
  if (!approved.ok) throw new Error(approved.message);
  const { final } = approved.approval;

  it("removes bullets anywhere in the resume, including untouched sections", () => {
    // The junior role's bullet is in Experience, which this approval didn't change.
    const junior = profile.entries.find((e) => e.title === "Junior Web Developer");
    const bulletId = `bullet:${junior?.bullets[0]?.id}`;
    const dashboard = profile.entries.find((e) => e.title === "Dispatch Dashboard (Larkspur Logistics)");
    const chartBullet = `bullet:${dashboard?.bullets[2]?.id}`;

    const trimmed = trimApproval({ final, removeBulletIds: [chartBullet], profile, tex, latexSource: DEMO_TEX, resolver });
    expect(trimmed.ok).toBe(true);
    if (!trimmed.ok) return;
    expect(trimmed.approval.tex).not.toContain("Built fleet throughput charts with D3 and visx");
    // ...but never an entry's last bullet: the junior role keeps its only one.
    const keepsLast = trimApproval({ final, removeBulletIds: [bulletId], profile, tex, latexSource: DEMO_TEX, resolver });
    expect(keepsLast.ok && keepsLast.approval.tex).toContain("Built responsive marketing sites");
  });

  it("keeps everything else from the approval", () => {
    const trimmed = trimApproval({ final, removeBulletIds: [], profile, tex, latexSource: DEMO_TEX, resolver });
    if (!trimmed.ok) throw new Error(trimmed.message);
    const parsed = parseResumeLatex(trimmed.approval.tex);
    const original = parseResumeLatex(approved.ok ? approved.approval.tex : "");
    if (!parsed.ok || !original.ok) throw new Error("parse");
    expect(parsed.resume.sections.map((s) => s.entries.map((e) => e.bullets.map((b) => b.text)))).toEqual(
      original.resume.sections.map((s) => s.entries.map((e) => e.bullets.map((b) => b.text))),
    );
  });

  it("refuses when the profile no longer has an item the approval uses", () => {
    const changed = structuredClone(profile);
    const trail = changed.entries.findIndex((e) => e.title === "Trail Conditions Map (Volunteer)");
    changed.entries.splice(trail, 1);
    const result = trimApproval({ final, removeBulletIds: [], profile: changed, tex, latexSource: DEMO_TEX, resolver });
    expect(result).toMatchObject({ ok: false });
  });
});
