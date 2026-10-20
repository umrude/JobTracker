// No "server-only" here, like the other *-store.ts modules: the seed uses
// it with its own connection. Every function takes the database and owner
// as arguments; the app reaches it through cover-letters.ts (db), which
// passes requireUserId().
import { and, desc, eq, sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@/server/db/schema";
import { coverLetters } from "@/server/db/schema";
import type { CoverLength, CoverTone, LetterWarning } from "@/lib/schemas/cover-letter";

type AppDb = BetterSQLite3Database<typeof schema>;

// Saves a generated letter as the next version for this job. One
// transaction, so two quick generations can't take the same version.
export function insertCoverLetter(
  db: AppDb,
  userId: number,
  input: {
    jobId: number;
    tailoringId: number | null;
    resumeId: number;
    tone: CoverTone;
    length: CoverLength;
    text: string;
    warnings: LetterWarning[];
    model: string;
  },
): { id: number; version: number } {
  return db.transaction((tx) => {
    const { maxVersion } = tx
      .select({ maxVersion: sql<number>`coalesce(max(${coverLetters.version}), 0)` })
      .from(coverLetters)
      .where(and(eq(coverLetters.userId, userId), eq(coverLetters.jobId, input.jobId)))
      .get() ?? { maxVersion: 0 };
    return tx
      .insert(coverLetters)
      .values({ ...input, userId, version: maxVersion + 1, generatedText: input.text })
      .returning({ id: coverLetters.id, version: coverLetters.version })
      .get();
  });
}

// Newest first.
export function coverLetterRows(db: AppDb, userId: number, jobId: number) {
  return db
    .select()
    .from(coverLetters)
    .where(and(eq(coverLetters.userId, userId), eq(coverLetters.jobId, jobId)))
    .orderBy(desc(coverLetters.version))
    .all();
}

export type CoverLetterRow = ReturnType<typeof coverLetterRows>[number];

export function updateCoverLetterText(db: AppDb, userId: number, id: number, text: string): boolean {
  const updated = db
    .update(coverLetters)
    .set({ text, updatedAt: new Date() })
    .where(and(eq(coverLetters.id, id), eq(coverLetters.userId, userId)))
    .returning({ id: coverLetters.id })
    .get();
  return updated !== undefined;
}
