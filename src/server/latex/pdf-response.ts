import "server-only";
import type { CompileErrorKind, CompileResult } from "@/server/latex/tectonic";

type CompileError = Extract<CompileResult, { ok: false }>["error"];

// The HTTP side of serving a compiled resume, shared by the PDF routes
// (api/resumes/[id]/pdf and api/tailored/[id]/pdf).

const STATUS_BY_ERROR: Record<CompileErrorKind, number> = {
  not_installed: 503,
  missing_package: 503,
  timeout: 504,
  latex_error: 422,
  demo_unavailable: 404,
};

// A plain-text answer the browser shows as is: the PDF links open in a new
// tab, so there's no page around them to show an error in.
export function textResponse(status: number, message: string): Response {
  return new Response(message, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export function compileErrorResponse(error: CompileError): Response {
  return textResponse(STATUS_BY_ERROR[error.kind], error.message);
}

export function pdfResponse(pdf: Uint8Array, pages: number, filename: string): Response {
  // Copied into a fresh ArrayBuffer-backed array: Response's body type
  // rejects a Uint8Array that might be backed by a SharedArrayBuffer.
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      // Personal data: don't let any cache keep a copy.
      "Cache-Control": "private, no-store",
      "X-Page-Count": String(pages),
    },
  });
}
