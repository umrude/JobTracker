import "server-only";
import { getDb } from "@/server/db/client";
import { getMode } from "@/server/mode";
import { requireUserId } from "@/server/current-user";
import { insertTailoringDraft, latestTailoringRow } from "@/server/db/tailoring-store";
import type { CheckIssue, TailoringProposal } from "@/lib/schemas/tailoring";

// The app's entry points for tailored resumes: the current mode's database
// and the current user. The job and resume ids come from owner-scoped
// reads in runTailoring; the owner is stamped here, never taken from a caller.

async function scope() {
  return { db: getDb(await getMode()), userId: await requireUserId() };
}

export async function createTailoringDraft(input: {
  jobId: number;
  resumeId: number;
  proposal: TailoringProposal;
  issues: CheckIssue[];
  model: string;
}) {
  const { db, userId } = await scope();
  return insertTailoringDraft(db, userId, input);
}

export async function getLatestTailoringRow(jobId: number) {
  const { db, userId } = await scope();
  return latestTailoringRow(db, userId, jobId);
}
