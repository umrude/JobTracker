import { describe, it, expect } from "vitest";
import { ghostedCandidates, type GhostedInput } from "@/lib/email/ghosted";
import { matchApplication, mentionsTitle, type MatchableApplication } from "@/lib/email/matching";
import type { EmailMeta } from "@/lib/schemas/email";
import { SEED_APPLICATIONS } from "@/server/db/seed";
import { demoInbox } from "@/server/gmail/demo-inbox";

// The seeded applications, with ids by position.
const applications: MatchableApplication[] = SEED_APPLICATIONS.map((app, index) => ({
  id: index + 1,
  company: app.company,
  title: app.title,
}));
const idOf = (company: string) => applications.find((a) => a.company === company)?.id;

const inbox = new Map(demoInbox(new Date("2026-10-20T12:00:00Z")).map((e) => [e.meta.id, e.meta]));
const meta = (id: string): EmailMeta => {
  const found = inbox.get(id);
  if (!found) throw new Error(`no fixture ${id}`);
  return found;
};

describe("matchApplication on the demo inbox", () => {
  it("links by company name, including via an applicant-tracking sender", () => {
    expect(matchApplication(meta("demo-cobalt-ack"), applications, new Map())).toEqual({
      applicationId: idOf("Cobalt Harbor"),
      method: "company",
    });
    expect(matchApplication(meta("demo-marrow-assessment"), applications, new Map())).toMatchObject({
      applicationId: idOf("Marrow Biotech"),
    });
  });

  it("links by domain when the name isn't in the text", () => {
    expect(matchApplication(meta("demo-driftwood-interview"), applications, new Map())).toMatchObject({
      applicationId: idOf("Driftwood Analytics"),
    });
  });

  it("links a reply that never names the company by its thread", () => {
    const reject = meta("demo-fenwick-reject");
    // Without the thread, nothing in it says Fenwick & Vale.
    expect(matchApplication(reject, applications, new Map())).toEqual({ applicationId: null, candidates: [] });
    const fenwick = idOf("Fenwick & Vale");
    if (fenwick === undefined) throw new Error("missing");
    expect(matchApplication(reject, applications, new Map([["t-fenwick", fenwick]]))).toEqual({
      applicationId: fenwick,
      method: "thread",
    });
  });

  it("leaves a cold recruiter email unlinked", () => {
    expect(matchApplication(meta("demo-recruiter-outreach"), applications, new Map())).toEqual({
      applicationId: null,
      candidates: [],
    });
  });
});

describe("matchApplication with two applications at one company", () => {
  const two: MatchableApplication[] = [
    { id: 1, company: "Acme", title: "Backend Engineer (Node.js)" },
    { id: 2, company: "Acme", title: "Data Analyst" },
  ];
  const acme = (subject: string): EmailMeta => ({
    id: "x",
    threadId: "t",
    fromAddress: "jobs@acme.example",
    fromName: "Acme",
    subject,
    snippet: "",
    receivedAt: new Date(),
    labels: ["INBOX"],
  });

  it("narrows to one by the job title", () => {
    expect(matchApplication(acme("Interview: Backend Engineer"), two, new Map())).toEqual({
      applicationId: 1,
      method: "company_title",
    });
  });

  it("leaves it for you to pick when the title doesn't settle it", () => {
    expect(matchApplication(acme("Your application"), two, new Map())).toEqual({ applicationId: null, candidates: [1, 2] });
  });
});

describe("mentionsTitle", () => {
  it("ignores parentheses in the title", () => {
    expect(mentionsTitle("Interview for Backend Engineer next week", "Backend Engineer (Node.js)")).toBe(true);
  });
});

describe("ghostedCandidates", () => {
  const now = new Date("2026-10-20T12:00:00Z");
  const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const app = (overrides: Partial<GhostedInput>): GhostedInput => ({
    id: 1,
    status: "applied",
    appliedAt: daysAgo(40),
    lastEmailAt: null,
    ghostedDismissedAt: null,
    ghostedPending: false,
    ...overrides,
  });

  it("suggests an application with no activity for 30 days", () => {
    expect(ghostedCandidates([app({})], now)).toEqual([1]);
  });

  it("counts a recent email as activity", () => {
    expect(ghostedCandidates([app({ lastEmailAt: daysAgo(10) })], now)).toEqual([]);
  });

  it("only applies while waiting to hear back", () => {
    expect(ghostedCandidates([app({ status: "rejected" }), app({ id: 2, status: "offer" })], now)).toEqual([]);
  });

  it("doesn't repeat a suggestion that's pending, or one you dismissed until 30 more days pass", () => {
    expect(ghostedCandidates([app({ ghostedPending: true })], now)).toEqual([]);
    expect(ghostedCandidates([app({ ghostedDismissedAt: daysAgo(5) })], now)).toEqual([]);
    expect(ghostedCandidates([app({ appliedAt: daysAgo(80), ghostedDismissedAt: daysAgo(35) })], now)).toEqual([1]);
  });
});
