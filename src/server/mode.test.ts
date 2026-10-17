import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.mock is hoisted above imports, so the mutable object it closes over
// must be created with vi.hoisted() to exist by the time the mock runs.
const mockEnv = vi.hoisted(() => ({ DEMO_MODE: false }));
vi.mock("@/server/env", () => ({ env: mockEnv }));

import { assertWritable, isWritable, resolveMode } from "@/server/mode";

beforeEach(() => {
  mockEnv.DEMO_MODE = false;
});

describe("resolveMode", () => {
  it("is live when DEMO_MODE is false and no cookie is set", () => {
    expect(resolveMode(false, undefined)).toBe("live");
  });

  it("is demo when the cookie is set, on a live deployment", () => {
    expect(resolveMode(false, "true")).toBe("demo");
  });

  it("ignores the cookie on a public demo deployment", () => {
    expect(resolveMode(true, undefined)).toBe("demo");
    expect(resolveMode(true, "true")).toBe("demo");
  });

  it("treats any cookie value other than the literal 'true' as unset", () => {
    expect(resolveMode(false, "false")).toBe("live");
    expect(resolveMode(false, "")).toBe("live");
  });
});

describe("isWritable / assertWritable", () => {
  it("is writable on a live deployment", () => {
    expect(isWritable()).toBe(true);
    expect(() => assertWritable()).not.toThrow();
  });

  it("is not writable on a public demo deployment", () => {
    mockEnv.DEMO_MODE = true;
    expect(isWritable()).toBe(false);
    expect(() => assertWritable()).toThrow(/demo mode/i);
  });
});
