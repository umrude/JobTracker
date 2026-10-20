import { describe, it, expect } from "vitest";
import { checkCoverLetter } from "@/lib/cover-letter/check";
import { resumePlainText } from "@/lib/cover-letter/sources";
import { createSkillResolver } from "@/lib/skills/resolver";
import { DEMO_COVER_LETTERS } from "@/server/llm/cover-letter-demo";
import { SEED_SAVED_JOBS } from "@/server/db/seed";
import { demoProfile, demoTex } from "@/test/demo-profile";

const profile = demoProfile();
const resolver = createSkillResolver(profile.skills);
const resumeText = resumePlainText(demoTex());

describe("demo cover letters", () => {
  // They model what a good letter looks like, so they must pass the same
  // checks a generated one does.
  it.each(Object.entries(DEMO_COVER_LETTERS))("%s raises no warnings", (url, letter) => {
    const job = SEED_SAVED_JOBS.find((j) => j.url === url);
    expect(job, url).toBeDefined();
    const warnings = checkCoverLetter(letter, {
      profile,
      resumeText,
      listing: job?.listingText ?? "",
      resolver,
      length: "standard",
    });
    expect(warnings).toEqual([]);
  });
});
