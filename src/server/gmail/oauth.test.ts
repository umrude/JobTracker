import { describe, it, expect, vi } from "vitest";

vi.mock("@/server/env", () => ({
  env: { GOOGLE_CLIENT_ID: "test-client", GOOGLE_CLIENT_SECRET: "test-secret", APP_URL: "http://localhost:3000" },
}));

const { GMAIL_READONLY_SCOPE, grantsReadonly, gmailRedirectUri, httpStatus, isInvalidGrant, startConnect, statesMatch } =
  await import("@/server/gmail/oauth");

describe("startConnect", () => {
  it("asks for gmail.readonly only, offline, with state and PKCE", async () => {
    const { url, pending } = await startConnect("me@example.com");
    const params = new URL(url).searchParams;
    expect(params.get("scope")).toBe(GMAIL_READONLY_SCOPE);
    expect(params.get("access_type")).toBe("offline");
    expect(params.get("prompt")).toBe("consent");
    expect(params.get("state")).toBe(pending.state);
    expect(params.get("code_challenge_method")).toBe("S256");
    expect(params.get("code_challenge")).toBeTruthy();
    // The verifier itself never goes to Google in the URL.
    expect(url).not.toContain(pending.verifier);
    expect(params.get("redirect_uri")).toBe(gmailRedirectUri());
    expect(gmailRedirectUri()).toBe("http://localhost:3000/api/gmail/callback");
  });
});

describe("callback checks", () => {
  it("matches the state exactly", () => {
    expect(statesMatch("abc", "abc")).toBe(true);
    expect(statesMatch("abc", "abd")).toBe(false);
    expect(statesMatch("abc", "ab")).toBe(false);
    expect(statesMatch("abc", null)).toBe(false);
  });

  it("requires the read-only scope to have been granted", () => {
    expect(grantsReadonly(`openid ${GMAIL_READONLY_SCOPE}`)).toBe(true);
    expect(grantsReadonly("openid email")).toBe(false);
    expect(grantsReadonly(undefined)).toBe(false);
  });
});

describe("Google errors", () => {
  it("recognizes a refused refresh token", () => {
    const fromBody = Object.assign(new Error("Request failed"), { response: { status: 400, data: { error: "invalid_grant" } } });
    expect(isInvalidGrant(fromBody)).toBe(true);
    expect(isInvalidGrant(new Error("invalid_grant"))).toBe(true);
    expect(isInvalidGrant(new Error("quota exceeded"))).toBe(false);
    expect(isInvalidGrant("invalid_grant")).toBe(false);
  });

  it("reads an HTTP status from either shape", () => {
    expect(httpStatus(Object.assign(new Error("x"), { status: 404 }))).toBe(404);
    expect(httpStatus(Object.assign(new Error("x"), { response: { status: 404 } }))).toBe(404);
    expect(httpStatus(new Error("x"))).toBeUndefined();
  });
});
