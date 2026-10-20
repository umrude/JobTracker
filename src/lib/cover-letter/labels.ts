import { COVER_LENGTH_WORDS, type CoverLength, type CoverTone } from "@/lib/schemas/cover-letter";

// Display text for cover letter options.

export const TONE_LABELS: Record<CoverTone, string> = {
  professional: "Professional",
  warm: "Warm",
  direct: "Direct",
};

export const LENGTH_LABELS: Record<CoverLength, string> = {
  short: `Short (~${COVER_LENGTH_WORDS.short} words)`,
  standard: `Standard (~${COVER_LENGTH_WORDS.standard} words)`,
  long: `Long (~${COVER_LENGTH_WORDS.long} words)`,
};
