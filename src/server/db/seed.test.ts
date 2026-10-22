import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { afterAll, beforeAll, describe, it, expect } from "vitest";
import * as schema from "@/server/db/schema";
import { seedDemoDatabase } from "@/server/db/seed";
import { pendingSuggestionRows, recentlyDecidedRows } from "@/server/db/email-event-store";

// The demo seed, into a temporary file: the read-only public demo can't
// sync, so it must ship with its Gmail suggestions already made.

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jobtracker-seed-"));
const dbPath = path.join(dir, "demo.db");
let sqlite: Database.Database;
let db: ReturnType<typeof drizzle<typeof schema>>;
let userId: number;

beforeAll(async () => {
  await seedDemoDatabase(dbPath);
  sqlite = new Database(dbPath, { readonly: true });
  db = drizzle(sqlite, { schema });
  userId = db.select().from(schema.users).get()?.id ?? 0;
});

afterAll(() => {
  sqlite.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("demo seed: Gmail suggestions", () => {
  it("has the demo inbox's suggestions waiting, changes first", () => {
    const pending = pendingSuggestionRows(db, userId);
    expect(pending).toHaveLength(12);
    expect(pending.filter((row) => row.proposedStatus !== null)).toHaveLength(6);
    expect(pending.slice(0, 6).every((row) => row.proposedStatus !== null)).toBe(true);
  });

  it("links the Northwind email to its saved job, and leaves the two never-added applications to add", () => {
    const pending = pendingSuggestionRows(db, userId);
    expect(pending.find((row) => row.company === "Northwind Robotics")).toMatchObject({ applicationId: null, proposedStatus: "acknowledged" });
    const unlinked = pending.filter((row) => row.applicationId === null && row.jobId === null);
    expect(unlinked.map((row) => row.extractedCompany).sort()).toEqual(["Alder & Finch", "Pinecrest Labs"]);
  });

  it("suggests Larkspur Systems is ghosted, and nothing else", () => {
    const ghosted = pendingSuggestionRows(db, userId).filter((row) => row.source === "ghosted");
    expect(ghosted.map((row) => row.company)).toEqual(["Larkspur Systems"]);
  });

  it("files the cold recruiter away", () => {
    expect(recentlyDecidedRows(db, userId).map((row) => row.emailType)).toEqual(["not_relevant"]);
  });
});

describe("demo seed: insights history", () => {
  it("gives the Insights page enough to show every part of it", async () => {
    const { insightInputs } = await import("@/server/db/insights-store");
    const { buildInsights } = await import("@/lib/insights/build");
    const { jobs, profileSkills } = insightInputs(db, userId);
    const insights = buildInsights(jobs, profileSkills, "applied");

    expect(insights.coverage.included).toBeGreaterThanOrEqual(20);
    expect(insights.coverage.noListing.length).toBeGreaterThan(0);
    expect(insights.screeningSplit).toBe(true);
    const byName = new Map(insights.skills.map((s) => [s.name, s]));
    // A comparable skill, one that's too few to compare, and each profile standing.
    expect(insights.skills.some((s) => s.missing > 0 && s.outcomes.comparable)).toBe(true);
    expect(byName.get("Kubernetes")?.outcomes.comparable).toBe(false);
    expect(byName.get("Python")?.standing).toBe("in_profile");
    expect(byName.get("Docker")?.standing).toBe("learning");
  });
});
