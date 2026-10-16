import { describe, it, expect } from "vitest";
import {
  createApplicationSchema,
  moveApplicationSchema,
  updateApplicationSchema,
} from "@/lib/schemas/application";

describe("createApplicationSchema", () => {
  it("defaults status to saved and treats blank optional fields as absent", () => {
    const result = createApplicationSchema.parse({
      company: "Acme",
      title: "Engineer",
      url: "",
      notes: "",
    });
    expect(result).toEqual({
      company: "Acme",
      title: "Engineer",
      url: undefined,
      notes: undefined,
      status: "saved",
    });
  });

  it("rejects a missing company", () => {
    expect(() =>
      createApplicationSchema.parse({ company: "", title: "Engineer" }),
    ).toThrow();
  });

  it("rejects a malformed url", () => {
    expect(() =>
      createApplicationSchema.parse({
        company: "Acme",
        title: "Engineer",
        url: "not-a-url",
      }),
    ).toThrow();
  });
});

describe("updateApplicationSchema", () => {
  it("coerces a string id to a number and allows partial fields", () => {
    const result = updateApplicationSchema.parse({ id: "5", notes: "Follow up" });
    expect(result).toEqual({ id: 5, notes: "Follow up" });
  });
});

describe("moveApplicationSchema", () => {
  it("requires both id and status", () => {
    expect(() => moveApplicationSchema.parse({ id: 1 })).toThrow();
    expect(moveApplicationSchema.parse({ id: 1, status: "applied" })).toEqual({
      id: 1,
      status: "applied",
    });
  });
});
