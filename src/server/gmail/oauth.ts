import "server-only";
import { timingSafeEqual } from "node:crypto";
import { CodeChallengeMethod, OAuth2Client } from "google-auth-library";
import { gmail } from "@googleapis/gmail";
import { env } from "@/server/env";

// Connecting Gmail: a separate OAuth consent from signing in. Sign-in
// (Auth.js) keeps its minimal scopes; this asks only for gmail.readonly,
// and only when you click "Connect Gmail". See docs/gmail-sync.md.

export const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
export const GMAIL_CALLBACK_PATH = "/api/gmail/callback";
// The cookie holding the state and PKCE verifier between "Connect Gmail"
// and Google's redirect back.
export const GMAIL_OAUTH_COOKIE = "gmail-oauth";
export const GMAIL_OAUTH_COOKIE_MAX_AGE = 10 * 60;

export type GmailConfigProblem = "missing_client" | "missing_key";

// What connecting needs that isn't there, if anything. Checked before
// sending you to Google, so a missing setting is a clear message instead
// of a failure after you've granted access.
export function gmailConfigProblem(): GmailConfigProblem | null {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return "missing_client";
  if (!env.TOKEN_ENCRYPTION_KEY) return "missing_key";
  return null;
}

export function gmailRedirectUri(): string {
  return new URL(GMAIL_CALLBACK_PATH, env.APP_URL).toString();
}

export function oauthClient(): OAuth2Client {
  return new OAuth2Client({
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    redirectUri: gmailRedirectUri(),
  });
}

export type PendingConnect = { state: string; verifier: string };

// The Google consent URL, plus what the callback must check.
// - state: random, compared on return, so a callback can't be forged into
//   your session (CSRF).
// - PKCE: the code Google returns is useless without the verifier, which
//   never leaves the server and your browser's cookie.
// - access_type=offline + prompt=consent: Google issues a refresh token
//   (it otherwise only does on the very first consent), so sync works
//   without you present.
export async function startConnect(loginHint: string | undefined): Promise<{ url: string; pending: PendingConnect }> {
  const client = oauthClient();
  const { codeVerifier, codeChallenge } = await client.generateCodeVerifierAsync();
  const state = crypto.randomUUID();
  const url = client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [GMAIL_READONLY_SCOPE],
    // Only this scope, not the sign-in scopes you granted before.
    include_granted_scopes: false,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: CodeChallengeMethod.S256,
    login_hint: loginHint,
  });
  return { url, pending: { state, verifier: codeVerifier } };
}

// Constant-time, so how much of the state matched doesn't leak through
// timing. Pure: tested on its own.
export function statesMatch(expected: string, received: string | null): boolean {
  if (!received) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Google's consent screen lets you untick a scope. Without read access the
// connection is useless, so it isn't saved.
export function grantsReadonly(scope: string | null | undefined): boolean {
  return (scope ?? "").split(" ").includes(GMAIL_READONLY_SCOPE);
}

export type FinishedConnect =
  | { ok: true; refreshToken: string; scope: string; email: string }
  | { ok: false; reason: "no_readonly" | "no_refresh_token" };

// Trades the code for tokens and reads which Gmail address it is. The
// access token is used once, here, and dropped; only the refresh token is
// kept (encrypted, by the caller).
export async function finishConnect(code: string, verifier: string): Promise<FinishedConnect> {
  const client = oauthClient();
  const { tokens } = await client.getToken({ code, codeVerifier: verifier });
  if (!grantsReadonly(tokens.scope)) return { ok: false, reason: "no_readonly" };
  if (!tokens.refresh_token) return { ok: false, reason: "no_refresh_token" };

  client.setCredentials(tokens);
  const profile = await gmail({ version: "v1", auth: client }).users.getProfile({ userId: "me" });
  const email = profile.data.emailAddress;
  if (!email) throw new Error("Gmail didn't return the account's address.");
  return { ok: true, refreshToken: tokens.refresh_token, scope: tokens.scope ?? GMAIL_READONLY_SCOPE, email };
}

// Revokes access at Google, so disconnecting really ends it (deleting our
// copy alone would leave the grant in your Google account). Best effort:
// false if Google couldn't be reached or already forgot the token.
export async function revokeAtGoogle(refreshToken: string): Promise<boolean> {
  try {
    await oauthClient().revokeToken(refreshToken);
    return true;
  } catch {
    return false;
  }
}

// Whether an error from a Google call means the refresh token is no longer
// accepted (revoked, or expired after 7 days in Testing). Google reports
// it as an OAuth "invalid_grant", on the error's response body.
export function isInvalidGrant(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.message.includes("invalid_grant")) return true;
  const response = "response" in error ? error.response : undefined;
  const data = typeof response === "object" && response !== null && "data" in response ? response.data : undefined;
  return typeof data === "object" && data !== null && "error" in data && data.error === "invalid_grant";
}

// The HTTP status of a failed Google call, if it has one.
export function httpStatus(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const status = "status" in error ? error.status : undefined;
  if (typeof status === "number") return status;
  const response = "response" in error ? error.response : undefined;
  if (typeof response === "object" && response !== null && "status" in response && typeof response.status === "number") {
    return response.status;
  }
  return undefined;
}
