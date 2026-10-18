import { z } from "zod";
import { idSchema, optionalText, optionalUrl } from "@/lib/schemas/form";

// Caps what a single comparison request can cost. Long enough for any real
// listing; a paste over this is almost always a whole page by mistake, and
// it's better to catch that when saving than as an API error later.
export const LISTING_TEXT_MAX = 20_000;
export const JOB_NOTES_MAX = 5_000;

const savedJobFields = {
  company: z.string().trim().min(1, "Company is required"),
  title: z.string().trim().min(1, "Title is required"),
  url: optionalUrl,
  listingText: optionalText(
    LISTING_TEXT_MAX,
    `Listing text must be ${LISTING_TEXT_MAX.toLocaleString("en-US")} characters or fewer`,
  ),
  notes: optionalText(
    JOB_NOTES_MAX,
    `Notes must be ${JOB_NOTES_MAX.toLocaleString("en-US")} characters or fewer`,
  ),
};

export const createSavedJobSchema = z.object(savedJobFields);

export type CreateSavedJobInput = z.infer<typeof createSavedJobSchema>;

// The edit form always submits every field, so an update is a full replace:
// a field left blank means "clear it", not "leave it unchanged". That's
// why this reuses the create fields as-is instead of making them optional.
export const updateSavedJobSchema = z.object({
  id: idSchema,
  ...savedJobFields,
});

export type UpdateSavedJobInput = z.infer<typeof updateSavedJobSchema>;

export const savedJobIdSchema = z.object({ id: idSchema });

export type SavedJobIdInput = z.infer<typeof savedJobIdSchema>;
