"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertWritable } from "@/server/mode";
import { requireSession } from "@/server/require-session";
import {
  createBullet,
  createEntry,
  createHighlight,
  createSkill,
  deleteBullet,
  deleteEntry,
  deleteHighlight,
  deleteSkill,
  importFromActiveResume,
  updateBullet,
  updateEntry,
  updateHighlight,
  updateSkill,
  type WriteResult,
} from "@/server/db/profile";
import {
  createBulletSchema,
  createEntrySchema,
  createHighlightSchema,
  createSkillSchema,
  profileItemIdSchema,
  updateBulletSchema,
  updateEntrySchema,
  updateHighlightSchema,
  updateSkillSchema,
} from "@/lib/schemas/profile";
import { validationError, type FormState, type MessageState } from "@/lib/form-state";

// Every action: session, then assertWritable() (the public demo is
// read-only), then Zod validation, then the data layer, which scopes
// everything to the current user. Problems come back as form state rather
// than thrown errors, so a dialog keeps what you typed.

// Builds a (prevState, formData) action from a schema and a data-layer
// write. Every profile form has the same shape, so the boilerplate lives
// here once instead of eight times.
function formAction<T>(
  schema: z.ZodType<T>,
  write: (input: T) => Promise<WriteResult>,
) {
  return async (_prevState: FormState, formData: FormData): Promise<FormState> => {
    await requireSession();
    assertWritable();

    const parsed = schema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return validationError(parsed.error);

    const result = await write(parsed.data);
    if (!result.ok) {
      return {
        status: "error",
        message: result.message,
        fieldErrors: result.field ? { [result.field]: [result.message] } : {},
      };
    }
    revalidatePath("/profile");
    return { status: "success" };
  };
}

// Plain (formData) actions for delete buttons.
function deleteAction(remove: (id: number) => Promise<void>) {
  return async (formData: FormData): Promise<void> => {
    await requireSession();
    assertWritable();
    const { id } = profileItemIdSchema.parse({ id: formData.get("id") });
    await remove(id);
    revalidatePath("/profile");
  };
}

// "use server" files may only export async functions, so each action is
// declared as one, delegating to the shared builders above.
export async function createSkillAction(prev: FormState, data: FormData) {
  return formAction(createSkillSchema, createSkill)(prev, data);
}
export async function updateSkillAction(prev: FormState, data: FormData) {
  return formAction(updateSkillSchema, updateSkill)(prev, data);
}
export async function deleteSkillAction(data: FormData) {
  return deleteAction(deleteSkill)(data);
}

export async function createEntryAction(prev: FormState, data: FormData) {
  return formAction(createEntrySchema, createEntry)(prev, data);
}
export async function updateEntryAction(prev: FormState, data: FormData) {
  return formAction(updateEntrySchema, updateEntry)(prev, data);
}
export async function deleteEntryAction(data: FormData) {
  return deleteAction(deleteEntry)(data);
}

export async function createBulletAction(prev: FormState, data: FormData) {
  return formAction(createBulletSchema, createBullet)(prev, data);
}
export async function updateBulletAction(prev: FormState, data: FormData) {
  return formAction(updateBulletSchema, updateBullet)(prev, data);
}
export async function deleteBulletAction(data: FormData) {
  return deleteAction(deleteBullet)(data);
}

export async function createHighlightAction(prev: FormState, data: FormData) {
  return formAction(createHighlightSchema, createHighlight)(prev, data);
}
export async function updateHighlightAction(prev: FormState, data: FormData) {
  return formAction(updateHighlightSchema, updateHighlight)(prev, data);
}
export async function deleteHighlightAction(data: FormData) {
  return deleteAction(deleteHighlight)(data);
}

export async function importFromResumeAction(): Promise<MessageState> {
  await requireSession();
  assertWritable();

  const result = await importFromActiveResume();
  if (!result.ok) return { status: "error", message: result.message };

  revalidatePath("/profile");
  const { skills, entries, bullets, highlights } = result.added;
  const parts = [
    [skills, "skill"],
    [entries, "entry"],
    [bullets, "bullet"],
    [highlights, "highlight"],
  ] as const;
  const added = parts
    .filter(([count]) => count > 0)
    .map(([count, noun]) => `${count} ${count === 1 ? noun : noun === "entry" ? "entries" : `${noun}s`}`);
  return {
    status: "success",
    message: added.length > 0 ? `Added ${added.join(", ")}.` : "Nothing new to add: your profile already has everything in your resume.",
  };
}
