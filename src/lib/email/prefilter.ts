import type { EmailMeta } from "@/lib/schemas/email";

// The cheap first pass of Gmail sync: decide from headers and the snippet
// alone whether an email could be about one of your applications. Only
// candidates are sent to the classifier (an LLM call), so this keeps cost
// down and keeps most of your inbox away from the model entirely.
// Pure: tested on its own. See docs/gmail-sync.md.

// Applicant-tracking systems that send hiring email on companies' behalf.
// Matched against the sender's domain, including subdomains
// ("no-reply@us.greenhouse-mail.io").
export const ATS_DOMAINS = [
  "greenhouse.io",
  "greenhouse-mail.io",
  "lever.co",
  "hire.lever.co",
  "myworkday.com",
  "myworkdayjobs.com",
  "ashbyhq.com",
  "smartrecruiters.com",
  "icims.com",
  "jobvite.com",
  "bamboohr.com",
  "workablemail.com",
  "workable.com",
  "teamtailor.com",
  "recruitee.com",
  "breezy.hr",
  "jazzhr.com",
  "successfactors.com",
  "taleo.net",
  "rippling.com",
] as const;

// Subject phrases that point at hiring news. Deliberately specific: a bare
// "offer" matches "Special offer: 50% off", so offers need "offer letter",
// "job offer", or "offer of employment".
const SUBJECT_PATTERNS: readonly RegExp[] = [
  /\byour application\b/i,
  /\bthank(s| you) for (applying|your application|your interest)\b/i,
  /\bapplication (received|status|update)\b/i,
  /\binterview/i,
  /\bnext steps?\b/i,
  /\bunfortunately\b/i,
  /\bregret to inform\b/i,
  /\b(other|another) candidates?\b/i,
  /\b(job|employment) offer\b|\boffer (letter|of employment)\b/i,
  /\b(coding|technical|online) (assessment|challenge|test)\b|\btake[- ]home\b/i,
  /\byour candidacy\b/i,
];

// Phrases in Gmail's preview (the snippet) that point at hiring news even
// when the subject doesn't, for applications you haven't added to the
// tracker: "Quick question" from a company you never entered, opening
// "Thanks for applying for the Product Designer role...". Stricter than
// the subject patterns, since snippets are longer and more varied: each
// phrase is one a non-hiring email rarely contains.
const SNIPPET_PATTERNS: readonly RegExp[] = [
  /\bthank(s| you) for (applying|your application)\b/i,
  /\byour application (for|to)\b/i,
  /\b(schedule|set up|book) (a|an|your) (phone screen|interview)\b/i,
  /\bmov(e|ing) forward with (your application|other candidates)\b/i,
  /\boffer (letter|of employment)\b/i,
  /\b(take[- ]home|coding (assessment|challenge|test)|online assessment)\b/i,
];

// Gmail's own sorting: these tabs hold marketing and social mail. Company
// newsletters and job-board alerts land here, and only a known ATS sender
// overrides it.
const NOISE_LABELS = new Set(["CATEGORY_PROMOTIONS", "CATEGORY_SOCIAL"]);

export type PrefilterResult = { candidate: boolean; reasons: string[] };

// `companies` are the companies of your applications and saved jobs.
export function prefilter(email: EmailMeta, companies: readonly string[]): PrefilterResult {
  const reasons: string[] = [];
  const domain = senderDomain(email.fromAddress);

  const ats = ATS_DOMAINS.find((ats) => domain === ats || domain.endsWith(`.${ats}`));
  if (ats) reasons.push(`ats:${ats}`);

  for (const company of companies) {
    if (emailMentionsCompany(email, company)) reasons.push(`company:${company}`);
  }

  const pattern = SUBJECT_PATTERNS.find((p) => p.test(email.subject));
  if (pattern) reasons.push("subject");
  if (SNIPPET_PATTERNS.some((p) => p.test(email.snippet))) reasons.push("snippet");

  const noise = email.labels.some((label) => NOISE_LABELS.has(label));
  const candidate = ats !== undefined || (!noise && reasons.length > 0);
  return { candidate, reasons };
}

export function senderDomain(address: string): string {
  return address.slice(address.lastIndexOf("@") + 1).toLowerCase().trim();
}

// Company names, normalized for comparison: lowercase, "&" as "and",
// punctuation as spaces, and common legal suffixes dropped, so "Fenwick &
// Vale, Inc." and "fenwick and vale" are the same company.
export function normalizeCompany(name: string): string {
  return name
    .toLowerCase()
    .replaceAll("&", " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(inc|llc|ltd|limited|corp|corporation|co|gmbh|plc)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Whether text names the company as a whole phrase: "Larkspur Systems"
// isn't found in "Larkspur Logistics all-hands".
export function mentionsCompany(text: string, company: string): boolean {
  const name = normalizeCompany(company);
  if (name === "") return false;
  return ` ${normalizeCompany(text)} `.includes(` ${name} `);
}

// Whether an email is from or about a company: its name in the sender's
// name, the subject, or the snippet, or as a label of the sender's domain
// ("recruiting.northwindrobotics.example" for Northwind Robotics, its
// name without spaces).
//
// A one-word name that's also an ordinary word ("Affirm", "Square",
// "Ramp") would match "we affirm our commitment" in any email. So in the
// subject and snippet, a one-word name only counts written the way you
// capitalized it; the sender's name and domain are trusted as before.
export function emailMentionsCompany(email: EmailMeta, company: string): boolean {
  const squashed = normalizeCompany(company).replaceAll(" ", "");
  if (squashed === "") return false;
  if (mentionsCompany(email.fromName, company)) return true;
  if (senderDomain(email.fromAddress).split(".").includes(squashed)) return true;
  const text = `${email.subject} ${email.snippet}`;
  return isOneWord(company) ? mentionsCapitalized(text, company.trim()) : mentionsCompany(text, company);
}

function isOneWord(company: string): boolean {
  return !normalizeCompany(company).includes(" ");
}

// Exact capitalization, as a whole word ("Affirm", not "affirm" or
// "Affirmation"). A name you typed in lowercase can't tell, so it matches
// any capitalization.
function mentionsCapitalized(text: string, company: string): boolean {
  const word = company.replace(/[^\p{L}\p{N}]/gu, "");
  if (word === "") return false;
  if (word === word.toLowerCase()) return mentionsCompany(text, company);
  return new RegExp(`(^|[^\\p{L}\\p{N}])${word}($|[^\\p{L}\\p{N}])`, "u").test(text);
}
