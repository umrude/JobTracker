// No "server-only" here, like schema.ts: the seed script (pnpm db:seed)
// imports these fixtures under tsx, outside Next's bundler, where the real
// "server-only" package throws. This file is canned data with no I/O or
// secrets, so the risk that rule guards against doesn't apply.
import { comparisonSchema, type Comparison, type ComparisonInput } from "@/lib/schemas/comparison";

// Canned comparison results for demo mode, so it never calls the API.
// Keyed by job URL, not id: URLs stay the same across reseeds, ids don't.
// Each one matches the seeded resume (SEED_RESUME_V2) against the seeded
// listing with that URL; compare-demo.test.ts checks every seeded saved
// job has a fixture and that every fixture passes comparisonSchema.

export const DEMO_MODEL = "demo";

export const DEMO_COMPARISONS: Record<string, ComparisonInput> = {
  // Northwind Robotics, Senior Frontend Engineer: strong fit.
  "https://careers.northwindrobotics.example/jobs/1821": {
    score: 88,
    matchedSkills: [
      "React",
      "TypeScript",
      "Real-time data (WebSockets)",
      "Performance work on data-heavy UIs",
      "D3",
      "Playwright end-to-end tests",
      "CI",
      "Mentoring",
    ],
    missingSkills: ["Canvas/WebGL rendering", "Logistics or industrial software (partial)"],
    missingKeywords: ["telemetry", "fleet", "WebGL", "accessibility reviews"],
    suggestions: [
      "Lead with the shipment tracking dashboard: it's the closest match to their operator console. Mention 'live telemetry' if the data was real-time vehicle positions.",
      "Larkspur Logistics is logistics software, which the listing names as a nice-to-have. Say so explicitly in the summary.",
      "Mention the axe checks and ARIA work as 'accessibility reviews', the listing's wording.",
    ],
  },

  // Tidewater Labs, Full-Stack Engineer: partial fit.
  "https://tidewaterlabs.example/careers/fse-112": {
    score: 64,
    matchedSkills: ["TypeScript", "React", "Next.js", "Node.js"],
    missingSkills: [
      "Production PostgreSQL experience",
      "AWS (ECS, RDS, S3)",
      "tRPC",
      "Background job workers",
    ],
    missingKeywords: ["App Router", "PostgreSQL schema design", "AWS", "tRPC", "support rotation"],
    suggestions: [
      "Expand the Copperline bullet about Node.js API routes and PostgreSQL queries: name the tables or features, and any migrations you wrote.",
      "If the Next.js front end used the App Router, say so; the listing asks for it by name.",
      "Add any AWS or other cloud deployment experience, even small, if you have it. Vercel counts for something but isn't AWS.",
    ],
  },

  // Bramblewood Learning, Software Engineer, Accessibility: partial fit.
  "https://bramblewoodlearning.example/jobs/a11y-07": {
    score: 58,
    matchedSkills: ["React", "ARIA", "Keyboard interaction patterns", "axe-core", "Playwright"],
    missingSkills: [
      "Screen reader testing (NVDA, JAWS, VoiceOver)",
      "WCAG 2.2 AA audits",
      "Focus management for complex widgets",
      "Accessibility guidelines and workshops",
    ],
    missingKeywords: ["WCAG 2.2", "NVDA", "JAWS", "VoiceOver", "screen reader", "IAAP"],
    suggestions: [
      "Turn the ARIA and keyboard-navigation bullet into its own accomplishment: what you fixed, against which WCAG criteria, and the result.",
      "If you've tested with any screen reader, name it. The listing requires at least one.",
      "The Storybook component library is relevant: say whether you documented accessible usage patterns in it.",
    ],
  },

  // Granite & Gale, Backend Engineer, Data Platform: weak fit.
  "https://graniteandgale.example/careers/be-data-3": {
    score: 22,
    matchedSkills: ["SQL (basic)"],
    missingSkills: [
      "Go, Rust, or Java",
      "Kafka or another message queue",
      "Stream processing (Flink)",
      "Time-series databases (TimescaleDB, ClickHouse)",
      "Kubernetes",
      "Terraform",
      "On-call ownership",
      // A nice-to-have in the listing. Alex has Python in their profile
      // (coursework) but not on the resume, so the demo shows "In profile".
      "Python",
    ],
    missingKeywords: ["Go", "Kafka", "Flink", "ClickHouse", "Kubernetes", "Terraform", "distributed systems"],
    suggestions: [
      "This role is a large step away from your frontend experience. If you want to pursue it, a backend side project in Go with a message queue would be the most convincing addition.",
      "Mention any work consuming real-time event streams on the dashboard side, since it's adjacent to their ingestion pipeline.",
    ],
  },

  // Pebblebrook Health, Product Designer: weak fit.
  "https://pebblebrookhealth.example/careers/4410": {
    score: 18,
    matchedSkills: ["Figma (handoff)", "Partnering with engineers"],
    missingSkills: [
      "Product design portfolio",
      "User research and usability studies",
      "Interaction and visual design",
      "Expert Figma (components, auto layout)",
      "Design systems ownership",
    ],
    missingKeywords: ["user research", "usability testing", "prototypes", "wireframes", "design system"],
    suggestions: [
      "This is a design role and your resume is engineering-focused. If you're interested in a design-engineering hybrid, highlight the Storybook component library and any UI decisions you led.",
      "Mention any usability testing you took part in on the dispatcher dashboard.",
    ],
  },
};

// For jobs added during a local demo preview, which have no fixture. It's
// deliberately generic so it doesn't pretend to have analyzed the listing.
export const DEMO_FALLBACK_COMPARISON: ComparisonInput = {
  score: 50,
  matchedSkills: ["React", "TypeScript"],
  missingSkills: ["(Demo mode) This listing has no canned result."],
  missingKeywords: [],
  suggestions: [
    "Demo mode uses canned results for the seeded listings only. Switch back to live data and add an API key to compare this listing for real.",
  ],
};

// Runs the fixture through comparisonSchema, so demo results go through
// the same validation (and any transforms) as live ones.
export function getDemoComparison(jobUrl: string | null): Comparison {
  const fixture = (jobUrl && DEMO_COMPARISONS[jobUrl]) || DEMO_FALLBACK_COMPARISON;
  return comparisonSchema.parse(fixture);
}
