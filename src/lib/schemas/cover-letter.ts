import { z } from "zod";
import { idSchema } from "@/lib/schemas/form";

// Cover letters (docs/cover-letters.md). Value sets, the model's output
// shape, and form input.

export const COVER_TONES = ["professional", "warm", "direct"] as const;
export const coverToneSchema = z.enum(COVER_TONES);
export type CoverTone = z.infer<typeof coverToneSchema>;

export const COVER_LENGTHS = ["short", "standard", "long"] as const;
export const coverLengthSchema = z.enum(COVER_LENGTHS);
export type CoverLength = z.infer<typeof coverLengthSchema>;

// Target word counts for the body (greeting and closing not counted).
export const COVER_LENGTH_WORDS: Record<CoverLength, number> = {
  short: 150,
  standard: 250,
  long: 400,
};

// What the model returns. Sent as JSON Schema (structured outputs), so no
// transforms here.
export const coverLetterOutputSchema = z.object({
  greeting: z.string().describe('e.g. "Dear Northwind Robotics hiring team,"'),
  paragraphs: z.array(z.string()).describe("The body, one string per paragraph."),
  closing: z.string().describe('e.g. "Sincerely,"'),
});

export type CoverLetterOutput = z.infer<typeof coverLetterOutputSchema>;

// What the checker found (lib/cover-letter/check.ts). Warnings, not
// reverts: a letter is prose, and a mention can legitimately describe the
// company rather than you, so you decide.
export const LETTER_WARNING_KINDS = [
  "new_number",
  "unknown_skill",
  "no_context_skill",
  "learning_claim",
  "length",
] as const;

export const letterWarningSchema = z.object({
  kinds: z.array(z.enum(LETTER_WARNING_KINDS)),
  message: z.string(),
});

export type LetterWarning = z.infer<typeof letterWarningSchema>;

// Form input.
export const generateCoverLetterSchema = z.object({
  jobId: idSchema,
  tone: coverToneSchema,
  length: coverLengthSchema,
});

export const COVER_LETTER_MAX = 6_000;

export const saveCoverLetterSchema = z.object({
  id: idSchema,
  jobId: idSchema,
  text: z
    .string()
    .trim()
    .min(1, "The letter is empty")
    .max(COVER_LETTER_MAX, `Cover letters must be ${COVER_LETTER_MAX.toLocaleString("en-US")} characters or fewer`),
});
