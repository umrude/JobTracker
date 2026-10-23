// Shared display formatting, so every page writes dates and counts the
// same way. Pure; usable from Server and Client Components.

const DATE = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });
const DATE_TIME = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });
// For values that are whole UTC days (the Gmail sync start date), which
// would otherwise show as the day before in time zones west of UTC.
const UTC_DATE = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });

// "Oct 22, 2026"
export const formatDate = (date: Date): string => DATE.format(date);
// "Oct 22, 2026, 3:04 PM"
export const formatDateTime = (date: Date): string => DATE_TIME.format(date);
export const formatUtcDate = (date: Date): string => UTC_DATE.format(date);

// "1 email", "3 emails"; pass the plural for irregular words.
export function plural(count: number, word: string, pluralWord = `${word}s`): string {
  return `${count} ${count === 1 ? word : pluralWord}`;
}

const DAY = 24 * 60 * 60 * 1000;

// "today", "3d ago", "5w ago", "4mo ago": how long ago, compactly.
export function sinceLabel(date: Date, now: Date): string {
  const days = Math.max(0, Math.floor((now.getTime() - date.getTime()) / DAY));
  if (days === 0) return "today";
  if (days < 14) return `${days}d ago`;
  if (days < 60) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}
