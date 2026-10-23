import "server-only";
import { and, eq, ne, sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { getMode } from "@/server/mode";
import { requireUserId } from "@/server/current-user";
import {
  jobs,
  profileBullets,
  profileEntries,
  profileHighlights,
  profileSkills,
} from "@/server/db/schema";
import {
  importProfileFromLatexInto,
  loadProfileFrom,
  nextSortOrder,
  type ImportResult,
  type Tx,
} from "@/server/db/profile-store";
import { getActiveResume } from "@/server/db/resumes";
import { skillKey } from "@/lib/comparison-helpers";
import type { Profile } from "@/lib/profile/types";
import type {
  ConfirmGapInput,
  CreateBulletInput,
  CreateEntryInput,
  CreateHighlightInput,
  CreateSkillInput,
  UpdateBulletInput,
  UpdateEntryInput,
  UpdateHighlightInput,
  UpdateSkillInput,
} from "@/lib/schemas/profile";

// The app's entry points for the profile. Every function uses the current
// mode's database and the current user (requireUserId), and every query
// filters by that user. Shared logic lives in profile-store.ts, so the
// seed can use it too.

async function scope() {
  return { db: getDb(await getMode()), userId: await requireUserId() };
}

export async function loadProfile(): Promise<Profile> {
  const { db, userId } = await scope();
  return loadProfileFrom(db, userId);
}

export async function importProfileFromLatex(tex: string): Promise<ImportResult> {
  const { db, userId } = await scope();
  return importProfileFromLatexInto(db, userId, tex);
}

// The Profile page's "Import from active resume": for a resume saved
// before the profile existed, or after editing the profile by hand.
export async function importFromActiveResume(): Promise<ImportResult> {
  const active = await getActiveResume();
  if (!active) return { ok: false, message: "You don't have an active resume yet." };
  if (!active.latexSource) {
    return { ok: false, message: "Your active resume has no LaTeX source. Upload your .tex to import it." };
  }
  return importProfileFromLatex(active.latexSource);
}

export type WriteResult = { ok: true } | { ok: false; field?: string; message: string };

const NOT_FOUND: WriteResult = { ok: false, message: "That item no longer exists." };

// ---- Skills ----

// A name is taken if any of your other skills has it as its name or as an
// alias: "Postgres" can't be added when PostgreSQL lists it as an alias.
function findNameClash(
  tx: Tx,
  userId: number,
  name: string,
  exceptId?: number,
): string | undefined {
  const key = skillKey(name);
  const skills = tx
    .select({ name: profileSkills.name, nameKey: profileSkills.nameKey, aliases: profileSkills.aliases })
    .from(profileSkills)
    .where(
      exceptId === undefined
        ? eq(profileSkills.userId, userId)
        : and(eq(profileSkills.userId, userId), ne(profileSkills.id, exceptId)),
    )
    .all();
  return skills.find((skill) => skill.nameKey === key || skill.aliases.some((alias) => skillKey(alias) === key))
    ?.name;
}

function clash(existing: string): WriteResult {
  return { ok: false, field: "name", message: `That's already in your profile as “${existing}”.` };
}

export async function createSkill(input: CreateSkillInput): Promise<WriteResult> {
  const { db, userId } = await scope();
  return db.transaction((tx) => {
    const existing = findNameClash(tx, userId, input.name);
    if (existing) return clash(existing);
    tx.insert(profileSkills)
      .values({
        userId,
        name: input.name,
        nameKey: skillKey(input.name),
        category: input.category ?? null,
        proficiency: input.proficiency ?? null,
        experience: input.experience ?? null,
        note: input.note ?? null,
        aliases: input.aliases,
        source: "added",
        sortOrder: nextSortOrder(tx, profileSkills, userId),
      })
      .run();
    return { ok: true };
  });
}

// Full replace of the editable fields. The source stays as it was: editing
// an imported skill doesn't make it "added".
export async function updateSkill(input: UpdateSkillInput): Promise<WriteResult> {
  const { db, userId } = await scope();
  return db.transaction((tx) => {
    const existing = findNameClash(tx, userId, input.name, input.id);
    if (existing) return clash(existing);
    const updated = tx
      .update(profileSkills)
      .set({
        name: input.name,
        nameKey: skillKey(input.name),
        category: input.category ?? null,
        proficiency: input.proficiency ?? null,
        experience: input.experience ?? null,
        note: input.note ?? null,
        aliases: input.aliases,
      })
      .where(and(eq(profileSkills.id, input.id), eq(profileSkills.userId, userId)))
      .returning({ id: profileSkills.id })
      .get();
    return updated ? { ok: true } : NOT_FOUND;
  });
}

export async function deleteSkill(id: number): Promise<void> {
  const { db, userId } = await scope();
  db.delete(profileSkills)
    .where(and(eq(profileSkills.id, id), eq(profileSkills.userId, userId)))
    .run();
}

// ---- Entries ----

export async function createEntry(input: CreateEntryInput): Promise<WriteResult> {
  const { db, userId } = await scope();
  db.transaction((tx) => {
    tx.insert(profileEntries)
      .values({ userId, ...input, source: "added", sortOrder: nextSortOrder(tx, profileEntries, userId) })
      .run();
  });
  return { ok: true };
}

// The .tex link (latex_key) is deliberately left alone, so renaming an
// entry keeps it linked to its \resumeSubheading.
export async function updateEntry(input: UpdateEntryInput): Promise<WriteResult> {
  const { db, userId } = await scope();
  const { id, ...fields } = input;
  const updated = db
    .update(profileEntries)
    .set(fields)
    .where(and(eq(profileEntries.id, id), eq(profileEntries.userId, userId)))
    .returning({ id: profileEntries.id })
    .get();
  return updated ? { ok: true } : NOT_FOUND;
}

// Its bullets are deleted with it (ON DELETE CASCADE).
export async function deleteEntry(id: number): Promise<void> {
  const { db, userId } = await scope();
  db.delete(profileEntries)
    .where(and(eq(profileEntries.id, id), eq(profileEntries.userId, userId)))
    .run();
}

// ---- Bullets ----

export async function createBullet(input: CreateBulletInput): Promise<WriteResult> {
  const { db, userId } = await scope();
  return db.transaction((tx) => {
    // The entry must be yours: an entry id from the form is checked, not trusted.
    const entry = tx
      .select({ id: profileEntries.id })
      .from(profileEntries)
      .where(and(eq(profileEntries.id, input.entryId), eq(profileEntries.userId, userId)))
      .get();
    if (!entry) return NOT_FOUND;

    const { maxOrder } = tx
      .select({ maxOrder: sql<number>`coalesce(max(${profileBullets.sortOrder}), -1)` })
      .from(profileBullets)
      .where(and(eq(profileBullets.userId, userId), eq(profileBullets.entryId, entry.id)))
      .get() ?? { maxOrder: -1 };

    tx.insert(profileBullets)
      .values({ userId, entryId: entry.id, text: input.text, source: "added", sortOrder: maxOrder + 1 })
      .run();
    return { ok: true };
  });
}

export async function updateBullet(input: UpdateBulletInput): Promise<WriteResult> {
  const { db, userId } = await scope();
  const updated = db
    .update(profileBullets)
    .set({ text: input.text })
    .where(and(eq(profileBullets.id, input.id), eq(profileBullets.userId, userId)))
    .returning({ id: profileBullets.id })
    .get();
  return updated ? { ok: true } : NOT_FOUND;
}

export async function deleteBullet(id: number): Promise<void> {
  const { db, userId } = await scope();
  db.delete(profileBullets)
    .where(and(eq(profileBullets.id, id), eq(profileBullets.userId, userId)))
    .run();
}

// ---- Highlights ----

export async function createHighlight(input: CreateHighlightInput): Promise<WriteResult> {
  const { db, userId } = await scope();
  db.transaction((tx) => {
    tx.insert(profileHighlights)
      .values({ userId, text: input.text, source: "added", sortOrder: nextSortOrder(tx, profileHighlights, userId) })
      .run();
  });
  return { ok: true };
}

export async function updateHighlight(input: UpdateHighlightInput): Promise<WriteResult> {
  const { db, userId } = await scope();
  const updated = db
    .update(profileHighlights)
    .set({ text: input.text })
    .where(and(eq(profileHighlights.id, input.id), eq(profileHighlights.userId, userId)))
    .returning({ id: profileHighlights.id })
    .get();
  return updated ? { ok: true } : NOT_FOUND;
}

export async function deleteHighlight(id: number): Promise<void> {
  const { db, userId } = await scope();
  db.delete(profileHighlights)
    .where(and(eq(profileHighlights.id, id), eq(profileHighlights.userId, userId)))
    .run();
}

// ---- "I have this" on a comparison gap ----

// Records your answer to a gap, with the job as the item's source. The job
// and (for an alias) the skill must be yours; both are checked, not trusted
// from the form.
export async function confirmGap(input: ConfirmGapInput): Promise<WriteResult> {
  const { db, userId } = await scope();
  return db.transaction((tx) => {
    const job = tx
      .select({ id: jobs.id })
      .from(jobs)
      .where(and(eq(jobs.id, input.jobId), eq(jobs.userId, userId)))
      .get();
    if (!job) return NOT_FOUND;

    if (input.mode === "highlight") {
      tx.insert(profileHighlights)
        .values({
          userId,
          text: input.text,
          source: "gap",
          sourceJobId: job.id,
          sortOrder: nextSortOrder(tx, profileHighlights, userId),
        })
        .run();
      return { ok: true };
    }

    if (input.mode === "alias") {
      const skill = tx
        .select({ id: profileSkills.id, aliases: profileSkills.aliases })
        .from(profileSkills)
        .where(and(eq(profileSkills.id, input.skillId), eq(profileSkills.userId, userId)))
        .get();
      if (!skill) return NOT_FOUND;
      // The new alias can't be another skill's name or alias.
      const existing = findNameClash(tx, userId, input.name, skill.id);
      if (existing) return clash(existing);
      if (!skill.aliases.some((alias) => skillKey(alias) === skillKey(input.name))) {
        tx.update(profileSkills)
          .set({ aliases: [...skill.aliases, input.name] })
          .where(and(eq(profileSkills.id, skill.id), eq(profileSkills.userId, userId)))
          .run();
      }
      return { ok: true };
    }

    // "skill" or "learning": a new skill per ticked name, sourced from this
    // gap, all with the same details. A name that's already in your profile
    // (or repeats an earlier one) is skipped; it's an error only when every
    // name was.
    const clashes: string[] = [];
    let added = 0;
    for (const name of input.names) {
      const existing = findNameClash(tx, userId, name);
      if (existing) {
        clashes.push(existing);
        continue;
      }
      tx.insert(profileSkills)
        .values({
          userId,
          name,
          nameKey: skillKey(name),
          category: input.category ?? null,
          proficiency: input.mode === "learning" ? "learning" : (input.proficiency ?? null),
          experience: input.mode === "skill" ? (input.experience ?? null) : null,
          note: input.mode === "skill" ? (input.note ?? null) : null,
          source: "gap",
          sourceJobId: job.id,
          sortOrder: nextSortOrder(tx, profileSkills, userId),
        })
        .run();
      added++;
    }
    if (added === 0) {
      return clashes.length === 1
        ? clash(clashes[0])
        : { ok: false, field: "names", message: "Those are all in your profile already." };
    }
    return { ok: true };
  });
}
