// No "server-only" import: this is a standalone CLI script run via tsx
// (pnpm db:seed), not part of the Next.js runtime, so it can't go through
// the app's DB client factory (client.ts) either -- that module imports
// "server-only", which throws unconditionally outside Next's bundler.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import Database from "better-sqlite3";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "@/server/db/schema";
import { DEMO_DB_PATH, DEMO_USER_EMAIL } from "@/server/db/paths";
import type { Status } from "@/lib/schemas/status";
import { DEMO_MODEL, getDemoComparison, getDemoTailoredComparison } from "@/server/llm/compare-demo";
import { importProfileFromLatexInto, type ProfileDb } from "@/server/db/profile-store";
import { insertComparisonWithSkills, insertTailoredComparisonRow } from "@/server/db/comparison-store";
import { insertTailoringDraft, saveTailoringApproval } from "@/server/db/tailoring-store";
import { buildApproval } from "@/lib/tailoring/approve";
import { insertCoverLetter } from "@/server/db/cover-letter-store";
import { getDemoCoverLetter } from "@/server/llm/cover-letter-demo";
import { checkCoverLetter } from "@/lib/cover-letter/check";
import { headerName, letterText, resumePlainText } from "@/lib/cover-letter/sources";
import { currentAsProposal, listChanges } from "@/lib/tailoring/changes";
import { loadProfileFrom } from "@/server/db/profile-store";
import { getDemoTailoring, resolveDemoProposal } from "@/server/llm/tailor-demo";
import { parseResumeLatex } from "@/lib/latex/resume";
import { createSkillResolver } from "@/lib/skills/resolver";
import { checkProposal } from "@/lib/tailoring/check";
import { skillKey } from "@/lib/comparison-helpers";
import type { Experience, Proficiency } from "@/lib/schemas/profile";
import { defaultSyncStart } from "@/lib/email/sync-window";
import { statusImpliesScreening } from "@/lib/screening";
import { comparisonSchema } from "@/lib/schemas/comparison";
import { historyListing, SEED_HISTORY } from "@/server/db/seed-history";
import { earliestAppliedAt } from "@/server/db/gmail-store";
import { demoMailSource } from "@/server/gmail/demo-source";
import { syncInbox } from "@/server/gmail/sync";
import { demoClassification, DEMO_CLASSIFIER_MODEL } from "@/server/llm/classify-demo";
import { backfillStatusHistory, recordCreation, recordStatusChange } from "@/server/db/status-history-store";
import type { EmailType } from "@/lib/schemas/email";
import { GHOSTED_AFTER_DAYS } from "@/lib/email/ghosted";
import type { InterviewKind } from "@/lib/schemas/interview";
import { insertInterview } from "@/server/db/today-store";

const UNCOMPARED_SEED_JOB_URL = "https://pebblebrookhealth.example/careers/4410";
// Gets a tailored resume draft in the seed, so the read-only public demo
// has one to show (with the canned proposal's deliberate checker flag).
const TAILORED_SEED_JOB_URL = "https://careers.northwindrobotics.example/jobs/1821";
// Gets an approved tailored resume, so the demo also shows the finished
// state: the PDF and page count.
const APPROVED_SEED_JOB_URL = "https://bramblewoodlearning.example/jobs/a11y-07";

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
  // When it got past screening, if known. Interviewing and Offer imply it
  // (set from the applied date when not given); a rejection after an
  // interview, like Ironclad's, says so explicitly.
  passedScreeningDaysAgo?: number;
  // How it got to `status` after applying, for its page's timeline
  // (docs/status-history.md). Without one, the history is reconstructed
  // like any older application's. The last step must reach `status`.
  history?: SeedStep[];
  // Interviews, dated from today (the demo reseeds on every start, so
  // upcoming ones stay upcoming): days from now (negative for past ones),
  // at a local hour.
  interviews?: { inDays: number; hour: number; kind: InterviewKind; durationMinutes: number; location: string; notes?: string }[];
};

// One step in a seeded application's history. An email step also seeds the
// confirmed email that caused it, so the page can show it.
type SeedStep = { to: Status; daysAgo: number } & (
  | { via: "board" }
  | { via: "ghosted" }
  | { via: "email"; emailType: EmailType; subject: string; fromName: string; fromAddress: string; snippet: string }
);

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
export const SEED_APPLICATIONS: SeedApplication[] = [
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
    history: [
      {
        to: "acknowledged",
        daysAgo: 18,
        via: "email",
        emailType: "acknowledged",
        subject: "We received your application",
        fromName: "Driftwood Analytics Talent",
        fromAddress: "talent@driftwood.example",
        snippet: "Thanks for applying for Full-Stack Developer. We review every application and will be in touch within two weeks.",
      },
    ],
  },
  {
    company: "Larkspur Systems",
    title: "DevOps Engineer",
    url: "https://larkspursystems.example/jobs/ops-22",
    listingText: "Run CI/CD and Kubernetes infrastructure for a fintech platform.",
    source: "Company site",
    // Long enough ago, with no email since, for the ghosted rule to fire
    // in the demo (30 days of silence).
    savedDaysAgo: 43,
    status: "acknowledged",
    appliedDaysAgo: 41,
    notes: "Got the automated acknowledgement, then nothing.",
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
    history: [
      {
        to: "acknowledged",
        daysAgo: 14,
        via: "email",
        emailType: "acknowledged",
        subject: "Application received: QA Automation Engineer",
        fromName: "Marrow Biotech Careers",
        fromAddress: "careers@marrowbio.example",
        snippet: "Hi Alex, we've received your application and our team is reviewing it.",
      },
      // After a recruiter call.
      { to: "interviewing", daysAgo: 9, via: "board" },
    ],
    interviews: [
      {
        inDays: 2,
        hour: 10,
        kind: "technical",
        durationMinutes: 90,
        location: "Video call (link in the invite)",
        notes: "Take-home walkthrough, then a live test-automation exercise.",
      },
    ],
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
    history: [
      {
        to: "interviewing",
        daysAgo: 9,
        via: "email",
        emailType: "interview",
        subject: "Interview: Mobile Engineer (iOS)",
        fromName: "Dana Kim",
        fromAddress: "dana.kim@solstice.example",
        snippet: "We'd like to invite you to a technical interview with the iOS team. Here are a few times that work for us.",
      },
    ],
    interviews: [
      { inDays: -6, hour: 15, kind: "phone_screen", durationMinutes: 30, location: "Phone" },
      {
        inDays: 1,
        hour: 9,
        kind: "technical",
        durationMinutes: 60,
        location: "Video call",
        notes: "Rescheduled from Monday. iOS architecture and a SwiftUI pairing exercise.",
      },
    ],
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
    history: [
      {
        to: "acknowledged",
        daysAgo: 37,
        via: "email",
        emailType: "acknowledged",
        subject: "Thanks for applying to Hearthstone Logistics",
        fromName: "Hearthstone Recruiting",
        fromAddress: "no-reply@hearthstone.example",
        snippet: "We've received your application for Site Reliability Engineer.",
      },
      {
        to: "interviewing",
        daysAgo: 30,
        via: "email",
        emailType: "interview",
        subject: "Interview availability: Site Reliability Engineer",
        fromName: "Priya Natarajan",
        fromAddress: "priya@hearthstone.example",
        snippet: "Could you share your availability for a first conversation with the reliability team next week?",
      },
      // A verbal offer on a call, before the letter (in the Inbox) arrived.
      { to: "offer", daysAgo: 6, via: "board" },
    ],
    interviews: [
      { inDays: -28, hour: 11, kind: "phone_screen", durationMinutes: 30, location: "Phone" },
      { inDays: -14, hour: 13, kind: "final", durationMinutes: 180, location: "Hearthstone HQ, 400 Dock St" },
    ],
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
    passedScreeningDaysAgo: 38,
    notes: "Passed after the final round; team went with an internal candidate.",
    history: [
      {
        to: "acknowledged",
        daysAgo: 42,
        via: "email",
        emailType: "acknowledged",
        subject: "Your application for Engineering Manager",
        fromName: "Ironclad Ledger Talent",
        fromAddress: "talent@ironclad.example",
        snippet: "Thank you for your interest in Ironclad Ledger. Our team will review your application.",
      },
      {
        to: "interviewing",
        daysAgo: 38,
        via: "email",
        emailType: "interview",
        subject: "Next steps: Engineering Manager interviews",
        fromName: "Marcus Hale",
        fromAddress: "marcus.hale@ironclad.example",
        snippet: "We enjoyed reading about your team leadership. Let's set up a call with the hiring manager.",
      },
      // Told on the final call; the written rejection is in the Inbox.
      { to: "rejected", daysAgo: 32, via: "board" },
    ],
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
    history: [
      {
        to: "rejected",
        daysAgo: 33,
        via: "email",
        emailType: "rejection",
        subject: "Technical Writer application",
        fromName: "Violet Meridian Hiring",
        fromAddress: "hiring@violetmeridian.example",
        snippet: "Thank you for applying. After careful review, we've decided to move forward with other candidates.",
      },
    ],
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
    history: [
      { to: "ghosted", daysAgo: 27, via: "ghosted" },
    ],
  },
];

// Alex's profile: imported from the demo .tex with the same code the app
// uses, plus extras that aren't on the resume, so tailoring has something
// to pull in and the Profile page shows "extra" items. Fictional, like the
// rest of the demo data.
function seedProfile(db: ProfileDb, userId: number, latexSource: string | null) {
  if (!latexSource) return;
  const imported = importProfileFromLatexInto(db, userId, latexSource);
  if (!imported.ok) throw new Error(`Demo profile import failed: ${imported.message}`);

  // Levels you'd set on the Profile page. Imported skills start unset.
  const levels: [string, Proficiency, Experience][] = [
    ["TypeScript", "expert", "professional"],
    ["React", "expert", "professional"],
    ["Playwright", "proficient", "professional"],
    ["D3", "proficient", "professional"],
    ["some SQL", "familiar", "professional"],
  ];
  for (const [name, proficiency, experience] of levels) {
    db.update(schema.profileSkills)
      .set({ proficiency, experience })
      .where(and(eq(schema.profileSkills.userId, userId), eq(schema.profileSkills.nameKey, skillKey(name))))
      .run();
  }

  // Skills that didn't fit, or that Alex is still learning.
  db.insert(schema.profileSkills)
    .values([
      {
        userId,
        name: "Python",
        nameKey: skillKey("Python"),
        category: "Languages",
        proficiency: "familiar",
        experience: "coursework",
        note: "University coursework and small data-cleaning scripts.",
        source: "added",
        sortOrder: 100,
      },
      {
        userId,
        name: "Leaflet",
        nameKey: skillKey("Leaflet"),
        category: "Frontend",
        proficiency: "proficient",
        experience: "personal",
        note: "Used for the trail conditions map volunteer project.",
        source: "added",
        sortOrder: 101,
      },
      {
        userId,
        name: "Docker",
        nameKey: skillKey("Docker"),
        category: "Tools",
        proficiency: "learning",
        experience: "personal",
        source: "added",
        sortOrder: 102,
      },
    ])
    .run();

  // A project that doesn't fit on the one-page resume.
  const volunteer = db
    .insert(schema.profileEntries)
    .values({
      userId,
      section: "Notable Projects",
      title: "Trail Conditions Map (Volunteer)",
      dates: "2023",
      subtitle: "Community Hiking Club Site",
      detail: "Next.js, Leaflet",
      source: "added",
      sortOrder: 100,
    })
    .returning({ id: schema.profileEntries.id })
    .get();
  db.insert(schema.profileBullets)
    .values([
      {
        userId,
        entryId: volunteer.id,
        text: "Built a trail conditions map that club volunteers update through a simple admin form",
        source: "added",
        sortOrder: 0,
      },
      {
        userId,
        entryId: volunteer.id,
        text: "Cut page weight by 60% by lazy-loading the map layers",
        source: "added",
        sortOrder: 1,
      },
    ])
    .run();

  // An extra bullet for an entry that is on the resume.
  const copperline = db
    .select({ id: schema.profileEntries.id })
    .from(schema.profileEntries)
    .where(and(eq(schema.profileEntries.userId, userId), eq(schema.profileEntries.title, "Frontend Developer")))
    .get();
  if (copperline) {
    db.insert(schema.profileBullets)
      .values({
        userId,
        entryId: copperline.id,
        text: "Ran a weekly front-end guild for six engineers covering testing and accessibility",
        source: "added",
        sortOrder: 100,
      })
      .run();
  }

  db.insert(schema.profileHighlights)
    .values({
      userId,
      text: "Comfortable owning features from design handoff to production.",
      source: "added",
      sortOrder: 100,
    })
    .run();
}

// Approves a canned demo proposal with every change accepted, through the
// same buildApproval the app uses, so the read-only public demo shows an
// approved tailored resume with a PDF. The page count is left for the app
// to work out from the pre-built demo PDF (the seed can't compile).
function seedApprovedTailoring(
  db: ProfileDb,
  userId: number,
  jobId: number,
  jobUrl: string,
  resume: { id: number; latexSource: string },
) {
  const tex = parseResumeLatex(resume.latexSource);
  if (!tex.ok) throw new Error(`Demo resume does not parse: ${tex.message}`);
  const profile = loadProfileFrom(db, userId);
  const resolver = createSkillResolver(profile.skills);
  const context = { profile, tex: tex.resume, resolver };
  const checked = checkProposal(resolveDemoProposal(getDemoTailoring(jobUrl), profile, tex.resume), context);
  const draft = insertTailoringDraft(db, userId, { jobId, resumeId: resume.id, ...checked, model: DEMO_MODEL });

  const current = currentAsProposal(profile, tex.resume, resolver);
  if (!current.ok) throw new Error(`Demo profile is missing part of the resume: ${current.message}`);
  const accepted = listChanges(current.proposal, checked.proposal, profile, tex.resume).map((change) => change.id);
  const built = buildApproval({ ...context, proposed: checked.proposal, accepted, latexSource: resume.latexSource });
  if (!built.ok) throw new Error(`Demo approval failed: ${built.message}`);
  saveTailoringApproval(db, userId, draft.id, { edits: built.approval.edits, final: built.approval.final, pages: null });

  // Its comparison against the same listing, so the demo shows original vs
  // tailored scores.
  insertTailoredComparisonRow(db, userId, {
    jobId,
    resumeId: resume.id,
    tailoringId: draft.id,
    result: getDemoTailoredComparison(jobUrl),
    model: DEMO_MODEL,
  });
  // A cover letter written from the tailored resume, so the demo shows a
  // complete application. Checked like a generated one.
  const tailored = parseResumeLatex(built.approval.tex);
  if (!tailored.ok) throw new Error(`Tailored demo resume does not parse: ${tailored.message}`);
  const output = getDemoCoverLetter(jobUrl);
  const listing = SEED_SAVED_JOBS.find((job) => job.url === jobUrl)?.listingText ?? "";
  const resumeText = resumePlainText(tailored.resume);
  const warnings = checkCoverLetter(output, { profile, resumeText, listing, resolver, length: "standard" });
  insertCoverLetter(db, userId, {
    jobId,
    tailoringId: draft.id,
    resumeId: resume.id,
    tone: "professional",
    length: "standard",
    text: letterText(output, headerName(built.approval.tex)),
    warnings,
    model: DEMO_MODEL,
  });
}

// A tailoring draft from the canned demo proposal, through the same
// resolver and honesty checker the app uses.
function seedTailoring(
  db: ProfileDb,
  userId: number,
  jobId: number,
  jobUrl: string,
  resume: { id: number; latexSource: string },
) {
  const tex = parseResumeLatex(resume.latexSource);
  if (!tex.ok) throw new Error(`Demo resume doesn't parse: ${tex.message}`);
  const profile = loadProfileFrom(db, userId);
  const context = { profile, tex: tex.resume, resolver: createSkillResolver(profile.skills) };
  const checked = checkProposal(resolveDemoProposal(getDemoTailoring(jobUrl), profile, tex.resume), context);
  insertTailoringDraft(db, userId, { jobId, resumeId: resume.id, ...checked, model: DEMO_MODEL });
}

// The Insights page's history (seed-history.ts): each application, and for
// those with a listing, a comparison through the same function as the app,
// so its skill rows are written exactly as a real comparison's would be.
// A showcase application's written history: applied on its applied date,
// then each step. An email step also stores the confirmed email behind it
// (metadata and snippet, as the real sync would), so the application's
// page lists it and the timeline names it.
function seedApplicationHistory(db: ProfileDb, userId: number, applicationId: number, seedApp: SeedApplication) {
  const steps = seedApp.history ?? [];
  if (steps.at(-1)?.to !== seedApp.status) {
    throw new Error(`${seedApp.company}'s seeded history doesn't end at its status (${seedApp.status}).`);
  }
  const applied = daysAgo(seedApp.appliedDaysAgo ?? seedApp.savedDaysAgo);
  recordCreation(db, userId, { applicationId, status: "applied", appliedAt: applied, at: applied, source: "board" });

  let current: Status = "applied";
  steps.forEach((step, i) => {
    const at = daysAgo(step.daysAgo);
    let emailEventId: number | null = null;
    if (step.via !== "board") {
      emailEventId = db
        .insert(schema.emailEvents)
        .values({
          userId,
          applicationId,
          state: "confirmed",
          proposedStatus: step.to,
          decidedAt: at,
          ...(step.via === "email"
            ? {
                source: "email" as const,
                gmailMessageId: `seed-history-${applicationId}-${i}`,
                gmailThreadId: `seed-history-${applicationId}`,
                subject: step.subject,
                fromName: step.fromName,
                fromAddress: step.fromAddress,
                snippet: step.snippet,
                receivedAt: at,
                matchMethod: "company" as const,
                emailType: step.emailType,
                confidence: 0.95,
                model: DEMO_CLASSIFIER_MODEL,
              }
            : { source: "ghosted" as const, reason: `No reply and no change for ${GHOSTED_AFTER_DAYS} days.` }),
        })
        .returning({ id: schema.emailEvents.id })
        .get().id;
    }
    recordStatusChange(db, userId, {
      applicationId,
      from: current,
      to: step.to,
      at,
      source: step.via,
      emailEventId,
    });
    current = step.to;
  });
}

function seedHistory(db: ProfileDb, userId: number, resumeId: number) {
  for (const app of SEED_HISTORY) {
    const listingText = historyListing(app);
    const job = db
      .insert(schema.jobs)
      .values({
        userId,
        company: app.company,
        title: app.title,
        listingText,
        source: listingText ? "Company site" : "Email",
        savedAt: daysAgo(app.appliedDaysAgo + 2),
      })
      .returning({ id: schema.jobs.id })
      .get();
    const updatedDaysAgo = app.updatedDaysAgo ?? Math.max(app.appliedDaysAgo - 20, 35);
    db.insert(schema.applications)
      .values({
        userId,
        jobId: job.id,
        status: app.status,
        appliedAt: daysAgo(app.appliedDaysAgo),
        updatedAt: daysAgo(updatedDaysAgo),
        passedScreeningAt:
          app.passedScreening || statusImpliesScreening(app.status) ? daysAgo(Math.max(app.appliedDaysAgo - 7, updatedDaysAgo)) : null,
      })
      .run();

    if (!app.skills) continue;
    const { matched, missing } = app.skills;
    insertComparisonWithSkills(db, userId, {
      jobId: job.id,
      resumeId,
      result: comparisonSchema.parse({
        score: Math.round((100 * matched.length) / (matched.length + missing.length)),
        matchedSkills: matched,
        missingSkills: missing,
        missingKeywords: [],
        suggestions: ["Demo history: a sample comparison for the Insights page."],
      }),
      model: DEMO_MODEL,
      createdAt: daysAgo(app.appliedDaysAgo + 1),
    });
  }
}

// Reusable by both the CLI entry point below and instrumentation.ts (which
// reseeds on every dev-server restart so the local "writable demo preview"
// cookie toggle always starts from a clean, known state). Async because
// the Gmail sync it runs is. The path is only overridden by tests.
export async function seedDemoDatabase(dbPath: string = DEMO_DB_PATH): Promise<number> {
  fs.rmSync(dbPath, { force: true });
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  const db = drizzle(sqlite, { schema });

  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

  // The demo database's only user; everything below belongs to it. Demo
  // mode always acts as this user (see requireUserId).
  const demoUser = db
    .insert(schema.users)
    .values({ email: DEMO_USER_EMAIL })
    .returning({ id: schema.users.id })
    .get();

  // Two versions so the demo shows the version history; v2 is active.
  const [, activeResume] = db
    .insert(schema.resumes)
    .values([
      { userId: demoUser.id, text: SEED_RESUME_V1, version: 1, isActive: false, createdAt: daysAgo(120) },
      {
        userId: demoUser.id,
        text: SEED_RESUME_V2,
        latexSource: fs.readFileSync(DEMO_RESUME_TEX_PATH, "utf8"),
        version: 2,
        isActive: true,
        createdAt: daysAgo(14),
      },
    ])
    .returning()
    .all();

  seedProfile(db, demoUser.id, activeResume?.latexSource ?? null);

  for (const seedJob of SEED_SAVED_JOBS) {
    const job = db
      .insert(schema.jobs)
      .values({
        userId: demoUser.id,
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
      // Through the same function as the app, so the demo also gets the
      // normalized skill rows.
      insertComparisonWithSkills(db, demoUser.id, {
          jobId: job.id,
          resumeId: activeResume.id,
          result: getDemoComparison(seedJob.url),
          model: DEMO_MODEL,
          createdAt: daysAgo(Math.max(seedJob.savedDaysAgo - 1, 0)),
        });
    }

    if (activeResume?.latexSource && seedJob.url === APPROVED_SEED_JOB_URL) {
      seedApprovedTailoring(db, demoUser.id, job.id, seedJob.url, { id: activeResume.id, latexSource: activeResume.latexSource });
    }
    if (activeResume?.latexSource && seedJob.url === TAILORED_SEED_JOB_URL) {
      seedTailoring(db, demoUser.id, job.id, seedJob.url, { id: activeResume.id, latexSource: activeResume.latexSource });
    }
  }

  const withHistory: { seedApp: SeedApplication; applicationId: number }[] = [];
  for (const seedApp of SEED_APPLICATIONS) {
    const job = db
      .insert(schema.jobs)
      .values({
        userId: demoUser.id,
        company: seedApp.company,
        title: seedApp.title,
        url: seedApp.url,
        listingText: seedApp.listingText,
        source: seedApp.source,
        savedAt: daysAgo(seedApp.savedDaysAgo),
      })
      .returning()
      .get();

    const application = db
      .insert(schema.applications)
      .values({
        userId: demoUser.id,
        jobId: job.id,
        status: seedApp.status,
        appliedAt: seedApp.appliedDaysAgo
          ? daysAgo(seedApp.appliedDaysAgo)
          : null,
        // Last changed when applied, not "now": the ghosted rule counts a
        // recent change as activity.
        updatedAt: daysAgo(seedApp.appliedDaysAgo ?? seedApp.savedDaysAgo),
        passedScreeningAt:
          seedApp.passedScreeningDaysAgo !== undefined
            ? daysAgo(seedApp.passedScreeningDaysAgo)
            : statusImpliesScreening(seedApp.status)
              ? daysAgo(Math.max((seedApp.appliedDaysAgo ?? 0) - 5, 0))
              : null,
        notes: seedApp.notes,
      })
      .returning({ id: schema.applications.id })
      .get();
    if (seedApp.history) withHistory.push({ seedApp, applicationId: application.id });
    for (const interview of seedApp.interviews ?? []) {
      const at = new Date();
      at.setDate(at.getDate() + interview.inDays);
      at.setHours(interview.hour, 0, 0, 0);
      insertInterview(db, demoUser.id, {
        applicationId: application.id,
        at,
        durationMinutes: interview.durationMinutes,
        kind: interview.kind,
        location: interview.location,
        notes: interview.notes,
      });
    }
  }

  // Older applications with comparisons, for the Insights page.
  if (activeResume) seedHistory(db, demoUser.id, activeResume.id);

  // Gmail suggestions, made by the real sync over the demo inbox with the
  // canned classifications: the read-only public demo can't sync, so it
  // ships already synced. The local preview can sync again (nothing new).
  const now = new Date();
  await syncInbox({
    db,
    userId: demoUser.id,
    source: demoMailSource(now),
    classify: async (email) => ({ ok: true, classification: demoClassification(email.id), model: DEMO_CLASSIFIER_MODEL }),
    position: { historyId: null, since: defaultSyncStart(earliestAppliedAt(db, demoUser.id), now) },
    now,
  });

  // Written histories for the showcase applications, after the sync so the
  // demo Inbox's pending suggestions come out exactly as before. The rest
  // get the same reconstruction the backfill gives real data that predates
  // history (docs/status-history.md).
  for (const { seedApp, applicationId } of withHistory) {
    seedApplicationHistory(db, demoUser.id, applicationId, seedApp);
  }
  backfillStatusHistory(db, demoUser.id);

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
  // .then, not top-level await: tsx runs this file as CommonJS.
  void seedDemoDatabase().then((count) => console.log(`Seeded ${count} jobs into ${DEMO_DB_PATH}`));
}
