// No "server-only" here: pure functions for the classifier eval, used by
// scripts/eval-classifier.ts and tested on their own.
import type { EmailMeta, EmailType } from "@/lib/schemas/email";
import { CONFIDENT_AT } from "@/lib/email/propose";
import { normalizeCompany } from "@/lib/email/prefilter";
import { parseFrom } from "@/server/gmail/parse";
import type { ClassifyInput } from "@/server/llm/classify-email";
import type { EvalCase } from "@/server/llm/classify-eval-cases";

// What the classifier would be given for a case in real use.
export function evalCaseInput(testCase: EvalCase): ClassifyInput {
  const from = parseFrom(testCase.from);
  return {
    fromName: from.name,
    fromAddress: from.address,
    subject: testCase.subject,
    body: testCase.body,
    application: testCase.application,
  };
}

// What the pre-filter would see: Gmail's snippet is roughly the start of
// the body.
export function evalCaseMeta(testCase: EvalCase): EmailMeta {
  const from = parseFrom(testCase.from);
  return {
    id: testCase.id,
    threadId: `t-${testCase.id}`,
    fromAddress: from.address,
    fromName: from.name,
    subject: testCase.subject,
    snippet: testCase.body.replace(/\s+/g, " ").slice(0, 200),
    receivedAt: new Date(0),
    labels: testCase.labels ?? ["INBOX"],
  };
}

export type EvalOutcome = {
  id: string;
  expected: EmailType;
  // Null when the call failed (refusal, API error, malformed twice).
  actual: EmailType | null;
  confidence: number | null;
  reason: string;
  // The company and role the classifier read, and what the case expects
  // (undefined: not scored).
  company?: string | null;
  role?: string | null;
  expectedCompany?: string | null;
  expectedRole?: string | null;
};

export type EvalReport = {
  total: number;
  correct: number;
  failed: number;
  accuracy: number;
  perType: Record<EmailType, { expected: number; correct: number; predicted: number }>;
  // Calibration: how often it's right when it says it's sure, and when not.
  confident: { count: number; correct: number };
  unsure: { count: number; correct: number };
  misses: EvalOutcome[];
  // The company and role read correctly, out of the cases that state them.
  // Reported separately: a miss only means editing a prefilled field.
  extraction: { checked: number; company: number; role: number };
};

// Same name, ignoring case, punctuation, and legal suffixes; both null
// (the email doesn't say) also counts.
function sameName(actual: string | null | undefined, expected: string | null): boolean {
  if (expected === null) return actual === null || actual === undefined;
  return actual !== null && actual !== undefined && normalizeCompany(actual) === normalizeCompany(expected);
}

// The same "sure" threshold sync uses.
export { CONFIDENT_AT };

export function scoreEval(outcomes: readonly EvalOutcome[]): EvalReport {
  // Written out rather than built from EMAIL_TYPES, so the compiler checks
  // every type has a row (a built object would need an `as` cast).
  const counts = () => ({ expected: 0, correct: 0, predicted: 0 });
  const perType: EvalReport["perType"] = {
    acknowledged: counts(),
    interview: counts(),
    assessment: counts(),
    rejection: counts(),
    offer: counts(),
    not_relevant: counts(),
  };
  const confident = { count: 0, correct: 0 };
  const unsure = { count: 0, correct: 0 };
  const misses: EvalOutcome[] = [];
  const extraction = { checked: 0, company: 0, role: 0 };
  let correct = 0;
  let failed = 0;

  for (const outcome of outcomes) {
    const right = outcome.actual === outcome.expected;
    perType[outcome.expected].expected++;
    if (outcome.actual) perType[outcome.actual].predicted++;
    if (outcome.actual === null) failed++;
    if (right) {
      correct++;
      perType[outcome.expected].correct++;
    } else {
      misses.push(outcome);
    }
    if (outcome.expectedCompany !== undefined && outcome.expectedRole !== undefined && outcome.actual !== null) {
      extraction.checked++;
      if (sameName(outcome.company, outcome.expectedCompany)) extraction.company++;
      if (sameName(outcome.role, outcome.expectedRole)) extraction.role++;
    }
    if (outcome.confidence !== null) {
      const bucket = outcome.confidence >= CONFIDENT_AT ? confident : unsure;
      bucket.count++;
      if (right) bucket.correct++;
    }
  }

  return {
    total: outcomes.length,
    correct,
    failed,
    accuracy: outcomes.length === 0 ? 0 : correct / outcomes.length,
    perType,
    confident,
    unsure,
    misses,
    extraction,
  };
}
