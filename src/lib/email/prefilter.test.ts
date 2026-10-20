import { describe, it, expect } from "vitest";
import { mentionsCompany, normalizeCompany, prefilter } from "@/lib/email/prefilter";
import type { EmailMeta } from "@/lib/schemas/email";
import { SEED_APPLICATIONS } from "@/server/db/seed";
import { demoInbox } from "@/server/gmail/demo-inbox";

const companies = SEED_APPLICATIONS.map((app) => app.company);
const inbox = demoInbox(new Date("2026-10-20T12:00:00Z"));
const candidateIds = inbox.filter((email) => prefilter(email.meta, companies).candidate).map((email) => email.meta.id);

const email = (overrides: Partial<EmailMeta>): EmailMeta => ({
  id: "x",
  threadId: "t",
  fromAddress: "someone@example.com",
  fromName: "Someone",
  subject: "Hello",
  snippet: "",
  receivedAt: new Date(),
  labels: ["INBOX"],
  ...overrides,
});

describe("prefilter on the demo inbox", () => {
  it("keeps the hiring news, including tricky cases", () => {
    expect(candidateIds).toEqual([
      "demo-cobalt-ack",
      "demo-fenwick-ack",
      "demo-fenwick-reject",
      "demo-driftwood-interview",
      "demo-marrow-assessment",
      "demo-solstice-reschedule",
      "demo-hearthstone-offer",
      "demo-ironclad-reject",
      "demo-recruiter-outreach",
    ]);
  });

  it("drops your employer's email, newsletters, promotions, alerts, and personal mail", () => {
    for (const id of ["demo-employer-allhands", "demo-driftwood-newsletter", "demo-promo", "demo-job-alert", "demo-personal"]) {
      expect(candidateIds).not.toContain(id);
    }
  });
});

describe("prefilter rules", () => {
  it("always keeps a known applicant-tracking sender, including subdomains, even in Promotions", () => {
    const result = prefilter(email({ fromAddress: "no-reply@us.greenhouse-mail.io", labels: ["CATEGORY_PROMOTIONS"] }), []);
    expect(result).toEqual({ candidate: true, reasons: ["ats:greenhouse-mail.io"] });
  });

  it("matches a company by its name squashed into the sender's domain", () => {
    const result = prefilter(email({ fromAddress: "jobs@recruiting.cobaltharbor.example" }), ["Cobalt Harbor"]);
    expect(result.reasons).toContain("company:Cobalt Harbor");
  });

  it("doesn't treat a bare 'offer' as hiring news", () => {
    expect(prefilter(email({ subject: "Limited time offer inside" }), []).candidate).toBe(false);
    expect(prefilter(email({ subject: "Your offer letter" }), []).candidate).toBe(true);
  });
});

describe("company names", () => {
  it("normalizes ampersands, punctuation, and legal suffixes", () => {
    expect(normalizeCompany("Fenwick & Vale, Inc.")).toBe("fenwick and vale");
  });

  it("matches whole names only", () => {
    expect(mentionsCompany("Larkspur Logistics all-hands", "Larkspur Systems")).toBe(false);
    expect(mentionsCompany("Your application to Fenwick and Vale", "Fenwick & Vale")).toBe(true);
  });
});
