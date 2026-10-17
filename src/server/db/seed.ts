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

// process.cwd()-relative, not import.meta.dirname: this module runs both
// directly under tsx (pnpm db:seed) and dynamically imported inside a
// Turbopack-bundled chunk (src/instrumentation.ts's register()), and
// import.meta.dirname comes back undefined in the latter.
const MIGRATIONS_FOLDER = path.join(
  process.cwd(),
  "src/server/db/migrations",
);

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

type SeedApplication = {
  company: string;
  title: string;
  url: string;
  listingText: string;
  source: string;
  savedDaysAgo: number;
  status: Status;
  appliedDaysAgo?: number;
  notes?: string;
};

// Fictional companies and .example URLs (RFC 2606 reserved, never resolve)
// spread across all seven statuses so every kanban column has cards.
const SEED_APPLICATIONS: SeedApplication[] = [
  {
    company: "Northwind Robotics",
    title: "Senior Frontend Engineer",
    url: "https://careers.northwindrobotics.example/jobs/1821",
    listingText:
      "Build the operator console for warehouse robots using React and TypeScript.",
    source: "LinkedIn",
    savedDaysAgo: 6,
    status: "saved",
  },
  {
    company: "Pebblebrook Health",
    title: "Product Designer",
    url: "https://pebblebrookhealth.example/careers/4410",
    listingText:
      "Design patient-facing scheduling flows for a telehealth platform.",
    source: "Company site",
    savedDaysAgo: 5,
    status: "saved",
  },
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
  return SEED_APPLICATIONS.length;
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
  console.log(`Seeded ${count} applications into ${DEMO_DB_PATH}`);
}
