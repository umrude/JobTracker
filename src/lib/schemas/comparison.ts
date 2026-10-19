import { z } from "zod";

// TODO(you): this file is yours to write. What's here is only the agreed
// field names with bare types, so the rest of the code compiles. Replace
// it with your real schemas.
//
// There are two schemas because of one constraint:
//
// 1. comparisonOutputSchema is sent to the model as a JSON Schema
//    (structured outputs, via zodOutputFormat in server/llm/client.ts).
//    It can NOT contain .transform() or .pipe() into a transform: Zod
//    can't express those as JSON Schema and zodOutputFormat throws.
//    Number/length bounds (.min/.max/.int) are allowed, but the API doesn't
//    enforce them. The SDK moves them into the field description as a hint,
//    and only your Zod validation actually checks them. .describe() text
//    is sent to the model too, so it's a good place for per-field guidance.
//
// 2. comparisonSchema is what you validate the model's JSON with, what
//    gets stored, and what stored rows are re-validated with on every read
//    (see the comparisons.result column). It can add transforms on top of
//    the output schema, e.g. comparisonOutputSchema.transform(...). The
//    helpers in lib/comparison-helpers.ts are there for this.
//    Careful: stored rows are parsed with it again on read, so any
//    transform needs to give the same result when run on its own output.
//
// Things to decide:
// - score: integer 0-100? Reject out-of-range values (forcing a retry), or
//   accept and clamp with clampScore()? Which is better UX?
// - Skill/keyword arrays: trim and dedupe? Cap the length? Reject empty
//   strings?
// - suggestions: plain strings, or objects (e.g. { section, change, why })
//   so the UI can group them? If you change the shape, update the demo
//   fixtures in server/llm/compare-demo.ts too (a test checks they parse).
// - Should missingSkills and matchedSkills be allowed to overlap?

export const comparisonOutputSchema = z.object({
  score: z.number(),
  matchedSkills: z.array(z.string()),
  missingSkills: z.array(z.string()),
  missingKeywords: z.array(z.string()),
  suggestions: z.array(z.string()),
});

export const comparisonSchema = comparisonOutputSchema;

// The validated shape the app works with.
export type Comparison = z.infer<typeof comparisonSchema>;

// What the model (or a fixture) produces before comparisonSchema runs.
// Same as Comparison until you add transforms.
export type ComparisonInput = z.input<typeof comparisonSchema>;
