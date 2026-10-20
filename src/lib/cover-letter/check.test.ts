import { describe, it, expect } from "vitest";
import { checkCoverLetter } from "@/lib/cover-letter/check";
import { headerName, letterText, resumePlainText, wordCount } from "@/lib/cover-letter/sources";
import { createSkillResolver } from "@/lib/skills/resolver";
import type { CoverLetterOutput } from "@/lib/schemas/cover-letter";
import { SEED_SAVED_JOBS } from "@/server/db/seed";
import { DEMO_TEX, demoProfile, demoTex } from "@/test/demo-profile";

const profile = demoProfile();
const resumeText = resumePlainText(demoTex());
const listing = SEED_SAVED_JOBS.find((job) => job.company === "Northwind Robotics")?.listingText ?? "";
const context = { profile, resumeText, listing, resolver: createSkillResolver(profile.skills), length: "short" as const };

// About 150 words of honest body text, padded to the short target.
const HONEST =
  "I led the rebuild of a real-time shipment tracking dashboard used by 400+ dispatchers, built in React and TypeScript, and cut time-to-interactive from 6s to 1.8s. " +
  "Your operator console sounds like the same kind of problem at a larger scale, and I would love to help build it. " +
  "I care about testing and accessibility: I introduced Playwright end-to-end tests in CI and ran ARIA and keyboard fixes across our dashboard. " +
  "I have also mentored two junior engineers through code review and pairing, which your role asks for. " +
  "Real-time views, fleet maps, and charts for throughput are work I enjoy and know well, and I would bring that focus to Northwind. " +
  "Thank you for considering my application; I would welcome the chance to talk about the console and the team.";

const letter = (paragraph: string): CoverLetterOutput => ({
  greeting: "Dear Northwind Robotics hiring team,",
  paragraphs: [paragraph],
  closing: "Sincerely,",
});

const kinds = (paragraph: string) => checkCoverLetter(letter(paragraph), context).flatMap((w) => w.kinds);

describe("checkCoverLetter", () => {
  it("has no warnings for an honest letter of the right length", () => {
    expect(checkCoverLetter(letter(HONEST), context)).toEqual([]);
  });

  it("warns about a number that isn't anywhere in the profile, resume, or listing", () => {
    expect(kinds(`${HONEST} I cut costs by 35% in my last role.`)).toContain("new_number");
  });

  it("allows numbers quoted from the listing", () => {
    // The listing mentions a fleet of 50+ robots.
    expect(kinds(HONEST.replace("at a larger scale", "at the scale of 50+ robots"))).not.toContain("new_number");
  });

  it("warns about a skill not in the profile, noting when it's from the listing", () => {
    const warnings = checkCoverLetter(letter(`${HONEST} I also have deep Kubernetes experience.`), context);
    expect(warnings.find((w) => w.kinds.includes("unknown_skill"))?.message).toContain('"Kubernetes"');
  });

  it("doesn't warn about a skill your own bullets mention, even if it's not in your skills list", () => {
    // "accessibility" isn't a profile skill, but a bullet covers it.
    expect(kinds(HONEST)).not.toContain("unknown_skill");
  });

  it("warns when a Learning skill isn't phrased as learning", () => {
    expect(kinds(`${HONEST} I deploy everything with Docker.`)).toContain("learning_claim");
    expect(kinds(`${HONEST} I am currently learning Docker on personal projects.`)).not.toContain("learning_claim");
  });

  it("warns about a skill with no context", () => {
    // Vercel is listed on the resume but nothing says where it was used.
    expect(kinds(`${HONEST} I ship to Vercel.`)).toContain("no_context_skill");
  });

  it("warns when the length is far from the target", () => {
    expect(kinds("I would like this job.")).toContain("length");
  });
});

describe("sources", () => {
  it("reads the name from the resume header", () => {
    expect(headerName(DEMO_TEX)).toBe("Alex Rivera");
    expect(headerName("\\begin{document}\nNo header here\n\\end{document}")).toBeNull();
  });

  it("assembles a signed plain-text letter", () => {
    expect(letterText({ greeting: "Dear team,", paragraphs: ["One.", " ", "Two."], closing: "Sincerely," }, "Alex Rivera")).toBe(
      "Dear team,\n\nOne.\n\nTwo.\n\nSincerely,\nAlex Rivera",
    );
  });

  it("writes the resume as readable plain text", () => {
    expect(resumeText).toContain("Senior Frontend Engineer | Larkspur Logistics | 2022 – Present | Portland, OR");
    expect(resumeText).toContain("- Mentored two junior engineers through code review and pairing");
  });

  it("counts words", () => {
    expect(wordCount("  one two\nthree  ")).toBe(3);
  });
});
