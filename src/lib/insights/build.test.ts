import { describe, it, expect } from "vitest";
import { buildInsights, MIN_SAMPLE, type InsightJob } from "@/lib/insights/build";
import type { Status } from "@/lib/schemas/status";

let nextId = 0;
function job(
  status: Status | null,
  skills: Record<string, "matched" | "missing">,
  extra: Partial<InsightJob> = {},
): InsightJob {
  const id = ++nextId;
  return {
    jobId: id,
    company: `Company ${id}`,
    title: "Engineer",
    hasListing: true,
    status,
    passedScreening: false,
    comparison: {
      skills: Object.entries(skills).map(([key, s]) => ({ key, name: key.toUpperCase(), status: s })),
      listingChanged: false,
      olderResume: false,
    },
    ...extra,
  };
}

const profile = [
  { key: "react", learning: false },
  { key: "kubernetes", learning: true },
];

describe("buildInsights: what's included", () => {
  it("analyzes only jobs with a listing and a comparison, and lists the rest", () => {
    const insights = buildInsights(
      [
        job("applied", { react: "matched" }),
        job("rejected", {}, { hasListing: false, comparison: null }),
        job(null, {}, { comparison: null }),
        job("offer", { go: "missing" }, { comparison: { skills: [{ key: "go", name: "Go", status: "missing" }], listingChanged: true, olderResume: true } }),
      ],
      profile,
      "all",
    );
    expect(insights.coverage).toMatchObject({ included: 2, listingChanged: 1, olderResume: 1 });
    expect(insights.coverage.noListing.map((j) => j.isApplication)).toEqual([true]);
    expect(insights.coverage.notCompared.map((j) => j.isApplication)).toEqual([false]);
  });

  it("leaves saved jobs out when the scope is applications only", () => {
    const jobs = [job(null, { react: "missing" }), job("applied", { react: "matched" })];
    expect(buildInsights(jobs, profile, "all").skills[0]).toMatchObject({ asked: 2, missing: 1 });
    expect(buildInsights(jobs, profile, "applied").skills[0]).toMatchObject({ asked: 1, missing: 0 });
  });
});

describe("buildInsights: skills", () => {
  it("counts how often each skill is asked for and missing, most missing first", () => {
    const insights = buildInsights(
      [job("applied", { react: "matched", kubernetes: "missing", terraform: "missing" }), job("applied", { kubernetes: "missing" })],
      profile,
      "all",
    );
    expect(insights.skills.map((s) => [s.key, s.asked, s.missing])).toEqual([
      ["kubernetes", 2, 2],
      ["terraform", 1, 1],
      ["react", 1, 0],
    ]);
  });

  it("says where each skill stands in your profile", () => {
    const insights = buildInsights([job("applied", { react: "missing", kubernetes: "missing", terraform: "missing" })], profile, "all");
    const standing = Object.fromEntries(insights.skills.map((s) => [s.key, s.standing]));
    expect(standing).toEqual({ react: "in_profile", kubernetes: "learning", terraform: "absent" });
  });
});

describe("buildInsights: outcomes", () => {
  it("counts rejections (ghosted shown inside) against progressed, among listings that asked", () => {
    const insights = buildInsights(
      [
        job("rejected", { go: "missing" }),
        job("ghosted", { go: "missing" }),
        job("rejected", { go: "matched" }),
        job("interviewing", { go: "matched" }),
        job("offer", { go: "missing" }),
        job("applied", { go: "missing" }),
        job("rejected", { react: "matched" }),
      ],
      profile,
      "all",
    );
    const go = insights.skills.find((s) => s.key === "go");
    expect(go?.outcomes).toMatchObject({
      rejected: { total: 3, missing: 2, ghosted: { total: 1, missing: 1 } },
      progressed: { total: 2, missing: 1 },
      comparable: false,
    });
    expect(insights.outcomes).toMatchObject({ rejected: 3, ghosted: 1, progressed: 2, waiting: 1 });
  });

  it("is comparable only with enough on both sides", () => {
    const rejected = Array.from({ length: MIN_SAMPLE }, () => job("rejected", { go: "missing" }));
    const progressed = Array.from({ length: MIN_SAMPLE }, () => job("interviewing", { go: "matched" }));
    expect(buildInsights([...rejected, ...progressed], profile, "all").skills[0].outcomes.comparable).toBe(true);
    expect(buildInsights([...rejected, ...progressed.slice(1)], profile, "all").skills[0].outcomes.comparable).toBe(false);
  });

  it("splits rejections by what you know about screening, and only says so with enough", () => {
    const passed = Array.from({ length: 4 }, () => job("rejected", { go: "matched" }, { passedScreening: true }));
    const unknown = [job("rejected", { go: "missing" }), job("ghosted", { go: "missing" })];
    const few = buildInsights([...passed, ...unknown], profile, "all");
    expect(few.skills[0].outcomes).toMatchObject({ afterScreening: { total: 4, missing: 0 }, stageUnknown: { total: 2, missing: 2 } });
    expect(few.outcomes.rejectedAfterScreening).toBe(4);
    expect(few.screeningSplit).toBe(false);
    const enough = buildInsights([...passed, job("ghosted", { go: "matched" }, { passedScreening: true }), ...unknown], profile, "all");
    expect(enough.screeningSplit).toBe(true);
  });
});
