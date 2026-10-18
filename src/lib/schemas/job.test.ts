import { describe, it, expect } from "vitest";
import {
  createSavedJobSchema,
  LISTING_TEXT_MAX,
  updateSavedJobSchema,
} from "@/lib/schemas/job";

describe("createSavedJobSchema", () => {
  it("trims required fields and treats blank optional fields as absent", () => {
    const result = createSavedJobSchema.parse({
      company: "  Acme  ",
      title: "Engineer",
      url: "",
      listingText: "   ",
      notes: "",
    });
    expect(result).toEqual({
      company: "Acme",
      title: "Engineer",
      url: undefined,
      listingText: undefined,
      notes: undefined,
    });
  });

  it("accepts listing text at the limit and rejects it one character over", () => {
    const base = { company: "Acme", title: "Engineer" };
    expect(() =>
      createSavedJobSchema.parse({
        ...base,
        listingText: "a".repeat(LISTING_TEXT_MAX),
      }),
    ).not.toThrow();

    const result = createSavedJobSchema.safeParse({
      ...base,
      listingText: "a".repeat(LISTING_TEXT_MAX + 1),
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["listingText"]);
  });

  it("rejects a malformed url", () => {
    expect(() =>
      createSavedJobSchema.parse({
        company: "Acme",
        title: "Engineer",
        url: "not-a-url",
      }),
    ).toThrow();
  });
});

describe("updateSavedJobSchema", () => {
  it("coerces the id and still requires company and title", () => {
    expect(
      updateSavedJobSchema.parse({ id: "3", company: "Acme", title: "Eng" }),
    ).toMatchObject({ id: 3, company: "Acme", title: "Eng" });
    expect(() => updateSavedJobSchema.parse({ id: "3" })).toThrow();
  });
});
