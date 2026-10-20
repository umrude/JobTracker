// No "server-only" here, like profile-store.ts: the seed uses it with its
// own connection. Every function takes the database and owner as arguments;
// the app reaches it through tailored-resumes.ts, which passes requireUserId().
import { and, desc, eq, sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@/server/db/schema";
import { tailoredResumes } from "@/server/db/schema";
import type { CheckIssue, TailoringProposal } from "@/lib/schemas/tailoring";

type AppDb = BetterSQLite3Database<typeof schema>;

// Saves a checked proposal as the next draft version for this job. One
// transaction, so two quick generations can't take the same version.
export function insertTailoringDraft(
  db: AppDb,
  userId: number,
  input: {
    jobId: number;
    resumeId: number;
    proposal: TailoringProposal;
    issues: CheckIssue[];
    model: string;
    createdAt?: Date;
  },
): { id: number; version: number } {
  return db.transaction((tx) => {
    const { maxVersion } = tx
      .select({ maxVersion: sql<number>`coalesce(max(${tailoredResumes.version}), 0)` })
      .from(tailoredResumes)
      .where(and(eq(tailoredResumes.userId, userId), eq(tailoredResumes.jobId, input.jobId)))
      .get() ?? { maxVersion: 0 };

    return tx
      .insert(tailoredResumes)
      .values({ ...input, userId, version: maxVersion + 1, status: "draft" })
      .returning({ id: tailoredResumes.id, version: tailoredResumes.version })
      .get();
  });
}

export function latestTailoringRow(db: AppDb, userId: number, jobId: number) {
  return db
    .select()
    .from(tailoredResumes)
    .where(and(eq(tailoredResumes.userId, userId), eq(tailoredResumes.jobId, jobId)))
    .orderBy(desc(tailoredResumes.version))
    .limit(1)
    .get();
}

export type TailoringRow = NonNullable<ReturnType<typeof latestTailoringRow>>;
