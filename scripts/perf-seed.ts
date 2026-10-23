// Builds a large database for measuring performance (docs/performance.md):
// the normal demo, plus hundreds of fictional applications with realistic
// listing lengths, notes, comparisons, and Inbox suggestions. Written to
// data/perf.db (gitignored), never your real database.
//
//   pnpm perf:seed                 # 300 extra applications
//   pnpm perf:seed --count 1000
//
// Then measure it as the read-only demo:
//   pnpm build
//   DEMO_MODE=true DEMO_DATABASE_PATH=./data/perf.db pnpm start
//   pnpm perf:measure
import { parseArgs } from "node:util";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import * as schema from "@/server/db/schema";
import { seedDemoDatabase } from "@/server/db/seed";
import { DEMO_USER_EMAIL } from "@/server/db/paths";
import { insertComparisonWithSkills } from "@/server/db/comparison-store";
import { insertEmailEvent } from "@/server/db/email-event-store";
import { backfillStatusHistory } from "@/server/db/status-history-store";
import { comparisonSchema } from "@/lib/schemas/comparison";
import type { Status } from "@/lib/schemas/status";

export const PERF_DB_PATH = "./data/perf.db";

const { values } = parseArgs({ options: { count: { type: "string", default: "300" } } });
const COUNT = Math.max(1, Number(values.count) || 300);

// A seeded random generator, so every run builds the same database and
// before/after measurements compare like with like.
let state = 42;
function random(): number {
  state = (state * 1664525 + 1013904223) % 2 ** 32;
  return state / 2 ** 32;
}
const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)];

const PREFIXES = ["Aster", "Basalt", "Cedar", "Delta", "Ember", "Fjord", "Garnet", "Harbor", "Indigo", "Juniper", "Kelvin", "Lattice", "Meridian", "Nimbus", "Onyx", "Prism", "Quill", "Ridge", "Summit", "Tundra"];
const SUFFIXES = ["Labs", "Systems", "Health", "Analytics", "Software", "Logistics", "Payments", "Studios", "Cloud", "Robotics"];
const TITLES = ["Frontend Engineer", "Senior Frontend Engineer", "Full-Stack Developer", "Software Engineer", "UI Engineer", "Web Developer", "React Developer", "Software Engineer, Frontend (Platform)"];
const STATUSES: Status[] = ["applied", "applied", "acknowledged", "interviewing", "rejected", "rejected", "rejected", "rejected", "ghosted", "offer"];
const SKILLS = ["React", "TypeScript", "Next.js", "Node.js", "PostgreSQL", "AWS", "Kubernetes", "Docker", "GraphQL", "Python", "Accessibility", "Playwright"];

// About 4,000 to 6,000 characters, like a real listing.
const PARAGRAPHS = [
  "We're looking for an engineer who cares about craft and ships product that real people depend on every day. You'll work closely with design and product to turn ambiguous problems into clear, well-tested interfaces.",
  "You'll own features end to end: from the first sketch with a designer, through code review and testing, to watching the metrics after launch. We value small, frequent releases and honest retrospectives.",
  "Our stack is modern but boring where it counts: typed code, automated tests, continuous deployment, and observability that tells us when something is wrong before our customers do.",
  "You'll mentor other engineers, write and review design documents, and help shape how the team builds software. We hire people who leave codebases better than they found them.",
  "Benefits include a learning budget, flexible hours, four weeks of vacation, and a hardware stipend. We're a remote-first team across several time zones with a few in-person weeks each year.",
  "Requirements: several years of professional experience building web applications; strong fundamentals in HTML, CSS, and JavaScript; experience with testing and accessibility; clear written communication.",
  "Nice to have: experience with data-heavy dashboards, real-time updates, design systems, performance profiling, or working in a regulated industry. None of these are required; tell us what you'd bring.",
  "Our interview process has four steps: a short call with a recruiter, a take-home exercise of about three hours, a technical conversation about your exercise, and a final round with the team.",
];
function listing(company: string, title: string, skills: string[]): string {
  const body = Array.from({ length: 22 }, () => pick(PARAGRAPHS));
  return `${title} at ${company}\n\n${body.join("\n\n")}\n\nSkills: ${skills.join(", ")}.`;
}

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => new Date(Date.now() - days * DAY);

async function main() {
  await seedDemoDatabase(PERF_DB_PATH);
  const sqlite = new Database(PERF_DB_PATH);
  const db = drizzle(sqlite, { schema });
  const user = db.select().from(schema.users).where(eq(schema.users.email, DEMO_USER_EMAIL)).get();
  const resume = db.select().from(schema.resumes).where(eq(schema.resumes.isActive, true)).get();
  if (!user || !resume) throw new Error("The demo seed didn't create its user and resume.");

  const applicationIds: number[] = [];
  for (let i = 0; i < COUNT; i++) {
    const company = `${pick(PREFIXES)} ${pick(SUFFIXES)} ${i}`;
    const title = pick(TITLES);
    const skills = SKILLS.filter(() => random() < 0.4);
    const appliedDaysAgo = 5 + Math.floor(random() * 170);
    const status = pick(STATUSES);
    const job = db
      .insert(schema.jobs)
      .values({
        userId: user.id,
        company,
        title,
        url: `https://jobs.example/${i}`,
        listingText: random() < 0.9 ? listing(company, title, skills) : null,
        source: "Company site",
        savedAt: daysAgo(appliedDaysAgo + 2),
      })
      .returning()
      .get();
    const app = db
      .insert(schema.applications)
      .values({
        userId: user.id,
        jobId: job.id,
        status,
        appliedAt: daysAgo(appliedDaysAgo),
        // Recent enough that nothing here is ghosted by the rule.
        updatedAt: daysAgo(Math.min(appliedDaysAgo, 10)),
        notes: random() < 0.5 ? "Referred by a former colleague. Follow up after the take-home. ".repeat(4) : null,
        passedScreeningAt: status === "interviewing" || status === "offer" || random() < 0.1 ? daysAgo(appliedDaysAgo - 3) : null,
      })
      .returning()
      .get();
    applicationIds.push(app.id);

    if (job.listingText && random() < 0.5) {
      const matched = skills.filter(() => random() < 0.5);
      const missing = skills.filter((s) => !matched.includes(s));
      insertComparisonWithSkills(db, user.id, {
        jobId: job.id,
        resumeId: resume.id,
        result: comparisonSchema.parse({
          score: Math.round((100 * matched.length) / Math.max(1, skills.length)),
          matchedSkills: matched,
          missingSkills: missing,
          missingKeywords: [],
          suggestions: ["Generated for performance testing."],
        }),
        model: "demo",
      });
    }
  }

  // Inbox suggestions, like a first sync over a busy inbox.
  for (let i = 0; i < 150; i++) {
    insertEmailEvent(db, user.id, {
      source: "email",
      gmailMessageId: `perf-${i}`,
      gmailThreadId: `perf-thread-${i}`,
      fromAddress: "no-reply@greenhouse-mail.io",
      fromName: "Recruiting",
      subject: `Update on your application #${i}`,
      snippet: "Thank you for your interest. We've reviewed your application and will be in touch about next steps.",
      receivedAt: daysAgo(i % 60),
      applicationId: random() < 0.7 ? pick(applicationIds) : null,
      matchMethod: "company",
      emailType: pick(["acknowledged", "interview", "rejection"] as const),
      confidence: 0.9,
      reason: "Generated for performance testing.",
    });
  }

  // Status history for the generated applications, as the seed does.
  backfillStatusHistory(db, user.id);

  sqlite.close();
  console.log(`Wrote ${PERF_DB_PATH}: the demo plus ${COUNT} applications and 150 Inbox suggestions.`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
