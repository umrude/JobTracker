// No "server-only" here, like compare-demo.ts: the seed imports these
// fixtures under tsx. Canned data, no I/O or secrets.
import { skillKey } from "@/lib/comparison-helpers";
import type { ParsedResumeLatex } from "@/lib/latex/resume";
import { textKey } from "@/lib/profile/import";
import type { Profile } from "@/lib/profile/types";
import type { TailoringProposal } from "@/lib/schemas/tailoring";

// Canned tailoring for demo mode, which never calls the API. Written in
// text (skill names, entry titles, original bullet text) rather than ids,
// because ids change on every reseed; resolveDemoProposal maps them to
// the current profile. Like real proposals, these go through the honesty
// checker before they're shown.

type DemoBullet = string | { original: string; text: string };

type DemoTailoring = {
  summary: string | null;
  skills: { category: string; skills: string[] }[];
  sections: {
    section: string;
    afterSection?: string | null;
    entries: { title: string; bullets: DemoBullet[] }[];
  }[];
  // Original bullet texts, least important first.
  trimOrder: string[];
  rationale: string;
};

export const DEMO_TAILORINGS: Record<string, DemoTailoring> = {
  // Northwind Robotics, Senior Frontend Engineer: a strong fit. Leads with
  // the real-time dashboard, and swaps in the volunteer map project (maps,
  // live data) for the less relevant component library.
  "https://careers.northwindrobotics.example/jobs/1821": {
    summary:
      "Frontend engineer with 6 years of experience building data-heavy React and TypeScript applications, including a real-time shipment tracking dashboard used by 400+ dispatchers. I care about performance, testing, and accessible interfaces.",
    skills: [
      { category: "Frontend", skills: ["React", "D3", "visx", "Next.js", "Tailwind CSS", "Storybook"] },
      { category: "Real-time", skills: ["WebSockets", "server-sent events"] },
      { category: "Languages", skills: ["TypeScript", "JavaScript", "HTML", "CSS"] },
      { category: "Testing", skills: ["Playwright", "Vitest", "React Testing Library", "axe-core"] },
      { category: "Tools", skills: ["Git", "GitHub Actions", "Vercel"] },
    ],
    sections: [
      {
        section: "Notable Projects",
        entries: [
          {
            title: "Dispatch Dashboard (Larkspur Logistics)",
            bullets: [
              {
                original: "Led the rebuild of a real-time shipment tracking dashboard used by 400+ dispatchers",
                text: "Led the rebuild of a real-time fleet tracking dashboard used by 400+ dispatchers",
              },
              "Cut time-to-interactive from 6s to 1.8s with virtualization and memoization",
              "Built fleet throughput charts with D3 and visx",
            ],
          },
          {
            title: "Trail Conditions Map (Volunteer)",
            bullets: ["Built a trail conditions map that club volunteers update through a simple admin form"],
          },
        ],
      },
      {
        section: "Experience",
        entries: [
          {
            title: "Senior Frontend Engineer",
            bullets: [
              "Introduced Playwright end-to-end tests and component tests in CI (GitHub Actions); flaky-test rate dropped below 1%",
              // Deliberately breaks a rule: it adds a skill (WebSockets) the
              // original bullet doesn't mention. The checker keeps the
              // original and flags it, so the demo shows the check working.
              {
                original: "Mentored two junior engineers through code review and pairing",
                text: "Mentored two junior engineers in WebSockets through code review and pairing",
              },
              "Ran keyboard-navigation and ARIA fixes across the dashboard; added axe checks to CI",
            ],
          },
          {
            title: "Frontend Developer",
            bullets: [
              "Built a Next.js publishing front end serving 2M monthly readers",
              "Wrote Node.js API routes and simple PostgreSQL queries for the editorial tools",
            ],
          },
          { title: "Junior Web Developer", bullets: ["Built responsive marketing sites with HTML, CSS, and JavaScript"] },
        ],
      },
    ],
    trimOrder: [
      "Built responsive marketing sites with HTML, CSS, and JavaScript",
      "Built a trail conditions map that club volunteers update through a simple admin form",
      "Wrote Node.js API routes and simple PostgreSQL queries for the editorial tools",
    ],
    rationale:
      "Led with the real-time dispatch dashboard and its charts, the closest match to Northwind's operator console. Swapped in the trail map project for the component library, since it shows live map data, and moved real-time skills up.",
  },

  // Bramblewood Learning, Software Engineer, Accessibility: leads with the
  // accessibility work, and pulls in a profile-only bullet (the testing and
  // accessibility guild) that isn't on the resume.
  "https://bramblewoodlearning.example/jobs/a11y-07": {
    summary: null,
    skills: [
      { category: "Testing", skills: ["axe-core", "Playwright", "React Testing Library", "Vitest"] },
      { category: "Frontend", skills: ["React", "Storybook", "Next.js", "Tailwind CSS", "D3", "visx"] },
      { category: "Languages", skills: ["HTML", "CSS", "TypeScript", "JavaScript"] },
      { category: "Tools", skills: ["Git", "GitHub Actions", "Figma (handoff only)"] },
    ],
    sections: [
      {
        section: "Experience",
        entries: [
          {
            title: "Senior Frontend Engineer",
            bullets: [
              "Ran keyboard-navigation and ARIA fixes across the dashboard; added axe checks to CI",
              "Introduced Playwright end-to-end tests and component tests in CI (GitHub Actions); flaky-test rate dropped below 1%",
              "Mentored two junior engineers through code review and pairing",
            ],
          },
          {
            title: "Frontend Developer",
            bullets: [
              "Ran a weekly front-end guild for six engineers covering testing and accessibility",
              "Built a Next.js publishing front end serving 2M monthly readers",
            ],
          },
          { title: "Junior Web Developer", bullets: ["Built responsive marketing sites with HTML, CSS, and JavaScript"] },
        ],
      },
    ],
    trimOrder: [
      "Built responsive marketing sites with HTML, CSS, and JavaScript",
      "Built a Next.js publishing front end serving 2M monthly readers",
    ],
    rationale:
      "Put the ARIA, keyboard, and axe work first, and added the front-end guild bullet from your profile because it covers teaching accessibility, which the listing asks for. Testing skills lead, and the real-time skills are dropped as irrelevant here.",
  },
};

// For jobs without a canned proposal (e.g. added during a local demo
// preview): no changes, with a note saying why.
export const DEMO_EMPTY_TAILORING: DemoTailoring = {
  summary: null,
  skills: [],
  sections: [],
  trimOrder: [],
  rationale:
    "Demo mode only has canned tailoring for some of the seeded listings. Switch to live data to tailor for this job.",
};

export function getDemoTailoring(jobUrl: string | null): DemoTailoring {
  return (jobUrl && DEMO_TAILORINGS[jobUrl]) || DEMO_EMPTY_TAILORING;
}

// Maps a text-based fixture to a proposal in the current profile's ids.
// Anything that can't be found is skipped, so a stale fixture degrades to
// a smaller proposal rather than an error.
export function resolveDemoProposal(fixture: DemoTailoring, profile: Profile, tex: ParsedResumeLatex): TailoringProposal {
  const skillByName = new Map(profile.skills.map((skill) => [skillKey(skill.name), skill]));
  const categoryByName = new Map(tex.skills.map((category) => [category.category.toLowerCase(), category.id]));
  const entryByTitle = new Map(profile.entries.map((entry) => [entry.title.toLowerCase(), entry]));
  const texSections = new Set(tex.sections.map((section) => section.title.toLowerCase()));

  const bulletId = (title: string, original: string): string | null => {
    const bullet = entryByTitle.get(title.toLowerCase())?.bullets.find((b) => textKey(b.text) === textKey(original));
    return bullet ? `bullet:${bullet.id}` : null;
  };

  return {
    summary: fixture.summary ? { text: fixture.summary, sourceIds: [] } : null,
    skills: fixture.skills.flatMap((group) => {
      const categoryId = categoryByName.get(group.category.toLowerCase());
      if (!categoryId) return [];
      const skillIds = group.skills.flatMap((name) => {
        const skill = skillByName.get(skillKey(name));
        return skill ? [`skill:${skill.id}`] : [];
      });
      return [{ categoryId, skillIds }];
    }),
    sections: fixture.sections.map((section) => ({
      section: section.section,
      isNew: !texSections.has(section.section.toLowerCase()),
      afterSection: section.afterSection ?? null,
      entries: section.entries.flatMap((entry) => {
        const profileEntry = entryByTitle.get(entry.title.toLowerCase());
        if (!profileEntry) return [];
        return [
          {
            entryId: `entry:${profileEntry.id}`,
            bullets: entry.bullets.flatMap((bullet) => {
              const original = typeof bullet === "string" ? bullet : bullet.original;
              const id = bulletId(entry.title, original);
              return id ? [{ bulletId: id, text: typeof bullet === "string" ? bullet : bullet.text }] : [];
            }),
          },
        ];
      }),
    })),
    trimOrder: fixture.sections
      .flatMap((section) => section.entries.map((entry) => entry.title))
      .flatMap((title) => fixture.trimOrder.map((text) => bulletId(title, text)))
      .filter((id): id is string => id !== null),
    rationale: fixture.rationale,
  };
}
