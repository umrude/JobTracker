// No "server-only" here: types only, shared by the demo and live sources.
import type { EmailMeta } from "@/lib/schemas/email";

// Where sync reads email from. Gmail in live mode (live-source.ts), the
// demo inbox in demo mode (demo-source.ts): sync (Step 4d) is written
// once against this and never knows which it has, so demo mode exercises
// the same code path without calling Google.

export type MailBatch = {
  // Metadata only (headers, snippet, labels), newest first.
  messages: EmailMeta[];
  // Pass to listNew next time to get only what arrived after this batch.
  historyId: string;
  // True if there were more messages than one sync reads (MAX_MESSAGES);
  // the oldest were left out.
  truncated: boolean;
};

export type MailSource = {
  // Everything received on or after `since`: the first sync, or the
  // fallback when Gmail no longer has the history listNew needs.
  listSince(since: Date): Promise<MailBatch>;
  // What arrived after `historyId`. Null if Gmail no longer keeps that much
  // history (it keeps roughly a week); the caller then uses listSince.
  listNew(historyId: string): Promise<MailBatch | null>;
  // The readable text of one message, for the classifier. Fetched when
  // needed and never stored.
  body(messageId: string): Promise<string>;
};

// The most messages one sync reads. A first sync over months of a busy
// inbox can be thousands; each costs one metadata request.
export const MAX_MESSAGES = 2000;

// Thrown when Google refuses the stored refresh token: revoked, or expired
// (7 days for a Google app in Testing). Sync catches it and marks the
// connection "Reconnect Gmail".
export class GmailReconnectNeeded extends Error {
  constructor() {
    super("Google no longer accepts this Gmail connection. Reconnect Gmail to keep syncing.");
    this.name = "GmailReconnectNeeded";
  }
}
