import fs from "node:fs";
import path from "node:path";
import { skillKey } from "@/lib/comparison-helpers";
import { parseResumeLatex, type ParsedResumeLatex } from "@/lib/latex/resume";
import { planProfileImport } from "@/lib/profile/import";
import type { Profile, ProfileBullet, ProfileEntry, ProfileSkill } from "@/lib/profile/types";
import type { Experience, Proficiency } from "@/lib/schemas/profile";

// Alex's demo profile, built in memory for tests: the demo .tex imported
// with the real planner (as the seed does), plus extras that aren't on the
// resume. Ids are assigned per kind, like database rows.

export const DEMO_TEX = fs.readFileSync(
  path.join(process.cwd(), "src/server/db/fixtures/demo-resume.tex"),
  "utf8",
);

export function demoTex(): ParsedResumeLatex {
  const parsed = parseResumeLatex(DEMO_TEX);
  if (!parsed.ok) throw new Error(parsed.message);
  return parsed.resume;
}

const now = new Date("2026-10-19T12:00:00Z");

export function demoProfile(): Profile {
  const plan = planProfileImport(demoTex(), { skills: [], entries: [], highlights: [] });
  let skillId = 0;
  let entryId = 0;
  let bulletId = 0;
  let highlightId = 0;

  const skill = (
    name: string,
    category: string,
    extra: { proficiency?: Proficiency; experience?: Experience; note?: string; source?: ProfileSkill["source"] } = {},
  ): ProfileSkill => ({
    id: ++skillId,
    userId: 1,
    name,
    nameKey: skillKey(name),
    category,
    aliases: [],
    proficiency: extra.proficiency ?? null,
    experience: extra.experience ?? null,
    note: extra.note ?? null,
    source: extra.source ?? "resume",
    sourceJobId: null,
    sortOrder: skillId,
    createdAt: now,
  });

  const bullets = (owner: number, texts: string[], source: ProfileBullet["source"] = "resume"): ProfileBullet[] =>
    texts.map((text) => ({ id: ++bulletId, userId: 1, entryId: owner, text, source, sortOrder: bulletId, createdAt: now }));

  const entry = (
    fields: Pick<ProfileEntry, "section" | "title" | "dates" | "subtitle" | "detail" | "latexKey" | "source">,
    texts: string[],
  ): ProfileEntry => {
    const id = ++entryId;
    return { id, userId: 1, sortOrder: id, createdAt: now, ...fields, bullets: bullets(id, texts, fields.source) };
  };

  const entries = plan.entries.map((planned) =>
    entry(
      {
        section: planned.section,
        title: planned.title,
        dates: planned.dates,
        subtitle: planned.subtitle,
        detail: planned.detail,
        latexKey: planned.latexKey,
        source: "resume",
      },
      planned.bullets,
    ),
  );

  // Extras that aren't on the resume.
  entries.push(
    entry(
      {
        section: "Notable Projects",
        title: "Trail Conditions Map (Volunteer)",
        dates: "2023",
        subtitle: "Community Hiking Club Site",
        detail: "Next.js, Leaflet",
        latexKey: null,
        source: "added",
      },
      [
        "Built a trail conditions map that club volunteers update through a simple admin form",
        "Cut page weight by 60% by lazy-loading the map layers",
      ],
    ),
    entry(
      {
        section: "Volunteering",
        title: "Mentor",
        dates: "2024",
        subtitle: "Code Club",
        detail: "Portland, OR",
        latexKey: null,
        source: "added",
      },
      ["Taught weekly web development sessions to 12 high school students"],
    ),
  );
  const copperline = entries.find((e) => e.title === "Frontend Developer");
  copperline?.bullets.push(
    ...bullets(copperline.id, ["Ran a weekly front-end guild for six engineers covering testing and accessibility"], "added"),
  );

  const skills = plan.skills.map((planned) => skill(planned.name, planned.category));
  for (const s of skills) {
    if (s.name === "TypeScript" || s.name === "React") Object.assign(s, { proficiency: "expert", experience: "professional" });
  }
  skills.push(
    skill("Python", "Languages", { proficiency: "familiar", experience: "coursework", note: "University coursework.", source: "added" }),
    skill("Leaflet", "Frontend", { proficiency: "proficient", experience: "personal", note: "Trail conditions map.", source: "added" }),
    skill("Docker", "Tools", { proficiency: "learning", experience: "personal", source: "added" }),
  );

  const highlights = [...plan.highlights, "Comfortable owning features from design handoff to production."].map(
    (text, index) => ({
      id: ++highlightId,
      userId: 1,
      text,
      source: index < plan.highlights.length ? ("resume" as const) : ("added" as const),
      sourceJobId: null,
      sortOrder: highlightId,
      createdAt: now,
    }),
  );

  return { skills, entries, highlights };
}
