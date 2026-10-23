// No "server-only": the seed and the backfill script use this with their
// own connection, and the other stores call it inside their transactions.
// Like every *-store.ts, it takes the user id explicitly; the app reaches
// it through wrappers that pass requireUserId() (see CLAUDE.md).
import { and, asc, eq, inArray, isNotNull, notExists } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@/server/db/schema";
import { applications, emailEvents, statusEvents } from "@/server/db/schema";
import type { Status } from "@/lib/schemas/status";
import type { StatusChange, StatusChangeSource } from "@/lib/schemas/status-history";
import { creationChanges, reconstructHistory, type ConfirmedSuggestion } from "@/lib/status-history";

type AppDb = BetterSQLite3Database<typeof schema>;
// A database or a transaction: recording happens inside the caller's
// transaction, so a status and its history can't disagree.
type Writer = Pick<AppDb, "insert">;

function insertChanges(db: Writer, userId: number, applicationId: number, changes: StatusChange[]) {
  if (changes.length === 0) return;
  db.insert(statusEvents)
    .values(
      changes.map((change) => ({
        userId,
        applicationId,
        fromStatus: change.from,
        toStatus: change.to,
        at: change.at,
        source: change.source,
        emailEventId: change.emailEventId,
      })),
    )
    .run();
}

// A status change on an existing application. Nothing is recorded when the
// status didn't actually change (saving the edit form unchanged, say).
export function recordStatusChange(
  db: Writer,
  userId: number,
  change: { applicationId: number; from: Status; to: Status; at: Date; source: StatusChangeSource; emailEventId?: number | null },
) {
  if (change.from === change.to) return;
  insertChanges(db, userId, change.applicationId, [
    { from: change.from, to: change.to, at: change.at, source: change.source, emailEventId: change.emailEventId ?? null },
  ]);
}

// The start of a new application's history (see creationChanges).
export function recordCreation(
  db: Writer,
  userId: number,
  input: { applicationId: number; status: Status; appliedAt: Date | null; at: Date; source: StatusChangeSource; emailEventId?: number | null },
) {
  insertChanges(db, userId, input.applicationId, creationChanges(input));
}

// One application's history in the order it was recorded, with the email
// that caused each step when there was one. Recorded order, not date
// order, keeps the chain intact (each step's `from` is the previous
// step's `to`): confirming an old email records a step dated before steps
// already there (the email's real date), and sorting by date would put it
// ahead of the status it moved from. The dates stay true either way.
export function listStatusHistory(db: AppDb, userId: number, applicationId: number) {
  return db
    .select({
      id: statusEvents.id,
      from: statusEvents.fromStatus,
      to: statusEvents.toStatus,
      at: statusEvents.at,
      source: statusEvents.source,
      emailSubject: emailEvents.subject,
      emailFrom: emailEvents.fromName,
    })
    .from(statusEvents)
    .leftJoin(emailEvents, and(eq(emailEvents.id, statusEvents.emailEventId), eq(emailEvents.userId, userId)))
    .where(and(eq(statusEvents.userId, userId), eq(statusEvents.applicationId, applicationId)))
    .orderBy(asc(statusEvents.id))
    .all();
}

export type StatusHistoryRow = ReturnType<typeof listStatusHistory>[number];

// Reconstructs history for this user's applications that have none: those
// from before history was kept. Safe to run any number of times, since an
// application with any history is left alone. Returns how many
// applications it filled in. See reconstructHistory for the rules.
export function backfillStatusHistory(db: AppDb, userId: number): number {
  return db.transaction((tx) => {
    const missing = tx
      .select({
        id: applications.id,
        status: applications.status,
        appliedAt: applications.appliedAt,
        createdAt: applications.createdAt,
        updatedAt: applications.updatedAt,
      })
      .from(applications)
      .where(
        and(
          eq(applications.userId, userId),
          notExists(
            tx
              .select({ id: statusEvents.id })
              .from(statusEvents)
              .where(and(eq(statusEvents.applicationId, applications.id), eq(statusEvents.userId, userId))),
          ),
        ),
      )
      .all();
    if (missing.length === 0) return 0;

    const confirmed = tx
      .select({
        id: emailEvents.id,
        applicationId: emailEvents.applicationId,
        source: emailEvents.source,
        status: emailEvents.proposedStatus,
        receivedAt: emailEvents.receivedAt,
        decidedAt: emailEvents.decidedAt,
        createdAt: emailEvents.createdAt,
      })
      .from(emailEvents)
      .where(
        and(
          eq(emailEvents.userId, userId),
          eq(emailEvents.state, "confirmed"),
          isNotNull(emailEvents.proposedStatus),
          inArray(
            emailEvents.applicationId,
            missing.map((application) => application.id),
          ),
        ),
      )
      .all();
    const byApplication = new Map<number, ConfirmedSuggestion[]>();
    for (const row of confirmed) {
      if (row.applicationId === null || row.status === null) continue;
      const list = byApplication.get(row.applicationId) ?? [];
      list.push({ id: row.id, source: row.source, status: row.status, at: row.receivedAt ?? row.decidedAt ?? row.createdAt });
      byApplication.set(row.applicationId, list);
    }

    for (const application of missing) {
      insertChanges(tx, userId, application.id, reconstructHistory({ ...application, confirmed: byApplication.get(application.id) ?? [] }));
    }
    return missing.length;
  });
}
