import { z } from "zod";

// What POST /api/sync answers: whether it worked, and a sentence to show.
// A schema rather than just a type because the Sync button reads it with
// fetch: the JSON arrives as unknown and is validated before use.
export const syncResponseSchema = z.object({ ok: z.boolean(), message: z.string() });
export type SyncResponse = z.infer<typeof syncResponseSchema>;
