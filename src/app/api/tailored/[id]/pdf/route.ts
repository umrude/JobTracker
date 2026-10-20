import { requireSession } from "@/server/require-session";
import { renderTailoredPdf } from "@/server/tailoring";
import type { CompileErrorKind } from "@/server/latex/tectonic";
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
  if (!result.ok) return textResponse(STATUS_BY_ERROR[result.error.kind], result.error.message);

  return new Response(new Uint8Array(result.pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="tailored-resume-v${result.version}.pdf"`,
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
