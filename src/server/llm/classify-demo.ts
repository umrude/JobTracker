// No "server-only" here, like the other demo fixtures: the seed and tests
// use it. Canned data, no I/O or secrets.
import type { Classification } from "@/lib/schemas/email";

// Canned classifier answers for demo mode, so it never calls the API.
// Keyed by demo inbox message id (demo-inbox.ts). classify-demo.test.ts
// checks every demo email the pre-filter keeps has one, and that each
// passes classificationSchema. They're what a good classifier should say,
// including the tricky ones: the reschedule is an interview, and the cold
// recruiter is not relevant. Company and role are null where the email
// doesn't name them (the thread-only rejection, the reschedule).

export const DEMO_CLASSIFIER_MODEL = "demo";

export const DEMO_CLASSIFICATIONS: Record<string, Classification> = {
  "demo-cobalt-ack": {
    type: "acknowledged",
    confidence: 0.97,
    reason: "Automated confirmation that the application was received; no decision yet.",
    company: "Cobalt Harbor",
    role: "Backend Engineer (Node.js)",
  },
  "demo-fenwick-ack": {
    type: "acknowledged",
    confidence: 0.95,
    reason: "Confirms the application arrived and says next steps will follow.",
    company: "Fenwick & Vale",
    role: "Data Analyst",
  },
  "demo-fenwick-reject": {
    type: "rejection",
    confidence: 0.96,
    reason: "Says they've decided to move forward with other candidates.",
    company: null,
    role: null,
  },
  "demo-driftwood-interview": {
    type: "interview",
    confidence: 0.95,
    reason: "Invites you to a 45-minute call with the engineering lead and asks for times.",
    company: null,
    role: "Full-Stack Developer",
  },
  "demo-marrow-assessment": {
    type: "assessment",
    confidence: 0.96,
    reason: "Asks you to complete a take-home assessment within 5 days.",
    company: "Marrow Biotech",
    role: "QA Automation Engineer",
  },
  "demo-solstice-reschedule": {
    type: "interview",
    confidence: 0.88,
    reason: "Asks to move an existing interview to Monday: a reschedule, not a rejection.",
    company: null,
    role: null,
  },
  "demo-hearthstone-offer": {
    type: "offer",
    confidence: 0.97,
    reason: "Congratulates you and attaches an offer letter.",
    company: "Hearthstone Logistics",
    role: "Site Reliability Engineer",
  },
  "demo-ironclad-reject": {
    type: "rejection",
    confidence: 0.95,
    reason: "Says they won't be moving forward with the application.",
    company: "Ironclad Ledger",
    role: "Engineering Manager",
  },
  "demo-recruiter-outreach": {
    type: "not_relevant",
    confidence: 0.82,
    reason: "A recruiter pitching a different role, not a reply to one of your applications.",
    company: null,
    role: "Senior Frontend Engineer",
  },
  "demo-northwind-ack": {
    type: "acknowledged",
    confidence: 0.96,
    reason: "Automated confirmation that the application was received.",
    company: "Northwind Robotics",
    role: "Senior Frontend Engineer",
  },
  "demo-pinecrest-ack": {
    type: "acknowledged",
    confidence: 0.96,
    reason: "Confirms the application for Frontend Engineer was received.",
    company: "Pinecrest Labs",
    role: "Frontend Engineer",
  },
  "demo-alderfinch-interview": {
    type: "interview",
    confidence: 0.9,
    reason: "Says thanks for applying, then asks to set up a 30-minute call.",
    company: "Alder & Finch",
    role: "Product Designer",
  },
};

const UNKNOWN: Classification = {
  type: "not_relevant",
  confidence: 0.5,
  reason: "No canned classification for this demo email.",
  company: null,
  role: null,
};

export function demoClassification(messageId: string): Classification {
  return DEMO_CLASSIFICATIONS[messageId] ?? UNKNOWN;
}
