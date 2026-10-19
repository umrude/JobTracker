import { z } from "zod";
import {
  clampScore,
  normalizeSkills,
  withoutSkills,
} from "@/lib/comparison-helpers";

// There are two schemas because of one constraint:
//
// 1. comparisonOutputSchema is sent to the model as a JSON Schema
//    (structured outputs, via zodOutputFormat in server/llm/client.ts).
//    It can't contain .transform(): Zod can't express transforms as JSON
//    Schema and zodOutputFormat throws. Bounds like .min()/.max() would be
//    allowed but not enforced by the API, so the guidance lives in
//    .describe() text instead, which the model does see.
//
// 2. comparisonSchema validates the model's JSON, is what gets stored, and
//    re-validates stored rows on every read. It adds cleanup transforms on
//    top of the output schema.
//
// Policy: wrong types or missing fields fail validation, and compareResume
// retries. Merely imperfect values (a score of 104, a duplicate skill, an
// overlong list) are cleaned up instead of rejected: the result is still
// useful, and a retry costs another API call.

const MAX_SKILLS = 30;
const MAX_SUGGESTIONS = 10;

export const comparisonOutputSchema = z.object({
  score: z
    .number()
    .describe("Overall fit as an integer from 0 to 100, per the scoring guide."),
  matchedSkills: z
    .array(z.string())
    .describe("Skills and qualifications from the listing that the resume clearly shows."),
  missingSkills: z
    .array(z.string())
    .describe("Skills and qualifications from the listing the resume doesn't show, required ones first."),
  missingKeywords: z
    .array(z.string())
    .describe("Specific terms from the listing that don't appear in the resume."),
  suggestions: z
    .array(z.string())
    .describe("Concrete, honest edits to the resume for this listing. At most 10."),
});

function cleanSuggestions(suggestions: readonly string[]): string[] {
  const trimmed = suggestions.map((s) => s.trim()).filter((s) => s !== "");
  return [...new Set(trimmed)].slice(0, MAX_SUGGESTIONS);
}

// Every step here gives the same result when run on its own output
// (clamping a clamped score, deduping a deduped list), so re-validating a
// stored row on read returns it unchanged.
export const comparisonSchema = comparisonOutputSchema.transform((raw) => {
  const matchedSkills = normalizeSkills(raw.matchedSkills).slice(0, MAX_SKILLS);
  return {
    score: clampScore(raw.score),
    matchedSkills,
    // A skill listed as both matched and missing counts as matched.
    missingSkills: withoutSkills(normalizeSkills(raw.missingSkills), matchedSkills).slice(
      0,
      MAX_SKILLS,
    ),
    missingKeywords: normalizeSkills(raw.missingKeywords).slice(0, MAX_SKILLS),
    suggestions: cleanSuggestions(raw.suggestions),
  };
});

// The validated shape the app works with.
export type Comparison = z.infer<typeof comparisonSchema>;

// What the model (or a fixture) produces before comparisonSchema runs.
export type ComparisonInput = z.input<typeof comparisonSchema>;
