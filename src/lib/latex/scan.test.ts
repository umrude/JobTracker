import { describe, it, expect } from "vitest";
import { findAllCommands, findCommand, indentationAt, isCommandAt, readGroup } from "@/lib/latex/scan";

describe("readGroup", () => {
  it("matches nested braces", () => {
    const tex = "x {a {b} c} y";
    const group = readGroup(tex, 1);
    expect(group && tex.slice(group.contentStart, group.contentEnd)).toBe("a {b} c");
  });

  it("ignores escaped braces and braces in comments", () => {
    const tex = "{a \\} % }\n b}";
    const group = readGroup(tex, 0);
    expect(group?.end).toBe(tex.length);
  });

  it("returns null when there's no group or it never closes", () => {
    expect(readGroup("x", 0)).toBeNull();
    expect(readGroup("{open", 0)).toBeNull();
  });
});

describe("isCommandAt / findCommand", () => {
  it("matches whole command names only", () => {
    const tex = "\\resumeSubHeadingListEnd";
    expect(isCommandAt(tex, 0, "resumeSubHeadingList")).toBe(false);
    expect(isCommandAt(tex, 0, "resumeSubHeadingListEnd")).toBe(true);
  });

  it("is case-sensitive, like LaTeX", () => {
    expect(findCommand("\\resumeSubHeadingList", "resumeSubheading")).toBe(-1);
  });

  it("skips commented-out commands and escaped percent signs", () => {
    const tex = "100\\% done % \\resumeItem{hidden}\n\\resumeItem{shown}";
    expect(findAllCommands(tex, "resumeItem")).toEqual([tex.lastIndexOf("\\resumeItem")]);
  });

  it("doesn't treat a \\\\ line break as escaping the next command", () => {
    const tex = "a \\\\\\resumeItem{x}";
    expect(findCommand(tex, "resumeItem")).toBe(4);
  });
});

describe("indentationAt", () => {
  it("returns the leading whitespace, or nothing if the line has other text", () => {
    expect(indentationAt("a\n    \\item", 6)).toBe("    ");
    expect(indentationAt("text \\item", 5)).toBe("");
  });
});
