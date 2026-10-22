import { normalizeCompany } from "@/lib/email/prefilter";

// Searching your jobs (applications and saved jobs). Pure: the header
// search runs it on the server (listings never reach the browser), the
// board's filter in the browser on company and role. Tested on its own.
//
// Ranking is by tiers, so a company match always beats a role match, and
// a role match always beats a listing match:
//   company: exact > starts with > a word starts with > anywhere
//   company and role together ("affirm frontend")
//   role:    exact > starts with > a word starts with > anywhere
//   listing: the exact phrase > all the words somewhere
// Within a tier, the most recently updated comes first. Text is compared
// normalized (lowercase, punctuation as spaces, "&" as "and"), so "Fenwick
// and Vale" finds "Fenwick & Vale". See docs/search.md.

export type SearchDoc = {
  jobId: number;
  applicationId: number | null;
  company: string;
  title: string;
  listing: string | null;
  updatedAt: Date;
};

export type MatchField = "company" | "title" | "listing";

// A listing match's context, as plain text in three parts, so the page can
// highlight the match without ever treating listing text as HTML.
export type Snippet = { before: string; match: string; after: string };

export type SearchHit<D extends SearchDoc = SearchDoc> = {
  doc: D;
  field: MatchField;
  score: number;
  snippet: Snippet | null;
};

// Normalized like company names, which is what this mostly searches.
export const normalize = (text: string): string => normalizeCompany(text);

const terms = (query: string) => normalize(query).split(" ").filter(Boolean);

// How well a field matches, 0 to 4: exact, starts with, a word starts
// with, anywhere (the whole query as a phrase), or 0.
function fieldScore(value: string, query: string): number {
  const text = normalize(value);
  if (text === "" || query === "") return 0;
  if (text === query) return 4;
  if (text.startsWith(query)) return 3;
  if (` ${text}`.includes(` ${query}`)) return 2;
  if (text.includes(query)) return 1;
  return 0;
}

const TIER = { company: 400, both: 300, title: 200, listing: 100 } as const;

export function scoreDoc<D extends SearchDoc>(doc: D, query: string): SearchHit<D> | null {
  const phrase = terms(query).join(" ");
  if (phrase === "") return null;

  const company = fieldScore(doc.company, phrase);
  if (company > 0) return { doc, field: "company", score: TIER.company + company * 10, snippet: null };

  // Every word found across company and role, at least one in the company.
  const words = terms(query);
  const companyText = ` ${normalize(doc.company)} `;
  const titleText = ` ${normalize(doc.title)} `;
  const inCompany = words.filter((w) => companyText.includes(` ${w}`));
  if (words.length > 1 && inCompany.length > 0 && words.every((w) => companyText.includes(` ${w}`) || titleText.includes(` ${w}`))) {
    return { doc, field: "company", score: TIER.both, snippet: null };
  }

  const title = fieldScore(doc.title, phrase);
  if (title > 0) return { doc, field: "title", score: TIER.title + title * 10, snippet: null };

  if (doc.listing) {
    const listing = normalize(doc.listing);
    if (listing.includes(phrase)) {
      return { doc, field: "listing", score: TIER.listing + 20, snippet: snippetFor(doc.listing, words[0] ?? phrase, phrase) };
    }
    if (words.every((w) => listing.includes(w))) {
      return { doc, field: "listing", score: TIER.listing + 10, snippet: snippetFor(doc.listing, words[0], words[0]) };
    }
  }
  return null;
}

export function searchDocs<D extends SearchDoc>(docs: readonly D[], query: string, limit = 20): SearchHit<D>[] {
  return docs
    .flatMap((doc) => {
      const hit = scoreDoc(doc, query);
      return hit ? [hit] : [];
    })
    .sort((a, b) => b.score - a.score || b.doc.updatedAt.getTime() - a.doc.updatedAt.getTime())
    .slice(0, limit);
}

const SNIPPET_SIDE = 60;

// About 120 characters of the original listing around the first place the
// match occurs, cut at word boundaries. Found case-insensitively in the
// original text; if normalizing moved things too much (heavy punctuation),
// the first word alone is used.
export function snippetFor(listing: string, firstWord: string, phrase: string): Snippet | null {
  const flat = listing.replace(/\s+/g, " ");
  const lower = flat.toLowerCase();
  let at = lower.indexOf(phrase);
  let length = phrase.length;
  if (at < 0) {
    at = lower.indexOf(firstWord);
    length = firstWord.length;
  }
  if (at < 0) return null;
  let start = Math.max(0, at - SNIPPET_SIDE);
  let end = Math.min(flat.length, at + length + SNIPPET_SIDE);
  if (start > 0) start = flat.indexOf(" ", start) + 1 || start;
  if (end < flat.length) end = flat.lastIndexOf(" ", end) > at + length ? flat.lastIndexOf(" ", end) : end;
  return {
    before: (start > 0 ? "…" : "") + flat.slice(start, at),
    match: flat.slice(at, at + length),
    after: flat.slice(at + length, end) + (end < flat.length ? "…" : ""),
  };
}
