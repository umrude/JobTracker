import { getMode } from "@/server/mode";
import { requireSession } from "@/server/require-session";
import { getResume } from "@/server/db/resumes";
import { compileLatex } from "@/server/latex/compile";
import { readDemoPdf } from "@/server/latex/demo-pdfs";
import type { CompileErrorKind } from "@/server/latex/tectonic";
import { idSchema } from "@/lib/schemas/form";

// GET /api/resumes/:id/pdf: the PDF of one resume version, compiled from
// its LaTeX source. A route handler rather than a Server Action because it
// returns a file the browser opens directly (a link with target="_blank"),
// and Server Actions are for mutations. It only reads, so it doesn't call
// assertWritable(); it still requires a session.
export async function GET(_request: Request, ctx: RouteContext<"/api/resumes/[id]/pdf">) {
  await requireSession();

  const id = idSchema.safeParse((await ctx.params).id);
  if (!id.success) return textResponse(404, "Resume not found.");

  const resume = await getResume(id.data);
  if (!resume) return textResponse(404, "Resume not found.");
  if (!resume.latexSource) {
    return textResponse(404, "This resume version has no LaTeX source. Upload your .tex to get a PDF.");
  }

  // Demo mode never compiles; it serves the pre-built PDF for this LaTeX.
  const result =
    (await getMode()) === "demo"
      ? await readDemoPdf(resume.latexSource)
      : await compileLatex(resume.latexSource);
  if (!result.ok) return textResponse(STATUS_BY_ERROR[result.error.kind], result.error.message);

  // Copied into a fresh ArrayBuffer-backed array: Response's body type
  // rejects a Uint8Array that might be backed by a SharedArrayBuffer.
  return new Response(new Uint8Array(result.pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="resume-v${resume.version}.pdf"`,
      // Personal data: don't let any cache keep a copy.
      "Cache-Control": "private, no-store",
      "X-Page-Count": String(result.pages),
    },
  });
}

const STATUS_BY_ERROR: Record<CompileErrorKind, number> = {
  not_installed: 503,
  missing_package: 503,
  timeout: 504,
  latex_error: 422,
  demo_unavailable: 404,
};

function textResponse(status: number, message: string) {
  return new Response(message, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
