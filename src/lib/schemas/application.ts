import { z } from "zod";
import { statusSchema } from "@/lib/schemas/status";

// Forms submit "" for an empty optional field, not undefined. Normalize
// before validating so an untouched URL/notes field doesn't fail url() or
// get stored as an empty string.
const emptyToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const optionalUrl = z.preprocess(emptyToUndefined, z.string().url().optional());
const optionalText = z.preprocess(emptyToUndefined, z.string().optional());

export const createApplicationSchema = z.object({
  company: z.string().trim().min(1, "Company is required"),
  title: z.string().trim().min(1, "Title is required"),
  url: optionalUrl,
  notes: optionalText,
  status: statusSchema.default("saved"),
});

export type CreateApplicationInput = z.infer<typeof createApplicationSchema>;

export const updateApplicationSchema = z.object({
  id: z.coerce.number().int().positive(),
  company: z.string().trim().min(1, "Company is required").optional(),
  title: z.string().trim().min(1, "Title is required").optional(),
  url: optionalUrl,
  notes: optionalText,
  status: statusSchema.optional(),
});

export type UpdateApplicationInput = z.infer<typeof updateApplicationSchema>;

export const moveApplicationSchema = z.object({
  id: z.coerce.number().int().positive(),
  status: statusSchema,
});

export type MoveApplicationInput = z.infer<typeof moveApplicationSchema>;

export const deleteApplicationSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export type DeleteApplicationInput = z.infer<typeof deleteApplicationSchema>;
