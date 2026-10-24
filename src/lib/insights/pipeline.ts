import type { Status } from "@/lib/schemas/status";
import { MIN_SAMPLE } from "@/lib/insights/build";

// How applications move through the search, from their status history
// (docs/status-history.md): how many reached each stage, and how long the
// steps between stages took. Counts and durations, never causes, like the
// rest of Insights (docs/insights.md). Pure: the data layer gathers each
// application's steps, this counts.

export type PipelineStep = {
  to: Status;
  at: Date;
  // A reconstructed step's date is a guess: it counts toward reaching a
  // stage, never toward a duration.
  estimated: boolean;
};

export type PipelineApplication = {
  status: Status;
  // In recorded order (listStatusHistory).
  steps: PipelineStep[];
  // An interview in the past (Today's interviews): it was interviewed even
  // if the board never said so.
  hadInterview: boolean;
};

export type FunnelStage = "applied" | "heard_back" | "interviewed" | "offer";

export const FUNNEL_LABELS: Record<FunnelStage, string> = {
  applied: "Applied",
  heard_back: "Heard back",
  interviewed: "Interviewed",
  offer: "Offer",
};

// What reaching each stage means. Any reply counts as hearing back,
// rejections included; ghosted doesn't.
const REACHES: Record<FunnelStage, readonly Status[]> = {
  applied: ["applied", "acknowledged", "interviewing", "offer", "rejected", "ghosted"],
  heard_back: ["acknowledged", "interviewing", "offer", "rejected"],
  interviewed: ["interviewing", "offer"],
  offer: ["offer"],
};

const TIMING_KEYS = ["to_reply", "to_interview", "to_decision"] as const;
export type TimingKey = (typeof TIMING_KEYS)[number];

export const TIMING_LABELS: Record<TimingKey, string> = {
  to_reply: "Applied to first reply",
  to_interview: "Acknowledged to interview",
  to_decision: "Interview to offer or rejection",
};

export type Timing = {
  key: TimingKey;
  // Whole days; null when there's no sample at all.
  medianDays: number | null;
  minDays: number | null;
  maxDays: number | null;
  // How many applications the numbers come from.
  sample: number;
  // Fewer than MIN_SAMPLE: shown, but labeled as too few to say much.
  tooFew: boolean;
};

export type Pipeline = {
  total: number;
  funnel: { stage: FunnelStage; count: number }[];
  // Context for the funnel: still waiting to hear, and given up on.
  waiting: number;
  ghosted: number;
  timings: Timing[];
};

const DAY = 24 * 60 * 60 * 1000;

function reached(application: PipelineApplication, stage: FunnelStage): boolean {
  const statuses = REACHES[stage];
  if (statuses.includes(application.status)) return true;
  if (application.steps.some((step) => statuses.includes(step.to))) return true;
  return stage === "interviewed" && application.hadInterview;
}

// Days from the first step into `from` to the first later step into `to`,
// when both dates are real and in order.
function gap(steps: PipelineStep[], from: readonly Status[], to: readonly Status[]): number | null {
  const start = steps.findIndex((step) => from.includes(step.to));
  if (start < 0) return null;
  const end = steps.findIndex((step, i) => i > start && to.includes(step.to));
  if (end < 0) return null;
  const [a, b] = [steps[start], steps[end]];
  if (a.estimated || b.estimated) return null;
  const days = (b.at.getTime() - a.at.getTime()) / DAY;
  // Dated before the step it follows (an old email confirmed late): no
  // meaningful duration.
  return days >= 0 ? Math.round(days) : null;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

function timing(key: TimingKey, values: number[]): Timing {
  return {
    key,
    medianDays: values.length > 0 ? median(values) : null,
    minDays: values.length > 0 ? Math.min(...values) : null,
    maxDays: values.length > 0 ? Math.max(...values) : null,
    sample: values.length,
    tooFew: values.length < MIN_SAMPLE,
  };
}

export function buildPipeline(applications: readonly PipelineApplication[]): Pipeline {
  const stages: FunnelStage[] = ["applied", "heard_back", "interviewed", "offer"];
  const durations: Record<TimingKey, number[]> = { to_reply: [], to_interview: [], to_decision: [] };
  for (const application of applications) {
    const steps = application.steps;
    const toReply = gap(steps, ["applied"], REACHES.heard_back);
    const toInterview = gap(steps, ["acknowledged"], ["interviewing"]);
    const toDecision = gap(steps, ["interviewing"], ["offer", "rejected"]);
    if (toReply !== null) durations.to_reply.push(toReply);
    if (toInterview !== null) durations.to_interview.push(toInterview);
    if (toDecision !== null) durations.to_decision.push(toDecision);
  }
  return {
    total: applications.length,
    funnel: stages.map((stage) => ({ stage, count: applications.filter((application) => reached(application, stage)).length })),
    waiting: applications.filter((application) => application.status === "applied" || application.status === "acknowledged").length,
    ghosted: applications.filter((application) => application.status === "ghosted").length,
    timings: TIMING_KEYS.map((key) => timing(key, durations[key])),
  };
}
