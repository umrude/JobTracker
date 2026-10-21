// No "server-only" here, like the other *-store.ts modules: tests and the
// seed use it with their own connection. Every query filters by owner;
// the app reaches it through server/insights.ts, which passes
// requireUserId().
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@/server/db/schema";
import { applications, comparisonSkills, comparisons, jobs, profileSkills, resumes } from "@/server/db/schema";
import { skillResolverFor } from "@/server/db/comparison-store";
import { listingChangedSince } from "@/lib/listing";
import type { InsightJob, InsightProfileSkill } from "@/lib/insights/build";
import { splitSkillPhrases } from "@/lib/insights/skills";

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
              skills: splitSkillPhrases(skillsByComparison.get(comparison.id) ?? [], resolver),
              listingChanged: listingChangedSince(comparison.listingHash, job.listingText),
              olderResume: activeResumeId !== undefined && comparison.resumeId !== activeResumeId,
            }
          : null,
      };
    }),
    profileSkills: skills.map((skill) => ({ key: resolver.resolve(skill.name).key, learning: skill.proficiency === "learning" })),
  };
}
