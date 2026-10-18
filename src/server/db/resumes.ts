import "server-only";
import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { getMode } from "@/server/mode";
import { resumes } from "@/server/db/schema";

export async function listResumes() {
  const db = getDb(await getMode());
  return db.select().from(resumes).orderBy(desc(resumes.version)).all();
}

export type Resume = Awaited<ReturnType<typeof listResumes>>[number];

export async function getActiveResume() {
  const db = getDb(await getMode());
  return db.select().from(resumes).where(eq(resumes.isActive, true)).get();
}

// Saving always creates a new version and makes it active; old versions
// are kept as history. One transaction, so the version number can't be
// taken twice and there's never a moment with two active resumes. The
// old active row is switched off *before* the insert, because the
// partial unique index (resumes_one_active) would reject the new row
// while the old one is still active.
export async function createResumeVersion(text: string) {
  const db = getDb(await getMode());
  return db.transaction((tx) => {
    const { maxVersion } = tx
      .select({ maxVersion: sql<number>`coalesce(max(${resumes.version}), 0)` })
      .from(resumes)
      .get() ?? { maxVersion: 0 };

    tx.update(resumes)
      .set({ isActive: false })
      .where(eq(resumes.isActive, true))
      .run();

    return tx
      .insert(resumes)
      .values({ text, version: maxVersion + 1, isActive: true })
      .returning()
      .get();
  });
}

export type ActivateResumeResult = { ok: true } | { ok: false; reason: "not_found" };

// Same ordering rule as above: deactivate first, then activate.
export async function activateResume(id: number): Promise<ActivateResumeResult> {
  const db = getDb(await getMode());
  return db.transaction((tx) => {
    const target = tx.select().from(resumes).where(eq(resumes.id, id)).get();
    if (!target) return { ok: false, reason: "not_found" };

    tx.update(resumes)
      .set({ isActive: false })
      .where(eq(resumes.isActive, true))
      .run();
    tx.update(resumes).set({ isActive: true }).where(eq(resumes.id, id)).run();

    return { ok: true };
  });
}
