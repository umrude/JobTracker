import { describe, expect, it } from "vitest";
import { interviewCalendar } from "@/lib/ics";

const now = new Date(Date.UTC(2026, 9, 20, 9, 0, 0));
const start = new Date(Date.UTC(2026, 9, 28, 14, 30, 0));

describe("interviewCalendar", () => {
  it("writes one event in UTC, ending after its duration, with CRLF lines", () => {
    const ics = interviewCalendar({ uid: "interview-7@job-tracker", start, durationMinutes: 45, summary: "Technical: Engineer at Acme" }, now);
    expect(ics.split("\r\n")).toEqual([
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Job Tracker//Interviews//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "BEGIN:VEVENT",
      "UID:interview-7@job-tracker",
      "DTSTAMP:20261020T090000Z",
      "DTSTART:20261028T143000Z",
      "DTEND:20261028T151500Z",
      "SUMMARY:Technical: Engineer at Acme",
      "END:VEVENT",
      "END:VCALENDAR",
      "",
    ]);
  });

  it("escapes text and includes the location and notes when there are any", () => {
    const ics = interviewCalendar(
      { uid: "u", start, durationMinutes: 60, summary: "Onsite", location: "12 Main St, Suite 4; Floor 2", description: "Bring ID\nAsk about C:\\path" },
      now,
    );
    expect(ics).toContain("LOCATION:12 Main St\\, Suite 4\\; Floor 2\r\n");
    expect(ics).toContain("DESCRIPTION:Bring ID\\nAsk about C:\\\\path\r\n");
  });

  it("folds long lines at 75 bytes without splitting a character", () => {
    const description = "é".repeat(100); // 2 bytes each
    const ics = interviewCalendar({ uid: "u", start, durationMinutes: 60, summary: "S", description }, now);
    const lines = ics.split("\r\n");
    const first = lines.findIndex((line) => line.startsWith("DESCRIPTION:"));
    // The DESCRIPTION line and the continuation lines (starting with a space) after it.
    const folded = [lines[first]];
    for (let i = first + 1; lines[i].startsWith(" "); i++) folded.push(lines[i]);
    expect(folded.length).toBeGreaterThan(1);
    for (const line of folded) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    // Unfolding gives the original back.
    expect(folded.map((line, i) => (i === 0 ? line : line.slice(1))).join("")).toBe(`DESCRIPTION:${description}`);
  });
});
