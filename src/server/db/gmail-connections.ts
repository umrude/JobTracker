import "server-only";
import { getDb } from "@/server/db/client";
import { getMode } from "@/server/mode";
import { env } from "@/server/env";
import { requireUserId } from "@/server/current-user";
import { defaultSyncStart } from "@/lib/email/sync-window";
import {
  deleteGmailConnection,
  earliestAppliedAt,
  gmailConnectionRow,
  markGmailNeedsReconnect,
  setGmailSyncStart,
  upsertGmailConnection,
} from "@/server/db/gmail-store";
import { decryptToken, encryptToken, parseKey } from "@/server/gmail/token-cipher";
import { demoMailSource } from "@/server/gmail/demo-source";
import { liveMailSource } from "@/server/gmail/live-source";
import { GmailReconnectNeeded, type MailSource } from "@/server/gmail/mail-source";

// The app's entry points for the Gmail connection: the current mode's
// database and the current user, with tokens encrypted on the way in and
// decrypted only to build a mail source. A decrypted token never leaves
// this module except to Google (revoking it, or the mail source's calls).

async function scope() {
  const mode = await getMode();
  return { mode, db: getDb(mode), userId: await requireUserId() };
}

function tokenKey(): Buffer {
  if (!env.TOKEN_ENCRYPTION_KEY) throw new Error("TOKEN_ENCRYPTION_KEY isn't set. See .env.example.");
  return parseKey(env.TOKEN_ENCRYPTION_KEY);
}

export type GmailStatus =
  // Demo mode: the demo inbox, no Google account.
  | { kind: "demo"; syncStartAt: Date }
  | { kind: "none"; defaultSyncStartAt: Date }
  | {
      kind: "connected";
      email: string;
      connectedAt: Date;
      needsReconnect: boolean;
      // The chosen start date, or the default if none was chosen.
      syncStartAt: Date;
      startChosen: boolean;
      lastSyncedAt: Date | null;
      // Whether the first sync has run (after it, the start date is fixed).
      synced: boolean;
    };

export async function getGmailStatus(now = new Date()): Promise<GmailStatus> {
  const { mode, db, userId } = await scope();
  const defaultStart = defaultSyncStart(earliestAppliedAt(db, userId), now);
  if (mode === "demo") return { kind: "demo", syncStartAt: defaultStart };

  const row = gmailConnectionRow(db, userId);
  if (!row) return { kind: "none", defaultSyncStartAt: defaultStart };
  return {
    kind: "connected",
    email: row.email,
    connectedAt: row.connectedAt,
    needsReconnect: row.needsReconnect,
    syncStartAt: row.syncStartAt ?? defaultStart,
    startChosen: row.syncStartAt !== null,
    lastSyncedAt: row.lastSyncedAt,
    synced: row.historyId !== null,
  };
}

// Just the banner's question, without the default-start query.
export async function gmailNeedsReconnect(): Promise<boolean> {
  const { mode, db, userId } = await scope();
  return mode === "live" && (gmailConnectionRow(db, userId)?.needsReconnect ?? false);
}

export async function saveGmailConnection(input: { email: string; refreshToken: string; scope: string }): Promise<void> {
  const { db, userId } = await scope();
  upsertGmailConnection(db, userId, {
    email: input.email,
    scope: input.scope,
    encryptedRefreshToken: encryptToken(input.refreshToken, tokenKey(), userId),
  });
}

// Deletes the connection. Returns the refresh token so the caller can
// revoke it at Google, or null if there was none or it can't be decrypted
// (a changed key): then there's nothing usable to revoke.
export async function removeGmailConnection(): Promise<string | null> {
  const { db, userId } = await scope();
  const sealed = deleteGmailConnection(db, userId);
  if (!sealed || !env.TOKEN_ENCRYPTION_KEY) return null;
  try {
    return decryptToken(sealed, tokenKey(), userId);
  } catch {
    return null;
  }
}

export async function markNeedsReconnect(): Promise<void> {
  const { db, userId } = await scope();
  markGmailNeedsReconnect(db, userId);
}

export async function chooseSyncStart(start: Date): Promise<boolean> {
  const { db, userId } = await scope();
  return setGmailSyncStart(db, userId, start);
}

// Where sync reads email from: the demo inbox in demo mode, else Gmail
// with your stored token. Null if Gmail isn't connected. Throws
// GmailReconnectNeeded (and marks the connection) if the token can't be
// used, so sync handles a bad key like an expired grant.
export async function getMailSource(now = new Date()): Promise<MailSource | null> {
  const { mode, db, userId } = await scope();
  if (mode === "demo") return demoMailSource(now);

  const row = gmailConnectionRow(db, userId);
  if (!row) return null;
  if (row.needsReconnect) throw new GmailReconnectNeeded();
  let refreshToken: string;
  try {
    refreshToken = decryptToken(row.encryptedRefreshToken, tokenKey(), userId);
  } catch {
    markGmailNeedsReconnect(db, userId);
    throw new GmailReconnectNeeded();
  }
  return liveMailSource(refreshToken);
}
