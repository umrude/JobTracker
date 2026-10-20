import "server-only";
import { getDb } from "@/server/db/client";
import { getMode } from "@/server/mode";
import { requireUserId } from "@/server/current-user";
import {
  insertTailoringDraft,
  latestApprovedTailoringRow,
  latestTailoringRow,
  saveTailoringApproval,
  tailoringRowById,
} from "@/server/db/tailoring-store";
import type { CheckIssue, TailoringProposal } from "@/lib/schemas/tailoring";
import type { ResumeEdits } from "@/lib/schemas/resume-edits";

// The app's entry points for tailored resumes: the current mode's database
// and the current user. Ids from forms only ever reach your own rows. The
// job and resume ids come from owner-scoped reads in the service; the
// owner is stamped here, never taken from a caller.

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

export async function getLatestApprovedTailoringRow(jobId: number) {
  const { db, userId } = await scope();
  return latestApprovedTailoringRow(db, userId, jobId);
}

export async function getTailoringRow(id: number) {
  const { db, userId } = await scope();
  return tailoringRowById(db, userId, id);
}

export async function saveApproval(
  id: number,
  input: { edits: ResumeEdits; final: TailoringProposal; pages: number | null },
): Promise<boolean> {
  const { db, userId } = await scope();
  return saveTailoringApproval(db, userId, id, input);
}
