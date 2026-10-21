"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertWritable } from "@/server/mode";
import { requireSession } from "@/server/require-session";
import { approveTailoring, editTailoring, previewTailoringLength, reviseTailoring, runTailoring, trimTailoring } from "@/server/tailoring";
import { decisionsSchema, reviewEditSchema, revisionRequestSchema } from "@/lib/schemas/tailoring";
import { generateCoverLetter, updateCoverLetter } from "@/server/cover-letters";
import { runTailoredComparison } from "@/server/comparisons";
import { idSchema } from "@/lib/schemas/form";
import { generateCoverLetterSchema, saveCoverLetterSchema } from "@/lib/schemas/cover-letter";
import { formError, validationError, type FormState, type MessageState } from "@/lib/form-state";

// The Prepare application page's actions. Each one: session, then
// assertWritable() (the public demo is read-only), then Zod validation,
// then the service, which scopes everything to the current user.

// A list of ids sent as one JSON form field, e.g. the accepted change ids.
const idList = z
  .string()
  .transform((value, ctx) => {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      ctx.addIssue({ code: "custom", message: "Invalid list" });
      return z.NEVER;
    }
  })
  .pipe(z.array(z.string().max(200)).max(500));

// Generating can take up to a minute in live mode; the button shows a
// pending state for the duration.
export async function generateTailoringAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  await requireSession();
  assertWritable();

  const jobId = idSchema.safeParse(formData.get("jobId"));
  if (!jobId.success) return formError("Invalid job.");

  const result = await runTailoring(jobId.data);
  if (!result.ok) return formError(result.error.message);

  revalidatePath(`/apply/${jobId.data}`);
  return { status: "success" };
}

export async function approveTailoringAction(_prevState: MessageState, formData: FormData): Promise<MessageState> {
  await requireSession();
  assertWritable();

  const parsed = z
    .object({ tailoringId: idSchema, jobId: idSchema, accepted: idList })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: "Invalid request. Reload the page and try again." };

  const result = await approveTailoring(parsed.data.tailoringId, parsed.data.accepted);
  if (!result.ok) return { status: "error", message: result.message };

  revalidatePath(`/apply/${parsed.data.jobId}`);
  return { status: "success", message: result.warning ?? "Approved." };
}

// Scores the approved tailored resume against the same listing (Step 7).
export async function compareTailoredAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  await requireSession();
  assertWritable();

  const parsed = z.object({ tailoringId: idSchema, jobId: idSchema }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return formError("Invalid request.");

  const result = await runTailoredComparison(parsed.data.tailoringId);
  if (!result.ok) return formError(result.error.message);

  revalidatePath(`/apply/${parsed.data.jobId}`);
  return { status: "success" };
}

// Cover letters (Step 6). Writing can take up to a minute in live mode.
export async function generateCoverLetterAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  await requireSession();
  assertWritable();

  const parsed = generateCoverLetterSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return formError("Choose a tone and length.");

  const result = await generateCoverLetter(parsed.data.jobId, { tone: parsed.data.tone, length: parsed.data.length });
  if (!result.ok) return formError(result.error.message);

  revalidatePath(`/apply/${parsed.data.jobId}`);
  return { status: "success" };
}

export async function saveCoverLetterAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  await requireSession();
  assertWritable();

  const parsed = saveCoverLetterSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error);

  const saved = await updateCoverLetter(parsed.data.id, parsed.data.text);
  if (!saved) return formError("This cover letter no longer exists.");

  revalidatePath(`/apply/${parsed.data.jobId}`);
  return { status: "success" };
}

export async function trimTailoringAction(_prevState: MessageState, formData: FormData): Promise<MessageState> {
  await requireSession();
  assertWritable();

  const parsed = z
    .object({ tailoringId: idSchema, jobId: idSchema, bulletIds: idList, entryIds: idList.optional() })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: "Invalid request. Reload the page and try again." };

  const result = await trimTailoring(parsed.data.tailoringId, parsed.data.bulletIds, parsed.data.entryIds ?? []);
  if (!result.ok) return { status: "error", message: result.message };

  revalidatePath(`/apply/${parsed.data.jobId}`);
  return {
    status: "success",
    message: result.warning ?? (result.pages === 1 ? "Trimmed: it fits on one page now." : `Trimmed: ${result.pages ?? "?"} pages.`),
  };
}

// ---- Editing a draft yourself, and checking its length ----

// A JSON form field, parsed and then validated by `schema`.
function jsonField<T extends z.ZodType>(schema: T) {
  return z
    .string()
    .transform((value, ctx) => {
      try {
        return JSON.parse(value) as unknown;
      } catch {
        ctx.addIssue({ code: "custom", message: "Invalid JSON" });
        return z.NEVER;
      }
    })
    .pipe(schema);
}

const editRequestSchema = z.union([
  z.object({ edit: reviewEditSchema }),
  z.object({ reset: z.string().max(200) }),
  z.object({ resetAll: z.literal(true) }),
]);

// One edit (reword, remove, move), a reset of one item, or a reset of all.
// The page sends its current decisions with it, so they're saved too.
export async function editTailoringAction(_prevState: MessageState, formData: FormData): Promise<MessageState> {
  await requireSession();
  assertWritable();

  const parsed = z
    .object({
      tailoringId: idSchema,
      jobId: idSchema,
      request: jsonField(editRequestSchema),
      decisions: jsonField(decisionsSchema),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    // A text edit's own message ("The text can't be empty.") is worth showing.
    const textProblem = parsed.error.issues.find((issue) => issue.path.includes("text"))?.message;
    return { status: "error", message: textProblem ?? "Invalid edit. Reload the page and try again." };
  }

  const result = await editTailoring(parsed.data.tailoringId, parsed.data.request, parsed.data.decisions);
  if (!result.ok) return { status: "error", message: result.message };

  revalidatePath(`/apply/${parsed.data.jobId}`);
  return { status: "success", message: "Saved." };
}

// "Check length": builds the PDF for what you've accepted so far, saving
// nothing. A read, so it's allowed in the read-only demo (which can only
// answer for pre-built PDFs).
// The page count is returned as data too, so a revision can pass it on.
export type LengthState = { status: "idle" } | { status: "done"; fits: boolean; message: string; pages: number | null };

export async function checkTailoringLengthAction(_prevState: LengthState, formData: FormData): Promise<LengthState> {
  await requireSession();

  const parsed = z.object({ tailoringId: idSchema, accepted: idList }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "done", fits: false, pages: null, message: "Invalid request. Reload the page and try again." };

  const result = await previewTailoringLength(parsed.data.tailoringId, parsed.data.accepted);
  if (!result.ok) return { status: "done", fits: false, pages: null, message: result.message };
  return {
    status: "done",
    fits: result.pages === 1,
    pages: result.pages,
    message: result.pages === 1 ? "Fits on one page." : `${result.pages} pages with these choices.`,
  };
}

// "Revise with notes": a new draft version that follows your notes. Can
// take up to a minute in live mode, like generating.
export async function reviseTailoringAction(_prevState: MessageState, formData: FormData): Promise<MessageState> {
  await requireSession();
  assertWritable();

  const parsed = z
    .object({
      tailoringId: idSchema,
      jobId: idSchema,
      request: jsonField(revisionRequestSchema),
      decisions: jsonField(decisionsSchema),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: "Invalid notes. Keep each note under 1,000 characters and try again." };

  const result = await reviseTailoring(parsed.data.tailoringId, parsed.data.request, parsed.data.decisions);
  if (!result.ok) return { status: "error", message: result.message };

  revalidatePath(`/apply/${parsed.data.jobId}`);
  return { status: "success", message: "Revised. Review what changed below." };
}
