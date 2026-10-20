// No "server-only" here, like the other *-store.ts modules: tests use it
// with their own connection. Every function takes the database and owner
// as arguments; the app reaches it through gmail-connections.ts, which
// passes requireUserId() and does the encrypting.
import { and, eq, isNull, min } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@/server/db/schema";
import { applications, gmailConnections } from "@/server/db/schema";

type AppDb = BetterSQLite3Database<typeof schema>;

export function gmailConnectionRow(db: AppDb, userId: number) {
  return db.select().from(gmailConnections).where(eq(gmailConnections.userId, userId)).get();
}

export type GmailConnectionRow = NonNullable<ReturnType<typeof gmailConnectionRow>>;

// Saves a new connection, or replaces the token of an existing one.
// Reconnecting the same address keeps the sync position (history id, start
// date), so the next sync picks up where the last one stopped. A different
// address starts over: the old history id means nothing in another inbox.
export function upsertGmailConnection(
  db: AppDb,
  userId: number,
  input: { email: string; encryptedRefreshToken: string; scope: string },
  now = new Date(),
): void {
  db.transaction((tx) => {
    const existing = tx
      .select({ email: gmailConnections.email })
      .from(gmailConnections)
      .where(eq(gmailConnections.userId, userId))
      .get();
    const fresh = { ...input, needsReconnect: false, connectedAt: now };
    if (!existing) {
      tx.insert(gmailConnections).values({ ...fresh, userId }).run();
    } else if (existing.email.toLowerCase() === input.email.toLowerCase()) {
      tx.update(gmailConnections).set(fresh).where(eq(gmailConnections.userId, userId)).run();
    } else {
      tx.update(gmailConnections)
        .set({ ...fresh, historyId: null, lastSyncedAt: null, syncStartAt: null })
        .where(eq(gmailConnections.userId, userId))
        .run();
    }
  });
}

// Deletes the connection and returns its encrypted token, so the caller
// can revoke it at Google. Undefined if there wasn't one.
export function deleteGmailConnection(db: AppDb, userId: number): string | undefined {
  return db
    .delete(gmailConnections)
    .where(eq(gmailConnections.userId, userId))
    .returning({ token: gmailConnections.encryptedRefreshToken })
    .get()?.token;
}

export function markGmailNeedsReconnect(db: AppDb, userId: number): void {
  db.update(gmailConnections).set({ needsReconnect: true }).where(eq(gmailConnections.userId, userId)).run();
}

// Only before the first sync: after it, sync follows Gmail's history and
// the start date no longer means anything. False if nothing changed.
export function setGmailSyncStart(db: AppDb, userId: number, start: Date): boolean {
  const updated = db
    .update(gmailConnections)
    .set({ syncStartAt: start })
    .where(and(eq(gmailConnections.userId, userId), isNull(gmailConnections.historyId)))
    .returning({ id: gmailConnections.id })
    .get();
  return updated !== undefined;
}

// For the default sync start date.
export function earliestAppliedAt(db: AppDb, userId: number): Date | null {
  const row = db
    .select({ earliest: min(applications.appliedAt) })
    .from(applications)
    .where(eq(applications.userId, userId))
    .get();
  return row?.earliest ?? null;
}
