import { describe, it, expect } from "vitest";
import { applyResumeEdits } from "@/lib/latex/resume";
import { createSkillResolver } from "@/lib/skills/resolver";
import type { TailoringProposal } from "@/lib/schemas/tailoring";
import { applySelection, currentAsProposal, listChanges } from "@/lib/tailoring/changes";
import { checkProposal } from "@/lib/tailoring/check";
import { toResumeEdits } from "@/lib/tailoring/to-edits";
import { getDemoTailoring, resolveDemoProposal } from "@/server/llm/tailor-demo";
import { DEMO_TEX, demoProfile, demoTex } from "@/test/demo-profile";

const profile = demoProfile();
const tex = demoTex();
const resolver = createSkillResolver(profile.skills);

const current = currentAsProposal(profile, tex, resolver);
if (!current.ok) throw new Error(current.message);
const original = current.proposal;

// The Northwind demo proposal, after the honesty checker.
const proposed = checkProposal(
  resolveDemoProposal(getDemoTailoring("https://careers.northwindrobotics.example/jobs/1821"), profile, tex),
  { profile, tex, resolver },
).proposal;

const changes = listChanges(original, proposed, profile, tex);
const ids = (kind: string) => changes.filter((c) => c.kind === kind).map((c) => c.id);

function texFor(proposal: TailoringProposal): string {
  const applied = applyResumeEdits(DEMO_TEX, toResumeEdits(proposal, profile, tex));
  if (!applied.ok) throw new Error(applied.message);
  return applied.tex;
}

const entryTitle = (id: string) => profile.entries.find((e) => `entry:${e.id}` === id)?.title;

describe("currentAsProposal", () => {
  it("expresses every part of the resume in profile ids", () => {
    expect(original.sections.map((s) => s.section)).toEqual(["Notable Projects", "Experience", "Education"]);
    expect(original.skills).toHaveLength(5);
    // Applying it unchanged reproduces the resume exactly.
    expect(texFor({ ...original, skills: [], sections: [] })).toBe(DEMO_TEX);
  });

  it("refuses when the profile is missing part of the resume", () => {
    const missing = structuredClone(profile);
    const senior = missing.entries.find((e) => e.title === "Senior Frontend Engineer");
    senior?.bullets.pop();
    const result = currentAsProposal(missing, tex, resolver);
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.message).toContain("Import from active resume");
  });
});

describe("listChanges (Northwind demo)", () => {
  it("lists each difference as its own change", () => {
    expect(changes.map((c) => c.kind)).toEqual([
      "summary",
      "skills",
      "skills",
      "skills",
      "entry_remove",
      "entry_add",
      "bullet_reword",
    ]);
  });

  it("describes changes in readable terms", () => {
    const add = changes.find((c) => c.kind === "entry_add");
    expect(add?.label).toBe("Add Trail Conditions Map (Volunteer), Community Hiking Club Site (2023) (from your profile)");
    const reword = changes.find((c) => c.kind === "bullet_reword");
    expect(reword).toMatchObject({
      before: ["Led the rebuild of a real-time shipment tracking dashboard used by 400+ dispatchers"],
      after: ["Led the rebuild of a real-time fleet tracking dashboard used by 400+ dispatchers"],
    });
  });

  it("doesn't list the checker-reverted rewording as a change", () => {
    expect(changes.some((c) => c.after.some((line) => line.includes("WebSockets through")))).toBe(false);
  });
});

describe("applySelection", () => {
  it("accepting everything gives exactly the proposal", () => {
    const all = applySelection(original, proposed, new Set(changes.map((c) => c.id)));
    expect(texFor(all)).toBe(texFor(proposed));
  });

  it("accepting nothing leaves the resume unchanged", () => {
    const none = applySelection(original, proposed, new Set());
    expect(toResumeEdits(none, profile, tex)).toEqual({});
    expect(texFor(none)).toBe(DEMO_TEX);
  });

  it("keeps a removed entry when the removal is rejected, alongside an accepted addition", () => {
    const result = applySelection(original, proposed, new Set(ids("entry_add")));
    const projects = result.sections.find((s) => s.section === "Notable Projects");
    expect(projects?.entries.map((e) => entryTitle(e.entryId))).toEqual([
      "Dispatch Dashboard (Larkspur Logistics)",
      "Trail Conditions Map (Volunteer)",
      "Component Library (Copperline Media)",
    ]);
  });

  it("keeps the original text when a rewording is rejected", () => {
    const result = applySelection(original, proposed, new Set([...ids("entry_add"), ...ids("entry_remove")]));
    const dashboard = result.sections[0]?.entries[0];
    expect(dashboard?.bullets[0]?.text).toBe("Led the rebuild of a real-time shipment tracking dashboard used by 400+ dispatchers");
  });

  it("applies only the accepted skill categories, keeping the rest as they are", () => {
    const [firstSkills] = ids("skills");
    if (!firstSkills) throw new Error("expected a skills change");
    const result = applySelection(original, proposed, new Set([firstSkills]));
    const changed = result.skills.find((g) => `skills:${g.categoryId}` === firstSkills);
    const proposedGroup = proposed.skills.find((g) => `skills:${g.categoryId}` === firstSkills);
    expect(changed?.skillIds).toEqual(proposedGroup?.skillIds);
    // Every other category keeps its original skills.
    for (const group of result.skills.filter((g) => `skills:${g.categoryId}` !== firstSkills)) {
      expect(group.skillIds).toEqual(original.skills.find((g) => g.categoryId === group.categoryId)?.skillIds);
    }
  });

  it("only touches sections that end up different", () => {
    const result = applySelection(original, proposed, new Set(ids("bullet_reword")));
    expect(result.sections.map((s) => s.section)).toEqual(["Notable Projects"]);
  });
});
