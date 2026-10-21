import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { beforeEach, describe, it, expect } from "vitest";
import * as schema from "@/server/db/schema";
import type { EmailMeta } from "@/lib/schemas/email";
import { SEED_APPLICATIONS } from "@/server/db/seed";
import { demoMailSource } from "@/server/gmail/demo-source";
import { demoClassification } from "@/server/llm/classify-demo";
import type { MailSource } from "@/server/gmail/mail-source";
import { ClassifierUnavailable, describeReclassify, describeSync, reclassifyStored, syncInbox, type Classifier } from "@/server/gmail/sync";
import {
  addApplicationFromSuggestion,
  confirmSuggestion,
  dismissSuggestion,
  linkSuggestion,
  pendingSuggestionRows,
  recentlyDecidedRows,
} from "@/server/db/email-event-store";

// The whole sync pipeline on the demo inbox, against a real (in-memory)
// database: pre-filter, matching, classification, storage, the ghosted
// rule, and then review.

const NOW = new Date("2026-10-20T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const USER = 1;

let db: ReturnType<typeof drizzle<typeof schema>>;
const appIds = new Map<string, number>();

const demoClassifier: Classifier = async (email) => ({ ok: true, classification: demoClassification(email.id), model: "demo" });

function run(overrides: Partial<Parameters<typeof syncInbox>[0]> = {}) {
  return syncInbox({
    db,
    userId: USER,
    source: demoMailSource(NOW),
    classify: demoClassifier,
    position: { historyId: null, since: new Date(NOW.getTime() - 90 * DAY) },
    now: NOW,
    ...overrides,
  });
}

const pending = () => pendingSuggestionRows(db, USER);
const pendingFor = (subject: string) => pending().find((row) => row.subject === subject);

beforeEach(() => {
  db = drizzle(new Database(":memory:"), { schema });
  migrate(db, { migrationsFolder: path.join(process.cwd(), "src/server/db/migrations") });
  db.insert(schema.users).values({ id: USER, email: "demo@example.com" }).run();
  appIds.clear();
  for (const app of SEED_APPLICATIONS) {
    // Larkspur Systems: applied long enough ago, with no email, to be ghosted.
    const appliedAt = new Date(NOW.getTime() - (app.company === "Larkspur Systems" ? 41 : (app.appliedDaysAgo ?? 0)) * DAY);
    const job = db.insert(schema.jobs).values({ userId: USER, company: app.company, title: app.title }).returning().get();
    const row = db
      .insert(schema.applications)
      .values({ userId: USER, jobId: job.id, status: app.status, appliedAt, updatedAt: appliedAt })
      .returning()
      .get();
    appIds.set(app.company, row.id);
  }
});

describe("syncInbox on the demo inbox", () => {
  it("turns hiring email into suggestions, files away the sure not-relevant, and adds ghosted", async () => {
    const { summary, historyId } = await run();
    expect(historyId).toBe("demo");
    // 12 hiring emails: 11 waiting plus the recruiter filed away; plus Larkspur ghosted.
    expect(summary).toMatchObject({ read: 17, candidates: 12, hidden: 1, ghosted: 1, unclassified: 0, suggestions: 12 });

    const rows = pending();
    // Changes first: the five that move an application, then the news.
    expect(rows.slice(0, 5).map((r) => r.proposedStatus)).toEqual(expect.arrayContaining(["acknowledged", "rejected", "interviewing", "ghosted"]));
    expect(rows.slice(5).every((r) => r.proposedStatus === null)).toBe(true);

    // The cold recruiter was filed away, not left for review.
    expect(recentlyDecidedRows(db, USER).map((r) => r.subject)).toEqual(["Interview request: Senior Frontend Engineer role"]);
  });

  it("links a reply that never names the company through its thread, in the same sync", async () => {
    await run();
    const reject = pendingFor("Update on your application");
    expect(reject).toMatchObject({ applicationId: appIds.get("Fenwick & Vale"), matchMethod: "thread", proposedStatus: "rejected" });
  });

  it("suggests no change for news about an application already there", async () => {
    await run();
    expect(pendingFor("Offer letter: Site Reliability Engineer")).toMatchObject({ emailType: "offer", currentStatus: "offer", proposedStatus: null });
    expect(pendingFor("Unfortunately we need to reschedule your interview")).toMatchObject({ emailType: "interview", proposedStatus: null });
  });

  it("does nothing new on a second sync", async () => {
    const first = await run();
    expect(describeSync(first.summary)).toBe("Read 17 emails, 12 about hiring: 12 new suggestions (1 ghosted) to review. 1 not relevant, filed away.");
    const before = pending().length;
    const { summary } = await run();
    // The five non-hiring emails are read again (they're never stored);
    // nothing already processed is classified or stored twice.
    expect(summary).toMatchObject({ read: 5, candidates: 0, suggestions: 0, ghosted: 0 });
    expect(pending()).toHaveLength(before);
    expect(describeSync(summary)).toBe("Read 5 emails: nothing new about your applications.");
  });
});

describe("syncInbox edge cases", () => {
  const meta = (overrides: Partial<EmailMeta>): EmailMeta => ({
    id: "m",
    threadId: "t",
    fromAddress: "someone@example.com",
    fromName: "Someone",
    subject: "Hello",
    snippet: "",
    receivedAt: new Date(NOW.getTime() - DAY),
    labels: ["INBOX"],
    ...overrides,
  });
  const sourceOf = (messages: EmailMeta[], listNew: MailSource["listNew"] = async () => null): MailSource => ({
    listSince: async () => ({ messages, historyId: "h2", truncated: false }),
    listNew,
    body: async () => "",
  });

  it("treats a reply in a linked thread as a candidate even if the pre-filter wouldn't", async () => {
    await run();
    const reply = meta({ id: "reply", threadId: "t-driftwood", fromName: "Sam", fromAddress: "sam@example.com", subject: "Re: Scheduling", snippet: "Monday works" });
    const classify: Classifier = async () => ({ ok: true, classification: { type: "interview", confidence: 0.9, reason: "Confirms a time.", company: null, role: null }, model: "test" });
    const { summary } = await run({ source: sourceOf([reply]), classify });
    expect(summary.candidates).toBe(1);
    expect(pendingFor("Re: Scheduling")).toMatchObject({ applicationId: appIds.get("Driftwood Analytics"), matchMethod: "thread" });
  });

  it("keeps an email the classifier couldn't answer, for you to look at", async () => {
    const failing: Classifier = async () => ({ ok: false, message: "The model declined to process this request." });
    const { summary } = await run({ source: sourceOf([meta({ id: "x", subject: "Your application to Cobalt Harbor" })]), classify: failing });
    expect(summary.unclassified).toBe(1);
    expect(pendingFor("Your application to Cobalt Harbor")).toMatchObject({ emailType: null, reason: expect.stringMatching(/^Couldn't classify/) });
  });

  it("re-lists by date when Gmail's history has run out", async () => {
    const { summary, historyId } = await run({ source: sourceOf([]), position: { historyId: "old", since: NOW } });
    expect(summary.relisted).toBe(true);
    expect(historyId).toBe("h2");
  });
});

describe("reviewing", () => {
  it("confirms by moving the application, and updates the other suggestions for it", async () => {
    await run();
    const ack = pendingFor("Your application for Data Analyst at Fenwick & Vale");
    const reject = pendingFor("Update on your application");
    if (!ack || !reject) throw new Error("missing");

    expect(confirmSuggestion(db, USER, reject.id, NOW)).toEqual({ ok: true, status: "rejected" });
    expect(db.select().from(schema.applications).all().find((a) => a.id === appIds.get("Fenwick & Vale"))?.status).toBe("rejected");
    // The acknowledgement is now just news, and can't be confirmed.
    expect(pendingFor("Your application for Data Analyst at Fenwick & Vale")?.proposedStatus).toBeNull();
    expect(confirmSuggestion(db, USER, ack.id, NOW)).toMatchObject({ ok: false, message: expect.stringMatching(/moved on/) });
    expect(dismissSuggestion(db, USER, ack.id, NOW).ok).toBe(true);
    expect(dismissSuggestion(db, USER, ack.id, NOW).ok).toBe(false);
  });

  it("records passing screening when an interview email is confirmed", async () => {
    await run();
    const interview = pendingFor("Interview invitation: Full-Stack Developer");
    if (!interview) throw new Error("missing");
    expect(confirmSuggestion(db, USER, interview.id, NOW)).toEqual({ ok: true, status: "interviewing" });
    const app = db.select().from(schema.applications).all().find((a) => a.id === appIds.get("Driftwood Analytics"));
    expect(app?.passedScreeningAt).toEqual(new Date(Math.floor(NOW.getTime() / 1000) * 1000));
  });

  it("confirms a ghosted suggestion, and doesn't suggest it again after a dismissal", async () => {
    await run();
    const ghosted = pending().find((row) => row.source === "ghosted");
    expect(ghosted).toMatchObject({ applicationId: appIds.get("Larkspur Systems"), proposedStatus: "ghosted" });
    if (!ghosted) return;
    dismissSuggestion(db, USER, ghosted.id, NOW);
    const { summary } = await run();
    expect(summary.ghosted).toBe(0);
  });

  it("links an unlinked email and works out its suggestion for that application", async () => {
    const classify: Classifier = async () => ({ ok: true, classification: { type: "interview", confidence: 0.6, reason: "Asks for a call.", company: null, role: null }, model: "test" });
    const email: EmailMeta = {
      id: "cold",
      threadId: "t-cold",
      fromAddress: "pat@agency.example",
      fromName: "Pat",
      subject: "Next steps",
      snippet: "Can we talk this week?",
      receivedAt: NOW,
      labels: ["INBOX"],
    };
    await run({ source: { listSince: async () => ({ messages: [email], historyId: "h", truncated: false }), listNew: async () => null, body: async () => "" }, classify });
    const row = pendingFor("Next steps");
    expect(row).toMatchObject({ applicationId: null, proposedStatus: null });
    if (!row) return;
    const cobalt = appIds.get("Cobalt Harbor") ?? 0;
    expect(linkSuggestion(db, USER, row.id, { kind: "application", id: cobalt })).toEqual({ ok: true, status: "interviewing" });
    expect(pendingFor("Next steps")).toMatchObject({ applicationId: cobalt, matchMethod: "manual", proposedStatus: "interviewing" });
  });
});

describe("applications you haven't added", () => {
  it("links an email about a saved job, and confirming adds it to the board", async () => {
    const job = db
      .insert(schema.jobs)
      .values({ userId: USER, company: "Northwind Robotics", title: "Senior Frontend Engineer", notes: "Tailored resume v2" })
      .returning()
      .get();
    await run();
    const row = pendingFor("Thanks for applying to Northwind Robotics");
    expect(row).toMatchObject({ applicationId: null, jobId: job.id, proposedStatus: "acknowledged", company: "Northwind Robotics" });
    if (!row) return;

    expect(confirmSuggestion(db, USER, row.id, NOW)).toEqual({ ok: true, status: "acknowledged" });
    const app = db.select().from(schema.applications).all().find((a) => a.jobId === job.id);
    // Applied as of the email's date, with the saved job's notes moved over.
    expect(app).toMatchObject({ status: "acknowledged", appliedAt: row.receivedAt, notes: "Tailored resume v2" });
  });

  it("offers never-added applications for adding, prefilled from the classifier", async () => {
    await run();
    const row = pendingFor("Thank you for applying to Pinecrest Labs");
    expect(row).toMatchObject({ applicationId: null, jobId: null, extractedCompany: "Pinecrest Labs", extractedRole: "Frontend Engineer" });
    if (!row) return;

    const input = { company: "Pinecrest Labs", title: "Frontend Engineer", status: "acknowledged" as const, appliedAt: NOW };
    expect(addApplicationFromSuggestion(db, USER, row.id, input, NOW)).toEqual({ ok: true, status: "acknowledged" });
    expect(addApplicationFromSuggestion(db, USER, row.id, input, NOW).ok).toBe(false);
    const job = db.select().from(schema.jobs).all().find((j) => j.company === "Pinecrest Labs");
    expect(db.select().from(schema.applications).all().find((a) => a.jobId === job?.id)).toMatchObject({ status: "acknowledged" });
    expect(recentlyDecidedRows(db, USER).find((r) => r.id === row.id)).toMatchObject({ state: "confirmed", company: "Pinecrest Labs" });
  });

  it("settles two near-identical roles with the role the classifier read in the body", async () => {
    for (const title of ["Senior Software Engineer, Frontend (Auth Experiences)", "Senior Software Engineer, Frontend (App Experience)"]) {
      const job = db.insert(schema.jobs).values({ userId: USER, company: "Affirm", title }).returning().get();
      db.insert(schema.applications).values({ userId: USER, jobId: job.id, status: "applied", appliedAt: NOW, updatedAt: NOW }).run();
    }
    const email: EmailMeta = {
      id: "affirm-ack",
      threadId: "t-affirm",
      fromAddress: "no-reply@greenhouse-mail.io",
      fromName: "Affirm",
      subject: "Thank you for applying to Affirm",
      snippet: "We've received your application.",
      receivedAt: NOW,
      labels: ["INBOX"],
    };
    const classify: Classifier = async () => ({
      ok: true,
      classification: { type: "acknowledged", confidence: 0.95, reason: "Confirms receipt.", company: "Affirm", role: "Senior Software Engineer, Frontend (App Experience)" },
      model: "test",
    });
    await run({ source: { listSince: async () => ({ messages: [email], historyId: "h", truncated: false }), listNew: async () => null, body: async () => "" }, classify });
    expect(pendingFor("Thank you for applying to Affirm")).toMatchObject({ title: "Senior Software Engineer, Frontend (App Experience)", matchMethod: "company_title" });
  });
});

describe("when the classifier can't work at all", () => {
  it("stops without storing the batch, and a later sync picks up where it stopped", async () => {
    const broke: Classifier = async () => ({
      ok: false,
      message: "Your Anthropic account is out of credits.",
      stopSync: { reason: "out_of_credits" },
    });
    await expect(run({ classify: broke })).rejects.toBeInstanceOf(ClassifierUnavailable);
    // Nothing stored as "Couldn't classify", so nothing is stuck.
    expect(db.select().from(schema.emailEvents).all()).toEqual([]);

    // After adding credits: everything is classified.
    const { summary } = await run();
    expect(summary).toMatchObject({ candidates: 12, unclassified: 0 });
  });
});

describe("Classify again", () => {
  // How emails were stored before an empty balance stopped the sync: each
  // one "Couldn't classify", and never retried.
  const oldFailure: Classifier = async () => ({ ok: false, message: "The Anthropic API request failed. Try again in a moment." });
  const unclassified = () => pending().filter((row) => row.source === "email" && row.emailType === null);

  it("classifies the stored ones without re-reading the inbox, and files away the sure not-relevant", async () => {
    await run({ classify: oldFailure });
    expect(unclassified()).toHaveLength(12);

    const summary = await reclassifyStored({ db, userId: USER, classify: demoClassifier, now: NOW });
    expect(summary).toEqual({ retried: 12, classified: 11, hidden: 1, stillUnclassified: 0 });
    expect(unclassified()).toHaveLength(0);
    // The same suggestions a working sync would have made.
    expect(pendingFor("Update on your application")).toMatchObject({ emailType: "rejection", proposedStatus: "rejected", matchMethod: "thread" });
    expect(pendingFor("Thank you for applying to Pinecrest Labs")).toMatchObject({ extractedCompany: "Pinecrest Labs" });
    expect(recentlyDecidedRows(db, USER).map((r) => r.subject)).toContain("Interview request: Senior Frontend Engineer role");
    expect(describeReclassify(summary)).toBe("Classified 11 of 12 emails. 1 not relevant, filed away.");
  });

  it("keeps a link you made by hand", async () => {
    await run({ classify: oldFailure });
    const row = pendingFor("Thank you for applying to Pinecrest Labs");
    const cobalt = appIds.get("Cobalt Harbor") ?? 0;
    if (!row) throw new Error("missing");
    linkSuggestion(db, USER, row.id, { kind: "application", id: cobalt });
    await reclassifyStored({ db, userId: USER, classify: demoClassifier, now: NOW });
    expect(pendingFor("Thank you for applying to Pinecrest Labs")).toMatchObject({ applicationId: cobalt, matchMethod: "manual" });
  });

  it("stops if the credits run out again, and finishes the rest next time", async () => {
    await run({ classify: oldFailure });
    let calls = 0;
    const runsOut: Classifier = async (email, about) => {
      calls++;
      return calls <= 4 ? demoClassifier(email, about) : { ok: false, message: "Out of credits.", stopSync: { reason: "out_of_credits" } };
    };
    await expect(reclassifyStored({ db, userId: USER, classify: runsOut, now: NOW })).rejects.toBeInstanceOf(ClassifierUnavailable);
    // The first batch of four was saved before the stop.
    expect(unclassified()).toHaveLength(8);
    const summary = await reclassifyStored({ db, userId: USER, classify: demoClassifier, now: NOW });
    expect(summary.retried).toBe(8);
    expect(unclassified()).toHaveLength(0);
  });
});
