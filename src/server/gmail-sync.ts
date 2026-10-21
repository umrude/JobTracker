import "server-only";
import { getDb } from "@/server/db/client";
import { getMode } from "@/server/mode";
import { env } from "@/server/env";
import { requireUserId } from "@/server/current-user";
import { defaultSyncStart } from "@/lib/email/sync-window";
import { earliestAppliedAt, gmailConnectionRow, markGmailNeedsReconnect, recordGmailSync } from "@/server/db/gmail-store";
import { getMailSource } from "@/server/db/gmail-connections";
import { GmailReconnectNeeded, type MailSource } from "@/server/gmail/mail-source";
import { httpStatus } from "@/server/gmail/oauth";
import { isRateLimited } from "@/server/gmail/quota";
import {
  ClassifierUnavailable,
  reclassifyStored,
  syncInbox,
  type Classifier,
  type ReclassifySummary,
  type SyncPosition,
  type SyncSummary,
} from "@/server/gmail/sync";
import type { LlmErrorKind } from "@/lib/llm-result";
import { getLlmClient } from "@/server/llm/client";
import { classifyEmail } from "@/server/llm/classify-email";
import { demoClassification, DEMO_CLASSIFIER_MODEL } from "@/server/llm/classify-demo";

// "Sync now" and "Classify again": wire syncInbox and reclassifyStored
// (gmail/sync.ts) to the current mode. Live:
// your Gmail, the model, and the stored sync position. Demo: the demo
// inbox and canned answers, never Google or Anthropic.

export type SyncFailure =
  | "not_connected"
  | "reconnect"
  | "missing_api_key"
  | "out_of_credits"
  | "classifier_unavailable"
  | "rate_limited"
  | "failed";
// Why a run (sync or "Classify again") couldn't finish, and what to tell you.
export type RunFailure = { ok: false; reason: SyncFailure; message: string };
export type SyncResult = { ok: true; summary: SyncSummary } | RunFailure;

const DAY = 24 * 60 * 60 * 1000;

const FAILURE_MESSAGES: Record<SyncFailure, string> = {
  not_connected: "Connect Gmail first.",
  reconnect: "Google no longer accepts the Gmail connection. Reconnect Gmail to keep syncing.",
  missing_api_key: "Set ANTHROPIC_API_KEY in .env: syncing classifies emails with the model.",
  out_of_credits:
    "Sync stopped: your Anthropic account is out of credits, so emails couldn't be classified. Nothing was skipped: add credits at console.anthropic.com (Settings, Billing), then sync again to pick up where it stopped.",
  classifier_unavailable: "Sync stopped: the model couldn't be reached. Nothing was skipped; sync again to pick up where it stopped.",
  rate_limited:
    "Gmail's per-minute limit was still reached after waiting. Wait a minute and sync again: emails already handled won't be redone.",
  failed: "The sync didn't finish. Nothing was lost; try again in a moment.",
};

const fail = (reason: SyncFailure, message = FAILURE_MESSAGES[reason]): RunFailure => ({ ok: false, reason, message });

// Errors that mean the model can't classify anything right now, rather
// than this one email: the sync stops and can be run again later.
const STOPS_SYNC: Partial<Record<LlmErrorKind, "out_of_credits" | "unavailable">> = {
  out_of_credits: "out_of_credits",
  missing_api_key: "unavailable",
  api_error: "unavailable",
};

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
    if (result.ok) return { ok: true, classification: result.data.classification, model: result.data.model };
    const stop = STOPS_SYNC[result.error.kind];
    return { ok: false, message: result.error.message, ...(stop ? { stopSync: { reason: stop } } : {}) };
  };
}

const demoClassifier: Classifier = async (email) => ({
  ok: true,
  classification: demoClassification(email.id),
  model: DEMO_CLASSIFIER_MODEL,
});

type Prepared = {
  mode: "live" | "demo";
  db: ReturnType<typeof getDb>;
  userId: number;
  source: MailSource;
  classify: Classifier;
};

// What both sync and "Classify again" need: the mail source and the
// classifier for the current mode, or why they can't run.
async function prepare(now: Date): Promise<{ ok: true; prepared: Prepared } | { ok: false; result: RunFailure }> {
  const mode = await getMode();
  const db = getDb(mode);
  const userId = await requireUserId();

  let source: MailSource | null;
  try {
    source = await getMailSource(now);
  } catch (error) {
    if (error instanceof GmailReconnectNeeded) return { ok: false, result: fail("reconnect") };
    throw error;
  }
  if (!source) return { ok: false, result: fail("not_connected") };

  if (mode === "demo") return { ok: true, prepared: { mode, db, userId, source, classify: demoClassifier } };
  const classify = liveClassifier(source);
  if (!classify) return { ok: false, result: fail("missing_api_key") };
  return { ok: true, prepared: { mode, db, userId, source, classify } };
}

// Turns an error from a run into the failure to show, the same way for
// sync and "Classify again". What to do next is the same too: run it
// again, and it picks up where it stopped.
function failureFor(error: unknown, db: Prepared["db"], userId: number, again: string): RunFailure {
  if (error instanceof GmailReconnectNeeded) {
    markGmailNeedsReconnect(db, userId);
    return fail("reconnect");
  }
  if (error instanceof ClassifierUnavailable) {
    const reason = error.reason === "out_of_credits" ? "out_of_credits" : "classifier_unavailable";
    const why =
      reason === "out_of_credits"
        ? "your Anthropic account is out of credits, so emails couldn't be classified. Add credits at console.anthropic.com (Settings, Billing), then"
        : `${error.message}`;
    return fail(reason, `Stopped: ${why} ${again} Nothing was skipped; it picks up where it stopped.`);
  }
  if (isRateLimited(httpStatus(error), error instanceof Error ? error.message : "")) return fail("rate_limited");
  console.error("Gmail sync failed", error);
  return fail("failed");
}

export async function runGmailSync(now = new Date()): Promise<SyncResult> {
  const ready = await prepare(now);
  if (!ready.ok) return ready.result;
  const { mode, db, userId, source, classify } = ready.prepared;

  const defaultStart = defaultSyncStart(earliestAppliedAt(db, userId), now);
  let position: SyncPosition;
  if (mode === "demo") {
    // The demo inbox has no history; each message is processed once anyway.
    position = { historyId: null, since: defaultStart };
  } else {
    const row = gmailConnectionRow(db, userId);
    if (!row) return fail("not_connected");
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
    return failureFor(error, db, userId, "sync again.");
  }
}

export type ReclassifyResult = { ok: true; summary: ReclassifySummary } | RunFailure;

// "Classify again" for emails stored as "Couldn't classify".
export async function runReclassify(now = new Date()): Promise<ReclassifyResult> {
  const ready = await prepare(now);
  if (!ready.ok) return ready.result;
  const { db, userId, classify } = ready.prepared;
  try {
    return { ok: true, summary: await reclassifyStored({ db, userId, classify, now }) };
  } catch (error) {
    return failureFor(error, db, userId, "run Classify again.");
  }
}
