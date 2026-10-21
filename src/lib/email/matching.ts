import type { EmailMeta, MatchMethod } from "@/lib/schemas/email";
import { emailMentionsCompany, normalizeCompany } from "@/lib/email/prefilter";

// Linking a candidate email to what it's about: one of your applications,
// or a saved job you applied to but haven't moved to Applied. Pure: tested
// on its own. See docs/gmail-sync.md.
//
// In order of how much it's trusted:
// 1. Thread: a reply in a thread already linked to an application belongs
//    to it. Recruiter replies often don't repeat the company name.
// 2. Company: exactly one application or saved job at a company the email
//    names.
// 3. Company and title: several at that company, narrowed to one by the
//    job title (see pickByTitle). Two nearly identical roles, say
//    "Senior Software Engineer, Frontend (Auth Experiences)" and "(App
//    Experience)", are told apart by the words that differ.
// Otherwise it's left unlinked, with the possible matches listed, and you
// pick in review. A wrong link is worse than none.

export type MatchTarget = { company: string; title: string };

export type Match<T> = { target: T; method: Exclude<MatchMethod, "manual"> } | { target: null; candidates: T[] };

export function matchEmail<T extends MatchTarget>(
  email: EmailMeta,
  targets: readonly T[],
  // What an earlier email in this thread was linked to, if anything.
  threadTarget: T | undefined,
): Match<T> {
  if (threadTarget !== undefined) return { target: threadTarget, method: "thread" };

  const atCompany = targets.filter((t) => emailMentionsCompany(email, t.company));
  const [only] = atCompany;
  if (atCompany.length === 1 && only) return { target: only, method: "company" };
  if (atCompany.length === 0) return { target: null, candidates: [] };

  const titled = pickByTitle(`${email.subject} ${email.snippet}`, atCompany);
  if (titled) return { target: titled, method: "company_title" };
  return { target: null, candidates: atCompany };
}

const words = (text: string) => normalizeCompany(text).split(" ").filter(Boolean);
const withoutParens = (title: string) => title.replace(/\([^)]*\)/g, " ");

// Whether text contains a phrase as whole words, after normalizing both.
function containsPhrase(text: string, phrase: string): boolean {
  const core = normalizeCompany(phrase);
  return core !== "" && ` ${normalizeCompany(text)} `.includes(` ${core} `);
}

// The one target whose title the text names, or undefined if it can't
// tell. Most specific first, and each step must single out exactly one:
// 1. The full title, qualifier included: "Senior Software Engineer,
//    Frontend (Auth Experiences)", however it's punctuated.
// 2. The title without its parenthesized part: "Backend Engineer
//    (Node.js)" is found as "Backend Engineer".
// 3. The words that set one title apart from the others ("auth" and
//    "experiences" vs "app" and "experience"): exactly one target may have
//    any of its own words in the text. If both do (say "auth" and "your
//    experience"), it's left to you.
export function pickByTitle<T extends MatchTarget>(text: string, targets: readonly T[]): T | undefined {
  const single = (found: T[]) => (found.length === 1 ? found[0] : undefined);

  const full = single(targets.filter((t) => containsPhrase(text, t.title)));
  if (full) return full;

  const core = single(targets.filter((t) => containsPhrase(text, withoutParens(t.title))));
  if (core) return core;

  const present = new Set(words(text));
  const scored = targets.filter((target) => {
    const others = new Set(targets.filter((t) => t !== target).flatMap((t) => words(t.title)));
    return words(target.title).some((word) => !others.has(word) && present.has(word));
  });
  return single(scored);
}

// A second chance, after classification, for an email matching couldn't
// settle from its headers and snippet. The classifier reads the whole
// body, and returns the company and role it names:
// - several candidates at one company: the role picks one, the same way
//   as pickByTitle (an Affirm email whose body says "(Auth Experiences)");
// - no candidates (the company only appears in the body, as in many
//   applicant-tracking emails): the company, compared normalized, and the
//   role if there are several there.
// Still only a suggestion: you confirm it, and the card says how it was
// linked.
export function matchByClassifier<T extends MatchTarget>(
  extracted: { company: string | null; role: string | null },
  targets: readonly T[],
  candidates: readonly T[],
): Match<T> {
  const company = extracted.company === null ? "" : normalizeCompany(extracted.company);
  const pool = candidates.length > 0 ? candidates : company === "" ? [] : targets.filter((t) => normalizeCompany(t.company) === company);
  const [only] = pool;
  if (pool.length === 1 && only) return { target: only, method: "company" };
  const titled = extracted.role ? pickByTitle(extracted.role, pool) : undefined;
  return titled ? { target: titled, method: "company_title" } : { target: null, candidates: [...pool] };
}

// ---- Applications only (the original interface, used by tests) ----

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
  const threadId = linkedThreads.get(email.threadId);
  const match = matchEmail(email, applications, applications.find((a) => a.id === threadId));
  return match.target
    ? { applicationId: match.target.id, method: match.method }
    : { applicationId: null, candidates: match.candidates.map((a) => a.id) };
}

// Whether text names the job title as a whole phrase, ignoring anything in
// parentheses ("Backend Engineer (Node.js)" is found as "Backend Engineer").
export function mentionsTitle(text: string, title: string): boolean {
  return containsPhrase(text, withoutParens(title));
}
