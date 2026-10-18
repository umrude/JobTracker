import "server-only";
import mammoth from "mammoth";
import { extractText } from "unpdf";
import {
  SIGNATURE_LENGTH,
  checkExtractedText,
  checkResumeFile,
  checkResumeSignature,
  resumeFileError,
  type ResumeFileError,
} from "@/lib/resume-file";
import type { ResumeFileKind } from "@/lib/schemas/resume";

export type ParseResumeResult =
  | { ok: true; text: string }
  | { ok: false; error: ResumeFileError };

// Turns an uploaded PDF/DOCX into plain text. Nothing is written to disk
// or the database: the bytes live in memory for this request only, and
// the caller decides what to do with the text (the resume page shows it
// for editing before anything is saved).
export async function parseResumeFile(file: File): Promise<ParseResumeResult> {
  // Size and extension first, so an oversized or wrong-type file is
  // rejected without copying its bytes into another buffer.
  const check = checkResumeFile({ name: file.name, size: file.size });
  if (!check.ok) return check;

  const bytes = new Uint8Array(await file.arrayBuffer());
  const mismatch = checkResumeSignature(
    check.kind,
    bytes.subarray(0, SIGNATURE_LENGTH),
  );
  if (mismatch) return { ok: false, error: mismatch };

  let raw: string;
  try {
    raw = await extractRawText(check.kind, bytes);
  } catch (error) {
    return { ok: false, error: toFileError(error) };
  }

  return checkExtractedText(raw);
}

async function extractRawText(
  kind: ResumeFileKind,
  bytes: Uint8Array,
): Promise<string> {
  if (kind === "pdf") {
    const { text } = await extractText(bytes, { mergePages: true });
    return text;
  }
  const { value } = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
  return value;
}

// The parsers throw their own error types for damaged or locked files.
// Map them to friendly messages; never show a raw parser error.
function toFileError(error: unknown): ResumeFileError {
  // PDF.js (inside unpdf) names this error class for password-protected PDFs.
  if (error instanceof Error && error.name === "PasswordException") {
    return resumeFileError("encrypted");
  }
  console.error("Resume parse failed", error);
  return resumeFileError("unreadable");
}
