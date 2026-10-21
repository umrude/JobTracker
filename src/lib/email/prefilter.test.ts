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
  it("keeps the hiring news, including tricky cases and applications you never added", () => {
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
      "demo-northwind-ack",
      "demo-pinecrest-ack",
      "demo-alderfinch-interview",
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

describe("one-word company names that are also words", () => {
  const affirm = (overrides: Partial<EmailMeta>) => prefilter(email(overrides), ["Affirm"]).reasons;

  it("counts the name as you capitalized it, not the ordinary word", () => {
    expect(affirm({ snippet: "We affirm our commitment to your privacy." })).not.toContain("company:Affirm");
    expect(affirm({ subject: "Your interview with Affirm" })).toContain("company:Affirm");
    expect(affirm({ subject: "Affirmations for the week" })).not.toContain("company:Affirm");
  });

  it("still trusts the sender's name and domain", () => {
    expect(affirm({ fromName: "affirm recruiting" })).toContain("company:Affirm");
    expect(affirm({ fromAddress: "jobs@affirm.example" })).toContain("company:Affirm");
  });

  it("matches any capitalization of a name you typed in lowercase", () => {
    expect(prefilter(email({ subject: "News from Initech" }), ["initech"]).reasons).toContain("company:initech");
  });
});

describe("hiring phrases in the snippet", () => {
  it("catches a vague subject with a clear snippet, outside Promotions", () => {
    const vague = { subject: "Quick question", snippet: "Thanks for applying for the Product Designer role! Free for a call?" };
    expect(prefilter(email(vague), []).candidate).toBe(true);
    expect(prefilter(email({ ...vague, labels: ["CATEGORY_PROMOTIONS"] }), []).candidate).toBe(false);
    expect(prefilter(email({ subject: "Quick question", snippet: "Are you free for a call about the lease?" }), []).candidate).toBe(false);
  });
});
