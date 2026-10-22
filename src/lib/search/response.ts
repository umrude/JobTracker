import { z } from "zod";
import { statusSchema } from "@/lib/schemas/status";

// What GET /api/search answers: the hits, without listing text (only the
// snippet around a listing match). A schema because the search box reads
// it with fetch: the JSON arrives as unknown and is validated before use.
export const searchResultSchema = z.object({
  jobId: z.number(),
  applicationId: z.number().nullable(),
  company: z.string(),
  title: z.string(),
  // Null for a saved job.
  status: statusSchema.nullable(),
  field: z.enum(["company", "title", "listing"]),
  snippet: z.object({ before: z.string(), match: z.string(), after: z.string() }).nullable(),
});

export const searchResponseSchema = z.object({ results: z.array(searchResultSchema) });

export type SearchResult = z.infer<typeof searchResultSchema>;
