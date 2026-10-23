import { describe, expect, it } from "vitest";
import { envSchema } from "@/server/env-schema";

describe("envSchema", () => {
  it("lets the public demo start with no secrets at all", () => {
    const env = envSchema.parse({ DEMO_MODE: "true" });
    expect(env.DEMO_MODE).toBe(true);
    expect(env.ALLOWED_EMAIL).toBeUndefined();
    expect(env.AUTH_SECRET).toBeUndefined();
  });

  it("requires sign-in settings in live mode, naming what's missing", () => {
    const result = envSchema.safeParse({ DEMO_MODE: "false", AUTH_SECRET: "" });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path[0]).sort()).toEqual(["ALLOWED_EMAIL", "AUTH_SECRET"]);
  });

  it("accepts a complete live configuration", () => {
    const env = envSchema.parse({ ALLOWED_EMAIL: "me@example.com", AUTH_SECRET: "secret" });
    expect(env.DEMO_MODE).toBe(false);
    expect(env.ALLOWED_EMAIL).toBe("me@example.com");
  });

  it("still rejects a malformed email, even in the demo", () => {
    expect(envSchema.safeParse({ DEMO_MODE: "true", ALLOWED_EMAIL: "not-an-email" }).success).toBe(false);
  });
});
