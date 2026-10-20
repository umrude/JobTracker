import { describe, it, expect } from "vitest";
import { createSkillResolver } from "@/lib/skills/resolver";
import type { TailoringProposal } from "@/lib/schemas/tailoring";
import { checkProposal, type CheckContext } from "@/lib/tailoring/check";
import { demoProfile, demoTex } from "@/test/demo-profile";

const profile = demoProfile();
const tex = demoTex();
const context: CheckContext = { profile, tex, resolver: createSkillResolver(profile.skills) };

// Lookups by human-readable text, so tests don't depend on id numbering.
const skillId = (name: string) => `skill:${profile.skills.find((s) => s.name === name)?.id}`;
const entry = (title: string) => {
  const found = profile.entries.find((e) => e.title === title);
  if (!found) throw new Error(`no entry ${title}`);
  return found;
};
const entryId = (title: string) => `entry:${entry(title).id}`;
const bullet = (title: string, index: number) => {
  const found = entry(title).bullets[index];
  if (!found) throw new Error(`no bullet ${index} in ${title}`);
  return { bulletId: `bullet:${found.id}`, text: found.text };
};

function proposal(overrides: Partial<TailoringProposal> = {}): TailoringProposal {
  return { summary: null, skills: [], sections: [], trimOrder: [], rationale: "", ...overrides };
}

function experience(...entries: TailoringProposal["sections"][number]["entries"]) {
  return { section: "Experience", isNew: false, afterSection: null, entries };
}

const SENIOR = "Senior Frontend Engineer";

describe("checkProposal: a faithful proposal", () => {
  it("passes through unchanged, with no issues", () => {
    const input = proposal({
      summary: {
        text: "Frontend engineer with 6 years of experience building data-heavy React and TypeScript apps, focused on testing.",
        sourceIds: ["highlight:1"],
      },
      skills: [{ categoryId: "s2", skillIds: [skillId("React"), skillId("Next.js")] }],
      sections: [
        experience({
          entryId: entryId(SENIOR),
          bullets: [bullet(SENIOR, 1), { ...bullet(SENIOR, 0), text: "Introduced Playwright end-to-end and component tests in CI (GitHub Actions); flaky-test rate fell below 1%" }],
        }),
      ],
      trimOrder: [bullet(SENIOR, 1).bulletId],
    });
    const result = checkProposal(input, context);
    expect(result.issues).toEqual([]);
    expect(result.proposal).toEqual(input);
  });
});

describe("checkProposal: bullets", () => {
  const source = bullet(SENIOR, 0);

  it("keeps the original when a rewording invents a number", () => {
    const result = checkProposal(
      proposal({ sections: [experience({ entryId: entryId(SENIOR), bullets: [{ ...source, text: "Introduced Playwright tests in CI, cutting bugs by 40%; flaky rate below 1%" }] })] }),
      context,
    );
    expect(result.proposal.sections[0]?.entries[0]?.bullets[0]?.text).toBe(source.text);
    expect(result.issues).toEqual([
      expect.objectContaining({ itemId: source.bulletId, kinds: ["new_number"], resolution: "kept_original" }),
    ]);
    expect(result.issues[0]?.message).toContain('"40"');
  });

  it("keeps the original when a rewording adds a skill the original didn't mention", () => {
    // Leaflet is a personal-project skill: never woven into a job's bullets.
    const result = checkProposal(
      proposal({ sections: [experience({ entryId: entryId(SENIOR), bullets: [{ ...source, text: "Introduced Playwright and Leaflet tests in CI (GitHub Actions); flaky rate below 1%" }] })] }),
      context,
    );
    expect(result.issues[0]).toMatchObject({ kinds: ["new_skill"], resolution: "kept_original" });
    expect(result.issues[0]?.message).toContain('"Leaflet"');
  });

  it("keeps the original when a rewording grows too much", () => {
    const result = checkProposal(
      proposal({
        sections: [experience({ entryId: entryId(SENIOR), bullets: [{ ...source, text: `${source.text}, working closely with QA, product, and design on every release cycle` }] })],
      }),
      context,
    );
    expect(result.issues[0]?.kinds).toEqual(["too_long"]);
  });

  it("removes a bullet placed under another entry", () => {
    const foreign = bullet("Frontend Developer", 0);
    const result = checkProposal(
      proposal({ sections: [experience({ entryId: entryId(SENIOR), bullets: [source, foreign] })] }),
      context,
    );
    expect(result.proposal.sections[0]?.entries[0]?.bullets).toEqual([source]);
    expect(result.issues).toEqual([expect.objectContaining({ itemId: foreign.bulletId, kinds: ["moved_bullet"], resolution: "removed" })]);
  });

  it("removes unknown ids", () => {
    const result = checkProposal(
      proposal({ sections: [experience({ entryId: entryId(SENIOR), bullets: [source, { bulletId: "bullet:999", text: "Invented" }] })] }),
      context,
    );
    expect(result.issues).toEqual([expect.objectContaining({ itemId: "bullet:999", kinds: ["unknown_id"] })]);
  });

  it("keeps an entry's original bullets rather than leaving it empty", () => {
    const result = checkProposal(proposal({ sections: [experience({ entryId: entryId(SENIOR), bullets: [] })] }), context);
    expect(result.proposal.sections[0]?.entries[0]?.bullets).toHaveLength(entry(SENIOR).bullets.length);
    expect(result.issues[0]).toMatchObject({ kinds: ["empty_entry"], resolution: "kept_original" });
  });
});

describe("checkProposal: skills", () => {
  it("removes Learning skills, unknown skills, and unknown categories", () => {
    const result = checkProposal(
      proposal({
        skills: [
          { categoryId: "s5", skillIds: [skillId("Git"), skillId("Docker"), "skill:999"] },
          { categoryId: "s99", skillIds: [skillId("React")] },
        ],
      }),
      context,
    );
    expect(result.proposal.skills).toEqual([{ categoryId: "s5", skillIds: [skillId("Git")] }]);
    expect(result.issues.map((issue) => issue.kinds[0])).toEqual(["learning_skill", "unknown_id", "unknown_category"]);
  });

  it("drops a skill listed twice", () => {
    const result = checkProposal(
      proposal({ skills: [{ categoryId: "s1", skillIds: [skillId("TypeScript"), skillId("TypeScript")] }] }),
      context,
    );
    expect(result.proposal.skills[0]?.skillIds).toEqual([skillId("TypeScript")]);
  });
});

describe("checkProposal: summary", () => {
  it("keeps the original summary when it invents a number", () => {
    const result = checkProposal(
      proposal({ summary: { text: "Frontend engineer with 9 years of React and TypeScript experience.", sourceIds: [] } }),
      context,
    );
    expect(result.proposal.summary).toBeNull();
    expect(result.issues[0]).toMatchObject({ itemId: "summary", kinds: ["new_number"], resolution: "kept_original" });
  });

  it("keeps the original summary when it claims a Learning or unknown skill", () => {
    const docker = checkProposal(
      proposal({ summary: { text: "Frontend engineer shipping React apps with Docker.", sourceIds: [] } }),
      context,
    );
    expect(docker.issues[0]?.kinds).toEqual(["unbacked_skill"]);
    const kubernetes = checkProposal(
      proposal({ summary: { text: "Frontend engineer running React apps on Kubernetes.", sourceIds: [] } }),
      context,
    );
    expect(kubernetes.issues[0]?.message).toContain('"Kubernetes"');
  });

  it("allows numbers found anywhere in the profile", () => {
    // "400+" is in a bullet and a highlight, not only the summary.
    const result = checkProposal(
      proposal({ summary: { text: "Frontend engineer who rebuilt a dashboard used by 400+ dispatchers, in React.", sourceIds: [] } }),
      context,
    );
    expect(result.issues).toEqual([]);
  });

  it("drops unknown source ids without flagging", () => {
    const result = checkProposal(
      proposal({ summary: { text: "Frontend engineer building React apps.", sourceIds: ["highlight:1", "highlight:999"] } }),
      context,
    );
    expect(result.proposal.summary?.sourceIds).toEqual(["highlight:1"]);
  });
});

describe("checkProposal: sections", () => {
  it("adds a profile entry that isn't on the resume to its own section", () => {
    const trail = "Trail Conditions Map (Volunteer)";
    const result = checkProposal(
      proposal({
        sections: [
          {
            section: "Notable Projects",
            isNew: false,
            afterSection: null,
            entries: [{ entryId: entryId(trail), bullets: [bullet(trail, 1)] }],
          },
        ],
      }),
      context,
    );
    expect(result.issues).toEqual([]);
  });

  it("removes an entry placed in a section it doesn't belong to", () => {
    const result = checkProposal(
      proposal({ sections: [experience({ entryId: entryId("Mentor"), bullets: [bullet("Mentor", 0)] })] }),
      context,
    );
    expect(result.proposal.sections).toEqual([]);
    expect(result.issues.map((issue) => issue.kinds[0])).toEqual(["wrong_section", "empty_entry"]);
  });

  it("treats a section the resume doesn't have as new, whatever the model said", () => {
    const result = checkProposal(
      proposal({
        sections: [
          { section: "Volunteering", isNew: false, afterSection: "Experience", entries: [{ entryId: entryId("Mentor"), bullets: [bullet("Mentor", 0)] }] },
        ],
      }),
      context,
    );
    expect(result.proposal.sections[0]).toMatchObject({ section: "Volunteering", isNew: true, afterSection: "Experience" });
  });

  it("ignores an afterSection that doesn't exist", () => {
    const result = checkProposal(
      proposal({
        sections: [
          { section: "Volunteering", isNew: true, afterSection: "Hobbies", entries: [{ entryId: entryId("Mentor"), bullets: [bullet("Mentor", 0)] }] },
        ],
      }),
      context,
    );
    expect(result.proposal.sections[0]?.afterSection).toBeNull();
  });

  it("drops trimOrder ids that aren't in the result", () => {
    const result = checkProposal(
      proposal({
        sections: [experience({ entryId: entryId(SENIOR), bullets: [bullet(SENIOR, 0)] })],
        trimOrder: [bullet(SENIOR, 0).bulletId, bullet(SENIOR, 2).bulletId, "bullet:999"],
      }),
      context,
    );
    expect(result.proposal.trimOrder).toEqual([bullet(SENIOR, 0).bulletId]);
  });
});
