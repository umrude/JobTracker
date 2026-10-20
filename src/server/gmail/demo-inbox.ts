// No "server-only" here, like the other demo fixtures: the seed and tests
// use it. Fake emails, no I/O or secrets.
import type { EmailMeta } from "@/lib/schemas/email";

// Demo mode's inbox, used instead of Gmail (demo mode never calls Google).
// Fictional companies and people, matching the seeded applications, plus
// the noise and traps a real inbox has. Dates are relative to `now`, so
// the demo always looks recent. See docs/gmail-sync.md.

export type DemoEmail = { meta: EmailMeta; body: string };

type Fixture = {
  id: string;
  thread: string;
  from: [name: string, address: string];
  subject: string;
  snippet: string;
  daysAgo: number;
  labels?: string[];
  body?: string;
};

const FIXTURES: Fixture[] = [
  // ---- Real hiring news ----
  {
    id: "demo-cobalt-ack",
    thread: "t-cobalt",
    from: ["Cobalt Harbor Recruiting", "no-reply@greenhouse-mail.io"],
    subject: "Thank you for applying to Cobalt Harbor",
    snippet: "Hi Alex, thanks for your interest in the Backend Engineer (Node.js) role. We've received your application and our team will review it.",
    daysAgo: 23,
    labels: ["INBOX", "CATEGORY_UPDATES"],
  },
  {
    id: "demo-fenwick-ack",
    thread: "t-fenwick",
    from: ["Fenwick & Vale Talent", "talent@hire.lever.co"],
    subject: "Your application for Data Analyst at Fenwick & Vale",
    snippet: "We received your application for Data Analyst and will be in touch about next steps.",
    daysAgo: 20,
  },
  // A reply in the same thread that never names the company: only thread
  // matching can link it.
  {
    id: "demo-fenwick-reject",
    thread: "t-fenwick",
    from: ["Priya Natarajan", "priya.n@fenwickvale.example"],
    subject: "Update on your application",
    snippet: "Thanks for your patience. Unfortunately, we've decided to move forward with other candidates for this role.",
    daysAgo: 3,
  },
  {
    id: "demo-driftwood-interview",
    thread: "t-driftwood",
    from: ["Sam Ortiz", "sam@driftwoodanalytics.example"],
    subject: "Interview invitation: Full-Stack Developer",
    snippet: "Hi Alex, we'd love to set up a 45-minute call with our engineering lead next week. What times work for you?",
    daysAgo: 2,
  },
  {
    id: "demo-marrow-assessment",
    thread: "t-marrow",
    from: ["Marrow Biotech", "no-reply@ashbyhq.com"],
    subject: "Next step: technical assessment for QA Automation Engineer",
    snippet: "Thanks for chatting with us. Please complete the take-home assessment within 5 days.",
    daysAgo: 5,
  },
  // "Unfortunately" and "interview" together: a reschedule, not a rejection.
  {
    id: "demo-solstice-reschedule",
    thread: "t-solstice",
    from: ["Dana Kim", "dana@solsticeinteractive.example"],
    subject: "Unfortunately we need to reschedule your interview",
    snippet: "So sorry for the late notice. Could we move Thursday's interview to Monday at 10am?",
    daysAgo: 1,
  },
  // Already at Offer: classified, but suggests no change.
  {
    id: "demo-hearthstone-offer",
    thread: "t-hearthstone",
    from: ["Hearthstone Logistics People Team", "people@hearthstonelogistics.example"],
    subject: "Offer letter: Site Reliability Engineer",
    snippet: "Congratulations! Please find your offer letter attached. We'd love to hear back by Friday.",
    daysAgo: 4,
  },
  // Already Rejected: suggests no change.
  {
    id: "demo-ironclad-reject",
    thread: "t-ironclad",
    from: ["Ironclad Ledger", "careers@ironcladledger.example"],
    subject: "Your application to Ironclad Ledger",
    snippet: "Thank you for your interest in the Engineering Manager role. Unfortunately, we won't be moving forward.",
    daysAgo: 30,
  },
  // A cold recruiter: matches no application, and isn't news about one.
  {
    id: "demo-recruiter-outreach",
    thread: "t-recruiter",
    from: ["Taylor Brooks", "taylor@brightpathtalent.example"],
    subject: "Interview request: Senior Frontend Engineer role",
    snippet: "I came across your profile and have a client looking for a senior frontend engineer. Open to a quick chat?",
    daysAgo: 6,
  },

  // ---- Noise the pre-filter should drop ----
  // Your employer, not the "Larkspur Systems" you applied to.
  {
    id: "demo-employer-allhands",
    thread: "t-allhands",
    from: ["Larkspur Logistics", "announcements@larkspurlogistics.example"],
    subject: "All-hands: Q4 roadmap",
    snippet: "Join us Thursday for the Q4 roadmap all-hands in the main room.",
    daysAgo: 3,
  },
  // A company you applied to, but its newsletter.
  {
    id: "demo-driftwood-newsletter",
    thread: "t-newsletter",
    from: ["Driftwood Analytics", "news@driftwoodanalytics.example"],
    subject: "Driftwood Analytics product update: October",
    snippet: "New dashboards, faster exports, and what's next on our roadmap.",
    daysAgo: 8,
    labels: ["CATEGORY_PROMOTIONS"],
  },
  {
    id: "demo-promo",
    thread: "t-promo",
    from: ["Gadget Shop", "deals@gadgetshop.example"],
    subject: "Special offer: 50% off headphones",
    snippet: "This weekend only. Your exclusive offer is waiting.",
    daysAgo: 2,
    labels: ["CATEGORY_PROMOTIONS"],
  },
  {
    id: "demo-job-alert",
    thread: "t-alert",
    from: ["JobBoard Alerts", "alerts@jobboard.example"],
    subject: "12 new jobs matching frontend engineer",
    snippet: "Your next interview could be one click away. See today's matches.",
    daysAgo: 1,
    labels: ["CATEGORY_PROMOTIONS"],
  },
  {
    id: "demo-personal",
    thread: "t-personal",
    from: ["Jordan", "jordan@example.com"],
    subject: "Dinner Friday?",
    snippet: "Are you free Friday? Thinking of trying the new place on Alder.",
    daysAgo: 2,
  },
];

export function demoInbox(now: Date): DemoEmail[] {
  return FIXTURES.map((fixture) => ({
    meta: {
      id: fixture.id,
      threadId: fixture.thread,
      fromName: fixture.from[0],
      fromAddress: fixture.from[1],
      subject: fixture.subject,
      snippet: fixture.snippet,
      receivedAt: new Date(now.getTime() - fixture.daysAgo * 24 * 60 * 60 * 1000),
      labels: fixture.labels ?? ["INBOX"],
    },
    body: fixture.body ?? fixture.snippet,
  }));
}
