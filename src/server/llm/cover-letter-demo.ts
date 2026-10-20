// No "server-only" here, like the other demo fixtures: the seed imports
// these under tsx. Canned data, no I/O or secrets.
import type { CoverLetterOutput } from "@/lib/schemas/cover-letter";

// Canned cover letters for demo mode, which never calls the API. Written
// only from Alex's resume, highlights, and the listings (a test checks
// they raise no warnings). Demo letters are "standard" length and don't
// change with the tone and length options.

export const DEMO_COVER_LETTERS: Record<string, CoverLetterOutput> = {
  "https://careers.northwindrobotics.example/jobs/1821": {
    greeting: "Dear Northwind Robotics hiring team,",
    paragraphs: [
      "I'm applying for the Senior Frontend Engineer role. For the past several years I've built data-heavy React and TypeScript interfaces, most recently leading the rebuild of a real-time shipment tracking dashboard used by 400+ dispatchers at Larkspur Logistics. Your operator console, showing live telemetry for a fleet of 50+ robots, is exactly the kind of product I most enjoy building.",
      "On that dashboard I cut time-to-interactive from 6s to 1.8s with virtualization and memoization, and built fleet throughput charts with D3 and visx. I also introduced Playwright end-to-end and component tests in CI, which brought our flaky-test rate below 1%, and ran keyboard-navigation and ARIA fixes with automated checks in CI. The quality bar you describe is one I already work to.",
      "I've mentored two junior engineers through code review and pairing, and I'd be glad to do the same on your team while working closely with robotics and design. Outside work, I built a trail conditions map for my hiking club, which taught me a lot about keeping map-heavy pages fast.",
      "Thank you for considering my application. I'd welcome the chance to talk about the console and how I could help.",
    ],
    closing: "Sincerely,",
  },
  "https://bramblewoodlearning.example/jobs/a11y-07": {
    greeting: "Dear Bramblewood Learning hiring team,",
    paragraphs: [
      "I'm applying for the Software Engineer, Accessibility role. I'm a frontend engineer with 6 years of experience in React and TypeScript, and accessibility is the part of my work I care about most: interfaces should work for everyone.",
      "At Larkspur Logistics I ran keyboard-navigation and ARIA fixes across a real-time dashboard used by 400+ dispatchers, and added automated accessibility checks to CI so regressions are caught before they ship. I also introduced Playwright end-to-end and component tests, which brought our flaky-test rate below 1%.",
      "Teaching is a big part of this role, and it's something I already do. I ran a weekly front-end guild for six engineers covering testing and accessibility, and I've mentored two junior engineers through code review and pairing. Earlier, at Copperline Media, I built a shared React component library with Storybook, the kind of foundation your component library audit would start from.",
      "Screen-reader testing is the area I most want to grow in, and I'd be glad to learn it alongside your team. Thank you for considering my application; I'd welcome the chance to talk.",
    ],
    closing: "Sincerely,",
  },
};

// For jobs without a canned letter (e.g. added during a local preview).
export const DEMO_FALLBACK_COVER_LETTER: CoverLetterOutput = {
  greeting: "Dear hiring team,",
  paragraphs: [
    "Demo mode only has canned cover letters for some of the seeded listings. Switch to live data to write one for this job.",
  ],
  closing: "Sincerely,",
};

export function getDemoCoverLetter(jobUrl: string | null): CoverLetterOutput {
  return (jobUrl && DEMO_COVER_LETTERS[jobUrl]) || DEMO_FALLBACK_COVER_LETTER;
}
