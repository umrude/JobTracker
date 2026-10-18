import { describe, it, expect } from "vitest";
import { RESUME_TEXT_MAX, saveResumeSchema } from "@/lib/schemas/resume";

describe("saveResumeSchema", () => {
  it("trims the text", () => {
    expect(saveResumeSchema.parse({ text: "  Jane Doe\n" })).toEqual({
      text: "Jane Doe",
    });
  });

  it("rejects whitespace-only text", () => {
    expect(() => saveResumeSchema.parse({ text: " \n\t " })).toThrow(
      "Resume text is empty",
    );
  });

  it("rejects text over the limit", () => {
    expect(() =>
      saveResumeSchema.parse({ text: "a".repeat(RESUME_TEXT_MAX + 1) }),
    ).toThrow();
  });
});
