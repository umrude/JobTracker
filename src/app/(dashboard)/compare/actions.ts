"use server";

import { revalidatePath } from "next/cache";
import { assertWritable } from "@/server/mode";
import { requireSession } from "@/server/require-session";
import { runComparison } from "@/server/comparisons";
import { idSchema } from "@/lib/schemas/form";
import { formError, validationError, type FormState } from "@/lib/form-state";
import { confirmGapSchema } from "@/lib/schemas/profile";
import { confirmGap } from "@/server/db/profile";

// The only path that calls the model: the page itself just reads the saved
// result, so reopening a job never re-runs it. In live mode this can take
// tens of seconds, which is fine for a Server Action: the button shows a
// pending state for the duration.
export async function runComparisonAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireSession();
  assertWritable();

  const parsed = idSchema.safeParse(formData.get("jobId"));
  if (!parsed.success) return formError("Invalid job.");

  const result = await runComparison(parsed.data);
  if (!result.ok) return formError(result.error.message);

  revalidatePath(`/compare/${parsed.data}`);
  revalidatePath("/compare");
  return { status: "success" };
}

// "I have this" on a gap: adds the answer to your profile (as an alias, a
// skill, a Learning skill, or a highlight), sourced from this job. Returns
// form state rather than throwing, so the dialog keeps what you typed.
export async function confirmGapAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  await requireSession();
  assertWritable();

  const parsed = confirmGapSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error);

  const result = await confirmGap(parsed.data);
  if (!result.ok) {
    return {
      status: "error",
      message: result.message,
      fieldErrors: result.field ? { [result.field]: [result.message] } : {},
    };
  }

  // The gap now shows "In profile" here, and the item appears on Profile.
  revalidatePath(`/compare/${parsed.data.jobId}`);
  revalidatePath("/profile");
  return { status: "success" };
}
