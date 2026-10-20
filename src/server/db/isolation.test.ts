import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { beforeEach, describe, it, expect, vi } from "vitest";
import * as schema from "@/server/db/schema";

// User isolation: every data-layer function must only ever see, change,
// or delete the current user's rows. SQLite has no row-level security, so
// one missing `user_id` filter would leak one user's resume to another.
// These tests run the real query code against an in-memory database with
// two users, swapping the "current user" between calls.

const state = vi.hoisted(() => ({
  db: undefined as unknown,
  userId: 0,
}));

vi.mock("@/server/mode", () => ({ getMode: async () => "live" }));
vi.mock("@/server/db/client", () => ({ getDb: () => state.db }));
vi.mock("@/server/current-user", () => ({ requireUserId: async () => state.userId }));

const jobsDal = await import("@/server/db/jobs");
const applicationsDal = await import("@/server/db/applications");
const resumesDal = await import("@/server/db/resumes");
const comparisonsDal = await import("@/server/db/comparisons");
const profileDal = await import("@/server/db/profile");

const DEMO_TEX = fs.readFileSync(
  path.join(process.cwd(), "src/server/db/fixtures/demo-resume.tex"),
  "utf8",
);

const ALICE = 1;
const BOB = 2;

function as(userId: number) {
  state.userId = userId;
}

beforeEach(() => {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: path.join(process.cwd(), "src/server/db/migrations") });
  db.insert(schema.users).values([
    { id: ALICE, email: "alice@example.com" },
    { id: BOB, email: "bob@example.com" },
  ]).run();
  state.db = db;
});

describe("saved jobs", () => {
  it("lists, reads, edits, and deletes only your own", async () => {
    as(ALICE);
    const alices = await jobsDal.createSavedJob({ company: "Acme", title: "Engineer" });
    as(BOB);
    const bobs = await jobsDal.createSavedJob({ company: "Globex", title: "Developer" });

    expect((await jobsDal.listSavedJobs()).map((j) => j.id)).toEqual([bobs.id]);
    expect(await jobsDal.getSavedJob(alices.id)).toBeUndefined();
    await expect(
      jobsDal.updateSavedJob({ id: alices.id, company: "Hacked", title: "Hacked" }),
    ).rejects.toThrow(/not found/);
    await jobsDal.deleteSavedJob(alices.id);
    expect((await jobsDal.moveSavedJobToApplied(alices.id, new Date())).ok).toBe(false);

    as(ALICE);
    const [stillThere] = await jobsDal.listSavedJobs();
    expect(stillThere).toMatchObject({ id: alices.id, company: "Acme" });
  });

  it("moves to applied as the owner, with the application owned by them", async () => {
    as(ALICE);
    const job = await jobsDal.createSavedJob({ company: "Acme", title: "Engineer" });
    expect((await jobsDal.moveSavedJobToApplied(job.id, new Date())).ok).toBe(true);
    expect(await applicationsDal.listApplicationsWithJob()).toHaveLength(1);
    as(BOB);
    expect(await applicationsDal.listApplicationsWithJob()).toEqual([]);
  });
});

describe("applications (board)", () => {
  it("lists, edits, moves, and deletes only your own", async () => {
    as(ALICE);
    const alices = await applicationsDal.createApplication({
      company: "Acme",
      title: "Engineer",
      status: "applied",
    });
    as(BOB);
    await applicationsDal.createApplication({ company: "Globex", title: "Dev", status: "applied" });

    expect((await applicationsDal.listApplicationsWithJob()).map((a) => a.job.company)).toEqual([
      "Globex",
    ]);
    await expect(
      applicationsDal.updateApplication({ id: alices.id, notes: "hacked" }),
    ).rejects.toThrow(/not found/);
    await expect(applicationsDal.moveApplicationStatus(alices.id, "offer")).rejects.toThrow(
      /not found/,
    );
    await applicationsDal.deleteApplication(alices.id);

    as(ALICE);
    const [mine] = await applicationsDal.listApplicationsWithJob();
    expect(mine).toMatchObject({ id: alices.id, status: "applied", notes: null });
    expect(mine.job.company).toBe("Acme");
  });
});

describe("resumes", () => {
  it("numbers versions per user and keeps each user's active resume separate", async () => {
    as(ALICE);
    await resumesDal.createResumeVersion("alice v1", null);
    as(BOB);
    const bobV1 = await resumesDal.createResumeVersion("bob v1", null);
    // Saving Bob's resume must not deactivate Alice's.
    as(ALICE);
    expect((await resumesDal.getActiveResume())?.text).toBe("alice v1");
    as(BOB);
    expect(bobV1.version).toBe(1);
    expect((await resumesDal.getActiveResume())?.text).toBe("bob v1");
  });

  it("can't read or activate another user's version", async () => {
    as(ALICE);
    const alices = await resumesDal.createResumeVersion("alice v1", "\\begin{document}\\end{document}");
    as(BOB);
    await resumesDal.createResumeVersion("bob v1", null);

    expect(await resumesDal.getResume(alices.id)).toBeUndefined();
    expect(await resumesDal.activateResume(alices.id)).toEqual({ ok: false, reason: "not_found" });
    expect((await resumesDal.listResumes()).map((r) => r.text)).toEqual(["bob v1"]);
  });
});

describe("comparisons", () => {
  it("only reads your own jobs and results", async () => {
    as(ALICE);
    const job = await jobsDal.createSavedJob({ company: "Acme", title: "Engineer", listingText: "x" });
    const resume = await resumesDal.createResumeVersion("alice", null);
    const result = { score: 80, matchedSkills: [], missingSkills: [], missingKeywords: [], suggestions: [] };
    await comparisonsDal.insertComparison({ jobId: job.id, resumeId: resume.id, result, model: "demo" });
    expect(await comparisonsDal.getLatestComparisonRow(job.id)).toBeDefined();

    as(BOB);
    expect(await comparisonsDal.getJobForComparison(job.id)).toBeUndefined();
    expect(await comparisonsDal.getLatestComparisonRow(job.id)).toBeUndefined();
    expect((await comparisonsDal.listLatestComparisonRows()).size).toBe(0);
  });
});

describe("profile", () => {
  it("imports per user: the same .tex fills both profiles independently", async () => {
    as(ALICE);
    const first = await profileDal.importProfileFromLatex(DEMO_TEX);
    as(BOB);
    // Bob gets everything, even though Alice already has identical skills
    // (uniqueness is per user, not global).
    const second = await profileDal.importProfileFromLatex(DEMO_TEX);
    expect(second).toEqual(first);

    const bobs = await profileDal.loadProfile();
    as(ALICE);
    const alices = await profileDal.loadProfile();
    expect(bobs.skills).toHaveLength(alices.skills.length);
    const aliceIds = new Set(alices.skills.map((s) => s.id));
    expect(bobs.skills.some((s) => aliceIds.has(s.id))).toBe(false);
    expect(alices.entries.every((e) => e.userId === ALICE && e.bullets.every((b) => b.userId === ALICE))).toBe(true);
  });

  it("an empty profile stays empty when someone else has one", async () => {
    as(ALICE);
    await profileDal.importProfileFromLatex(DEMO_TEX);
    as(BOB);
    expect(await profileDal.loadProfile()).toEqual({ skills: [], entries: [], highlights: [] });
  });
});
