// Runs the email classifier against the eval set (45 synthetic emails with
// known answers) using the real model, and reports accuracy, per-type
// results, calibration, misses, and what the run cost. Spends real API
// credit, so it's a script you run on purpose, never part of `pnpm test`.
//
//   pnpm eval:classifier                          # ANTHROPIC_CLASSIFIER_MODEL
//   pnpm eval:classifier --model claude-opus-5-5  # compare another model
//   pnpm eval:classifier --effort medium          # or another effort
//   pnpm eval:classifier --only rej-role-closed   # one case
//
// Exits 1 if accuracy is below --min-accuracy (default 0.9).
// See docs/gmail-sync.md, "Step 4c".
import { parseArgs } from "node:util";
import { env } from "@/server/env";
import { getLlmClient, type LlmClient, type StructuredRequest } from "@/server/llm/client";
import { classifyEmail } from "@/server/llm/classify-email";
import { CLASSIFIER_EVAL_CASES, type EvalCase } from "@/server/llm/classify-eval-cases";
import { CONFIDENT_AT, evalCaseInput, scoreEval, type EvalOutcome } from "@/server/llm/classify-eval";
import { EMAIL_TYPES } from "@/lib/schemas/email";
import { costUsd } from "@/lib/llm-pricing";


const { values } = parseArgs({
  options: {
    model: { type: "string", default: env.ANTHROPIC_CLASSIFIER_MODEL },
    effort: { type: "string" },
    only: { type: "string" },
    concurrency: { type: "string", default: "4" },
    "min-accuracy": { type: "string", default: "0.9" },
  },
});

const EFFORTS = ["low", "medium", "high"] as const;
function isEffort(value: string | undefined): value is StructuredRequest["effort"] & string {
  return EFFORTS.some((effort) => effort === value);
}
if (values.effort !== undefined && !isEffort(values.effort)) {
  console.error(`--effort must be one of: ${EFFORTS.join(", ")}`);
  process.exit(2);
}

// Overrides the effort the classifier asks for, without changing app code.
function withEffort(client: LlmClient, effort: StructuredRequest["effort"]): LlmClient {
  return { generateStructured: (request) => client.generateStructured({ ...request, effort }) };
}

async function main() {
  const created = getLlmClient(values.model);
  if (!created.ok) {
    console.error(created.error.message);
    process.exit(2);
  }
  const client = isEffort(values.effort) ? withEffort(created.data, values.effort) : created.data;

  const cases = values.only ? CLASSIFIER_EVAL_CASES.filter((c) => c.id === values.only) : CLASSIFIER_EVAL_CASES;
  if (cases.length === 0) {
    console.error(`No case with id ${values.only}.`);
    process.exit(2);
  }

  console.log(`Classifying ${cases.length} emails with ${values.model}${values.effort ? ` (effort ${values.effort})` : ""}...\n`);
  const usage = { inputTokens: 0, outputTokens: 0 };
  const outcomes: EvalOutcome[] = [];

  async function run(testCase: EvalCase): Promise<EvalOutcome> {
    const result = await classifyEmail(evalCaseInput(testCase), client);
    if (!result.ok) {
      return { id: testCase.id, expected: testCase.expected, actual: null, confidence: null, reason: `${result.error.kind}: ${result.error.message}` };
    }
    usage.inputTokens += result.data.usage?.inputTokens ?? 0;
    usage.outputTokens += result.data.usage?.outputTokens ?? 0;
    const { type, confidence, reason, company, role } = result.data.classification;
    return {
      id: testCase.id,
      expected: testCase.expected,
      actual: type,
      confidence,
      reason,
      company,
      role,
      expectedCompany: testCase.company,
      expectedRole: testCase.role,
    };
  }

  const concurrency = Math.max(1, Number(values.concurrency) || 4);
  for (let i = 0; i < cases.length; i += concurrency) {
    const chunk = await Promise.all(cases.slice(i, i + concurrency).map(run));
    for (const outcome of chunk) {
      outcomes.push(outcome);
      const mark = outcome.actual === outcome.expected ? "ok  " : "MISS";
      const confidence = outcome.confidence === null ? "" : ` (${outcome.confidence.toFixed(2)})`;
      console.log(`${mark} ${outcome.id.padEnd(32)} ${outcome.actual ?? "error"}${confidence}`);
    }
  }

  const report = scoreEval(outcomes);
  const pct = (n: number, of: number) => (of === 0 ? "-" : `${Math.round((n / of) * 100)}%`);

  console.log(`\nAccuracy: ${report.correct}/${report.total} (${pct(report.correct, report.total)})${report.failed ? `, ${report.failed} failed calls` : ""}`);
  console.log("\nType           expected  correct  predicted");
  for (const type of EMAIL_TYPES) {
    const row = report.perType[type];
    console.log(`${type.padEnd(15)}${String(row.expected).padStart(8)}${String(row.correct).padStart(9)}${String(row.predicted).padStart(11)}`);
  }
  console.log(
    `\nCalibration: right ${pct(report.confident.correct, report.confident.count)} of the time at confidence >= ${CONFIDENT_AT} (${report.confident.count} answers), ` +
      `${pct(report.unsure.correct, report.unsure.count)} below it (${report.unsure.count} answers).`,
  );

  if (report.extraction.checked > 0) {
    const { checked, company, role } = report.extraction;
    console.log(`\nCompany and role (prefill for "Add as application"): company ${company}/${checked}, role ${role}/${checked}.`);
    for (const outcome of outcomes) {
      if (outcome.expectedCompany === undefined || outcome.actual === null) continue;
      if (outcome.company === outcome.expectedCompany && outcome.role === outcome.expectedRole) continue;
      console.log(`- ${outcome.id}: read "${outcome.company}" / "${outcome.role}", expected "${outcome.expectedCompany}" / "${outcome.expectedRole}"`);
    }
  }

  if (report.misses.length > 0) {
    console.log("\nMisses:");
    for (const miss of report.misses) {
      const note = CLASSIFIER_EVAL_CASES.find((c) => c.id === miss.id)?.note ?? "";
      console.log(`- ${miss.id}: expected ${miss.expected}, got ${miss.actual ?? "error"}. ${note}\n    "${miss.reason}"`);
    }
  }

  const dollars = costUsd(values.model, usage.inputTokens, usage.outputTokens);
  const cost = dollars === null ? "" : ` ≈ ${dollars.toFixed(4)}`;
  console.log(`\nTokens: ${usage.inputTokens.toLocaleString("en-US")} in, ${usage.outputTokens.toLocaleString("en-US")} out${cost}`);

  const minAccuracy = Number(values["min-accuracy"]);
  if (report.accuracy < minAccuracy) {
    console.log(`\nBelow the minimum accuracy of ${minAccuracy}.`);
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
