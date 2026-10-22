// No "server-only" here, like the other *-store.ts modules: tests use it
// with their own connection. The app reaches it through server/search.ts.
import { and, desc, eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@/server/db/schema";
import { applications, jobs } from "@/server/db/schema";
import type { SearchDoc } from "@/lib/search/search";
import type { Status } from "@/lib/schemas/status";

type AppDb = BetterSQLite3Database<typeof schema>;

export type JobSearchDoc = SearchDoc & { status: Status | null };

// Every job you have (saved or applied) as a search document, listing
// included. Read on the server for each search; at hundreds of jobs that's
// a few milliseconds (docs/search.md).
export function searchDocuments(db: AppDb, userId: number): JobSearchDoc[] {
  return db
    .select({
      jobId: jobs.id,
      applicationId: applications.id,
      company: jobs.company,
      title: jobs.title,
      listing: jobs.listingText,
      status: applications.status,
      appUpdatedAt: applications.updatedAt,
      savedAt: jobs.savedAt,
    })
    .from(jobs)
    .leftJoin(applications, and(eq(applications.jobId, jobs.id), eq(applications.userId, userId)))
    .where(eq(jobs.userId, userId))
    .orderBy(desc(jobs.id))
    .all()
    .map(({ appUpdatedAt, savedAt, ...doc }) => ({ ...doc, updatedAt: appUpdatedAt ?? savedAt }));
}
