import { describe, it, expect } from "vitest";
import { EMAIL_TYPES } from "@/lib/schemas/email";
import { prefilter } from "@/lib/email/prefilter";
import { buildClassifyRequest } from "@/server/llm/classify-email";
import { CLASSIFIER_EVAL_CASES } from "@/server/llm/classify-eval-cases";
import { evalCaseInput, evalCaseMeta, scoreEval, type EvalOutcome } from "@/server/llm/classify-eval";

describe("the eval set", () => {
  it("has 40 cases with unique ids and at least four of every type", () => {
    expect(CLASSIFIER_EVAL_CASES).toHaveLength(40);
    expect(new Set(CLASSIFIER_EVAL_CASES.map((c) => c.id)).size).toBe(40);
    for (const type of EMAIL_TYPES) {
      expect(CLASSIFIER_EVAL_CASES.filter((c) => c.expected === type).length, type).toBeGreaterThanOrEqual(4);
    }
  });

  it("builds a request for every case", () => {
    for (const testCase of CLASSIFIER_EVAL_CASES) {
      expect(buildClassifyRequest(evalCaseInput(testCase)).prompt).toContain(testCase.subject);
    }
  });

  // If the pre-filter dropped one of these, the classifier would never see
  // it in real use, however well it classifies.
  it("is all let through by the pre-filter, except replies linked by thread", () => {
    const missed = CLASSIFIER_EVAL_CASES.filter(
      (c) => c.expected !== "not_relevant" && c.application && !c.viaThread,
    ).filter((c) => !prefilter(evalCaseMeta(c), [c.application?.company ?? ""]).candidate);
    expect(missed.map((c) => c.id)).toEqual([]);
  });
});

describe("scoreEval", () => {
  const outcome = (expected: EvalOutcome["expected"], actual: EvalOutcome["actual"], confidence: number | null): EvalOutcome => ({
    id: `${expected}-${actual}`,
    expected,
    actual,
    confidence,
    reason: "",
  });

  it("counts accuracy, per-type results, failures, and calibration", () => {
    const report = scoreEval([
      outcome("offer", "offer", 0.95),
      outcome("rejection", "rejection", 0.9),
      outcome("interview", "rejection", 0.85),
      outcome("assessment", "interview", 0.5),
      outcome("acknowledged", null, null),
    ]);
    expect(report).toMatchObject({ total: 5, correct: 2, failed: 1, accuracy: 0.4 });
    expect(report.perType.rejection).toEqual({ expected: 1, correct: 1, predicted: 2 });
    expect(report.confident).toEqual({ count: 3, correct: 2 });
    expect(report.unsure).toEqual({ count: 1, correct: 0 });
    expect(report.misses.map((m) => m.expected)).toEqual(["interview", "assessment", "acknowledged"]);
  });
});
