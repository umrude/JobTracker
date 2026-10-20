import { z } from "zod";

// What happened after "Connect Gmail" or "Disconnect", passed back to the
// inbox page as ?gmail=<notice>. Parsed with Zod: a URL is user input, so
// only these known values ever reach the page, and the text shown is ours.

export const GMAIL_NOTICES = [
  "connected",
  "disconnected",
  "disconnected_unrevoked",
  "denied",
  "state",
  "failed",
  "no_readonly",
  "no_refresh_token",
  "unavailable",
  "missing_client",
  "missing_key",
] as const;

export const gmailNoticeSchema = z.enum(GMAIL_NOTICES);
export type GmailNotice = z.infer<typeof gmailNoticeSchema>;

export const GMAIL_NOTICE_TEXT: Record<GmailNotice, { tone: "success" | "error"; text: string }> = {
  connected: { tone: "success", text: "Gmail connected (read-only). Pick a start date if you like, then sync." },
  disconnected: { tone: "success", text: "Gmail disconnected, and access revoked at Google." },
  disconnected_unrevoked: {
    tone: "error",
    text: "Gmail disconnected here, but Google couldn't be reached to revoke access. Remove it at myaccount.google.com/permissions.",
  },
  denied: { tone: "error", text: "Gmail wasn't connected: access was declined on Google's screen." },
  state: { tone: "error", text: "That connection attempt expired or didn't start here. Try Connect Gmail again." },
  failed: { tone: "error", text: "Couldn't finish connecting to Gmail. Try again." },
  no_readonly: {
    tone: "error",
    text: "Gmail wasn't connected: read access was unticked on Google's screen. It's the only permission asked for.",
  },
  no_refresh_token: {
    tone: "error",
    text: "Google didn't issue a lasting token. Remove the app at myaccount.google.com/permissions and connect again.",
  },
  unavailable: { tone: "error", text: "Connecting Gmail isn't available in demo mode." },
  missing_client: { tone: "error", text: "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env to connect Gmail." },
  missing_key: { tone: "error", text: "Set TOKEN_ENCRYPTION_KEY in .env to connect Gmail (see .env.example)." },
};

export function parseGmailNotice(value: unknown): GmailNotice | null {
  const parsed = gmailNoticeSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
