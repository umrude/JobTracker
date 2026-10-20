"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertWritable } from "@/server/mode";
import { requireSession } from "@/server/require-session";
import { approveTailoring, runTailoring, trimTailoring } from "@/server/tailoring";
import { idSchema } from "@/lib/schemas/form";
import { formError, type FormState, type MessageState } from "@/lib/form-state";

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

export async function trimTailoringAction(_prevState: MessageState, formData: FormData): Promise<MessageState> {
  await requireSession();
  assertWritable();

  const parsed = z
    .object({ tailoringId: idSchema, jobId: idSchema, bulletIds: idList })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: "Invalid request. Reload the page and try again." };

  const result = await trimTailoring(parsed.data.tailoringId, parsed.data.bulletIds);
  if (!result.ok) return { status: "error", message: result.message };

  revalidatePath(`/apply/${parsed.data.jobId}`);
  return {
    status: "success",
    message: result.warning ?? (result.pages === 1 ? "Trimmed: it fits on one page now." : `Trimmed: ${result.pages ?? "?"} pages.`),
  };
}
