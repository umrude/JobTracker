// No "server-only" import: this is a standalone CLI script run via tsx
// (pnpm db:seed), not part of the Next.js runtime, so it can't go through
// the app's DB client factory (client.ts) either -- that module imports
// "server-only", which throws unconditionally outside Next's bundler.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "@/server/db/schema";
import { DEMO_DB_PATH } from "@/server/db/paths";
import type { Status } from "@/lib/schemas/status";
import { DEMO_MODEL, getDemoComparison } from "@/server/llm/compare-demo";

const UNCOMPARED_SEED_JOB_URL = "https://pebblebrookhealth.example/careers/4410";

// process.cwd()-relative, not import.meta.dirname: this module runs both
// directly under tsx (pnpm db:seed) and dynamically imported inside a
// Turbopack-bundled chunk (src/instrumentation.ts's register()), and
// import.meta.dirname comes back undefined in the latter.
const MIGRATIONS_FOLDER = path.join(
  process.cwd(),
  "src/server/db/migrations",
);

// v2's LaTeX source, so the demo has a tailorable resume. v1 has none, to
// show the "upload your .tex" state in the version history. cwd-relative
// for the same reason as MIGRATIONS_FOLDER.
const DEMO_RESUME_TEX_PATH = path.join(
  process.cwd(),
  "src/server/db/fixtures/demo-resume.tex",
);

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

type SeedJob = {
  company: string;
  title: string;
  url: string;
  listingText: string;
  source: string;
  savedDaysAgo: number;
  notes?: string;
};

type SeedApplication = SeedJob & {
  status: Status;
  appliedDaysAgo?: number;
};

// A fake resume for a fictional person; never put real resume text here.
// It's a frontend engineer on purpose: a strong fit for Northwind, a
// partial fit for Tidewater (no AWS, light Postgres) and Bramblewood
// (ARIA and axe, but no screen-reader testing), and a weak fit for the
// backend and design roles.
export const SEED_RESUME_V1 = `Alex Rivera
alex.rivera@example.com · Portland, OR

Frontend Engineer with 5 years building React applications.

Experience
Frontend Engineer, Larkspur Logistics (2022-present)
- Built a shipment tracking dashboard in React and TypeScript.
- Added Playwright end-to-end tests to CI.

Frontend Developer, Copperline Media (2020-2022)
- Built marketing sites and a CMS-driven article template in React.

Skills
React, TypeScript, JavaScript, CSS, Playwright, Git`;

// The plain-text form of fixtures/demo-resume.tex (same content, LaTeX
// removed), laid out the way a parsed PDF of it would read. Keep the two
// in sync; the demo comparisons in compare-demo.ts were written against it.
export const SEED_RESUME_V2 = `Alex Rivera
555-0142 | alex.rivera@example.com | github.com/alex-rivera-example | Portland, OR

Summary
Frontend engineer with 6 years of experience building data-heavy React and TypeScript applications. Led the rebuild of a real-time shipment tracking dashboard used by 400+ dispatchers. I care about performance, testing, and interfaces that work for everyone.

Technical Skills
Languages: TypeScript, JavaScript, HTML, CSS, some SQL
Frontend: React, Next.js, D3, visx, Tailwind CSS, Storybook
Real-time: WebSockets, server-sent events
Testing: Playwright, Vitest, React Testing Library, axe-core
Tools: Git, GitHub Actions, Vercel, Figma (handoff only)

Notable Projects
Dispatch Dashboard (Larkspur Logistics) | 2022 - Present
Real-Time Shipment Tracking | React, TypeScript, WebSockets
- Led the rebuild of a real-time shipment tracking dashboard used by 400+ dispatchers
- Cut time-to-interactive from 6s to 1.8s with virtualization and memoization
- Built fleet throughput charts with D3 and visx

Component Library (Copperline Media) | 2021 - 2022
Shared React UI Kit | React, Storybook
- Built a shared React component library with Storybook, used across the editorial tools and the public site

Experience
Senior Frontend Engineer | 2022 - Present
Larkspur Logistics | Portland, OR
- Introduced Playwright end-to-end tests and component tests in CI (GitHub Actions); flaky-test rate dropped below 1%
- Mentored two junior engineers through code review and pairing
- Ran keyboard-navigation and ARIA fixes across the dashboard; added axe checks to CI

Frontend Developer | 2020 - 2022
Copperline Media | Portland, OR
- Built a Next.js publishing front end serving 2M monthly readers
- Wrote Node.js API routes and simple PostgreSQL queries for the editorial tools

Junior Web Developer | 2019 - 2020
Fennel & Finch Agency | Portland, OR
- Built responsive marketing sites with HTML, CSS, and JavaScript

Education
Willamette Valley State University | Salem, OR
B.S. Computer Science | 2015 - 2019`;

// Jobs with no application: these appear on the Saved jobs page. Their
// URLs are also the keys for the canned demo comparison results, so keep
// them stable. The listings fit the seeded resume to varying degrees
// (strong, partial, weak) so the demo shows a spread of scores.
export const SEED_SAVED_JOBS: SeedJob[] = [
  {
    company: "Northwind Robotics",
    title: "Senior Frontend Engineer",
    url: "https://careers.northwindrobotics.example/jobs/1821",
    listingText: `Northwind Robotics builds autonomous picking robots for mid-size warehouses. Our operator console is how floor managers see, steer, and troubleshoot a fleet of 50+ robots in real time.

What you'll do
- Own the architecture of the operator console, a React + TypeScript app that renders live robot telemetry.
- Build real-time views fed by WebSockets: fleet maps, task queues, fault alerts.
- Design data visualizations for throughput and error rates (D3 or similar).
- Raise the quality bar: component tests, Playwright end-to-end tests, and accessibility reviews.
- Mentor two mid-level engineers and partner closely with our robotics and design teams.

What we're looking for
- 5+ years building production web apps, 2+ with TypeScript.
- Deep React experience, including performance work on data-heavy UIs.
- Experience with real-time data (WebSockets, server-sent events).
- Comfort with automated testing and CI.
- Nice to have: D3, canvas/WebGL rendering, experience in logistics or industrial software.`,
    source: "LinkedIn",
    savedDaysAgo: 6,
    notes: "Recruiter reached out. Hybrid, 2 days/week in office.",
  },
  {
    company: "Tidewater Labs",
    title: "Full-Stack Engineer",
    url: "https://tidewaterlabs.example/careers/fse-112",
    listingText: `Tidewater Labs makes scheduling software for independent veterinary clinics. We're a 25-person team, fully remote in US time zones.

The role
You'll ship features end to end across our Next.js frontend and Node.js API, from database migration to UI polish.

Responsibilities
- Build product features in Next.js (App Router) and TypeScript.
- Design PostgreSQL schemas and write efficient queries.
- Maintain our tRPC API layer and background job workers.
- Deploy and monitor services on AWS (ECS, RDS, S3).
- Talk to customers: every engineer joins a support rotation one week per quarter.

Requirements
- 3+ years of full-stack web development.
- Strong TypeScript and React.
- Production experience with PostgreSQL.
- Familiarity with AWS or a similar cloud platform.
- Nice to have: tRPC, Stripe integrations, experience at an early-stage startup.`,
    source: "Company site",
    savedDaysAgo: 4,
  },
  {
    company: "Bramblewood Learning",
    title: "Software Engineer, Accessibility",
    url: "https://bramblewoodlearning.example/jobs/a11y-07",
    listingText: `Bramblewood Learning builds reading software used by 2 million K-8 students, including many who rely on screen readers, switch devices, and magnification.

About the role
Join our Accessibility team to make every part of the student experience usable by every student.

You will
- Audit and fix our React component library against WCAG 2.2 AA.
- Build accessible patterns for complex widgets: drag-and-drop activities, audio players, rich text.
- Write automated accessibility tests (axe-core, Playwright) and run manual audits with NVDA, JAWS, and VoiceOver.
- Teach other teams: write guidelines, review pull requests, run workshops.

You have
- 2+ years of frontend engineering with React.
- Hands-on knowledge of ARIA, keyboard interaction patterns, and focus management.
- Experience testing with at least one screen reader.
- Clear writing; you'll document a lot of patterns.
- Nice to have: IAAP certification (CPACC or WAS), experience in education technology.`,
    source: "Referral",
    savedDaysAgo: 3,
    notes: "Referred by a former teammate. Ask about the switch-device testing lab.",
  },
  {
    company: "Granite & Gale",
    title: "Backend Engineer, Data Platform",
    url: "https://graniteandgale.example/careers/be-data-3",
    listingText: `Granite & Gale provides weather-risk analytics to insurers and utilities. Our data platform ingests 4 TB of sensor and forecast data per day.

What you'll work on
- Build and operate high-throughput ingestion services in Go.
- Design event pipelines on Kafka and stream processing with Flink.
- Model time-series data in PostgreSQL/TimescaleDB and ClickHouse.
- Run services on Kubernetes with Terraform-managed infrastructure.
- Own on-call for the services your team builds.

What you bring
- 4+ years of backend engineering, ideally in Go, Rust, or Java.
- Experience with distributed systems and message queues (Kafka, Pulsar, or similar).
- Strong SQL and data modeling skills.
- Kubernetes and infrastructure-as-code experience.
- Nice to have: geospatial data, scientific computing, Python.`,
    source: "Indeed",
    savedDaysAgo: 2,
  },
  {
    company: "Pebblebrook Health",
    title: "Product Designer",
    url: "https://pebblebrookhealth.example/careers/4410",
    listingText: `Pebblebrook Health is a telehealth platform for primary care. We're hiring a Product Designer to own patient-facing scheduling and intake flows.

You will
- Lead design for booking, rescheduling, and pre-visit intake across web and mobile.
- Run user research with patients, including older adults and people with low digital literacy.
- Produce wireframes, high-fidelity mockups, and interactive prototypes in Figma.
- Contribute to and maintain our design system.
- Partner with engineers through implementation and QA.

You have
- 4+ years of product design experience with a portfolio of shipped work.
- Strong interaction design and visual design skills.
- Experience planning and running usability studies.
- Expert Figma skills, including components and auto layout.
- Nice to have: healthcare experience, familiarity with HIPAA constraints, front-end coding skills.`,
    source: "Company site",
    savedDaysAgo: 1,
  },
];

// Fictional companies and .example URLs (RFC 2606 reserved, never resolve)
// spread across every status so every kanban column has cards.
const SEED_APPLICATIONS: SeedApplication[] = [
  {
    company: "Cobalt Harbor",
    title: "Backend Engineer (Node.js)",
    url: "https://jobs.cobaltharbor.example/postings/902",
    listingText: "Own the payments API powering a logistics marketplace.",
    source: "Referral",
    savedDaysAgo: 25,
    status: "applied",
    appliedDaysAgo: 24,
  },
  {
    company: "Fenwick & Vale",
    title: "Data Analyst",
    url: "https://fenwickvale.example/jobs/da-07",
    listingText:
      "Turn retail transaction data into merchandising recommendations.",
    source: "Indeed",
    savedDaysAgo: 22,
    status: "applied",
    appliedDaysAgo: 21,
  },
  {
    company: "Driftwood Analytics",
    title: "Full-Stack Developer",
    url: "https://driftwoodanalytics.example/careers/318",
    listingText:
      "Ship features across a Next.js dashboard and its Python data pipeline.",
    source: "LinkedIn",
    savedDaysAgo: 20,
    status: "acknowledged",
    appliedDaysAgo: 19,
    notes: "Got an auto-reply confirming receipt.",
  },
  {
    company: "Larkspur Systems",
    title: "DevOps Engineer",
    url: "https://larkspursystems.example/jobs/ops-22",
    listingText: "Run CI/CD and Kubernetes infrastructure for a fintech platform.",
    source: "Company site",
    savedDaysAgo: 18,
    status: "acknowledged",
    appliedDaysAgo: 17,
    notes: "Recruiter screen scheduled for next week.",
  },
  {
    company: "Marrow Biotech",
    title: "QA Automation Engineer",
    url: "https://marrowbiotech.example/careers/qa-5",
    listingText: "Build end-to-end test coverage for a lab-results portal.",
    source: "Indeed",
    savedDaysAgo: 16,
    status: "interviewing",
    appliedDaysAgo: 15,
    notes: "Phone screen went well, onsite loop pending.",
  },
  {
    company: "Solstice Interactive",
    title: "Mobile Engineer (iOS)",
    url: "https://solsticeinteractive.example/jobs/ios-3",
    listingText: "Build offline-first features for a field-service iOS app.",
    source: "Referral",
    savedDaysAgo: 14,
    status: "interviewing",
    appliedDaysAgo: 13,
    notes: "Take-home exercise submitted, awaiting feedback.",
  },
  {
    company: "Hearthstone Logistics",
    title: "Site Reliability Engineer",
    url: "https://hearthstonelogistics.example/careers/sre-9",
    listingText:
      "Keep a 24/7 freight-tracking platform online across three regions.",
    source: "LinkedIn",
    savedDaysAgo: 40,
    status: "offer",
    appliedDaysAgo: 38,
    notes: "Verbal offer received, waiting on written details.",
  },
  {
    company: "Ironclad Ledger",
    title: "Engineering Manager",
    url: "https://ironcladledger.example/jobs/em-2",
    listingText:
      "Lead a 6-person team building reconciliation tooling for accountants.",
    source: "Company site",
    savedDaysAgo: 45,
    status: "rejected",
    appliedDaysAgo: 43,
    notes: "Passed after the final round; team went with an internal candidate.",
  },
  {
    company: "Violet Meridian",
    title: "Technical Writer",
    url: "https://violetmeridian.example/careers/tw-11",
    listingText: "Document a developer platform's REST and webhook APIs.",
    source: "Indeed",
    savedDaysAgo: 50,
    status: "rejected",
    appliedDaysAgo: 48,
    notes: "Declined; role was paused due to a hiring freeze.",
  },
  {
    company: "Quantum Loom",
    title: "Platform Engineer",
    url: "https://quantumloom.example/jobs/platform-4",
    listingText: "Build internal developer tooling for a 40-engineer org.",
    source: "LinkedIn",
    savedDaysAgo: 60,
    status: "ghosted",
    appliedDaysAgo: 58,
    notes: "No response since the first recruiter call six weeks ago.",
  },
];

// Reusable by both the CLI entry point below and instrumentation.ts (which
// reseeds on every dev-server restart so the local "writable demo preview"
// cookie toggle always starts from a clean, known state).
export function seedDemoDatabase(): number {
  fs.rmSync(DEMO_DB_PATH, { force: true });
  fs.mkdirSync(path.dirname(DEMO_DB_PATH), { recursive: true });

  const sqlite = new Database(DEMO_DB_PATH);
  sqlite.pragma("journal_mode = WAL");
  const db = drizzle(sqlite, { schema });

  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

  // Two versions so the demo shows the version history; v2 is active.
  const [, activeResume] = db
    .insert(schema.resumes)
    .values([
      { text: SEED_RESUME_V1, version: 1, isActive: false, createdAt: daysAgo(120) },
      {
        text: SEED_RESUME_V2,
        latexSource: fs.readFileSync(DEMO_RESUME_TEX_PATH, "utf8"),
        version: 2,
        isActive: true,
        createdAt: daysAgo(14),
      },
    ])
    .returning()
    .all();

  for (const seedJob of SEED_SAVED_JOBS) {
    const job = db
      .insert(schema.jobs)
      .values({
        company: seedJob.company,
        title: seedJob.title,
        url: seedJob.url,
        listingText: seedJob.listingText,
        source: seedJob.source,
        notes: seedJob.notes,
        savedAt: daysAgo(seedJob.savedDaysAgo),
      })
      .returning()
      .get();

    // Canned comparisons, so the read-only public demo has results to show.
    // One job is left uncompared on purpose, to demo the empty state (and,
    // in the writable local preview, running a comparison).
    if (activeResume && seedJob.url !== UNCOMPARED_SEED_JOB_URL) {
      db.insert(schema.comparisons)
        .values({
          jobId: job.id,
          resumeId: activeResume.id,
          result: getDemoComparison(seedJob.url),
          model: DEMO_MODEL,
          createdAt: daysAgo(Math.max(seedJob.savedDaysAgo - 1, 0)),
        })
        .run();
    }
  }

  for (const seedApp of SEED_APPLICATIONS) {
    const job = db
      .insert(schema.jobs)
      .values({
        company: seedApp.company,
        title: seedApp.title,
        url: seedApp.url,
        listingText: seedApp.listingText,
        source: seedApp.source,
        savedAt: daysAgo(seedApp.savedDaysAgo),
      })
      .returning()
      .get();

    db.insert(schema.applications)
      .values({
        jobId: job.id,
        status: seedApp.status,
        appliedAt: seedApp.appliedDaysAgo
          ? daysAgo(seedApp.appliedDaysAgo)
          : null,
        notes: seedApp.notes,
      })
      .run();
  }

  sqlite.close();
  return SEED_SAVED_JOBS.length + SEED_APPLICATIONS.length;
}

// CLI entry point (`pnpm db:seed`). Guarded so importing seedDemoDatabase()
// elsewhere (instrumentation.ts) doesn't also run this. Compared as file://
// URLs, not raw path strings -- process.argv[1] is a plain OS path (with
// backslashes on Windows), which never string-equals import.meta.url.
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const count = seedDemoDatabase();
  console.log(`Seeded ${count} jobs into ${DEMO_DB_PATH}`);
}
