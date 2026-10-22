import { requireSession } from "@/server/require-session";
import { getResume } from "@/server/db/resumes";
import { renderLatexPdf } from "@/server/latex/render";
import { compileErrorResponse, pdfResponse, textResponse } from "@/server/latex/pdf-response";
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

  // The public demo serves pre-built PDFs; everywhere else compiles (see
  // server/latex/render.ts).
  const result = await renderLatexPdf(resume.latexSource);
  if (!result.ok) return compileErrorResponse(result.error);
  return pdfResponse(result.pdf, result.pages, `resume-v${resume.version}.pdf`);
}
