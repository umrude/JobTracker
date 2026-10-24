"use server";

import { revalidatePath } from "next/cache";
import { assertWritable } from "@/server/mode";
import { requireSession } from "@/server/require-session";
import { addInterview, followedUp, removeInterview } from "@/server/db/today";
import { createInterviewSchema, followUpSchema, interviewIdSchema } from "@/lib/schemas/interview";
import { formError, validationError, type FormState } from "@/lib/form-state";
import { idSchema } from "@/lib/schemas/form";

// Writes for Today and an application's interviews (docs/today.md). Every
// one checks the session and that writes are allowed, then validates with
// Zod: ids in a form are untrusted, and the data layer only ever finds
// your own rows anyway.

// Today and the sidebar badge, and the application's page.
function refresh(applicationId?: number) {
  revalidatePath("/today");
  revalidatePath("/", "layout");
  if (applicationId) revalidatePath(`/applications/${applicationId}`);
}

export async function followedUpAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  await requireSession();
  assertWritable();
  const parsed = followUpSchema.safeParse({ applicationId: formData.get("applicationId") });
  if (!parsed.success) return formError("Invalid application.");
  const result = await followedUp(parsed.data.applicationId);
  if (!result.ok) return formError(result.message);
  refresh(parsed.data.applicationId);
  return { status: "success" };
}

// Returns form state rather than throwing, so the dialog keeps what you
// typed when a field is wrong.
export async function addInterviewAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  await requireSession();
  assertWritable();
  const parsed = createInterviewSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error);
  const result = await addInterview(parsed.data);
  if (!result.ok) return formError(result.message);
  refresh(parsed.data.applicationId);
  return { status: "success" };
}

export async function deleteInterviewAction(formData: FormData): Promise<void> {
  await requireSession();
  assertWritable();
  const { id } = interviewIdSchema.parse({ id: formData.get("id") });
  // Only says which page to refresh; the delete itself is by interview id.
  const applicationId = idSchema.safeParse(formData.get("applicationId"));
  await removeInterview(id);
  refresh(applicationId.success ? applicationId.data : undefined);
}
