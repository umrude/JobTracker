import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { describeFailure, runTectonic, type Exec } from "@/server/latex/tectonic";
import { buildPdf } from "@/test/build-pdf";

// Real Tectonic stderr for the two common failures (captured from 0.17).
const UNDEFINED_COMMAND = `Fontconfig error: Cannot load default config file: No such file: (null)
error: resume.tex:3: Undefined control sequence
error: something bad happened inside XeTeX; its output follows:
! Undefined control sequence.
l.3 \\undefinedmacro`;

const MISSING_PACKAGE = `error: resume.tex:3: ! LaTeX Error: File \`tikz-cd.sty' not found.
error: something bad happened inside XeTeX; its output follows:`;

describe("describeFailure", () => {
  it("reports the first error line with its line number", () => {
    expect(describeFailure(UNDEFINED_COMMAND)).toEqual({
      kind: "latex_error",
      message: "The LaTeX didn't compile. Line 3: Undefined control sequence",
    });
  });

  it("explains a package that isn't in the offline cache", () => {
    const failure = describeFailure(MISSING_PACKAGE);
    expect(failure.kind).toBe("missing_package");
    expect(failure.message).toContain("tikz-cd.sty");
    expect(failure.message).toContain("tectonic -X compile");
  });

  it("falls back to a generic message when there's no error line", () => {
    expect(describeFailure("something odd").kind).toBe("latex_error");
  });
});

// A fake compiler: records how it was called and does what `behave` says.
function fakeExec(behave: (cwd: string) => Awaited<ReturnType<Exec>>) {
  const calls: { file: string; args: string[]; cwd: string }[] = [];
  const exec: Exec = async (file, args, { cwd }) => {
    calls.push({ file, args, cwd });
    return behave(cwd);
  };
  return { exec, calls };
}

const ok = { exitCode: 0, stderr: "", timedOut: false, notFound: false };

describe("runTectonic (fake compiler)", () => {
  it("returns the PDF and its page count, then removes the temp folder", async () => {
    const { exec, calls } = fakeExec((cwd) => {
      fs.writeFileSync(path.join(cwd, "resume.pdf"), buildPdf(["Hello"]));
      return ok;
    });
    const result = await runTectonic("\\documentclass{article}", { tectonicPath: "tectonic", exec });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pages).toBe(1);
    expect(new TextDecoder().decode(result.pdf.slice(0, 5))).toBe("%PDF-");
    expect(fs.existsSync(calls[0].cwd)).toBe(false);
  });

  it("writes the source to resume.tex and always compiles untrusted and offline", async () => {
    let written = "";
    const { exec, calls } = fakeExec((cwd) => {
      written = fs.readFileSync(path.join(cwd, "resume.tex"), "utf8");
      fs.writeFileSync(path.join(cwd, "resume.pdf"), buildPdf([]));
      return ok;
    });
    await runTectonic("SOURCE", { tectonicPath: "/opt/tectonic", exec });

    expect(written).toBe("SOURCE");
    expect(calls[0].file).toBe("/opt/tectonic");
    expect(calls[0].args).toEqual(
      expect.arrayContaining(["--untrusted", "--only-cached", "resume.tex"]),
    );
  });

  it("reports a missing compiler", async () => {
    const { exec } = fakeExec(() => ({ ...ok, exitCode: null, notFound: true }));
    const result = await runTectonic("x", { tectonicPath: "missing", exec });
    expect(result).toMatchObject({ ok: false, error: { kind: "not_installed" } });
  });

  it("reports a timeout", async () => {
    const { exec } = fakeExec(() => ({ ...ok, exitCode: null, timedOut: true }));
    const result = await runTectonic("x", { tectonicPath: "tectonic", exec });
    expect(result).toMatchObject({ ok: false, error: { kind: "timeout" } });
  });

  it("reports a LaTeX error from stderr and still cleans up", async () => {
    const { exec, calls } = fakeExec(() => ({ ...ok, exitCode: 1, stderr: UNDEFINED_COMMAND }));
    const result = await runTectonic("x", { tectonicPath: "tectonic", exec });
    expect(result).toMatchObject({ ok: false, error: { kind: "latex_error" } });
    expect(fs.existsSync(calls[0].cwd)).toBe(false);
  });
});

// Runs the real compiler when it's available (set TECTONIC_PATH or put it
// on PATH), and skips otherwise, e.g. in CI without TeX installed.
const tectonicPath = process.env.TECTONIC_PATH ?? "tectonic";
const hasTectonic = spawnSync(tectonicPath, ["--version"]).status === 0;

describe.skipIf(!hasTectonic)("runTectonic (real Tectonic)", () => {
  it("compiles the demo resume to one page", async () => {
    const tex = fs.readFileSync(
      path.join(process.cwd(), "src/server/db/fixtures/demo-resume.tex"),
      "utf8",
    );
    const result = await runTectonic(tex, { tectonicPath });
    expect(result).toMatchObject({ ok: true, pages: 1 });
  }, 60_000);
});
