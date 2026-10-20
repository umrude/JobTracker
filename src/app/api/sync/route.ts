import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { isWritable } from "@/server/mode";
import { requireSession } from "@/server/require-session";
import { runGmailSync } from "@/server/gmail-sync";
import { describeSync } from "@/server/gmail/sync";
import type { SyncResponse } from "@/lib/email/sync-response";

// POST /api/sync: runs one Gmail sync and returns its summary as JSON.
// A route handler rather than a Server Action because a sync is a
// long-running job with a result to report, not a form submission, and
// it leaves room for something other than the page (say, a scheduled task
// on this machine) to start one later. The Inbox page's "Sync now" button
// calls it with fetch.
//
// POST only, and it needs your session cookie, which Auth.js sets with
// SameSite=Lax: another site's page can't trigger a sync in your name.

export async function POST() {
  await requireSession();
  // Writes (suggestions), so the read-only public demo is refused here, on
  // the server. Answered as JSON instead of assertWritable()'s throw, so
  // the button can show why.
  if (!isWritable()) {
    return NextResponse.json<SyncResponse>({ ok: false, message: "Syncing is disabled in the read-only demo." }, { status: 403 });
  }

  const result = await runGmailSync();
  if (!result.ok) {
    return NextResponse.json<SyncResponse>(
      { ok: false, message: result.message },
      { status: result.reason === "failed" ? 500 : 409 },
    );
  }
  revalidatePath("/", "layout");
  return NextResponse.json<SyncResponse>({ ok: true, message: describeSync(result.summary) });
}
