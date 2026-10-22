import "server-only";
import { getDb } from "@/server/db/client";
import { getMode } from "@/server/mode";
import { requireUserId } from "@/server/current-user";
import { searchDocuments } from "@/server/db/search-store";
import { searchDocs } from "@/lib/search/search";
import type { SearchResult } from "@/lib/search/response";

// Searches your jobs (docs/search.md). Listing text stays on the server:
// a result carries only the snippet around a listing match.
export async function searchJobs(query: string, limit = 20): Promise<SearchResult[]> {
  const db = getDb(await getMode());
  const docs = searchDocuments(db, await requireUserId());
  return searchDocs(docs, query, limit).map(({ doc, field, snippet }) => ({
    jobId: doc.jobId,
    applicationId: doc.applicationId,
    company: doc.company,
    title: doc.title,
    status: doc.status,
    field,
    snippet,
  }));
}
