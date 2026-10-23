import { describe, it, expect } from "vitest";
import { confirmGapSchema, createEntrySchema, createSkillSchema, updateSkillSchema } from "@/lib/schemas/profile";

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

describe("confirmGapSchema", () => {
  it("validates each choice with its own fields", () => {
    expect(confirmGapSchema.parse({ mode: "alias", jobId: "3", name: "Postgres", skillId: "9" })).toEqual({
      mode: "alias",
      jobId: 3,
      name: "Postgres",
      skillId: 9,
    });
    expect(confirmGapSchema.parse({ mode: "learning", jobId: "3", names: ["Docker"], category: "" })).toMatchObject({
      mode: "learning",
      names: ["Docker"],
      category: undefined,
    });
    expect(confirmGapSchema.parse({ mode: "highlight", jobId: "3", text: "5+ years of experience" }).mode).toBe("highlight");
  });

  it("rejects an alias without a skill, and unknown modes", () => {
    expect(confirmGapSchema.safeParse({ mode: "alias", jobId: "3", name: "Postgres" }).success).toBe(false);
    expect(confirmGapSchema.safeParse({ mode: "ignore", jobId: "3" }).success).toBe(false);
  });

  it("takes several skill names, but at least one", () => {
    expect(confirmGapSchema.parse({ mode: "skill", jobId: "3", names: [" AWS ", "Azure"] })).toMatchObject({
      names: ["AWS", "Azure"],
    });
    expect(confirmGapSchema.safeParse({ mode: "skill", jobId: "3", names: [] }).success).toBe(false);
    expect(confirmGapSchema.safeParse({ mode: "skill", jobId: "3", names: [""] }).success).toBe(false);
  });
});
