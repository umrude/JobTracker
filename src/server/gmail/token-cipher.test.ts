import { randomBytes } from "node:crypto";
import { describe, it, expect } from "vitest";
import { decryptToken, encryptToken, parseKey } from "@/server/gmail/token-cipher";

const key = randomBytes(32);
const TOKEN = "1//0g-fake-refresh-token";

describe("token cipher", () => {
  it("round-trips, and never stores the token in the clear", () => {
    const sealed = encryptToken(TOKEN, key, 1);
    expect(sealed).toMatch(/^v1\./);
    expect(sealed).not.toContain(TOKEN);
    expect(decryptToken(sealed, key, 1)).toBe(TOKEN);
  });

  it("uses a fresh nonce each time", () => {
    expect(encryptToken(TOKEN, key, 1)).not.toBe(encryptToken(TOKEN, key, 1));
  });

  it("refuses the wrong key, the wrong user, and tampering", () => {
    const sealed = encryptToken(TOKEN, key, 1);
    expect(() => decryptToken(sealed, randomBytes(32), 1)).toThrow();
    expect(() => decryptToken(sealed, key, 2)).toThrow();
    const parts = sealed.split(".");
    const flipped = Buffer.from(parts[3], "base64url");
    flipped[0] ^= 1;
    expect(() => decryptToken([...parts.slice(0, 3), flipped.toString("base64url")].join("."), key, 1)).toThrow();
    expect(() => decryptToken("not-a-token", key, 1)).toThrow(/format/);
  });

  it("only accepts a 32-byte key", () => {
    expect(parseKey(key.toString("base64"))).toEqual(key);
    expect(() => parseKey(randomBytes(16).toString("base64"))).toThrow(/32 bytes/);
  });
});
