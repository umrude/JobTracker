import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { getMode } from "@/server/mode";
import { requireUserId } from "@/server/current-user";
import { resumes } from "@/server/db/schema";

// Every query filters on the current user (requireUserId). That matters
// for writes as much as reads: "deactivate the active resume" without the
// owner filter would switch off every user's active resume.
async function scope() {
  return { db: getDb(await getMode()), userId: await requireUserId() };
}

export async function listResumes() {
  const { db, userId } = await scope();
  return db
    .select()
    .from(resumes)
    .where(eq(resumes.userId, userId))
    .orderBy(desc(resumes.version))
    .all();
}

export type Resume = Awaited<ReturnType<typeof listResumes>>[number];

export async function getResume(id: number) {
  const { db, userId } = await scope();
  return db
    .select()
    .from(resumes)
    .where(and(eq(resumes.id, id), eq(resumes.userId, userId)))
    .get();
}

export async function getActiveResume() {
  const { db, userId } = await scope();
  return db
    .select()
    .from(resumes)
    .where(and(eq(resumes.userId, userId), eq(resumes.isActive, true)))
    .get();
}

// Saving always creates a new version and makes it active; old versions
// are kept as history. Versions are numbered per user. One transaction,
// so the version number can't be taken twice and there's never a moment
// with two active resumes. The old active row is switched off *before*
// the insert, because the partial unique index (resumes_user_one_active)
// would reject the new row while the old one is still active.
export async function createResumeVersion(text: string, latexSource: string | null) {
  const { db, userId } = await scope();
  return db.transaction((tx) => {
    const { maxVersion } = tx
      .select({ maxVersion: sql<number>`coalesce(max(${resumes.version}), 0)` })
      .from(resumes)
      .where(eq(resumes.userId, userId))
      .get() ?? { maxVersion: 0 };

    tx.update(resumes)
      .set({ isActive: false })
      .where(and(eq(resumes.userId, userId), eq(resumes.isActive, true)))
      .run();

    return tx
      .insert(resumes)
      .values({ userId, text, latexSource, version: maxVersion + 1, isActive: true })
      .returning()
      .get();
  });
}

export type ActivateResumeResult = { ok: true } | { ok: false; reason: "not_found" };

// Same ordering rule as above: deactivate first, then activate.
export async function activateResume(id: number): Promise<ActivateResumeResult> {
  const { db, userId } = await scope();
  return db.transaction((tx) => {
    const target = tx
      .select()
      .from(resumes)
      .where(and(eq(resumes.id, id), eq(resumes.userId, userId)))
      .get();
    if (!target) return { ok: false, reason: "not_found" };

    tx.update(resumes)
      .set({ isActive: false })
      .where(and(eq(resumes.userId, userId), eq(resumes.isActive, true)))
      .run();
    tx.update(resumes)
      .set({ isActive: true })
      .where(and(eq(resumes.id, id), eq(resumes.userId, userId)))
      .run();

    return { ok: true };
  });
}
