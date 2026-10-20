import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { parseResumeLatex, type ParsedResumeLatex } from "@/lib/latex/resume";
import {
  entryLatexKey,
  isEmptyPlan,
  planProfileImport,
  summarySentences,
  type ImportPlan,
} from "@/lib/profile/import";
import type { Profile, ProfileEntry } from "@/lib/profile/types";

const DEMO = fs.readFileSync(
  path.join(process.cwd(), "src/server/db/fixtures/demo-resume.tex"),
  "utf8",
);

function parse(tex: string): ParsedResumeLatex {
  const result = parseResumeLatex(tex);
  if (!result.ok) throw new Error(result.message);
  return result.resume;
}

const EMPTY: Profile = { skills: [], entries: [], highlights: [] };
const now = new Date("2026-10-19T12:00:00Z");

// Builds the profile a plan would produce, as if it had been applied, so
// re-import can be tested without a database.
function profileAfter(plan: ImportPlan): Profile {
  let id = 0;
  const entries: ProfileEntry[] = plan.entries.map((entry) => {
    const entryId = ++id;
    return {
      id: entryId,
      userId: 1,
      section: entry.section,
      title: entry.title,
      dates: entry.dates,
      subtitle: entry.subtitle,
      detail: entry.detail,
      latexKey: entry.latexKey,
      source: "resume",
      sortOrder: 0,
      createdAt: now,
      bullets: entry.bullets.map((text) => ({
        id: ++id,
        userId: 1,
        entryId,
        text,
        source: "resume",
        sortOrder: 0,
        createdAt: now,
      })),
    };
  });
  return {
    skills: plan.skills.map((skill) => ({
      id: ++id,
      userId: 1,
      name: skill.name,
      nameKey: skill.name.toLowerCase(),
      category: skill.category,
      aliases: [],
      proficiency: null,
      experience: null,
      note: null,
      source: "resume",
      sourceJobId: null,
      sortOrder: 0,
      createdAt: now,
    })),
    entries,
    highlights: plan.highlights.map((text) => ({
      id: ++id,
      userId: 1,
      text,
      source: "resume",
      sourceJobId: null,
      sortOrder: 0,
      createdAt: now,
    })),
  };
}

describe("summarySentences", () => {
  it("splits sentences but keeps dotted names and decimals whole", () => {
    expect(summarySentences("Built apps in Node.js. Cut load time to 1.8s! Ready? Yes.")).toEqual([
      "Built apps in Node.js.",
      "Cut load time to 1.8s!",
      "Ready?",
      "Yes.",
    ]);
  });
});

describe("entryLatexKey", () => {
  it("ignores case and spacing, and not the dates", () => {
    expect(entryLatexKey("Web  Developer", "Graph'em")).toBe(entryLatexKey("web developer", "graph'em"));
  });
});

describe("planProfileImport into an empty profile", () => {
  const plan = planProfileImport(parse(DEMO), EMPTY);

  it("adds every skill with its category", () => {
    expect(plan.skills).toHaveLength(21);
    expect(plan.skills[0]).toEqual({ name: "TypeScript", category: "Languages" });
  });

  it("adds every entry with its section, heading, and bullets", () => {
    expect(plan.entries.map((e) => [e.section, e.title])).toEqual([
      ["Notable Projects", "Dispatch Dashboard (Larkspur Logistics)"],
      ["Notable Projects", "Component Library (Copperline Media)"],
      ["Experience", "Senior Frontend Engineer"],
      ["Experience", "Frontend Developer"],
      ["Experience", "Junior Web Developer"],
      ["Education", "Willamette Valley State University"],
    ]);
    const senior = plan.entries[2];
    expect(senior).toMatchObject({
      dates: "2022 – Present",
      subtitle: "Larkspur Logistics",
      detail: "Portland, OR",
      latexKey: entryLatexKey("Senior Frontend Engineer", "Larkspur Logistics"),
    });
    expect(senior.bullets).toHaveLength(3);
    expect(plan.entries[5].bullets).toEqual([]);
  });

  it("turns the summary's sentences into highlights", () => {
    expect(plan.highlights).toHaveLength(3);
    expect(plan.highlights[1]).toBe(
      "Led the rebuild of a real-time shipment tracking dashboard used by 400+ dispatchers.",
    );
  });
});

describe("re-importing", () => {
  it("adds nothing when the profile already has everything", () => {
    const resume = parse(DEMO);
    const profile = profileAfter(planProfileImport(resume, EMPTY));
    expect(isEmptyPlan(planProfileImport(resume, profile))).toBe(true);
  });

  it("adds only new bullets to an entry it already has, keeping the entry", () => {
    const profile = profileAfter(planProfileImport(parse(DEMO), EMPTY));
    const edited = DEMO.replace(
      "\\resumeItem{\\textbullet\\ Mentored two junior engineers through code review and pairing}",
      "\\resumeItem{\\textbullet\\ Mentored two junior engineers through code review and pairing}\n          \\resumeItem{\\textbullet\\ Ran the team's on-call rotation}",
    );
    const plan = planProfileImport(parse(edited), profile);
    const senior = profile.entries.find((e) => e.title === "Senior Frontend Engineer");
    expect(plan.entries).toEqual([]);
    expect(plan.bullets).toEqual([{ entryId: senior?.id, texts: ["Ran the team's on-call rotation"] }]);
  });

  it("matches skills by alias and ignores case", () => {
    const profile = profileAfter(planProfileImport(parse(DEMO), EMPTY));
    // The profile knows PostgreSQL; the .tex now calls it Postgres.
    profile.skills.push({ ...profile.skills[0], id: 999, name: "PostgreSQL", nameKey: "postgresql", aliases: ["Postgres"] });
    const edited = DEMO.replace("some SQL}", "some SQL, postgres, TYPESCRIPT}");
    expect(planProfileImport(parse(edited), profile).skills).toEqual([]);
  });

  it("never removes anything that's missing from the new .tex", () => {
    const profile = profileAfter(planProfileImport(parse(DEMO), EMPTY));
    const shorter = DEMO.replace(/\\section\{Notable Projects\}[\s\S]*?(?=\\section\{Experience\})/, "");
    const plan = planProfileImport(parse(shorter), profile);
    // A plan can only add; there's no way to express removal.
    expect(isEmptyPlan(plan)).toBe(true);
  });
});
