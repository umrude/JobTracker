// Turns a 0-100 match score into the label the UI shows. The bands match
// the scoring guide in the comparison prompt (server/llm/compare.ts), so
// the model's meaning for each number and the label agree.

export type ScoreBand = {
  label: "Strong fit" | "Solid fit" | "Stretch" | "Poor fit";
  tone: "strong" | "solid" | "stretch" | "poor";
};

export function scoreBand(score: number): ScoreBand {
  if (score >= 85) return { label: "Strong fit", tone: "strong" };
  if (score >= 60) return { label: "Solid fit", tone: "solid" };
  if (score >= 40) return { label: "Stretch", tone: "stretch" };
  return { label: "Poor fit", tone: "poor" };
}
