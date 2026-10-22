import { requireSession } from "@/server/require-session";
import { renderTailoredPdf } from "@/server/tailoring";
import { compileErrorResponse, pdfResponse, textResponse } from "@/server/latex/pdf-response";
import { idSchema } from "@/lib/schemas/form";

// GET /api/tailored/:id/pdf: an approved tailored resume as a PDF, rebuilt
// from the approved LaTeX edits (so it's always exactly what you approved).
// A route handler for the same reason as the resume PDF route: it returns
// a file the browser opens from a link. Read-only; requires a session.
export async function GET(_request: Request, ctx: RouteContext<"/api/tailored/[id]/pdf">) {
  await requireSession();

  const id = idSchema.safeParse((await ctx.params).id);
  if (!id.success) return textResponse(404, "Tailored resume not found.");

  const result = await renderTailoredPdf(id.data);
  if (!result.ok) return compileErrorResponse(result.error);
  return pdfResponse(result.pdf, result.pages, `tailored-resume-v${result.version}.pdf`);
}
