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

// Gmail's own sorting: these tabs hold marketing and social mail. Company
// newsletters and job-board alerts land here, and only a known ATS sender
// overrides it.
const NOISE_LABELS = new Set(["CATEGORY_PROMOTIONS", "CATEGORY_SOCIAL"]);

export type PrefilterResult = { candidate: boolean; reasons: string[] };

// `companies` are the companies you've applied to.
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
export function emailMentionsCompany(email: EmailMeta, company: string): boolean {
  if (mentionsCompany(`${email.fromName} ${email.subject} ${email.snippet}`, company)) return true;
  const squashed = normalizeCompany(company).replaceAll(" ", "");
  return squashed !== "" && senderDomain(email.fromAddress).split(".").includes(squashed);
}
