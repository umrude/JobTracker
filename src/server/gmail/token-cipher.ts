import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Encrypts Gmail refresh tokens at rest. A refresh token is a long-lived
// key to the inbox, so a copied database file alone must not be enough to
// read anyone's email: the key lives in TOKEN_ENCRYPTION_KEY, outside the
// database.
//
// AES-256-GCM: authenticated, so a tampered value fails to decrypt instead
// of decrypting to garbage. The owner's user id is the "associated data":
// it isn't stored in the value, but decrypting must supply the same one, so
// a token copied into another user's row doesn't decrypt there.
//
// Format: "v1.<iv>.<auth tag>.<ciphertext>", each part base64url. The
// version prefix leaves room to change the scheme (or rotate keys) later.

const VERSION = "v1";
const IV_BYTES = 12; // GCM's standard nonce size; random per encryption

export function parseKey(base64: string): Buffer {
  const key = Buffer.from(base64, "base64");
  if (key.length !== 32) throw new Error("TOKEN_ENCRYPTION_KEY must be 32 bytes, base64-encoded.");
  return key;
}

function associatedData(userId: number): Buffer {
  return Buffer.from(`gmail-token:user:${userId}`);
}

export function encryptToken(plaintext: string, key: Buffer, userId: number): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(associatedData(userId));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [VERSION, iv, cipher.getAuthTag(), ciphertext]
    .map((part) => (typeof part === "string" ? part : part.toString("base64url")))
    .join(".");
}

// Throws on a wrong key, a wrong user, or any tampering: callers treat
// that like a missing connection ("Reconnect Gmail"), never as a token.
export function decryptToken(value: string, key: Buffer, userId: number): string {
  const parts = value.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) throw new Error("Unrecognized token format.");
  const [iv, tag, ciphertext] = parts.slice(1).map((part) => Buffer.from(part, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAAD(associatedData(userId));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
