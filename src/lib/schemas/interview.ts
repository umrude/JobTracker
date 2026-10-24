import { z } from "zod";
import { idSchema, optionalText } from "@/lib/schemas/form";

// Interviews you add to an application (docs/today.md). Entered by hand;
// nothing reads dates out of emails.

export const INTERVIEW_KINDS = ["phone_screen", "technical", "onsite", "final", "other"] as const;
export type InterviewKind = (typeof INTERVIEW_KINDS)[number];

export const INTERVIEW_KIND_LABELS: Record<InterviewKind, string> = {
  phone_screen: "Phone screen",
  technical: "Technical",
  onsite: "Onsite",
  final: "Final round",
  other: "Interview",
};

// What <input type="datetime-local"> sends: "2026-10-28T14:30", with no
// time zone. It's read as local time, which for the live app (on your own
// machine) is yours.
const localDateTime = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Pick a date and time")
  .transform((value, ctx) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      ctx.addIssue({ code: "custom", message: "That isn't a real date" });
      return z.NEVER;
    }
    return date;
  });

export const createInterviewSchema = z.object({
  applicationId: idSchema,
  at: localDateTime,
  durationMinutes: z.coerce.number().int().min(5, "At least 5 minutes").max(600, "At most 10 hours").default(60),
  kind: z.enum(INTERVIEW_KINDS),
  // A meeting link, a phone number, or an address.
  location: optionalText(300, "Keep it under 300 characters"),
  notes: optionalText(1000, "Keep notes under 1,000 characters"),
});

export type CreateInterviewInput = z.infer<typeof createInterviewSchema>;

export const interviewIdSchema = z.object({ id: idSchema });

export const followUpSchema = z.object({ applicationId: idSchema });
