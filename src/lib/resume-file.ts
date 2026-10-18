import {
  RESUME_FILE_TYPES,
  RESUME_MAX_BYTES,
  RESUME_TEXT_MAX,
  type ResumeFileKind,
} from "@/lib/schemas/resume";

// Pure checks for an uploaded resume, with no I/O so they can be unit
// tested without real files. src/server/resume/parse.ts does the reading
// and the actual PDF/DOCX parsing around them.

export type ResumeFileErrorKind =
  | "missing"
  | "too_large"
  | "unsupported_type"
  | "content_mismatch"
  | "unreadable"
  | "encrypted"
  | "no_text"
  | "too_long";

export type ResumeFileError = { kind: ResumeFileErrorKind; message: string };

const MAX_MB = RESUME_MAX_BYTES / (1024 * 1024);

export const RESUME_FILE_ERRORS: Record<ResumeFileErrorKind, string> = {
  missing: "Choose a PDF or DOCX file to upload.",
  too_large: `That file is over ${MAX_MB} MB. Try exporting a smaller PDF.`,
  unsupported_type: "Only PDF and DOCX files are supported.",
  content_mismatch:
    "That file's contents don't match its extension. Try re-exporting it as PDF or DOCX.",
  unreadable:
    "We couldn't read that file. It may be damaged. Try re-exporting it, or paste the text instead.",
  encrypted:
    "That PDF is password-protected. Remove the password and try again, or paste the text instead.",
  no_text:
    "We couldn't find any text in that file. If it's a scanned image, paste the text instead.",
  too_long: `That resume is over ${RESUME_TEXT_MAX.toLocaleString("en-US")} characters of text, which is more than we can compare. Try a shorter version.`,
};

export function resumeFileError(kind: ResumeFileErrorKind): ResumeFileError {
  return { kind, message: RESUME_FILE_ERRORS[kind] };
}

// The first bytes of each format. A DOCX is a ZIP archive, so it starts
// with the ZIP local-file header ("PK\x03\x04").
const SIGNATURES: Record<ResumeFileKind, readonly number[]> = {
  pdf: [0x25, 0x50, 0x44, 0x46, 0x2d], // "%PDF-"
  docx: [0x50, 0x4b, 0x03, 0x04],
};

export const SIGNATURE_LENGTH = Math.max(
  ...Object.values(SIGNATURES).map((signature) => signature.length),
);

// Listed out instead of Object.keys(RESUME_FILE_TYPES), which TypeScript
// types as string[] and would need an `as` cast.
const KINDS: readonly ResumeFileKind[] = ["pdf", "docx"];

function kindFromName(name: string): ResumeFileKind | undefined {
  const lower = name.toLowerCase();
  return KINDS.find((kind) =>
    lower.endsWith(RESUME_FILE_TYPES[kind].extension),
  );
}

function startsWith(bytes: Uint8Array, signature: readonly number[]) {
  return signature.every((byte, index) => bytes[index] === byte);
}

export type ResumeFileCheck =
  | { ok: true; kind: ResumeFileKind }
  | { ok: false; error: ResumeFileError };

// Step one, before reading any bytes: size, then the type from the
// extension. The browser-reported MIME type is ignored: browsers on
// Windows often send "application/octet-stream" (or nothing) for DOCX,
// and anyone posting to the action directly can send any MIME type they
// like. checkResumeSignature() then confirms the type from the bytes.
export function checkResumeFile(file: {
  name: string;
  size: number;
}): ResumeFileCheck {
  if (file.size === 0) return { ok: false, error: resumeFileError("missing") };
  if (file.size > RESUME_MAX_BYTES) {
    return { ok: false, error: resumeFileError("too_large") };
  }

  const kind = kindFromName(file.name);
  if (!kind) return { ok: false, error: resumeFileError("unsupported_type") };

  return { ok: true, kind };
}

// Step two: the file's first bytes must match the format its extension
// claims. The bytes are the only part the sender can't misdescribe.
export function checkResumeSignature(
  kind: ResumeFileKind,
  header: Uint8Array,
): ResumeFileError | undefined {
  return startsWith(header, SIGNATURES[kind])
    ? undefined
    : resumeFileError("content_mismatch");
}

// Extracted text is messy: PDFs put stray spaces at line ends and big
// gaps between sections. Tidy it so the preview is pleasant to edit,
// without reflowing lines (line breaks often carry meaning in a resume).
export function cleanExtractedText(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/ /g, " ")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// What parseResumeAction returns to the upload form's useActionState.
export type ParseResumeState =
  | { status: "idle" }
  | { status: "parsed"; text: string; fileName: string }
  | { status: "error"; message: string };

export type ExtractedTextCheck =
  | { ok: true; text: string }
  | { ok: false; error: ResumeFileError };

export function checkExtractedText(raw: string): ExtractedTextCheck {
  const text = cleanExtractedText(raw);
  if (text.length === 0) return { ok: false, error: resumeFileError("no_text") };
  if (text.length > RESUME_TEXT_MAX) {
    return { ok: false, error: resumeFileError("too_long") };
  }
  return { ok: true, text };
}
