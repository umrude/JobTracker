import { describe, it, expect } from "vitest";
import { createEntrySchema, createSkillSchema, updateSkillSchema } from "@/lib/schemas/profile";

describe("createSkillSchema", () => {
  it("parses comma-separated aliases, dropping blanks", () => {
    expect(createSkillSchema.parse({ name: "PostgreSQL", aliases: " Postgres, ,PG " }).aliases).toEqual([
      "Postgres",
      "PG",
    ]);
  });

  it("treats empty selects and text as not set", () => {
    expect(
      createSkillSchema.parse({ name: "Go", category: "", proficiency: "", experience: "", note: "  ", aliases: "" }),
    ).toEqual({ name: "Go", category: undefined, proficiency: undefined, experience: undefined, note: undefined, aliases: [] });
  });

  it("rejects unknown levels and a blank name", () => {
    expect(createSkillSchema.safeParse({ name: "Go", proficiency: "guru", aliases: "" }).success).toBe(false);
    expect(createSkillSchema.safeParse({ name: "  ", aliases: "" }).success).toBe(false);
  });

  it("requires an id for updates, coerced from the form string", () => {
    expect(updateSkillSchema.parse({ id: "4", name: "Go", aliases: "" }).id).toBe(4);
  });
});

describe("createEntrySchema", () => {
  it("keeps blank optional heading parts as empty strings, as the template prints them", () => {
    expect(
      createEntrySchema.parse({ section: "Education", title: "State University", dates: "", subtitle: " ", detail: "" }),
    ).toEqual({ section: "Education", title: "State University", dates: "", subtitle: "", detail: "" });
  });
});
