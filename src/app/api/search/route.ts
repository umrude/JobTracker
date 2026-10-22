import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireSession } from "@/server/require-session";
import { searchJobs } from "@/server/search";
import type { searchResponseSchema } from "@/lib/search/response";

// GET /api/search?q=...: the header search box's results. A GET route
// rather than a Server Action: Server Actions from one page run one at a
// time, which makes search-as-you-type lag; GET requests run side by side
// and the box cancels the ones it no longer needs. Read-only; requires a
// session; private (no caching of your results).
const querySchema = z.string().trim().max(200);

export async function GET(request: NextRequest) {
  await requireSession();
  const query = querySchema.safeParse(request.nextUrl.searchParams.get("q") ?? "");
  const results = query.success && query.data.length >= 2 ? await searchJobs(query.data) : [];
  return NextResponse.json<z.infer<typeof searchResponseSchema>>({ results }, { headers: { "Cache-Control": "private, no-store" } });
}
