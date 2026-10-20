import "server-only";
import { getDb } from "@/server/db/client";
import { getMode } from "@/server/mode";
import { env } from "@/server/env";
import { requireUserId } from "@/server/current-user";
import { defaultSyncStart } from "@/lib/email/sync-window";
import { earliestAppliedAt, gmailConnectionRow, markGmailNeedsReconnect, recordGmailSync } from "@/server/db/gmail-store";
import { getMailSource } from "@/server/db/gmail-connections";
import { GmailReconnectNeeded, type MailSource } from "@/server/gmail/mail-source";
import { syncInbox, type Classifier, type SyncPosition, type SyncSummary } from "@/server/gmail/sync";
import { getLlmClient } from "@/server/llm/client";
import { classifyEmail } from "@/server/llm/classify-email";
import { demoClassification, DEMO_CLASSIFIER_MODEL } from "@/server/llm/classify-demo";

// "Sync now": wires syncInbox (gmail/sync.ts) to the current mode. Live:
// your Gmail, the model, and the stored sync position. Demo: the demo
// inbox and canned answers, never Google or Anthropic.

export type SyncFailure = "not_connected" | "reconnect" | "missing_api_key" | "failed";
export type SyncResult = { ok: true; summary: SyncSummary } | { ok: false; reason: SyncFailure; message: string };

const DAY = 24 * 60 * 60 * 1000;

const FAILURE_MESSAGES: Record<SyncFailure, string> = {
  not_connected: "Connect Gmail first.",
  reconnect: "Google no longer accepts the Gmail connection. Reconnect Gmail to keep syncing.",
  missing_api_key: "Set ANTHROPIC_API_KEY in .env: syncing classifies emails with the model.",
  failed: "The sync didn't finish. Nothing was lost; try again in a moment.",
};

const fail = (reason: SyncFailure): SyncResult => ({ ok: false, reason, message: FAILURE_MESSAGES[reason] });

function liveClassifier(source: MailSource): Classifier | null {
  const client = getLlmClient(env.ANTHROPIC_CLASSIFIER_MODEL);
  if (!client.ok) return null;
  return async (email, app) => {
    // The body is read for the model and dropped; only the snippet and the
    // model's answer are stored. If it can't be read, the snippet will do.
    let body = email.snippet;
    try {
      body = (await source.body(email.id)) || email.snippet;
    } catch (error) {
      if (error instanceof GmailReconnectNeeded) throw error;
    }
    const result = await classifyEmail(
      {
        fromName: email.fromName,
        fromAddress: email.fromAddress,
        subject: email.subject,
        body,
        application: app ? { company: app.company, title: app.title } : null,
      },
      client.data,
    );
    return result.ok
      ? { ok: true, classification: result.data.classification, model: result.data.model }
      : { ok: false, message: result.error.message };
  };
}

const demoClassifier: Classifier = async (email) => ({
  ok: true,
  classification: demoClassification(email.id),
  model: DEMO_CLASSIFIER_MODEL,
});

export async function runGmailSync(now = new Date()): Promise<SyncResult> {
  const mode = await getMode();
  const db = getDb(mode);
  const userId = await requireUserId();

  let source: MailSource | null;
  try {
    source = await getMailSource(now);
  } catch (error) {
    if (error instanceof GmailReconnectNeeded) return fail("reconnect");
    throw error;
  }
  if (!source) return fail("not_connected");

  const defaultStart = defaultSyncStart(earliestAppliedAt(db, userId), now);
  let position: SyncPosition;
  let classify: Classifier;
  if (mode === "demo") {
    // The demo inbox has no history; each message is processed once anyway.
    position = { historyId: null, since: defaultStart };
    classify = demoClassifier;
  } else {
    const row = gmailConnectionRow(db, userId);
    if (!row) return fail("not_connected");
    const live = liveClassifier(source);
    if (!live) return fail("missing_api_key");
    classify = live;
    // If Gmail's history has run out, re-list from a day before the last
    // sync (already-processed messages are skipped).
    const since = row.historyId && row.lastSyncedAt ? new Date(row.lastSyncedAt.getTime() - DAY) : (row.syncStartAt ?? defaultStart);
    position = { historyId: row.historyId, since };
  }

  try {
    const { summary, historyId } = await syncInbox({ db, userId, source, classify, position, now });
    if (mode === "live") recordGmailSync(db, userId, historyId, now);
    return { ok: true, summary };
  } catch (error) {
    if (error instanceof GmailReconnectNeeded) {
      markGmailNeedsReconnect(db, userId);
      return fail("reconnect");
    }
    console.error("Gmail sync failed", error);
    return fail("failed");
  }
}
