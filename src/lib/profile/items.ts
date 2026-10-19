import type { ProfileSource } from "@/lib/schemas/profile";
import type { Profile } from "@/lib/profile/types";

// One shape for every kind of profile item. The tailoring prompt, the
// honesty checker, and the review screen (Step 5) work with this shape,
// not with each table. Adding a new kind of item later (certifications,
// spoken languages, links) means a table plus a case in toProfileItems;
// the code that consumes items doesn't change. See docs/tailored-resumes.md,
// "Built to grow".

export type ProfileItemKind = "skill" | "entry" | "bullet" | "highlight";

export type ProfileItem = {
  // Unique across kinds, e.g. "skill:12" or "bullet:40". Stable for the
  // life of the database row.
  id: string;
  kind: ProfileItemKind;
  // What the item says, as plain text.
  text: string;
  source: ProfileSource;
  // For bullets, the entry they belong to.
  parentId?: string;
};

export function profileItemId(kind: ProfileItemKind, rowId: number): string {
  return `${kind}:${rowId}`;
}

export function toProfileItems(profile: Profile): ProfileItem[] {
  const items: ProfileItem[] = [];

  for (const skill of profile.skills) {
    items.push({ id: profileItemId("skill", skill.id), kind: "skill", text: skill.name, source: skill.source });
  }
  for (const entry of profile.entries) {
    const entryId = profileItemId("entry", entry.id);
    items.push({ id: entryId, kind: "entry", text: entryHeadingText(entry), source: entry.source });
    for (const bullet of entry.bullets) {
      items.push({
        id: profileItemId("bullet", bullet.id),
        kind: "bullet",
        text: bullet.text,
        source: bullet.source,
        parentId: entryId,
      });
    }
  }
  for (const highlight of profile.highlights) {
    items.push({
      id: profileItemId("highlight", highlight.id),
      kind: "highlight",
      text: highlight.text,
      source: highlight.source,
    });
  }
  return items;
}

// An entry's heading as one line, e.g. "Web Developer, Graph'em Solutions
// (April 2020 – September 2025)". Empty parts are left out.
export function entryHeadingText(entry: {
  title: string;
  subtitle: string;
  dates: string;
}): string {
  const name = [entry.title, entry.subtitle].filter((part) => part !== "").join(", ");
  return entry.dates ? `${name} (${entry.dates})` : name;
}
