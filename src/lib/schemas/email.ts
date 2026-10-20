import { z } from "zod";
import type { Status } from "@/lib/schemas/status";

// Gmail sync (docs/gmail-sync.md): what an email looks like to the app,
// how it's classified, and what each classification suggests.

// What the app reads from an email before deciding whether it matters:
// headers and Gmail's snippet. Never the body (that's fetched on demand,
// only for candidates, and never stored).
export const emailMetaSchema = z.object({
  id: z.string(),
  threadId: z.string(),
  fromAddress: z.string(),
  fromName: z.string(),
  subject: z.string(),
  snippet: z.string(),
  receivedAt: z.date(),
  // Gmail label ids, e.g. "INBOX", "CATEGORY_PROMOTIONS".
  labels: z.array(z.string()),
});

export type EmailMeta = z.infer<typeof emailMetaSchema>;

// What the classifier decides an email is about.
export const EMAIL_TYPES = ["acknowledged", "interview", "assessment", "rejection", "offer", "not_relevant"] as const;
export const emailTypeSchema = z.enum(EMAIL_TYPES);
export type EmailType = z.infer<typeof emailTypeSchema>;

// The status each type suggests. An assessment (take-home, coding test)
// is part of the interview process. Not-relevant suggests nothing.
export const STATUS_FOR_EMAIL_TYPE: Record<EmailType, Status | null> = {
  acknowledged: "acknowledged",
  interview: "interviewing",
  assessment: "interviewing",
  rejection: "rejected",
  offer: "offer",
  not_relevant: null,
};

// Where a suggestion came from: an email, or the ghosted rule (no email
// activity for a while).
export const SUGGESTION_SOURCES = ["email", "ghosted"] as const;
export type SuggestionSource = (typeof SUGGESTION_SOURCES)[number];

// Every suggestion waits for you. Nothing changes a status until you
// confirm it.
export const SUGGESTION_STATES = ["pending", "confirmed", "dismissed"] as const;
export type SuggestionState = (typeof SUGGESTION_STATES)[number];

// How an email was linked to an application (see lib/email/matching.ts).
export const MATCH_METHODS = ["thread", "company", "company_title", "manual"] as const;
export type MatchMethod = (typeof MATCH_METHODS)[number];

// The classifier's answer. Two schemas, as in comparison.ts: the output
// schema is sent to the model (structured outputs), so its guidance is in
// .describe() text; classificationSchema validates and tidies the result.
// A wrong type fails (and retries); an out-of-range confidence or an
// overlong reason is cleaned up instead.
export const classificationOutputSchema = z.object({
  type: emailTypeSchema.describe("What the email is about, per the definitions."),
  confidence: z
    .number()
    .describe("How sure you are, from 0 to 1. Use below 0.6 when the email is ambiguous."),
  reason: z
    .string()
    .describe("One short sentence on why, for the person reviewing. Under 25 words. No personal details."),
});

const MAX_REASON_CHARS = 200;

export const classificationSchema = classificationOutputSchema.transform((raw) => ({
  type: raw.type,
  confidence: Number.isFinite(raw.confidence) ? Math.min(1, Math.max(0, raw.confidence)) : 0,
  reason: raw.reason.trim().replace(/\s+/g, " ").slice(0, MAX_REASON_CHARS),
}));

export type Classification = z.output<typeof classificationSchema>;
