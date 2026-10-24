// No "server-only" here, like the other *-store.ts modules: tests and the
// seed use it with their own connection. Every query filters by owner;
// the app reaches it through server/insights.ts, which passes
// requireUserId().
import { and, asc, desc, eq, inArray, isNull, lt } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@/server/db/schema";
import { applications, comparisonSkills, comparisons, interviews, jobs, profileSkills, resumes, statusEvents } from "@/server/db/schema";
import { skillResolverFor } from "@/server/db/comparison-store";
import { listingChangedSince } from "@/lib/listing";
import type { InsightJob, InsightProfileSkill } from "@/lib/insights/build";
import { splitSkillPhrases } from "@/lib/insights/skills";
import type { PipelineApplication } from "@/lib/insights/pipeline";

type AppDb = BetterSQLite3Database<typeof schema>;

// Everything the Insights numbers are built from, as plain data for
// buildInsights: every job (saved or applied) with its latest comparison
// of your resume as written and that comparison's skill rows, and your
// profile's skills by canonical key.
export function insightInputs(db: AppDb, userId: number): { jobs: InsightJob[]; profileSkills: InsightProfileSkill[] } {
  const jobRows = db
    .select({
      jobId: jobs.id,
      company: jobs.company,
      title: jobs.title,
      listingText: jobs.listingText,
      status: applications.status,
      passedScreeningAt: applications.passedScreeningAt,
    })
    .from(jobs)
    .leftJoin(applications, and(eq(applications.jobId, jobs.id), eq(applications.userId, userId)))
    .where(eq(jobs.userId, userId))
    .all();

  // The latest comparison per job of your resume as written. Tailored
  // comparisons don't count: they were written toward the listing.
  const latest = new Map<number, { id: number; resumeId: number; listingHash: string | null }>();
  for (const row of db
    .select({ id: comparisons.id, jobId: comparisons.jobId, resumeId: comparisons.resumeId, listingHash: comparisons.listingHash })
    .from(comparisons)
    .where(and(eq(comparisons.userId, userId), isNull(comparisons.tailoringId)))
    .orderBy(desc(comparisons.createdAt), desc(comparisons.id))
    .all()) {
    if (!latest.has(row.jobId)) latest.set(row.jobId, row);
  }

  const ids = [...latest.values()].map((c) => c.id);
  const skillsByComparison = new Map<number, { key: string; name: string; status: "matched" | "missing" }[]>();
  for (let i = 0; i < ids.length; i += 500) {
    for (const row of db
      .select({ comparisonId: comparisonSkills.comparisonId, key: comparisonSkills.skillKey, name: comparisonSkills.name, status: comparisonSkills.status })
      .from(comparisonSkills)
      .where(and(eq(comparisonSkills.userId, userId), inArray(comparisonSkills.comparisonId, ids.slice(i, i + 500))))
      .all()) {
      const list = skillsByComparison.get(row.comparisonId) ?? [];
      list.push({ key: row.key, name: row.name, status: row.status });
      skillsByComparison.set(row.comparisonId, list);
    }
  }

  const activeResumeId = db
    .select({ id: resumes.id })
    .from(resumes)
    .where(and(eq(resumes.userId, userId), eq(resumes.isActive, true)))
    .get()?.id;

  const resolver = skillResolverFor(db, userId);
  const phraseCache = new Map<string, string[]>();
  const skills = db
    .select({ name: profileSkills.name, proficiency: profileSkills.proficiency })
    .from(profileSkills)
    .where(eq(profileSkills.userId, userId))
    .all();

  return {
    jobs: jobRows.map((job) => {
      const comparison = latest.get(job.jobId);
      return {
        jobId: job.jobId,
        company: job.company,
        title: job.title,
        hasListing: job.listingText !== null && job.listingText.trim() !== "",
        status: job.status,
        passedScreening: job.passedScreeningAt !== null,
        comparison: comparison
          ? {
              // Phrases split into the known skills they mention, so the same
              // skill written different ways is counted once (lib/insights/skills.ts).
              skills: splitSkillPhrases(skillsByComparison.get(comparison.id) ?? [], resolver, phraseCache),
              listingChanged: listingChangedSince(comparison.listingHash, job.listingText),
              olderResume: activeResumeId !== undefined && comparison.resumeId !== activeResumeId,
            }
          : null,
      };
    }),
    profileSkills: skills.map((skill) => ({ key: resolver.resolve(skill.name).key, learning: skill.proficiency === "learning" })),
  };
}

// The jobs "Compare all" would compare: a listing, no comparison yet. With
// their listing text, for the cost estimate.
export function jobsToCompare(db: AppDb, userId: number): { jobId: number; company: string; listingText: string }[] {
  const compared = new Set(
    db
      .select({ jobId: comparisons.jobId })
      .from(comparisons)
      .where(and(eq(comparisons.userId, userId), isNull(comparisons.tailoringId)))
      .all()
      .map((row) => row.jobId),
  );
  return db
    .select({ jobId: jobs.id, company: jobs.company, listingText: jobs.listingText })
    .from(jobs)
    .where(eq(jobs.userId, userId))
    .orderBy(desc(jobs.savedAt), desc(jobs.id))
    .all()
    .flatMap((job) => (job.listingText?.trim() && !compared.has(job.jobId) ? [{ ...job, listingText: job.listingText }] : []));
}

// What the pipeline (lib/insights/pipeline.ts) is built from: every
// application's status, its history in recorded order, and whether it had
// an interview before `now`. Three small queries, grouped here.
export function pipelineInputs(db: AppDb, userId: number, now: Date): PipelineApplication[] {
  const rows = db
    .select({ id: applications.id, status: applications.status })
    .from(applications)
    .where(eq(applications.userId, userId))
    .all();
  const steps = db
    .select({ applicationId: statusEvents.applicationId, to: statusEvents.toStatus, at: statusEvents.at, source: statusEvents.source })
    .from(statusEvents)
    .where(eq(statusEvents.userId, userId))
    .orderBy(asc(statusEvents.applicationId), asc(statusEvents.id))
    .all();
  const interviewed = new Set(
    db
      .selectDistinct({ applicationId: interviews.applicationId })
      .from(interviews)
      .where(and(eq(interviews.userId, userId), lt(interviews.at, now)))
      .all()
      .map((row) => row.applicationId),
  );

  const byApplication = new Map<number, PipelineApplication["steps"]>();
  for (const step of steps) {
    const list = byApplication.get(step.applicationId) ?? [];
    list.push({ to: step.to, at: step.at, estimated: step.source === "estimated" });
    byApplication.set(step.applicationId, list);
  }
  return rows.map((row) => ({ status: row.status, steps: byApplication.get(row.id) ?? [], hadInterview: interviewed.has(row.id) }));
}
