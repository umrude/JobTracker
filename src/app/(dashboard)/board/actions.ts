"use server";

import { revalidatePath } from "next/cache";
import { assertWritable } from "@/server/mode";
import { requireSession } from "@/server/require-session";
import {
  createApplication,
  deleteApplication,
  moveApplicationStatus,
  updateApplication,
} from "@/server/db/applications";
import {
  createApplicationSchema,
  deleteApplicationSchema,
  moveApplicationSchema,
  updateApplicationSchema,
} from "@/lib/schemas/application";

export async function addApplicationAction(formData: FormData) {
  await requireSession();
  assertWritable();

  const input = createApplicationSchema.parse({
    company: formData.get("company"),
    title: formData.get("title"),
    url: formData.get("url"),
    listingText: formData.get("listingText"),
    notes: formData.get("notes"),
    status: formData.get("status") || undefined,
    passedScreening: formData.get("passedScreening") === "on",
  });

  await createApplication(input);
  revalidatePath("/board");
}

export async function editApplicationAction(formData: FormData) {
  await requireSession();
  assertWritable();

  const input = updateApplicationSchema.parse({
    id: formData.get("id"),
    company: formData.get("company"),
    title: formData.get("title"),
    url: formData.get("url"),
    // Always sent by the edit form; blank clears it.
    listingText: formData.get("listingText") ?? undefined,
    notes: formData.get("notes"),
    status: formData.get("status") || undefined,
    // A checkbox sends nothing when unticked, and the edit form always has
    // it, so absent means unticked.
    passedScreening: formData.get("passedScreening") === "on",
  });

  await updateApplication(input);
  revalidatePath("/board");
}

export async function moveApplicationAction(id: number, status: string) {
  await requireSession();
  assertWritable();

  const input = moveApplicationSchema.parse({ id, status });

  await moveApplicationStatus(input.id, input.status);
  revalidatePath("/board");
}

export async function deleteApplicationAction(formData: FormData) {
  await requireSession();
  assertWritable();

  const input = deleteApplicationSchema.parse({ id: formData.get("id") });

  await deleteApplication(input.id);
  revalidatePath("/board");
}
