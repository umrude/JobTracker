import type { EmailMeta, MatchMethod } from "@/lib/schemas/email";
import { emailMentionsCompany, normalizeCompany } from "@/lib/email/prefilter";

// Linking a candidate email to one of your applications. Pure: tested on
// its own. See docs/gmail-sync.md.
//
// In order of how much it's trusted:
// 1. Thread: a reply in a thread already linked to an application belongs
//    to it. Recruiter replies often don't repeat the company name.
// 2. Company: exactly one application at a company the email names.
// 3. Company and title: several applications at that company, narrowed to
//    one by the job title in the subject or snippet.
// Otherwise it's left unlinked, with the possible applications listed, and
// you pick in review. A wrong link is worse than none.

export type MatchableApplication = { id: number; company: string; title: string };

export type MatchResult =
  | { applicationId: number; method: Exclude<MatchMethod, "manual"> }
  | { applicationId: null; candidates: number[] };

export function matchApplication(
  email: EmailMeta,
  applications: readonly MatchableApplication[],
  // Threads already linked to an application by earlier emails.
  linkedThreads: ReadonlyMap<string, number>,
): MatchResult {
  const threadApp = linkedThreads.get(email.threadId);
  if (threadApp !== undefined && applications.some((a) => a.id === threadApp)) {
    return { applicationId: threadApp, method: "thread" };
  }

  const atCompany = applications.filter((a) => emailMentionsCompany(email, a.company));
  const [only] = atCompany;
  if (atCompany.length === 1 && only) return { applicationId: only.id, method: "company" };
  if (atCompany.length === 0) return { applicationId: null, candidates: [] };

  const text = `${email.subject} ${email.snippet}`;
  const byTitle = atCompany.filter((a) => mentionsTitle(text, a.title));
  const [titled] = byTitle;
  if (byTitle.length === 1 && titled) return { applicationId: titled.id, method: "company_title" };
  return { applicationId: null, candidates: atCompany.map((a) => a.id) };
}

// Whether text names the job title as a whole phrase, ignoring anything in
// parentheses ("Backend Engineer (Node.js)" is found as "Backend Engineer").
export function mentionsTitle(text: string, title: string): boolean {
  const core = normalizeCompany(title.replace(/\([^)]*\)/g, " "));
  if (core === "") return false;
  return ` ${normalizeCompany(text)} `.includes(` ${core} `);
}
