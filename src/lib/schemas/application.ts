import { z } from "zod";
import { statusSchema } from "@/lib/schemas/status";
import { idSchema, optionalText, optionalUrl } from "@/lib/schemas/form";

export const createApplicationSchema = z.object({
  company: z.string().trim().min(1, "Company is required"),
  title: z.string().trim().min(1, "Title is required"),
  url: optionalUrl,
  notes: optionalText(),
  status: statusSchema.default("applied"),
});

export type CreateApplicationInput = z.infer<typeof createApplicationSchema>;

export const updateApplicationSchema = z.object({
  id: idSchema,
  company: z.string().trim().min(1, "Company is required").optional(),
  title: z.string().trim().min(1, "Title is required").optional(),
  url: optionalUrl,
  notes: optionalText(),
  status: statusSchema.optional(),
});

export type UpdateApplicationInput = z.infer<typeof updateApplicationSchema>;

export const moveApplicationSchema = z.object({
  id: idSchema,
  status: statusSchema,
});

export type MoveApplicationInput = z.infer<typeof moveApplicationSchema>;

export const deleteApplicationSchema = z.object({
  id: idSchema,
});

export type DeleteApplicationInput = z.infer<typeof deleteApplicationSchema>;
