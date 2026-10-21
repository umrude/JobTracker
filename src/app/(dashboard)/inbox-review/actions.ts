"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertWritable, getMode } from "@/server/mode";
import { env } from "@/server/env";
import { requireSession } from "@/server/require-session";
import { chooseSyncStart, removeGmailConnection } from "@/server/db/gmail-connections";
import { addAsApplication, confirm, dismiss, link } from "@/server/db/email-events";
import type { DecideResult, LinkTarget } from "@/server/db/email-event-store";
import { statusSchema } from "@/lib/schemas/status";
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

// ---- Reviewing suggestions ----
// Each returns a message instead of throwing, so the card can say why
// (say, "the application has moved on since"). revalidatePath refreshes
// the page, the board, and the nav count.

const suggestionIdSchema = z.object({ id: z.coerce.number().int().positive() });
// The picker's value says what kind of thing it is: "app:12" for an
// application, "job:5" for a saved job.
const linkSchema = suggestionIdSchema.extend({
  target: z
    .string()
    .regex(/^(app|job):\d+$/, "Pick an application or saved job.")
    .transform((value): LinkTarget => {
      const [kind, id] = value.split(":");
      return { kind: kind === "app" ? "application" : "job", id: Number(id) };
    }),
});

// "Add as application": what you checked in the prefilled form.
const addFromEmailSchema = suggestionIdSchema.extend({
  company: z.string().trim().min(1, "Company is required.").max(200),
  title: z.string().trim().min(1, "Role is required.").max(200),
  status: statusSchema,
  // <input type="date"> sends "YYYY-MM-DD".
  appliedOn: z.iso.date({ error: "Pick the date you applied." }),
});

async function decide(run: () => Promise<DecideResult>, success: string): Promise<MessageState> {
  const result = await run();
  if (!result.ok) return { status: "error", message: result.message };
  revalidatePath("/", "layout");
  return { status: "success", message: success };
}

export async function confirmSuggestionAction(_prev: MessageState, formData: FormData): Promise<MessageState> {
  await requireSession();
  assertWritable();
  const parsed = suggestionIdSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: "Unknown suggestion." };
  return decide(() => confirm(parsed.data.id), "Moved.");
}

export async function dismissSuggestionAction(_prev: MessageState, formData: FormData): Promise<MessageState> {
  await requireSession();
  assertWritable();
  const parsed = suggestionIdSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: "Unknown suggestion." };
  return decide(() => dismiss(parsed.data.id), "Dismissed.");
}

export async function linkSuggestionAction(_prev: MessageState, formData: FormData): Promise<MessageState> {
  await requireSession();
  assertWritable();
  const parsed = linkSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: "Pick an application or saved job." };
  return decide(() => link(parsed.data.id, parsed.data.target), "Linked.");
}

export async function addAsApplicationAction(_prev: MessageState, formData: FormData): Promise<MessageState> {
  await requireSession();
  assertWritable();
  const parsed = addFromEmailSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const [first] = Object.values(z.flattenError(parsed.error).fieldErrors).flat();
    return { status: "error", message: first ?? "Check the form." };
  }
  const { id, company, title, status, appliedOn } = parsed.data;
  return decide(
    () => addAsApplication(id, { company, title, status, appliedAt: new Date(`${appliedOn}T12:00:00Z`) }),
    "Added to the board.",
  );
}
