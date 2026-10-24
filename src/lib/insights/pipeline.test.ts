import { describe, expect, it } from "vitest";
import { buildPipeline, type PipelineApplication, type PipelineStep } from "@/lib/insights/pipeline";
import type { Status } from "@/lib/schemas/status";

const day = (n: number) => new Date(Date.UTC(2026, 8, n));
const step = (to: Status, n: number, estimated = false): PipelineStep => ({ to, at: day(n), estimated });
const app = (status: Status, steps: PipelineStep[], hadInterview = false): PipelineApplication => ({ status, steps, hadInterview });

describe("buildPipeline: the funnel", () => {
  it("counts each stage an application ever reached, not just where it is now", () => {
    const pipeline = buildPipeline([
      app("applied", [step("applied", 1)]),
      app("acknowledged", [step("applied", 1), step("acknowledged", 3)]),
      // Rejected after interviewing: heard back and interviewed.
      app("rejected", [step("applied", 1), step("interviewing", 8), step("rejected", 20)]),
      app("offer", [step("applied", 1), step("offer", 30)]),
      app("ghosted", [step("applied", 1), step("ghosted", 31)]),
    ]);
    expect(pipeline.funnel).toEqual([
      { stage: "applied", count: 5 },
      { stage: "heard_back", count: 3 },
      { stage: "interviewed", count: 2 },
      { stage: "offer", count: 1 },
    ]);
    expect([pipeline.total, pipeline.waiting, pipeline.ghosted]).toEqual([5, 2, 1]);
  });

  it("counts a past interview as interviewed, even if the board never said so", () => {
    const pipeline = buildPipeline([app("rejected", [step("applied", 1), step("rejected", 9)], true)]);
    expect(pipeline.funnel.find((f) => f.stage === "interviewed")?.count).toBe(1);
  });

  it("counts an application with no history by its current status", () => {
    expect(buildPipeline([app("interviewing", [])]).funnel.map((f) => f.count)).toEqual([1, 1, 1, 0]);
  });
});

describe("buildPipeline: time in each stage", () => {
  const timing = (applications: PipelineApplication[], key: string) => buildPipeline(applications).timings.find((t) => t.key === key);

  it("measures applied to first reply, acknowledged to interview, and interview to decision", () => {
    const applications = [
      app("offer", [step("applied", 1), step("acknowledged", 4), step("interviewing", 10), step("offer", 25)]),
      app("rejected", [step("applied", 1), step("rejected", 11)]),
    ];
    expect(timing(applications, "to_reply")).toMatchObject({ medianDays: 7, minDays: 3, maxDays: 10, sample: 2 });
    expect(timing(applications, "to_interview")).toMatchObject({ medianDays: 6, sample: 1 });
    expect(timing(applications, "to_decision")).toMatchObject({ medianDays: 15, sample: 1 });
  });

  it("leaves out guessed dates and steps dated before the one they follow", () => {
    const applications = [
      app("rejected", [step("applied", 1, true), step("rejected", 20)]),
      app("acknowledged", [step("applied", 10), step("acknowledged", 4)]),
    ];
    expect(timing(applications, "to_reply")).toMatchObject({ medianDays: null, sample: 0, tooFew: true });
  });

  it("marks small samples as too few, and takes the middle value", () => {
    const replies = [2, 4, 6, 8, 30].map((n) => app("acknowledged", [step("applied", 1), step("acknowledged", 1 + n)]));
    expect(timing(replies, "to_reply")).toMatchObject({ medianDays: 6, sample: 5, tooFew: false });
    expect(timing(replies.slice(0, 4), "to_reply")).toMatchObject({ medianDays: 5, tooFew: true });
  });
});
