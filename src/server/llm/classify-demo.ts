// No "server-only" here, like the other demo fixtures: the seed and tests
// use it. Canned data, no I/O or secrets.
import type { Classification } from "@/lib/schemas/email";

// Canned classifier answers for demo mode, so it never calls the API.
// Keyed by demo inbox message id (demo-inbox.ts). classify-demo.test.ts
// checks every demo email the pre-filter keeps has one, and that each
// passes classificationSchema. They're what a good classifier should say,
// including the tricky ones: the reschedule is an interview, and the cold
// recruiter is not relevant.

export const DEMO_CLASSIFIER_MODEL = "demo";

export const DEMO_CLASSIFICATIONS: Record<string, Classification> = {
  "demo-cobalt-ack": {
    type: "acknowledged",
    confidence: 0.97,
    reason: "Automated confirmation that the application was received; no decision yet.",
  },
  "demo-fenwick-ack": {
    type: "acknowledged",
    confidence: 0.95,
    reason: "Confirms the application arrived and says next steps will follow.",
  },
  "demo-fenwick-reject": {
    type: "rejection",
    confidence: 0.96,
    reason: "Says they've decided to move forward with other candidates.",
  },
  "demo-driftwood-interview": {
    type: "interview",
    confidence: 0.95,
    reason: "Invites you to a 45-minute call with the engineering lead and asks for times.",
  },
  "demo-marrow-assessment": {
    type: "assessment",
    confidence: 0.96,
    reason: "Asks you to complete a take-home assessment within 5 days.",
  },
  "demo-solstice-reschedule": {
    type: "interview",
    confidence: 0.88,
    reason: "Asks to move an existing interview to Monday: a reschedule, not a rejection.",
  },
  "demo-hearthstone-offer": {
    type: "offer",
    confidence: 0.97,
    reason: "Congratulates you and attaches an offer letter.",
  },
  "demo-ironclad-reject": {
    type: "rejection",
    confidence: 0.95,
    reason: "Says they won't be moving forward with the application.",
  },
  "demo-recruiter-outreach": {
    type: "not_relevant",
    confidence: 0.82,
    reason: "A recruiter pitching a different role, not a reply to one of your applications.",
  },
};

const UNKNOWN: Classification = {
  type: "not_relevant",
  confidence: 0.5,
  reason: "No canned classification for this demo email.",
};

export function demoClassification(messageId: string): Classification {
  return DEMO_CLASSIFICATIONS[messageId] ?? UNKNOWN;
}
