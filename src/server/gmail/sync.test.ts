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
import { describeSync, syncInbox, type Classifier } from "@/server/gmail/sync";
import {
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
    expect(summary).toMatchObject({ read: 14, candidates: 9, hidden: 1, ghosted: 1, unclassified: 0, suggestions: 9 });

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
    expect(describeSync(first.summary)).toBe("Read 14 emails, 9 about hiring: 9 new suggestions (1 ghosted) to review. 1 not relevant, filed away.");
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
    const classify: Classifier = async () => ({ ok: true, classification: { type: "interview", confidence: 0.9, reason: "Confirms a time." }, model: "test" });
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
    const classify: Classifier = async () => ({ ok: true, classification: { type: "interview", confidence: 0.6, reason: "Asks for a call." }, model: "test" });
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
    expect(linkSuggestion(db, USER, row.id, cobalt)).toEqual({ ok: true, status: "interviewing" });
    expect(pendingFor("Next steps")).toMatchObject({ applicationId: cobalt, matchMethod: "manual", proposedStatus: "interviewing" });
  });
});
