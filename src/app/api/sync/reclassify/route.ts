import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { isWritable } from "@/server/mode";
import { requireSession } from "@/server/require-session";
import { runReclassify } from "@/server/gmail-sync";
import { describeReclassify } from "@/server/gmail/sync";
import type { SyncResponse } from "@/lib/email/sync-response";

// POST /api/sync/reclassify: "Classify again" for emails stored as
// "Couldn't classify" (say, while the Anthropic account was out of
// credits). A route handler for the same reasons as /api/sync: a job with
// a result to report. Same session and read-only checks.

export async function POST() {
  await requireSession();
  if (!isWritable()) {
    return NextResponse.json<SyncResponse>({ ok: false, message: "Disabled in the read-only demo." }, { status: 403 });
  }

  const result = await runReclassify();
  // Some rows may have been classified before a stop, so refresh either way.
  revalidatePath("/", "layout");
  if (!result.ok) {
    return NextResponse.json<SyncResponse>({ ok: false, message: result.message }, { status: result.reason === "failed" ? 500 : 409 });
  }
  return NextResponse.json<SyncResponse>({ ok: true, message: describeReclassify(result.summary) });
}
