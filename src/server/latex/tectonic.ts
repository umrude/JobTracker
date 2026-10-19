// No "server-only" here, like schema.ts: scripts/build-demo-pdfs.ts runs
// this under tsx, outside Next's bundler, where the real "server-only"
// package throws. It has no secrets; the app reaches it only through
// compile.ts, which does import "server-only".
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getDocumentProxy } from "unpdf";

// Compiles LaTeX to PDF with Tectonic. See docs/tailored-resumes.md (Step 3).

export type CompileErrorKind =
  | "not_installed"
  | "missing_package"
  | "latex_error"
  | "timeout"
  // Demo mode has no pre-built PDF for this LaTeX (see demo-pdfs.ts).
  | "demo_unavailable";

export type CompileResult =
  | { ok: true; pdf: Uint8Array; pages: number }
  | { ok: false; error: { kind: CompileErrorKind; message: string } };

export type ExecResult = {
  exitCode: number | null;
  stderr: string;
  timedOut: boolean;
  // The executable wasn't found (ENOENT).
  notFound: boolean;
};

// How the compiler is started. Injectable so tests can fake every
// outcome without Tectonic installed.
export type Exec = (
  file: string,
  args: string[],
  options: { cwd: string; timeoutMs: number },
) => Promise<ExecResult>;

// A resume compiles in about 1.5 s once packages are cached. This leaves
// plenty of room on a slow machine while still stopping a runaway job.
export const COMPILE_TIMEOUT_MS = 30_000;

// Fixed arguments, never built from user input:
// - --untrusted turns off every TeX feature Tectonic considers insecure
//   (shell escape and similar), since the source contains model-written text.
// - --only-cached forbids network access, so compiling never downloads
//   anything. Packages must already be in Tectonic's cache.
const TECTONIC_ARGS = ["-X", "compile", "--untrusted", "--only-cached", "resume.tex"];

export async function runTectonic(
  tex: string,
  options: { tectonicPath: string; exec?: Exec; timeoutMs?: number },
): Promise<CompileResult> {
  const exec = options.exec ?? execTectonic;
  // A fresh, private folder per compile: concurrent compiles can't collide,
  // and the source and PDF never live anywhere permanent.
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "jobtracker-latex-"));
  try {
    await fs.writeFile(path.join(dir, "resume.tex"), tex, "utf8");
    const result = await exec(options.tectonicPath, TECTONIC_ARGS, {
      cwd: dir,
      timeoutMs: options.timeoutMs ?? COMPILE_TIMEOUT_MS,
    });

    if (result.notFound) {
      return failure(
        "not_installed",
        "Tectonic isn't installed, or TECTONIC_PATH doesn't point to it. See .env.example.",
      );
    }
    if (result.timedOut) {
      return failure("timeout", "Compiling the PDF took too long and was stopped.");
    }
    if (result.exitCode !== 0) return { ok: false, error: describeFailure(result.stderr) };

    const pdf = new Uint8Array(await fs.readFile(path.join(dir, "resume.pdf")));
    return { ok: true, pdf, pages: await countPages(pdf) };
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

export async function countPages(pdf: Uint8Array): Promise<number> {
  // PDF.js may take ownership of the buffer it's given, so pass a copy.
  const document = await getDocumentProxy(pdf.slice());
  return document.numPages;
}

function failure(kind: CompileErrorKind, message: string): CompileResult {
  return { ok: false, error: { kind, message } };
}

// Turns Tectonic's stderr into one readable message. The useful line is
// the first "error: resume.tex:<line>: <message>"; the rest is TeX's
// transcript.
export function describeFailure(stderr: string): { kind: CompileErrorKind; message: string } {
  const firstError = /^error: [^:\n]*:(\d+): (.+)$/m.exec(stderr);
  if (!firstError) {
    return { kind: "latex_error", message: "The LaTeX didn't compile, and Tectonic gave no details." };
  }
  const [, line, detail] = firstError;

  const missingFile = /File `([^']+)' not found/.exec(detail);
  if (missingFile) {
    return {
      kind: "missing_package",
      message: `The LaTeX uses ${missingFile[1]}, which isn't downloaded yet. The app compiles offline, so download it once by running: tectonic -X compile <your-resume>.tex`,
    };
  }
  return {
    kind: "latex_error",
    message: `The LaTeX didn't compile. Line ${line}: ${detail.replace(/^!\s*/, "")}`,
  };
}

const execTectonic: Exec = (file, args, { cwd, timeoutMs }) =>
  new Promise((resolve) => {
    // execFile, not exec: no shell is involved, so nothing in the
    // arguments or environment is interpreted as a command.
    execFile(
      file,
      args,
      { cwd, timeout: timeoutMs, windowsHide: true, maxBuffer: 10 * 1024 * 1024 },
      (error, _stdout, stderr) => {
        if (!error) {
          resolve({ exitCode: 0, stderr, timedOut: false, notFound: false });
          return;
        }
        resolve({
          exitCode: typeof error.code === "number" ? error.code : null,
          stderr,
          timedOut: error.killed === true,
          notFound: error.code === "ENOENT",
        });
      },
    );
  });
