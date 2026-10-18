"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertWritable } from "@/server/mode";
import { requireSession } from "@/server/require-session";
import {
  createSavedJob,
  deleteSavedJob,
  moveSavedJobToApplied,
  updateSavedJob,
} from "@/server/db/jobs";
import {
  createSavedJobSchema,
  savedJobIdSchema,
  updateSavedJobSchema,
} from "@/lib/schemas/job";
import { formError, validationError, type FormState } from "@/lib/form-state";

function savedJobFields(formData: FormData) {
  return {
    company: formData.get("company"),
    title: formData.get("title"),
    url: formData.get("url"),
    listingText: formData.get("listingText"),
    notes: formData.get("notes"),
  };
}

// The (prevState, formData) signature is what useActionState expects.
// prevState is unused: each submit validates the form from scratch.
export async function createSavedJobAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireSession();
  assertWritable();

  const parsed = createSavedJobSchema.safeParse(savedJobFields(formData));
  if (!parsed.success) return validationError(parsed.error);

  await createSavedJob(parsed.data);
  revalidatePath("/saved");
  return { status: "success" };
}

export async function updateSavedJobAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireSession();
  assertWritable();

  const parsed = updateSavedJobSchema.safeParse({
    id: formData.get("id"),
    ...savedJobFields(formData),
  });
  if (!parsed.success) return validationError(parsed.error);

  await updateSavedJob(parsed.data);
  revalidatePath("/saved");
  return { status: "success" };
}

export async function deleteSavedJobAction(formData: FormData) {
  await requireSession();
  assertWritable();

  const { id } = savedJobIdSchema.parse({ id: formData.get("id") });
  await deleteSavedJob(id);
  revalidatePath("/saved");
}

export async function moveToAppliedAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireSession();
  assertWritable();

  const { id } = savedJobIdSchema.parse({ id: formData.get("id") });
  const result = await moveSavedJobToApplied(id, new Date());
  if (!result.ok) {
    revalidatePath("/saved");
    return formError(
      result.reason === "already_applied"
        ? "You've already applied to this job. It's on the board."
        : "This job no longer exists.",
    );
  }

  // Both pages show this job (it leaves one and joins the other).
  // Revalidate before redirect(): redirect() throws, so nothing after it runs.
  revalidatePath("/saved");
  revalidatePath("/board");
  redirect("/board");
}
