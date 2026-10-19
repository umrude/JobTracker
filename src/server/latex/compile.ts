import "server-only";
import { env } from "@/server/env";
import { runTectonic, type CompileResult } from "@/server/latex/tectonic";

// The app's entry point for compiling LaTeX. Live mode only: demo mode
// serves pre-built PDFs (demo-pdfs.ts) and never runs a compiler, because
// the public demo host has no TeX engine.
export function compileLatex(tex: string): Promise<CompileResult> {
  return runTectonic(tex, { tectonicPath: env.TECTONIC_PATH });
}
