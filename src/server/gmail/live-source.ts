import "server-only";
import { gmail, type gmail_v1 } from "@googleapis/gmail";
import type { EmailMeta } from "@/lib/schemas/email";
import { ATS_DOMAINS } from "@/lib/email/prefilter";
import { extractBodyText, toEmailMeta } from "@/server/gmail/parse";
import { GmailReconnectNeeded, MAX_MESSAGES, type MailBatch, type MailSource } from "@/server/gmail/mail-source";
import { httpStatus, isInvalidGrant, oauthClient, retryAfterSeconds } from "@/server/gmail/oauth";
import { createQuotaLimiter, GMAIL_UNITS, isRateLimited, retryDelayMs } from "@/server/gmail/quota";

// The Gmail mail source. Read-only by construction: the token only grants
// gmail.readonly, and this only calls list and get.
//
// Cost: Gmail meters calls in quota units per user per minute. Listing is
// cheap (ids only); each message then needs a metadata read (5 units).
// Every call waits its turn in a quota limiter (quota.ts) so a sync stays
// under the limit, and a refusal anyway (another app sharing the quota,
// say) is waited out and retried rather than failing the sync.

const CONCURRENCY = 8;
const MAX_ATTEMPTS = 5;
// Not your email: what you sent, drafts, chat, spam, and trash.
const SKIP_LABELS = new Set(["SENT", "DRAFT", "CHAT", "SPAM", "TRASH"]);
const SKIP_QUERY = "-in:sent -in:drafts -in:chats";
// The same rule as the pre-filter, applied in Gmail's search so those
// messages are never read at all: Promotions and Social are skipped,
// except mail from an applicant-tracking system, which is always kept.
// ({a b} is Gmail search's OR.)
const MAIN_QUERY = `${SKIP_QUERY} -category:promotions -category:social`;
const ATS_IN_NOISE_QUERY = `${SKIP_QUERY} {${ATS_DOMAINS.map((d) => `from:${d}`).join(" ")}} {category:promotions category:social}`;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function liveMailSource(refreshToken: string): MailSource {
  const auth = oauthClient();
  // Only the refresh token: the client fetches a short-lived access token
  // itself when the first request needs one.
  auth.setCredentials({ refresh_token: refreshToken });
  const api = gmail({ version: "v1", auth });
  // One per source, so one sync (including the classifier's body reads)
  // shares one budget.
  const limiter = createQuotaLimiter();

  // Runs a Google call within the quota: waits its turn, retries rate-limit
  // refusals, and turns a refused refresh token into the one error sync
  // knows how to handle.
  async function call<T>(units: number, request: () => Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      await limiter.take(units);
      try {
        return await request();
      } catch (error) {
        if (isInvalidGrant(error)) throw new GmailReconnectNeeded();
        const message = error instanceof Error ? error.message : "";
        if (attempt < MAX_ATTEMPTS && isRateLimited(httpStatus(error), message)) {
          await sleep(retryDelayMs(attempt, retryAfterSeconds(error)));
          continue;
        }
        throw error;
      }
    }
  }

  async function metadata(id: string): Promise<EmailMeta | null> {
    try {
      const { data } = await call(GMAIL_UNITS.messagesGet, () =>
        api.users.messages.get({ userId: "me", id, format: "metadata", metadataHeaders: ["From", "Subject"] }),
      );
      return toEmailMeta(data);
    } catch (error) {
      // Deleted between listing and reading: nothing to do.
      if (httpStatus(error) === 404) return null;
      throw error;
    }
  }

  async function allMetadata(ids: string[]): Promise<EmailMeta[]> {
    const results: EmailMeta[] = [];
    for (let i = 0; i < ids.length; i += CONCURRENCY) {
      const chunk = await Promise.all(ids.slice(i, i + CONCURRENCY).map(metadata));
      for (const meta of chunk) if (meta) results.push(meta);
    }
    return results.sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime());
  }

  async function batch(ids: string[], historyId: string, more: boolean): Promise<MailBatch> {
    return {
      messages: await allMetadata(ids.slice(0, MAX_MESSAGES)),
      historyId,
      truncated: more || ids.length > MAX_MESSAGES,
    };
  }

  // Message ids matching a search, newest first, up to the cap.
  async function search(q: string): Promise<{ ids: string[]; more: boolean }> {
    const ids: string[] = [];
    let pageToken: string | undefined;
    do {
      const { data }: { data: gmail_v1.Schema$ListMessagesResponse } = await call(GMAIL_UNITS.messagesList, () =>
        api.users.messages.list({ userId: "me", q, maxResults: 500, pageToken }),
      );
      for (const message of data.messages ?? []) if (message.id) ids.push(message.id);
      pageToken = data.nextPageToken ?? undefined;
    } while (pageToken && ids.length <= MAX_MESSAGES);
    return { ids, more: pageToken !== undefined };
  }

  return {
    async listSince(since) {
      // The history id is read first, so anything arriving while this runs
      // is picked up by the next sync rather than missed. (Seeing a message
      // twice is harmless: each is processed once.)
      const profile = await call(GMAIL_UNITS.getProfile, () => api.users.getProfile({ userId: "me" }));
      const historyId = profile.data.historyId;
      if (!historyId) throw new Error("Gmail didn't return a history id.");

      // Gmail's "after:" takes seconds since the epoch.
      const after = `after:${Math.floor(since.getTime() / 1000)}`;
      const main = await search(`${after} ${MAIN_QUERY}`);
      const ats = await search(`${after} ${ATS_IN_NOISE_QUERY}`);
      const ids = [...new Set([...main.ids, ...ats.ids])];
      return batch(ids, historyId, main.more || ats.more);
    },

    async listNew(startHistoryId) {
      const ids = new Set<string>();
      let historyId = startHistoryId;
      let pageToken: string | undefined;
      do {
        let data: gmail_v1.Schema$ListHistoryResponse;
        try {
          ({ data } = await call(GMAIL_UNITS.historyList, () =>
            api.users.history.list({ userId: "me", startHistoryId, historyTypes: ["messageAdded"], maxResults: 500, pageToken }),
          ));
        } catch (error) {
          // Gmail no longer has history that old: fall back to listSince.
          if (httpStatus(error) === 404) return null;
          throw error;
        }
        for (const entry of data.history ?? []) {
          for (const added of entry.messagesAdded ?? []) {
            const message = added.message;
            if (message?.id && !(message.labelIds ?? []).some((label) => SKIP_LABELS.has(label))) ids.add(message.id);
          }
        }
        historyId = data.historyId ?? historyId;
        pageToken = data.nextPageToken ?? undefined;
      } while (pageToken && ids.size <= MAX_MESSAGES);

      return batch([...ids], historyId, pageToken !== undefined);
    },

    async body(messageId) {
      const { data } = await call(GMAIL_UNITS.messagesGet, () =>
        api.users.messages.get({ userId: "me", id: messageId, format: "full" }),
      );
      return extractBodyText(data.payload);
    },
  };
}
