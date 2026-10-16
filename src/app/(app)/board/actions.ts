"use server";

import { revalidatePath } from "next/cache";
import { assertWritable } from "@/server/mode";
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
  assertWritable();

  const input = createApplicationSchema.parse({
    company: formData.get("company"),
    title: formData.get("title"),
    url: formData.get("url"),
    notes: formData.get("notes"),
    status: formData.get("status") || undefined,
  });

  createApplication(input);
  revalidatePath("/board");
}

export async function editApplicationAction(formData: FormData) {
  assertWritable();

  const input = updateApplicationSchema.parse({
    id: formData.get("id"),
    company: formData.get("company"),
    title: formData.get("title"),
    url: formData.get("url"),
    notes: formData.get("notes"),
    status: formData.get("status") || undefined,
  });

  updateApplication(input);
  revalidatePath("/board");
}

export async function moveApplicationAction(id: number, status: string) {
  assertWritable();

  const input = moveApplicationSchema.parse({ id, status });

  moveApplicationStatus(input.id, input.status);
  revalidatePath("/board");
}

export async function deleteApplicationAction(formData: FormData) {
  assertWritable();

  const input = deleteApplicationSchema.parse({ id: formData.get("id") });

  deleteApplication(input.id);
  revalidatePath("/board");
}
