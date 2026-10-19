// No "server-only" here: scripts/build-demo-pdfs.ts uses demoPdfKey under
// tsx. It only reads committed fixture files.
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { countPages, type CompileResult } from "@/server/latex/tectonic";

// Demo mode never compiles: the public demo host has no TeX engine. Every
// PDF the demo can show is compiled ahead of time by `pnpm demo:pdfs` and
// committed, named by a hash of the LaTeX it came from. At runtime the
// demo hashes the LaTeX it would have compiled and serves the matching
// file. Keying by content (not by resume id or job) means any demo LaTeX,
// including tailored versions later, works the same way, and a stale PDF
// can never be served for changed LaTeX.

// cwd-relative, like the seed's paths, so it works under both tsx and Next.
export const DEMO_PDF_DIR = path.join(process.cwd(), "src/server/db/fixtures/pdf");

// Line endings are normalized first, so a checkout that converts the
// fixture .tex to CRLF still finds the same PDF.
export function demoPdfKey(tex: string): string {
  return createHash("sha256").update(tex.replaceAll("\r\n", "\n")).digest("hex").slice(0, 16);
}

export async function readDemoPdf(tex: string): Promise<CompileResult> {
  try {
    const pdf = new Uint8Array(await fs.readFile(path.join(DEMO_PDF_DIR, `${demoPdfKey(tex)}.pdf`)));
    return { ok: true, pdf, pages: await countPages(pdf) };
  } catch {
    return {
      ok: false,
      error: {
        // E.g. a .tex uploaded in the local demo preview.
        kind: "demo_unavailable",
        message: "Demo mode only has PDFs for the sample resume. Switch to live data to compile your own.",
      },
    };
  }
}
