// No "server-only" here, like schema.ts: the seed script (tsx, outside
// Next's bundler) imports these to build the demo profile. Every function
// takes the database as an argument and touches nothing else, no secrets
// and no request state. The app reaches them through profile.ts, which
// does import "server-only" and supplies getDb().
import { and, asc, eq, sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@/server/db/schema";
import { profileBullets, profileEntries, profileHighlights, profileSkills } from "@/server/db/schema";
import { skillKey } from "@/lib/comparison-helpers";
import { parseResumeLatex } from "@/lib/latex/resume";
import { isEmptyPlan, planProfileImport, type ImportPlan } from "@/lib/profile/import";
import type { Profile } from "@/lib/profile/types";

export type ProfileDb = BetterSQLite3Database<typeof schema>;

// Every function here takes the owner explicitly and filters every query
// by it. The app passes requireUserId() (see profile.ts); the seed passes
// the demo user.

export function loadProfileFrom(db: ProfileDb, userId: number): Profile {
  const skills = db
    .select()
    .from(profileSkills)
    .where(eq(profileSkills.userId, userId))
    .orderBy(asc(profileSkills.sortOrder), asc(profileSkills.id))
    .all();
  const entryRows = db
    .select()
    .from(profileEntries)
    .where(eq(profileEntries.userId, userId))
    .orderBy(asc(profileEntries.sortOrder), asc(profileEntries.id))
    .all();
  const bullets = db
    .select()
    .from(profileBullets)
    .where(eq(profileBullets.userId, userId))
    .orderBy(asc(profileBullets.sortOrder), asc(profileBullets.id))
    .all();
  const highlights = db
    .select()
    .from(profileHighlights)
    .where(eq(profileHighlights.userId, userId))
    .orderBy(asc(profileHighlights.sortOrder), asc(profileHighlights.id))
    .all();

  return {
    skills,
    entries: entryRows.map((entry) => ({
      ...entry,
      bullets: bullets.filter((bullet) => bullet.entryId === entry.id),
    })),
    highlights,
  };
}

export type ImportResult =
  | { ok: true; added: { skills: number; entries: number; bullets: number; highlights: number } }
  | { ok: false; message: string };

// Reads a .tex into the profile, adding only what's new (see
// planProfileImport). Safe to run any number of times.
export function importProfileFromLatexInto(db: ProfileDb, userId: number, tex: string): ImportResult {
  const parsed = parseResumeLatex(tex);
  if (!parsed.ok) return parsed;

  const plan = planProfileImport(parsed.resume, loadProfileFrom(db, userId));
  if (!isEmptyPlan(plan)) applyImportPlan(db, userId, plan);

  return {
    ok: true,
    added: {
      skills: plan.skills.length,
      entries: plan.entries.length,
      bullets:
        plan.entries.reduce((total, entry) => total + entry.bullets.length, 0) +
        plan.bullets.reduce((total, group) => total + group.texts.length, 0),
      highlights: plan.highlights.length,
    },
  };
}

// One transaction: an import is applied completely or not at all. New
// items are appended after everything already there (sort order), so an
// import never reshuffles what you've arranged.
function applyImportPlan(db: ProfileDb, userId: number, plan: ImportPlan) {
  db.transaction((tx) => {
    let skillOrder = nextSortOrder(tx, profileSkills, userId);
    for (const skill of plan.skills) {
      tx.insert(profileSkills)
        .values({
          userId,
          name: skill.name,
          nameKey: skillKey(skill.name),
          category: skill.category,
          source: "resume",
          sortOrder: skillOrder++,
        })
        .run();
    }

    let entryOrder = nextSortOrder(tx, profileEntries, userId);
    for (const entry of plan.entries) {
      const { id } = tx
        .insert(profileEntries)
        .values({
          userId,
          section: entry.section,
          title: entry.title,
          dates: entry.dates,
          subtitle: entry.subtitle,
          detail: entry.detail,
          latexKey: entry.latexKey,
          source: "resume",
          sortOrder: entryOrder++,
        })
        .returning({ id: profileEntries.id })
        .get();
      insertBullets(tx, userId, id, entry.bullets, 0);
    }

    for (const { entryId, texts } of plan.bullets) {
      const { maxOrder } = tx
        .select({ maxOrder: sql<number>`coalesce(max(${profileBullets.sortOrder}), -1)` })
        .from(profileBullets)
        .where(and(eq(profileBullets.userId, userId), eq(profileBullets.entryId, entryId)))
        .get() ?? { maxOrder: -1 };
      insertBullets(tx, userId, entryId, texts, maxOrder + 1);
    }

    let highlightOrder = nextSortOrder(tx, profileHighlights, userId);
    for (const text of plan.highlights) {
      tx.insert(profileHighlights)
        .values({ userId, text, source: "resume", sortOrder: highlightOrder++ })
        .run();
    }
  });
}

type Tx = Parameters<Parameters<ProfileDb["transaction"]>[0]>[0];

function insertBullets(tx: Tx, userId: number, entryId: number, texts: string[], firstOrder: number) {
  texts.forEach((text, index) => {
    tx.insert(profileBullets)
      .values({ userId, entryId, text, source: "resume", sortOrder: firstOrder + index })
      .run();
  });
}

function nextSortOrder(
  tx: Tx,
  table: typeof profileSkills | typeof profileEntries | typeof profileHighlights,
  userId: number,
): number {
  const { maxOrder } = tx
    .select({ maxOrder: sql<number>`coalesce(max(${table.sortOrder}), -1)` })
    .from(table)
    .where(eq(table.userId, userId))
    .get() ?? { maxOrder: -1 };
  return maxOrder + 1;
}
