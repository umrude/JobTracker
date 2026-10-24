import { requireSession } from "@/server/require-session";
import { getInterview } from "@/server/db/today";
import { textResponse } from "@/server/latex/pdf-response";
import { idSchema } from "@/lib/schemas/form";
import { INTERVIEW_KIND_LABELS } from "@/lib/schemas/interview";
import { interviewCalendar } from "@/lib/ics";

// GET /api/interviews/:id/ics: one interview as a calendar file, to open in
// any calendar app. A route handler like the PDF routes: it returns a
// file from a plain link, and only reads (no assertWritable(), so it works
// in the read-only demo). It still requires a session, and finds only your
// own interviews.
export async function GET(_request: Request, ctx: RouteContext<"/api/interviews/[id]/ics">) {
  await requireSession();

  const id = idSchema.safeParse((await ctx.params).id);
  if (!id.success) return textResponse(404, "Interview not found.");
  const interview = await getInterview(id.data);
  if (!interview) return textResponse(404, "Interview not found.");

  const ics = interviewCalendar(
    {
      uid: `interview-${interview.id}@job-tracker`,
      start: interview.at,
      durationMinutes: interview.durationMinutes,
      summary: `${INTERVIEW_KIND_LABELS[interview.kind]}: ${interview.title} at ${interview.company}`,
      location: interview.location,
      description: interview.notes,
    },
    new Date(),
  );
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="interview-${interview.id}.ics"`,
      // Personal data: never cached by anything in between.
      "Cache-Control": "private, no-store",
    },
  });
}
