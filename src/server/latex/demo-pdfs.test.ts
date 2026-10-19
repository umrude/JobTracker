import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { demoPdfKey, readDemoPdf } from "@/server/latex/demo-pdfs";

const DEMO_TEX = fs.readFileSync(
  path.join(process.cwd(), "src/server/db/fixtures/demo-resume.tex"),
  "utf8",
);

describe("demoPdfKey", () => {
  it("ignores line-ending differences", () => {
    expect(demoPdfKey("a\r\nb\r\n")).toBe(demoPdfKey("a\nb\n"));
  });

  it("changes when the content changes", () => {
    expect(demoPdfKey("a")).not.toBe(demoPdfKey("b"));
  });
});

describe("readDemoPdf", () => {
  // Fails if the demo resume changed without re-running `pnpm demo:pdfs`.
  it("has a pre-built PDF for the demo resume", async () => {
    const result = await readDemoPdf(DEMO_TEX);
    expect(result).toMatchObject({ ok: true, pages: 1 });
  });

  it("reports LaTeX with no pre-built PDF as unavailable in demo mode", async () => {
    const result = await readDemoPdf(DEMO_TEX + "% changed");
    expect(result).toMatchObject({ ok: false, error: { kind: "demo_unavailable" } });
  });
});
