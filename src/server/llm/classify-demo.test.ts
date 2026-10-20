import { describe, it, expect } from "vitest";
import { classificationSchema } from "@/lib/schemas/email";
import { prefilter } from "@/lib/email/prefilter";
import { SEED_APPLICATIONS } from "@/server/db/seed";
import { demoInbox } from "@/server/gmail/demo-inbox";
import { DEMO_CLASSIFICATIONS, demoClassification } from "@/server/llm/classify-demo";

const companies = SEED_APPLICATIONS.map((app) => app.company);
const candidates = demoInbox(new Date("2026-10-20T12:00:00Z")).filter((email) => prefilter(email.meta, companies).candidate);

describe("demo classifications", () => {
  it("cover exactly the demo emails the pre-filter keeps", () => {
    expect(Object.keys(DEMO_CLASSIFICATIONS).sort()).toEqual(candidates.map((email) => email.meta.id).sort());
  });

  it("are valid classifier output, unchanged by validation", () => {
    for (const classification of Object.values(DEMO_CLASSIFICATIONS)) {
      expect(classificationSchema.parse(classification)).toEqual(classification);
    }
  });

  it("get the tricky ones right", () => {
    expect(demoClassification("demo-solstice-reschedule").type).toBe("interview");
    expect(demoClassification("demo-recruiter-outreach").type).toBe("not_relevant");
    expect(demoClassification("unknown").type).toBe("not_relevant");
  });
});
