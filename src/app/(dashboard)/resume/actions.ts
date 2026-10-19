"use server";

import { revalidatePath } from "next/cache";
import { assertWritable } from "@/server/mode";
import { requireSession } from "@/server/require-session";
import { parseResumeFile } from "@/server/resume/parse";
import { activateResume, createResumeVersion } from "@/server/db/resumes";
import { activateResumeSchema, saveResumeSchema } from "@/lib/schemas/resume";
import { RESUME_FILE_ERRORS, type ParseResumeState } from "@/lib/resume-file";
import { validationError, type FormState } from "@/lib/form-state";
import { LATEX_SOURCE_MAX, addPdfTexGuards, checkLatexSource } from "@/lib/latex/source";

// Step one of two: turn the uploaded file into text and send the text
// back. Nothing is saved. Splitting parse and save into two actions is
// what lets you review and fix the parsed text before it's stored, and
// it means the file itself only ever exists in this request's memory.
//
// It writes nothing, but it still calls assertWritable(): on the public
// read-only demo it would otherwise let anyone push files at the server
// to be parsed.
export async function parseResumeAction(
  _prevState: ParseResumeState,
  formData: FormData,
): Promise<ParseResumeState> {
  await requireSession();
  assertWritable();

  // FormData values are File | string | null. instanceof narrows to File
  // without a cast; a string means the field was tampered with, and null
  // means no file was chosen.
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { status: "error", message: RESUME_FILE_ERRORS.missing };
  }

  const result = await parseResumeFile(file);
  if (!result.ok) return { status: "error", message: result.error.message };

  return { status: "parsed", text: result.text, fileName: file.name };
}

// Step two: save the (possibly edited) text as a new active version, with
// the optional LaTeX source that tailored resumes are built from.
export async function saveResumeAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireSession();
  assertWritable();

  const parsed = saveResumeSchema.safeParse({ text: formData.get("text") });
  if (!parsed.success) return validationError(parsed.error);

  const latex = await readLatexUpload(formData.get("latexFile"));
  if (!latex.ok) {
    return {
      status: "error",
      message: "Please fix the highlighted fields.",
      fieldErrors: { latexFile: [latex.message] },
    };
  }

  await createResumeVersion(parsed.data.text, latex.source);
  revalidatePath("/resume");
  return { status: "success" };
}

// The .tex upload is optional: an empty file input arrives as a File with
// size 0. Only the text is kept, never the file, same as the PDF/DOCX.
async function readLatexUpload(
  value: FormDataEntryValue | null,
): Promise<{ ok: true; source: string | null } | { ok: false; message: string }> {
  if (!(value instanceof File) || value.size === 0) return { ok: true, source: null };

  if (!value.name.toLowerCase().endsWith(".tex")) {
    return { ok: false, message: "The LaTeX source must be a .tex file." };
  }
  // Check the byte size before reading. UTF-8 is at most 4 bytes per
  // character, so this can't reject a file within the character limit.
  if (value.size > LATEX_SOURCE_MAX * 4) {
    return { ok: false, message: "That .tex file is far too large for a resume." };
  }

  const check = checkLatexSource(await value.text());
  if (!check.ok) return check;

  // Make it compile under Tectonic (XeTeX). Idempotent, so a file that's
  // already guarded is stored unchanged.
  return { ok: true, source: addPdfTexGuards(check.source).source };
}

export async function activateResumeAction(formData: FormData) {
  await requireSession();
  assertWritable();

  const { id } = activateResumeSchema.parse({ id: formData.get("id") });
  // A not_found result means the row is already gone; re-rendering the
  // page shows the current list either way.
  await activateResume(id);
  revalidatePath("/resume");
}
