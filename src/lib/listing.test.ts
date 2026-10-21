import { describe, it, expect } from "vitest";
import { listingChangedSince, listingHash } from "@/lib/listing";

describe("listing fingerprints", () => {
  it("ignores whitespace differences, but not wording", () => {
    expect(listingHash("Build APIs\n\nin  TypeScript")).toBe(listingHash("Build APIs in TypeScript"));
    expect(listingHash("Build APIs in TypeScript")).not.toBe(listingHash("Build APIs in Go"));
    expect(listingHash("   ")).toBeNull();
    expect(listingHash("x")).toMatch(/^[0-9a-f]{16}$/);
  });

  it("notices an edited listing, and stays quiet for comparisons without a fingerprint", () => {
    const hash = listingHash("Build APIs in TypeScript");
    expect(listingChangedSince(hash, "Build APIs in TypeScript")).toBe(false);
    expect(listingChangedSince(hash, "Build APIs in Go")).toBe(true);
    expect(listingChangedSince(hash, null)).toBe(true);
    expect(listingChangedSince(null, "anything")).toBe(false);
  });
});
