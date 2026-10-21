import type { Status } from "@/lib/schemas/status";

// The Insights numbers (docs/insights.md, Step 5b). Counts and facts only:
// which skills your listings ask for that your resume doesn't show, where
// each stands in your profile, and how often each was missing in
// applications that were rejected versus ones that progressed. Never a
// cause. Pure: the page and tests call it with plain data.

// ---- Input ----

export type InsightJob = {
  jobId: number;
  company: string;
  title: string;
  hasListing: boolean;
  // Null for a saved job (no application yet).
  status: Status | null;
  passedScreening: boolean;
  // The latest comparison of your resume as written, if any.
  comparison: {
    skills: { key: string; name: string; status: "matched" | "missing" }[];
    // The listing was edited after this comparison (it still counts).
    listingChanged: boolean;
    // It compared an older resume version than your active one.
    olderResume: boolean;
  } | null;
};

export type InsightProfileSkill = { key: string; learning: boolean };

export type InsightScope = "all" | "applied";

// ---- Output ----

// Where a skill stands in your profile:
// - in_profile: you have it (not Learning). If it was missing, your
//   resume didn't show it: tailoring can.
// - learning: you marked it Learning.
// - absent: not in your profile at all.
export type ProfileStanding = "in_profile" | "learning" | "absent";

export type Tally = { total: number; missing: number };

export type SkillInsight = {
  key: string;
  name: string;
  // Included listings that ask for it, and how often your resume was
  // missing it.
  asked: number;
  missing: number;
  standing: ProfileStanding;
  // Among applications whose listing asked for it (counts, not causes):
  outcomes: {
    // Rejected or Ghosted; ghosted is shown separately inside it.
    rejected: Tally & { ghosted: Tally };
    progressed: Tally;
    // Rejections split by what you know about screening.
    afterScreening: Tally;
    stageUnknown: Tally;
    // Enough of both rejected and progressed to put side by side.
    comparable: boolean;
  };
};

export type JobRef = { jobId: number; company: string; title: string; isApplication: boolean };

export type Insights = {
  scope: InsightScope;
  coverage: {
    // Jobs in scope with a listing and a comparison: what's analyzed.
    included: number;
    noListing: JobRef[];
    notCompared: JobRef[];
    listingChanged: number;
    olderResume: number;
  };
  outcomes: {
    rejected: number;
    ghosted: number;
    progressed: number;
    // Applied or Acknowledged: no result yet, so in neither group.
    waiting: number;
    // Rejections (incl. ghosted) you know passed screening.
    rejectedAfterScreening: number;
  };
  // Whether the screening split has enough to show (see SCREENING_MIN).
  screeningSplit: boolean;
  // Most often missing first, then most asked.
  skills: SkillInsight[];
};

// Fewer outcomes than this on either side is "too few to compare".
export const MIN_SAMPLE = 5;
// The screening split shows once this many rejections are known to have
// passed screening; before that, a single line says how many.
export const SCREENING_MIN = 5;

const REJECTED: readonly Status[] = ["rejected", "ghosted"];
const PROGRESSED: readonly Status[] = ["interviewing", "offer"];

const ref = (job: InsightJob): JobRef => ({
  jobId: job.jobId,
  company: job.company,
  title: job.title,
  isApplication: job.status !== null,
});

const tally = (): Tally => ({ total: 0, missing: 0 });

function count(target: Tally, missing: boolean) {
  target.total++;
  if (missing) target.missing++;
}

export function buildInsights(jobs: readonly InsightJob[], profileSkills: readonly InsightProfileSkill[], scope: InsightScope): Insights {
  const inScope = jobs.filter((job) => scope === "all" || job.status !== null);

  const noListing = inScope.filter((job) => !job.hasListing);
  const notCompared = inScope.filter((job) => job.hasListing && job.comparison === null);
  const included = inScope.filter((job) => job.hasListing && job.comparison !== null);

  const standing = new Map<string, ProfileStanding>();
  for (const skill of profileSkills) {
    // Having it at all wins over a Learning duplicate.
    if (standing.get(skill.key) !== "in_profile") standing.set(skill.key, skill.learning ? "learning" : "in_profile");
  }

  const skills = new Map<string, SkillInsight>();
  for (const job of included) {
    for (const skill of job.comparison?.skills ?? []) {
      let insight = skills.get(skill.key);
      if (!insight) {
        insight = {
          key: skill.key,
          name: skill.name,
          asked: 0,
          missing: 0,
          standing: standing.get(skill.key) ?? "absent",
          outcomes: {
            rejected: { ...tally(), ghosted: tally() },
            progressed: tally(),
            afterScreening: tally(),
            stageUnknown: tally(),
            comparable: false,
          },
        };
        skills.set(skill.key, insight);
      }
      const missing = skill.status === "missing";
      insight.asked++;
      if (missing) insight.missing++;

      const status = job.status;
      if (status && REJECTED.includes(status)) {
        count(insight.outcomes.rejected, missing);
        if (status === "ghosted") count(insight.outcomes.rejected.ghosted, missing);
        count(job.passedScreening ? insight.outcomes.afterScreening : insight.outcomes.stageUnknown, missing);
      } else if (status && PROGRESSED.includes(status)) {
        count(insight.outcomes.progressed, missing);
      }
    }
  }
  for (const insight of skills.values()) {
    insight.outcomes.comparable = insight.outcomes.rejected.total >= MIN_SAMPLE && insight.outcomes.progressed.total >= MIN_SAMPLE;
  }

  const applications = included.filter((job) => job.status !== null);
  const rejectedAfterScreening = applications.filter((job) => job.status && REJECTED.includes(job.status) && job.passedScreening).length;

  return {
    scope,
    coverage: {
      included: included.length,
      noListing: noListing.map(ref),
      notCompared: notCompared.map(ref),
      listingChanged: included.filter((job) => job.comparison?.listingChanged).length,
      olderResume: included.filter((job) => job.comparison?.olderResume).length,
    },
    outcomes: {
      rejected: applications.filter((job) => job.status === "rejected").length,
      ghosted: applications.filter((job) => job.status === "ghosted").length,
      progressed: applications.filter((job) => job.status && PROGRESSED.includes(job.status)).length,
      waiting: applications.filter((job) => job.status === "applied" || job.status === "acknowledged").length,
      rejectedAfterScreening,
    },
    screeningSplit: rejectedAfterScreening >= SCREENING_MIN,
    skills: [...skills.values()].sort((a, b) => b.missing - a.missing || b.asked - a.asked || a.name.localeCompare(b.name)),
  };
}
