"use server";

import { revalidatePath } from "next/cache";
import { assertWritable } from "@/server/mode";
import { requireSession } from "@/server/require-session";
import { runComparison } from "@/server/comparisons";
import { idSchema } from "@/lib/schemas/form";
import { formError, type FormState } from "@/lib/form-state";

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
