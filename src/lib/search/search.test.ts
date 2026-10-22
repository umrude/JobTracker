import { describe, it, expect } from "vitest";
import { scoreDoc, searchDocs, snippetFor, type SearchDoc } from "@/lib/search/search";

let nextId = 0;
const doc = (company: string, title: string, listing: string | null = null, daysAgo = 0): SearchDoc => ({
  jobId: ++nextId,
  applicationId: nextId,
  company,
  title,
  listing,
  updatedAt: new Date(Date.UTC(2026, 9, 22) - daysAgo * 86_400_000),
});

const names = (hits: { doc: SearchDoc }[]) => hits.map((h) => `${h.doc.company} / ${h.doc.title}`);

describe("searchDocs ranking", () => {
  const docs = [
    doc("Northwind Robotics", "Frontend Engineer", "We use React and data viz."),
    doc("Acme", "React Developer", "Build things."),
    doc("Reactor Labs", "Platform Engineer", null),
    doc("Globex", "Backend Engineer", "Our stack: Go, React for internal tools."),
  ];

  it("puts company matches first, then role, then listing", () => {
    expect(names(searchDocs(docs, "react"))).toEqual([
      "Reactor Labs / Platform Engineer",
      "Acme / React Developer",
      // Listing matches, most recently updated first (equal dates keep order).
      "Northwind Robotics / Frontend Engineer",
      "Globex / Backend Engineer",
    ]);
  });

  it("ranks exact over starts-with over a word over anywhere, within a field", () => {
    const companies = [doc("Big Vale", "x"), doc("Valero", "x"), doc("Vale", "x"), doc("Novale", "x")];
    expect(searchDocs(companies, "vale").map((h) => h.doc.company)).toEqual(["Vale", "Valero", "Big Vale", "Novale"]);
  });

  it("matches company and role together", () => {
    const affirm = [
      doc("Affirm", "Senior Software Engineer, Frontend (Auth Experiences)"),
      doc("Affirm", "Data Analyst"),
      doc("Globex", "Frontend Engineer"),
    ];
    const hits = searchDocs(affirm, "affirm frontend");
    expect(names(hits)).toEqual(["Affirm / Senior Software Engineer, Frontend (Auth Experiences)"]);
  });

  it("ignores case, punctuation, and & versus and", () => {
    expect(searchDocs([doc("Fenwick & Vale, Inc.", "Analyst")], "fenwick and vale")).toHaveLength(1);
    expect(searchDocs([doc("Next.js Shop", "Dev")], "NEXT JS")).toHaveLength(1);
  });

  it("breaks ties by most recently updated", () => {
    const older = doc("Acme", "Engineer", null, 30);
    const newer = doc("Acme", "Engineer", null, 1);
    expect(searchDocs([older, newer], "acme").map((h) => h.doc.jobId)).toEqual([newer.jobId, older.jobId]);
  });

  it("finds nothing for an empty query or no match, and caps the results", () => {
    expect(searchDocs(docs, "   ")).toEqual([]);
    expect(searchDocs(docs, "kubernetes")).toEqual([]);
    expect(searchDocs(Array.from({ length: 30 }, () => doc("Acme", "Dev")), "acme", 5)).toHaveLength(5);
  });
});

describe("listing matches", () => {
  it("prefers the exact phrase, and needs every word", () => {
    const phrase = scoreDoc(doc("A", "B", "Experience with design systems and Storybook."), "design systems");
    const scattered = scoreDoc(doc("C", "D", "A design team that builds systems."), "design systems");
    expect(phrase?.field).toBe("listing");
    expect((phrase?.score ?? 0) > (scattered?.score ?? 0)).toBe(true);
    expect(scoreDoc(doc("E", "F", "Design only."), "design systems")).toBeNull();
  });

  it("returns a plain-text snippet around the match", () => {
    const listing = `${"Intro words. ".repeat(20)}We need strong TypeScript skills and testing. ${"More text. ".repeat(20)}`;
    const snippet = snippetFor(listing, "typescript", "typescript");
    expect(snippet?.match).toBe("TypeScript");
    expect(snippet?.before.startsWith("…")).toBe(true);
    expect(snippet?.after.endsWith("…")).toBe(true);
    expect((snippet?.before.length ?? 0) + (snippet?.after.length ?? 0)).toBeLessThan(140);
  });
});
