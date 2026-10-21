import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
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
  // Demo mode lets a test tailor and revise with canned answers.
  mode: "live" as "live" | "demo",
}));

vi.mock("@/server/mode", () => ({ getMode: async () => state.mode }));
vi.mock("@/server/db/client", () => ({ getDb: () => state.db }));
vi.mock("@/server/current-user", () => ({ requireUserId: async () => state.userId }));
// Only what the Gmail connection needs: a token key and OAuth settings.
vi.mock("@/server/env", () => ({
  env: {
    DEMO_MODE: false,
    TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
    GOOGLE_CLIENT_ID: "test-client",
    GOOGLE_CLIENT_SECRET: "test-secret",
    APP_URL: "http://localhost:3000",
  },
}));

const jobsDal = await import("@/server/db/jobs");
const applicationsDal = await import("@/server/db/applications");
const resumesDal = await import("@/server/db/resumes");
const comparisonsDal = await import("@/server/db/comparisons");
const profileDal = await import("@/server/db/profile");
const gmailDal = await import("@/server/db/gmail-connections");
const emailEventsDal = await import("@/server/db/email-events");
const { insertEmailEvent } = await import("@/server/db/email-event-store");

const DEMO_TEX = fs.readFileSync(
  path.join(process.cwd(), "src/server/db/fixtures/demo-resume.tex"),
  "utf8",
);

const ALICE = 1;
const BOB = 2;

// The current test database, typed (state.db is the same object, for the mocks).
let testDb: ReturnType<typeof drizzle<typeof schema>>;

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
  state.mode = "live";
  testDb = db;
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

describe("profile edits (Profile page)", () => {
  it("can't edit or delete another user's skills, entries, bullets, or highlights", async () => {
    as(ALICE);
    await profileDal.importProfileFromLatex(DEMO_TEX);
    await profileDal.createHighlight({ text: "Alice's highlight" });
    const alice = await profileDal.loadProfile();
    const skill = alice.skills[0];
    const entry = alice.entries[0];
    const bullet = entry.bullets[0];
    const highlight = alice.highlights.at(-1);
    if (!highlight) throw new Error("expected a highlight");

    as(BOB);
    expect((await profileDal.updateSkill({ id: skill.id, name: "Hacked", aliases: [] })).ok).toBe(false);
    expect(
      (await profileDal.updateEntry({ id: entry.id, section: "x", title: "Hacked", dates: "", subtitle: "", detail: "" })).ok,
    ).toBe(false);
    expect((await profileDal.updateBullet({ id: bullet.id, text: "Hacked" })).ok).toBe(false);
    expect((await profileDal.updateHighlight({ id: highlight.id, text: "Hacked" })).ok).toBe(false);
    // Adding a bullet to someone else's entry is refused, not silently attached.
    expect((await profileDal.createBullet({ entryId: entry.id, text: "Injected" })).ok).toBe(false);
    await profileDal.deleteSkill(skill.id);
    await profileDal.deleteEntry(entry.id);
    await profileDal.deleteBullet(alice.entries[1].bullets[0].id);
    await profileDal.deleteHighlight(highlight.id);

    as(ALICE);
    expect(await profileDal.loadProfile()).toEqual(alice);
  });

  it("checks skill-name clashes per user, including aliases", async () => {
    as(ALICE);
    expect((await profileDal.createSkill({ name: "PostgreSQL", aliases: ["Postgres"] })).ok).toBe(true);
    // Alice's own alias blocks the duplicate...
    expect(await profileDal.createSkill({ name: "postgres", aliases: [] })).toMatchObject({ ok: false, field: "name" });
    // ...but Bob's profile is separate.
    as(BOB);
    expect((await profileDal.createSkill({ name: "Postgres", aliases: [] })).ok).toBe(true);
  });

  it("imports from your own active resume, not someone else's", async () => {
    as(ALICE);
    await resumesDal.createResumeVersion("alice", DEMO_TEX);
    as(BOB);
    expect(await profileDal.importFromActiveResume()).toMatchObject({ ok: false });
    expect(await profileDal.loadProfile()).toEqual({ skills: [], entries: [], highlights: [] });
  });
});

describe("comparison gaps and skill rows", () => {
  async function aliceJobWithSkill() {
    as(ALICE);
    const job = await jobsDal.createSavedJob({ company: "Acme", title: "Engineer", listingText: "x" });
    await profileDal.createSkill({ name: "PostgreSQL", aliases: [] });
    const [skill] = (await profileDal.loadProfile()).skills;
    return { job, skill };
  }

  it("records a confirmed gap as yours, sourced from the job", async () => {
    const { job } = await aliceJobWithSkill();
    expect((await profileDal.confirmGap({ mode: "learning", jobId: job.id, name: "Docker" })).ok).toBe(true);
    expect((await profileDal.confirmGap({ mode: "highlight", jobId: job.id, text: "5+ years" })).ok).toBe(true);
    const profile = await profileDal.loadProfile();
    expect(profile.skills.find((s) => s.name === "Docker")).toMatchObject({
      proficiency: "learning",
      source: "gap",
      sourceJobId: job.id,
      userId: ALICE,
    });
    expect(profile.highlights[0]).toMatchObject({ text: "5+ years", source: "gap", sourceJobId: job.id });
  });

  it("adds a gap's name as an alias of your skill", async () => {
    const { job, skill } = await aliceJobWithSkill();
    expect((await profileDal.confirmGap({ mode: "alias", jobId: job.id, name: "Postgres", skillId: skill.id })).ok).toBe(true);
    expect((await profileDal.loadProfile()).skills[0].aliases).toEqual(["Postgres"]);
  });

  it("refuses another user's job or skill", async () => {
    const { job, skill } = await aliceJobWithSkill();
    as(BOB);
    const bobsJob = await jobsDal.createSavedJob({ company: "Globex", title: "Dev" });
    // Alice's job as the source.
    expect((await profileDal.confirmGap({ mode: "learning", jobId: job.id, name: "Docker" })).ok).toBe(false);
    // Bob's own job, but Alice's skill as the alias target.
    expect(
      (await profileDal.confirmGap({ mode: "alias", jobId: bobsJob.id, name: "PG", skillId: skill.id })).ok,
    ).toBe(false);
    expect(await profileDal.loadProfile()).toEqual({ skills: [], entries: [], highlights: [] });
    as(ALICE);
    expect((await profileDal.loadProfile()).skills[0].aliases).toEqual([]);
  });

  it("saves a comparison's canonical skill rows, owned by the same user", async () => {
    const { job } = await aliceJobWithSkill();
    const resume = await resumesDal.createResumeVersion("alice", null);
    const result = {
      score: 70,
      matchedSkills: ["Postgres", "React.js"],
      missingSkills: ["k8s"],
      missingKeywords: [],
      suggestions: [],
    };
    const { id } = await comparisonsDal.insertComparison({ jobId: job.id, resumeId: resume.id, result, model: "demo" });

    const rows = testDb.select().from(schema.comparisonSkills).all();
    expect(rows.map((r) => [r.comparisonId, r.userId, r.skillKey, r.status])).toEqual([
      [id, ALICE, "postgresql", "matched"],
      [id, ALICE, "react", "matched"],
      [id, ALICE, "kubernetes", "missing"],
    ]);
  });
});

describe("tailored resumes", () => {
  const tailoringDal = () => import("@/server/db/tailored-resumes");
  const proposal = { summary: null, skills: [], sections: [], trimOrder: [], rationale: "" };

  it("numbers versions per user and job, and only reads your own", async () => {
    const { createTailoringDraft, getLatestTailoringRow } = await tailoringDal();
    as(ALICE);
    const job = await jobsDal.createSavedJob({ company: "Acme", title: "Engineer" });
    const resume = await resumesDal.createResumeVersion("alice", null);
    const v1 = await createTailoringDraft({ jobId: job.id, resumeId: resume.id, proposal, issues: [], model: "demo" });
    const v2 = await createTailoringDraft({ jobId: job.id, resumeId: resume.id, proposal, issues: [], model: "demo" });
    expect([v1.version, v2.version]).toEqual([1, 2]);
    expect((await getLatestTailoringRow(job.id))?.version).toBe(2);

    as(BOB);
    expect(await getLatestTailoringRow(job.id)).toBeUndefined();
    // Bob's first tailoring for his own job is his v1.
    const bobsJob = await jobsDal.createSavedJob({ company: "Globex", title: "Dev" });
    const bobsResume = await resumesDal.createResumeVersion("bob", null);
    const bobs = await createTailoringDraft({ jobId: bobsJob.id, resumeId: bobsResume.id, proposal, issues: [], model: "demo" });
    expect(bobs.version).toBe(1);
  });
});

describe("cover letters", () => {
  it("numbers versions per job, and only lists or edits your own", async () => {
    const lettersDal = await import("@/server/db/cover-letters");
    as(ALICE);
    const job = await jobsDal.createSavedJob({ company: "Acme", title: "Engineer" });
    const resume = await resumesDal.createResumeVersion("alice", null);
    const letter = {
      jobId: job.id,
      tailoringId: null,
      resumeId: resume.id,
      tone: "warm" as const,
      length: "short" as const,
      text: "Dear Acme,",
      warnings: [],
      model: "demo",
    };
    const v1 = await lettersDal.createCoverLetter(letter);
    const v2 = await lettersDal.createCoverLetter(letter);
    expect([v1.version, v2.version]).toEqual([1, 2]);
    expect(await lettersDal.saveCoverLetterText(v1.id, "Dear Acme team,")).toBe(true);

    as(BOB);
    expect(await lettersDal.listCoverLetterRows(job.id)).toEqual([]);
    expect(await lettersDal.saveCoverLetterText(v1.id, "Hacked")).toBe(false);

    as(ALICE);
    const rows = await lettersDal.listCoverLetterRows(job.id);
    expect(rows.map((r) => [r.version, r.text])).toEqual([
      [2, "Dear Acme,"],
      [1, "Dear Acme team,"],
    ]);
    // The generated text is kept alongside your edit.
    expect(rows[1]?.generatedText).toBe("Dear Acme,");
  });
});

describe("tailored comparisons", () => {
  it("never replace the original comparison, save no skill rows, and are yours only", async () => {
    const { createTailoringDraft } = await import("@/server/db/tailored-resumes");
    const result = { score: 60, matchedSkills: ["React"], missingSkills: ["AWS"], missingKeywords: [], suggestions: [] };
    as(ALICE);
    const job = await jobsDal.createSavedJob({ company: "Acme", title: "Engineer", listingText: "x" });
    const resume = await resumesDal.createResumeVersion("alice", null);
    const original = await comparisonsDal.insertComparison({ jobId: job.id, resumeId: resume.id, result, model: "demo" });
    const tailoring = await createTailoringDraft({
      jobId: job.id,
      resumeId: resume.id,
      proposal: { summary: null, skills: [], sections: [], trimOrder: [], rationale: "" },
      issues: [],
      model: "demo",
    });
    const tailored = await comparisonsDal.insertTailoredComparison({
      jobId: job.id,
      resumeId: resume.id,
      tailoringId: tailoring.id,
      result: { ...result, score: 75 },
      model: "demo",
    });

    // "The latest comparison for this job" is still the original.
    expect((await comparisonsDal.getLatestComparisonRow(job.id))?.id).toBe(original.id);
    expect((await comparisonsDal.listLatestComparisonRows()).get(job.id)?.id).toBe(original.id);
    expect((await comparisonsDal.getLatestTailoredComparisonRow(tailoring.id))?.id).toBe(tailored.id);
    // Only the original saved skill rows.
    const rowsFor = (id: number) => testDb.select().from(schema.comparisonSkills).all().filter((r) => r.comparisonId === id);
    expect(rowsFor(original.id)).toHaveLength(2);
    expect(rowsFor(tailored.id)).toHaveLength(0);

    as(BOB);
    expect(await comparisonsDal.getLatestTailoredComparisonRow(tailoring.id)).toBeUndefined();
  });
});

describe("gmail connection", () => {
  const connect = (email: string, refreshToken: string) =>
    gmailDal.saveGmailConnection({ email, refreshToken, scope: "https://www.googleapis.com/auth/gmail.readonly" });

  it("reads, changes, and removes only your own, and stores the token encrypted", async () => {
    as(ALICE);
    await connect("alice@gmail.example", "alice-refresh-token");
    const [row] = testDb.select().from(schema.gmailConnections).all();
    expect(row.encryptedRefreshToken).not.toContain("alice-refresh-token");

    as(BOB);
    expect((await gmailDal.getGmailStatus()).kind).toBe("none");
    expect(await gmailDal.getMailSource()).toBeNull();
    expect(await gmailDal.chooseSyncStart(new Date("2026-09-01"))).toBe(false);
    await gmailDal.markNeedsReconnect();
    expect(await gmailDal.removeGmailConnection()).toBeNull();

    as(ALICE);
    expect(await gmailDal.getGmailStatus()).toMatchObject({ kind: "connected", email: "alice@gmail.example", needsReconnect: false });
    expect(await gmailDal.gmailNeedsReconnect()).toBe(false);
    expect(await gmailDal.getMailSource()).not.toBeNull();
    expect(await gmailDal.removeGmailConnection()).toBe("alice-refresh-token");
    expect((await gmailDal.getGmailStatus()).kind).toBe("none");
  });

  it("won't use a token copied into another user's row", async () => {
    as(ALICE);
    await connect("alice@gmail.example", "alice-refresh-token");
    as(BOB);
    await connect("bob@gmail.example", "bob-refresh-token");
    const alices = testDb.select().from(schema.gmailConnections).all().find((r) => r.userId === ALICE);
    testDb
      .update(schema.gmailConnections)
      .set({ encryptedRefreshToken: alices?.encryptedRefreshToken })
      .where(eq(schema.gmailConnections.userId, BOB))
      .run();

    await expect(gmailDal.getMailSource()).rejects.toThrow(/Reconnect Gmail/);
    expect(await gmailDal.gmailNeedsReconnect()).toBe(true);
  });

  it("keeps the sync position when reconnecting the same address, and resets it for another", async () => {
    as(ALICE);
    await connect("alice@gmail.example", "first");
    expect(await gmailDal.chooseSyncStart(new Date("2026-09-01T00:00:00Z"))).toBe(true);
    testDb.update(schema.gmailConnections).set({ historyId: "123", needsReconnect: true }).run();
    // After the first sync, the start date is fixed.
    expect(await gmailDal.chooseSyncStart(new Date("2026-08-01T00:00:00Z"))).toBe(false);

    await connect("Alice@gmail.example", "second");
    expect(await gmailDal.getGmailStatus()).toMatchObject({
      needsReconnect: false,
      synced: true,
      syncStartAt: new Date("2026-09-01T00:00:00Z"),
    });

    await connect("other@gmail.example", "third");
    expect(await gmailDal.getGmailStatus()).toMatchObject({ email: "other@gmail.example", synced: false, startChosen: false });
  });
});

describe("email suggestions", () => {
  it("lists, confirms, dismisses, and links only your own", async () => {
    as(ALICE);
    const alicesApp = await applicationsDal.createApplication({ company: "Acme", title: "Engineer", status: "applied" });
    insertEmailEvent(testDb, ALICE, {
      source: "email",
      gmailMessageId: "alice-msg",
      gmailThreadId: "alice-thread",
      subject: "Interview invitation",
      applicationId: alicesApp.id,
      emailType: "interview",
      confidence: 0.9,
    });
    const [alices] = await emailEventsDal.listPendingSuggestions();
    expect(alices).toMatchObject({ company: "Acme", proposedStatus: "interviewing" });

    as(BOB);
    const bobsApp = await applicationsDal.createApplication({ company: "Globex", title: "Developer", status: "applied" });
    expect(await emailEventsDal.listPendingSuggestions()).toEqual([]);
    expect(await emailEventsDal.listRecentlyDecided()).toEqual([]);
    expect(await emailEventsDal.countPendingSuggestions()).toBe(0);
    expect((await emailEventsDal.confirm(alices.id)).ok).toBe(false);
    expect((await emailEventsDal.dismiss(alices.id)).ok).toBe(false);
    expect((await emailEventsDal.link(alices.id, { kind: "application", id: bobsApp.id })).ok).toBe(false);

    // Bob's own email can't be linked to Alice's application either.
    insertEmailEvent(testDb, BOB, { source: "email", gmailMessageId: "bob-msg", subject: "Hi", emailType: "offer", confidence: 0.9 });
    const [bobs] = await emailEventsDal.listPendingSuggestions();
    expect((await emailEventsDal.link(bobs.id, { kind: "application", id: alicesApp.id })).ok).toBe(false);
    // ...nor to Alice's saved job, and "Add as application" can't touch Alice's email.
    as(ALICE);
    const alicesSaved = await jobsDal.createSavedJob({ company: "Initech", title: "Analyst" });
    as(BOB);
    expect((await emailEventsDal.link(bobs.id, { kind: "job", id: alicesSaved.id })).ok).toBe(false);
    const add = { company: "Hacked", title: "Hacked", status: "applied" as const, appliedAt: new Date() };
    expect((await emailEventsDal.addAsApplication(alices.id, add)).ok).toBe(false);
    // Alice's email that couldn't be classified isn't counted for Bob.
    as(ALICE);
    insertEmailEvent(testDb, ALICE, { source: "email", gmailMessageId: "alice-unclassified", subject: "?" });
    expect(await emailEventsDal.countUnclassified()).toBe(1);
    as(BOB);
    expect(await emailEventsDal.countUnclassified()).toBe(0);
    // The same Gmail message id is a separate row per user.
    insertEmailEvent(testDb, BOB, { source: "email", gmailMessageId: "alice-msg", subject: "Same id" });
    expect(await emailEventsDal.countPendingSuggestions()).toBe(2);

    as(ALICE);
    // Her suggestion and her unclassified email; none of Bob's.
    expect(await emailEventsDal.countPendingSuggestions()).toBe(2);
    expect(await emailEventsDal.confirm(alices.id)).toEqual({ ok: true, status: "interviewing" });
    const [app] = await applicationsDal.listApplicationsWithJob();
    expect(app.status).toBe("interviewing");
  });
});

describe("listings and screening on applications", () => {
  it("adds, edits, and clears a listing, and records screening, only on your own", async () => {
    as(ALICE);
    const app = await applicationsDal.createApplication({ company: "Acme", title: "Engineer", status: "applied", listingText: "Build things." });
    await applicationsDal.updateApplication({ id: app.id, passedScreening: true });
    let [mine] = await applicationsDal.listApplicationsWithJob();
    expect(mine.job.listingText).toBe("Build things.");
    expect(mine.passedScreeningAt).not.toBeNull();

    as(BOB);
    await expect(applicationsDal.updateApplication({ id: app.id, listingText: "Hacked", passedScreening: false })).rejects.toThrow(/not found/);

    as(ALICE);
    // A blank listing clears it; unticking clears screening.
    await applicationsDal.updateApplication({ id: app.id, listingText: "  ", passedScreening: false });
    [mine] = await applicationsDal.listApplicationsWithJob();
    expect(mine.job.listingText).toBeNull();
    expect(mine.passedScreeningAt).toBeNull();
    // Reaching Interviewing sets it, and unticking can't undo that.
    await applicationsDal.moveApplicationStatus(app.id, "interviewing");
    await applicationsDal.updateApplication({ id: app.id, passedScreening: false });
    [mine] = await applicationsDal.listApplicationsWithJob();
    expect(mine.passedScreeningAt).not.toBeNull();
  });
});

describe("editing and revising a tailored draft", () => {
  const NORTHWIND = "https://careers.northwindrobotics.example/jobs/1821";

  // Alice's resume, profile, and a demo tailoring draft for the Northwind job.
  async function alicesDraft() {
    const tailoring = await import("@/server/tailoring");
    as(ALICE);
    await resumesDal.createResumeVersion("alice", DEMO_TEX);
    await profileDal.importProfileFromLatex(DEMO_TEX);
    const job = await jobsDal.createSavedJob({ company: "Northwind Robotics", title: "Senior Frontend Engineer", url: NORTHWIND, listingText: "Build things." });
    state.mode = "demo";
    const created = await tailoring.runTailoring(job.id);
    state.mode = "live";
    if (!created.ok) throw new Error(created.error.message);
    return { tailoring, jobId: job.id, draftId: created.tailoringId };
  }

  it("saves your edits and decisions only on your own draft", async () => {
    const { tailoring, jobId, draftId } = await alicesDraft();
    const edit = { edit: { op: "text" as const, itemId: "summary", text: "Frontend engineer who ships." } };

    as(BOB);
    expect(await tailoring.editTailoring(draftId, edit, {})).toMatchObject({ ok: false });
    const { saveReviewState } = await import("@/server/db/tailored-resumes");
    expect(await saveReviewState(draftId, { userEdits: [], decisions: {} })).toBe(false);

    as(ALICE);
    expect(await tailoring.editTailoring(draftId, edit, {})).toEqual({ ok: true });
    const review = await tailoring.getTailoringReview(jobId);
    expect(review.changes?.find((c) => c.id === "summary")?.after).toEqual(["Frontend engineer who ships."]);
    // You wrote it, so it's accepted.
    expect(review.decisions.summary).toBe("accepted");
    expect(review.outline?.summary).toEqual({ text: "Frontend engineer who ships.", edited: true });

    // Reset puts the suggestion back, undecided.
    await tailoring.editTailoring(draftId, { reset: "summary" }, review.decisions);
    expect((await tailoring.getTailoringReview(jobId)).decisions.summary).toBeUndefined();
  });

  it("revises into a new version, keeping your wording and decisions", async () => {
    const { tailoring, jobId, draftId } = await alicesDraft();
    await tailoring.editTailoring(draftId, { edit: { op: "text", itemId: "summary", text: "My own summary." } }, {});
    const before = await tailoring.getTailoringReview(jobId);
    const request = { notes: [], generalNote: "Keep it to one page.", pages: 2 };

    as(BOB);
    expect(await tailoring.reviseTailoring(draftId, request, {})).toMatchObject({ ok: false });

    as(ALICE);
    expect(await tailoring.reviseTailoring(draftId, { ...request, generalNote: "" }, {})).toMatchObject({ ok: false });
    state.mode = "demo";
    const revised = await tailoring.reviseTailoring(draftId, request, before.decisions);
    state.mode = "live";
    expect(revised).toMatchObject({ ok: true });

    const after = await tailoring.getTailoringReview(jobId);
    expect(after.latest).toMatchObject({ status: "ok", version: 2, revisedFromId: draftId, revisionNote: "Keep it to one page." });
    expect(after.outline?.summary).toEqual({ text: "My own summary.", edited: true });
    expect(after.decisions.summary).toBe("accepted");
  });
});
