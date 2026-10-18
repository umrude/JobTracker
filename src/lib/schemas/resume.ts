import { z } from "zod";
import { idSchema } from "@/lib/schemas/form";

export const RESUME_MAX_BYTES = 5 * 1024 * 1024;

// Plenty for a multi-page resume, and keeps a comparison prompt bounded.
export const RESUME_TEXT_MAX = 50_000;

export const RESUME_FILE_TYPES = {
  pdf: { mime: "application/pdf", extension: ".pdf" },
  docx: {
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    extension: ".docx",
  },
} as const;

export type ResumeFileKind = keyof typeof RESUME_FILE_TYPES;

// The text you confirm after previewing/editing the parsed upload. The
// uploaded file itself is never stored, only this.
export const saveResumeSchema = z.object({
  text: z
    .string()
    .trim()
    .min(1, "Resume text is empty")
    .max(
      RESUME_TEXT_MAX,
      `Resume text must be ${RESUME_TEXT_MAX.toLocaleString("en-US")} characters or fewer`,
    ),
});

export type SaveResumeInput = z.infer<typeof saveResumeSchema>;

export const activateResumeSchema = z.object({ id: idSchema });

export type ActivateResumeInput = z.infer<typeof activateResumeSchema>;
