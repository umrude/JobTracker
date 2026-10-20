// No "server-only" here, like demo-inbox.ts: fixtures only, used by tests.
import { demoInbox } from "@/server/gmail/demo-inbox";
import type { MailBatch, MailSource } from "@/server/gmail/mail-source";

// Demo mode's mail source: the demo inbox, never Google. The demo inbox
// doesn't change, so it has no real history: listNew returns the whole
// inbox again, which is safe because sync processes each message once per
// user (the unique index on email_events).
export const DEMO_HISTORY_ID = "demo";

export function demoMailSource(now: Date): MailSource {
  const inbox = demoInbox(now);
  const batch = (since: Date): MailBatch => ({
    messages: inbox
      .map((email) => email.meta)
      .filter((meta) => meta.receivedAt.getTime() >= since.getTime())
      .sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime()),
    historyId: DEMO_HISTORY_ID,
    truncated: false,
  });

  return {
    listSince: async (since) => batch(since),
    listNew: async () => batch(new Date(0)),
    body: async (messageId) => {
      const email = inbox.find((e) => e.meta.id === messageId);
      if (!email) throw new Error(`No demo email ${messageId}.`);
      return email.body;
    },
  };
}
