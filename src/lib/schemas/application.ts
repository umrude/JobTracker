import { z } from "zod";
import { statusSchema } from "@/lib/schemas/status";
import { idSchema, optionalText, optionalUrl } from "@/lib/schemas/form";
import { LISTING_TEXT_MAX } from "@/lib/schemas/job";

const listingMessage = `Listing text must be ${LISTING_TEXT_MAX.toLocaleString("en-US")} characters or fewer`;

export const createApplicationSchema = z.object({
  company: z.string().trim().min(1, "Company is required"),
  title: z.string().trim().min(1, "Title is required"),
  url: optionalUrl,
  // Optional: without it, the application can't be compared or counted in
  // insights (it says so on the card).
  listingText: optionalText(LISTING_TEXT_MAX, listingMessage),
  notes: optionalText(),
  status: statusSchema.default("applied"),
  passedScreening: z.boolean().optional(),
});

export type CreateApplicationInput = z.infer<typeof createApplicationSchema>;

export const updateApplicationSchema = z.object({
  id: idSchema,
  company: z.string().trim().min(1, "Company is required").optional(),
  title: z.string().trim().min(1, "Title is required").optional(),
  url: optionalUrl,
  // Not optionalText: the edit form always sends it, and a blank one means
  // "clear the listing", where optionalText would read it as "unchanged".
  listingText: z.string().max(LISTING_TEXT_MAX, listingMessage).optional(),
  notes: optionalText(),
  status: statusSchema.optional(),
  passedScreening: z.boolean().optional(),
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
