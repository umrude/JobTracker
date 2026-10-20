// No "server-only" here, like profile-store.ts: the seed uses it with its
// own connection. Every function takes the database and owner as arguments.
// The app reaches it through comparisons.ts, which passes requireUserId().
import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@/server/db/schema";
import { comparisonSkills, comparisons, profileSkills } from "@/server/db/schema";
import type { Comparison } from "@/lib/schemas/comparison";
import { createSkillResolver, type SkillResolver } from "@/lib/skills/resolver";
import { comparisonSkillRows } from "@/lib/skills/comparison-rows";

type AppDb = BetterSQLite3Database<typeof schema>;

// The user's skill resolver: built-in aliases plus their profile's.
export function skillResolverFor(db: AppDb, userId: number): SkillResolver {
  const skills = db
    .select({ name: profileSkills.name, aliases: profileSkills.aliases })
    .from(profileSkills)
    .where(eq(profileSkills.userId, userId))
    .all();
  return createSkillResolver(skills);
}

// Saves a comparison and its normalized skill rows together, in one
// transaction, so a comparison never exists without its rows.
export function insertComparisonWithSkills(
  db: AppDb,
  userId: number,
  input: { jobId: number; resumeId: number; result: Comparison; model: string; createdAt?: Date },
): { id: number } {
  const resolver = skillResolverFor(db, userId);
  return db.transaction((tx) => {
    const saved = tx
      .insert(comparisons)
      .values({ ...input, userId })
      .returning({ id: comparisons.id })
      .get();
    const rows = comparisonSkillRows(input.result, resolver);
    if (rows.length > 0) {
      tx.insert(comparisonSkills)
        .values(rows.map((row) => ({ ...row, userId, comparisonId: saved.id })))
        .run();
    }
    return saved;
  });
}
