import "server-only";
import { isWritable } from "@/server/mode";
import { compileLatex } from "@/server/latex/compile";
import { readDemoPdf } from "@/server/latex/demo-pdfs";
import type { CompileResult } from "@/server/latex/tectonic";

// The one place that decides how a PDF is produced.
//
// - The public demo deployment (DEMO_MODE=true, read-only) has no TeX
//   engine, so it only ever serves pre-built PDFs (see demo-pdfs.ts).
// - Everywhere else, including the local demo preview, runs on your own
//   machine, where Tectonic is installed: compile. If Tectonic isn't there,
//   fall back to a pre-built PDF when one exists for this LaTeX.
//
// isWritable() is the existing "is this the public demo deployment?" check
// in mode.ts (the deployment, not the per-request demo/live mode).
export async function renderLatexPdf(tex: string): Promise<CompileResult> {
  if (!isWritable()) return readDemoPdf(tex);

  const compiled = await compileLatex(tex);
  if (compiled.ok || compiled.error.kind !== "not_installed") return compiled;
  const prebuilt = await readDemoPdf(tex);
  return prebuilt.ok ? prebuilt : compiled;
}
