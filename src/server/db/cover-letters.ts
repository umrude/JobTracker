import "server-only";
import { getDb } from "@/server/db/client";
import { getMode } from "@/server/mode";
import { requireUserId } from "@/server/current-user";
import { coverLetterRows, insertCoverLetter, updateCoverLetterText } from "@/server/db/cover-letter-store";
import type { CoverLength, CoverTone, LetterWarning } from "@/lib/schemas/cover-letter";

// The app's entry points for cover letters: the current mode's database
// and the current user. Ids from forms only ever reach your own rows.

async function scope() {
  return { db: getDb(await getMode()), userId: await requireUserId() };
}

export async function createCoverLetter(input: {
  jobId: number;
  tailoringId: number | null;
  resumeId: number;
  tone: CoverTone;
  length: CoverLength;
  text: string;
  warnings: LetterWarning[];
  model: string;
}) {
  const { db, userId } = await scope();
  return insertCoverLetter(db, userId, input);
}

export async function listCoverLetterRows(jobId: number) {
  const { db, userId } = await scope();
  return coverLetterRows(db, userId, jobId);
}

export async function saveCoverLetterText(id: number, text: string): Promise<boolean> {
  const { db, userId } = await scope();
  return updateCoverLetterText(db, userId, id, text);
}
