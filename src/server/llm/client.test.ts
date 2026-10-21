import Anthropic from "@anthropic-ai/sdk";
import { describe, it, expect, vi } from "vitest";

vi.mock("@/server/env", () => ({ env: { ANTHROPIC_MODEL: "claude-opus-5-5" } }));

const { isOutOfCredits, supportsServerFallback } = await import("@/server/llm/client");

// Built the way the SDK builds them from an API response, not hand-made
// objects, so the check matches what a real call throws.
const apiError = (status: number, message: string) =>
  Anthropic.APIError.generate(status, { type: "error", error: { type: "invalid_request_error", message } }, undefined, new Headers());

describe("isOutOfCredits", () => {
  it("recognizes Anthropic's empty-balance error", () => {
    const error = apiError(400, "Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.");
    expect(error).toBeInstanceOf(Anthropic.BadRequestError);
    expect(isOutOfCredits(error)).toBe(true);
  });

  it("ignores other errors", () => {
    expect(isOutOfCredits(apiError(400, "max_tokens: Field required"))).toBe(false);
    expect(isOutOfCredits(apiError(401, "invalid x-api-key"))).toBe(false);
    expect(isOutOfCredits(new Error("credit balance"))).toBe(false);
  });
});

describe("supportsServerFallback", () => {
  it("is off for Haiku, which rejects the parameter", () => {
    expect(supportsServerFallback("claude-haiku-5-5")).toBe(false);
    expect(supportsServerFallback("claude-opus-5-5")).toBe(true);
  });
});
