"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertWritable, getMode } from "@/server/mode";
import { env } from "@/server/env";
import { requireSession } from "@/server/require-session";
import { chooseSyncStart, removeGmailConnection } from "@/server/db/gmail-connections";
import {
  GMAIL_CALLBACK_PATH,
  GMAIL_OAUTH_COOKIE,
  GMAIL_OAUTH_COOKIE_MAX_AGE,
  gmailConfigProblem,
  revokeAtGoogle,
  startConnect,
} from "@/server/gmail/oauth";
import { checkSyncStart } from "@/lib/email/sync-window";
import type { MessageState } from "@/lib/form-state";

// Connect and Disconnect end in a redirect (to Google, or back to the page
// with a notice), so they're plain form actions rather than
// useActionState ones: there's no form state to keep.

export async function connectGmailAction() {
  const session = await requireSession();
  assertWritable();
  if ((await getMode()) !== "live") redirect("/inbox-review?gmail=unavailable");
  const problem = gmailConfigProblem();
  if (problem) redirect(`/inbox-review?gmail=${problem}`);

  const { url, pending } = await startConnect(session?.user?.email ?? undefined);
  (await cookies()).set(GMAIL_OAUTH_COOKIE, JSON.stringify(pending), {
    httpOnly: true,
    // "lax" is what lets the cookie ride along on Google's top-level
    // redirect back; "strict" would drop it.
    sameSite: "lax",
    secure: env.APP_URL.startsWith("https://"),
    // Sent only to the callback, and only for a few minutes.
    path: GMAIL_CALLBACK_PATH,
    maxAge: GMAIL_OAUTH_COOKIE_MAX_AGE,
  });
  redirect(url);
}

export async function disconnectGmailAction() {
  await requireSession();
  assertWritable();
  if ((await getMode()) !== "live") redirect("/inbox-review?gmail=unavailable");

  // Deleted here first, so it's gone even if Google can't be reached.
  const token = await removeGmailConnection();
  const revoked = token ? await revokeAtGoogle(token) : true;
  revalidatePath("/", "layout");
  redirect(`/inbox-review?gmail=${revoked ? "disconnected" : "disconnected_unrevoked"}`);
}

// <input type="date"> sends "YYYY-MM-DD".
const syncStartSchema = z.object({ start: z.iso.date({ error: "Pick a date." }) });

export async function chooseSyncStartAction(_prev: MessageState, formData: FormData): Promise<MessageState> {
  await requireSession();
  assertWritable();

  const parsed = syncStartSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: "Pick a date." };
  const checked = checkSyncStart(new Date(`${parsed.data.start}T00:00:00Z`), new Date());
  if (!checked.ok) return { status: "error", message: checked.message };

  if (!(await chooseSyncStart(checked.start))) {
    return { status: "error", message: "The first sync has already run, so the start date is fixed." };
  }
  revalidatePath("/inbox-review");
  return { status: "success", message: "Start date saved." };
}
