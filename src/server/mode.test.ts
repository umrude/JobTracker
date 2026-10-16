import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.mock is hoisted above imports, so the mutable object it closes over
// must be created with vi.hoisted() to exist by the time the mock runs.
const mockEnv = vi.hoisted(() => ({ DEMO_MODE: false }));
vi.mock("@/server/env", () => ({ env: mockEnv }));

import { getMode, assertWritable } from "@/server/mode";

beforeEach(() => {
  mockEnv.DEMO_MODE = false;
});

describe("getMode", () => {
  it("returns live when DEMO_MODE is false", () => {
    expect(getMode()).toBe("live");
  });

  it("returns demo when DEMO_MODE is true", () => {
    mockEnv.DEMO_MODE = true;
    expect(getMode()).toBe("demo");
  });
});

describe("assertWritable", () => {
  it("does not throw in live mode", () => {
    expect(() => assertWritable()).not.toThrow();
  });

  it("throws in demo mode", () => {
    mockEnv.DEMO_MODE = true;
    expect(() => assertWritable()).toThrow(/demo mode/i);
  });
});
