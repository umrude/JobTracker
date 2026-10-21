import { describe, it, expect } from "vitest";
import { createSkillResolver } from "@/lib/skills/resolver";
import type { ReviewEdit } from "@/lib/schemas/tailoring";
import { buildApproval } from "@/lib/tailoring/approve";
import { currentAsProposal, listChanges } from "@/lib/tailoring/changes";
import { checkProposal } from "@/lib/tailoring/check";
import { applyEdit, applyEdits, buildOutline, carryDecisions, checkYourText, withoutEditsFor, wordedItemOf } from "@/lib/tailoring/edits";
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

const changesFor = (edits: ReviewEdit[]) => listChanges(original, applyEdits(proposed, original, edits), profile, tex);

// A section with at least two entries that the proposal keeps (the demo
// proposal swaps a project in Notable Projects, so an entry it dropped
// can't be moved), and an entry with at least two bullets.
const proposedIds = new Set(proposed.sections.flatMap((s) => s.entries.map((e) => e.entryId)));
const multiSection = original.sections.find(
  (s) => s.entries.filter((e) => proposedIds.has(e.entryId) || !proposed.sections.some((p) => p.section === s.section)).length >= 2,
);
if (!multiSection) throw new Error("no section with two entries");
const [firstEntry, secondEntry] = multiSection.entries;
const multiBulletEntry = original.sections.flatMap((s) => s.entries).find((e) => e.bullets.length >= 2);
if (!multiBulletEntry) throw new Error("no entry with two bullets");
const [firstBullet] = multiBulletEntry.bullets;

describe("applyEdit", () => {
  it("rewords the summary in your words", () => {
    const changes = changesFor([{ op: "text", itemId: "summary", text: "Frontend engineer who ships." }]);
    expect(changes.find((c) => c.id === "summary")?.after).toEqual(["Frontend engineer who ships."]);
  });

  it("rewords a bullet the model left alone, as a new change", () => {
    const edit: ReviewEdit = { op: "text", itemId: firstBullet.bulletId, text: "Shipped the thing, faster." };
    expect(changesFor([edit]).find((c) => c.id === `bullet_reword:${firstBullet.bulletId}`)?.after).toEqual([
      "Shipped the thing, faster.",
    ]);
  });

  it("removes and moves entries in a section the model didn't change", () => {
    const removed = changesFor([{ op: "remove_entry", entryId: secondEntry.entryId }]);
    expect(removed.some((c) => c.id === `entry_remove:${secondEntry.entryId}`)).toBe(true);
    const moved = changesFor([{ op: "move_entry", entryId: secondEntry.entryId, direction: "up" }]);
    expect(moved.find((c) => c.kind === "entry_order" && c.group === multiSection.section)).toBeDefined();
  });

  it("refuses an entry the proposal already dropped", () => {
    const dropped = original.sections.flatMap((s) => s.entries).find((e) => !proposedIds.has(e.entryId) && proposed.sections.some((p) => p.entries.length > 0));
    if (dropped) expect(applyEdit(proposed, original, { op: "move_entry", entryId: dropped.entryId, direction: "up" })).toMatchObject({ ok: false });
  });

  it("refuses edits that would break the resume or do nothing", () => {
    const onlyEntrySection = original.sections.find((s) => s.entries.length === 1);
    if (onlyEntrySection) {
      expect(applyEdit(proposed, original, { op: "remove_entry", entryId: onlyEntrySection.entries[0].entryId })).toMatchObject({ ok: false });
    }
    const oneBullet = original.sections.flatMap((s) => s.entries).find((e) => e.bullets.length === 1);
    if (oneBullet) {
      expect(applyEdit(proposed, original, { op: "remove_bullet", bulletId: oneBullet.bullets[0].bulletId })).toMatchObject({ ok: false });
    }
    expect(applyEdit(proposed, original, { op: "move_entry", entryId: firstEntry.entryId, direction: "up" })).toMatchObject({
      ok: false,
      message: "It can't move further.",
    });
    expect(applyEdit(proposed, original, { op: "remove_bullet", bulletId: "bullet:99999" })).toMatchObject({ ok: false });
  });

  it("never changes the proposal it was given", () => {
    const before = JSON.stringify(proposed);
    applyEdits(proposed, original, [{ op: "remove_entry", entryId: secondEntry.entryId }, { op: "text", itemId: "summary", text: "x" }]);
    expect(JSON.stringify(proposed)).toBe(before);
  });
});

describe("applyEdits", () => {
  it("skips an edit that no longer applies instead of failing", () => {
    const edits: ReviewEdit[] = [
      { op: "remove_bullet", bulletId: "bullet:99999" },
      { op: "text", itemId: "summary", text: "Still applied." },
    ];
    expect(applyEdits(proposed, original, edits).summary?.text).toBe("Still applied.");
  });

  it("resets one item back to the proposal's version", () => {
    const edits: ReviewEdit[] = [
      { op: "text", itemId: "summary", text: "Mine." },
      { op: "remove_entry", entryId: secondEntry.entryId },
    ];
    const reset = withoutEditsFor(edits, "summary");
    expect(reset).toEqual([{ op: "remove_entry", entryId: secondEntry.entryId }]);
    expect(applyEdits(proposed, original, reset).summary).toEqual(proposed.summary);
  });

  it("still approves to valid LaTeX with your edits in it", () => {
    const edits: ReviewEdit[] = [
      { op: "text", itemId: "summary", text: "Frontend engineer focused on fast, accessible interfaces." },
      { op: "remove_entry", entryId: secondEntry.entryId },
      { op: "move_bullet", bulletId: firstBullet.bulletId, direction: "down" },
    ];
    const effective = applyEdits(proposed, original, edits);
    const accepted = listChanges(original, effective, profile, tex).map((c) => c.id);
    const built = buildApproval({ proposed: effective, accepted, profile, tex: tex, latexSource: DEMO_TEX, resolver });
    expect(built.ok).toBe(true);
    if (built.ok) expect(built.approval.tex).toContain("Frontend engineer focused on fast, accessible interfaces.");
  });
});

describe("buildOutline", () => {
  it("lists the whole proposed resume in order, marking what you edited", () => {
    const edits: ReviewEdit[] = [{ op: "text", itemId: firstBullet.bulletId, text: "Edited." }];
    const outline = buildOutline(applyEdits(proposed, original, edits), original, edits, profile);
    expect(outline.sections.slice(0, original.sections.length).map((s) => s.title)).toEqual(original.sections.map((s) => s.section));
    const bullet = outline.sections.flatMap((s) => s.entries.flatMap((e) => e.bullets)).find((b) => b.bulletId === firstBullet.bulletId);
    expect(bullet).toEqual({ bulletId: firstBullet.bulletId, text: "Edited.", edited: true });
    expect(outline.summary?.edited).toBe(false);
  });
});

describe("checkYourText", () => {
  it("flags numbers and skills your profile doesn't have, but keeps your words", () => {
    const issues = checkYourText([{ op: "text", itemId: "summary", text: "Cut load times by 73% using Kubernetes." }], profile, resolver);
    expect(issues.map((i) => i.kinds[0])).toEqual(["new_number", "new_skill"]);
    expect(issues.every((i) => i.resolution === "kept_yours")).toBe(true);
  });

  it("is quiet about wording your profile backs, and only checks your latest wording", () => {
    const edits: ReviewEdit[] = [
      { op: "text", itemId: firstBullet.bulletId, text: "Grew it 999%." },
      { op: "text", itemId: firstBullet.bulletId, text: firstBullet.text },
    ];
    expect(checkYourText(edits, profile, resolver)).toEqual([]);
  });
});

describe("carryDecisions", () => {
  const before = changesFor([]);
  const decided = Object.fromEntries(before.map((c) => [c.id, "rejected" as const]));

  it("keeps decisions for unchanged changes, and accepts what your edit created", () => {
    const after = changesFor([{ op: "text", itemId: "summary", text: "Mine." }]);
    const carried = carryDecisions(before, after, decided, "accepted");
    expect(carried.summary).toBe("accepted");
    const untouched = after.find((c) => c.id !== "summary");
    if (untouched) expect(carried[untouched.id]).toBe("rejected");
  });

  it("leaves new or changed changes undecided after a revision", () => {
    const after = changesFor([{ op: "text", itemId: "summary", text: "Revised." }]);
    expect(carryDecisions(before, after, decided, undefined).summary).toBeUndefined();
  });
});

describe("wordedItemOf", () => {
  it("finds the summary or bullet a change's wording belongs to", () => {
    expect(wordedItemOf("summary")).toBe("summary");
    expect(wordedItemOf("bullet_reword:bullet:40")).toBe("bullet:40");
    expect(wordedItemOf("bullet_add:bullet:7")).toBe("bullet:7");
    expect(wordedItemOf("entry_remove:entry:3")).toBeNull();
    expect(wordedItemOf("skills:s1")).toBeNull();
  });
});
