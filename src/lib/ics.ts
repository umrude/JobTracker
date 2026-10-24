// A one-event iCalendar file (RFC 5545) for an interview, so it can go
// straight into any calendar app. Pure: the route handler only sends it.

export type CalendarEvent = {
  uid: string;
  start: Date;
  durationMinutes: number;
  summary: string;
  location?: string | null;
  description?: string | null;
};

// 20261028T143000Z: times are written in UTC, so every calendar shows the
// right local time.
function utc(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

// Text values escape backslashes, semicolons, commas, and newlines.
function escapeText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

// Lines longer than 75 octets are folded: continued on the next line,
// which starts with a space. Counted in UTF-8 bytes, never splitting a
// character.
function fold(line: string): string {
  const encoder = new TextEncoder();
  const parts: string[] = [];
  let current = "";
  let bytes = 0;
  for (const char of line) {
    const size = encoder.encode(char).length;
    const limit = parts.length === 0 ? 75 : 74; // continuations spend one on the space
    if (bytes + size > limit) {
      parts.push(current);
      current = "";
      bytes = 0;
    }
    current += char;
    bytes += size;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

export function interviewCalendar(event: CalendarEvent, now: Date): string {
  const end = new Date(event.start.getTime() + event.durationMinutes * 60 * 1000);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Job Tracker//Interviews//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${event.uid}`,
    `DTSTAMP:${utc(now)}`,
    `DTSTART:${utc(event.start)}`,
    `DTEND:${utc(end)}`,
    `SUMMARY:${escapeText(event.summary)}`,
    ...(event.location ? [`LOCATION:${escapeText(event.location)}`] : []),
    ...(event.description ? [`DESCRIPTION:${escapeText(event.description)}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}
