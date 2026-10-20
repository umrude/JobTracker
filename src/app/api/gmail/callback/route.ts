import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getMode, isWritable } from "@/server/mode";
import { requireSession } from "@/server/require-session";
import { saveGmailConnection } from "@/server/db/gmail-connections";
import { finishConnect, GMAIL_CALLBACK_PATH, GMAIL_OAUTH_COOKIE, statesMatch } from "@/server/gmail/oauth";
import type { GmailNotice } from "@/lib/email/connect-notices";

// Where Google sends you back after the Gmail consent screen. A route
// handler, not a Server Action: it's a plain GET navigation from Google,
// and Server Actions are only invoked by this app's own forms.

const pendingSchema = z.object({ state: z.string(), verifier: z.string() });

function readPending(raw: string | undefined) {
  if (!raw) return null;
  try {
    const parsed = pendingSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  // Every outcome lands on the inbox page with a notice, and the one-use
  // state cookie is cleared.
  const done = (notice: GmailNotice) => {
    const response = NextResponse.redirect(new URL(`/inbox-review?gmail=${notice}`, request.url));
    response.cookies.delete({ name: GMAIL_OAUTH_COOKIE, path: GMAIL_CALLBACK_PATH });
    return response;
  };

  // Writes, so read-only demo is refused here, on the server. A local demo
  // preview is refused too: a real token must not land in the demo DB.
  if (!isWritable() || (await getMode()) !== "live") return done("unavailable");
  await requireSession();

  const params = request.nextUrl.searchParams;
  // The state check comes first: without it, the rest could be someone
  // else's authorization code planted into your session.
  const pending = readPending(request.cookies.get(GMAIL_OAUTH_COOKIE)?.value);
  if (!pending || !statesMatch(pending.state, params.get("state"))) return done("state");
  if (params.get("error")) return done(params.get("error") === "access_denied" ? "denied" : "failed");
  const code = params.get("code");
  if (!code) return done("failed");

  let result;
  try {
    result = await finishConnect(code, pending.verifier);
  } catch {
    return done("failed");
  }
  if (!result.ok) return done(result.reason);

  await saveGmailConnection(result);
  return done("connected");
}
