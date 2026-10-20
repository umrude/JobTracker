// No "server-only" here, like profile-store.ts: tests and the seed use it
// with their own connection. Every function takes the database as an
// argument. The app reaches it only through current-user.ts.
import { eq, isNull } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@/server/db/schema";
import { users } from "@/server/db/schema";

export type AppDb = BetterSQLite3Database<typeof schema>;

export function findUserIdByEmail(db: AppDb, email: string): number | undefined {
  return db.select({ id: users.id }).from(users).where(eq(users.email, email)).get()?.id;
}

// The user for a signed-in email: an existing account, else the
// "unclaimed owner" (the account migration 0005 created to own data from
// before users existed), else a new account. One transaction, so two
// first requests at once can't both claim or both create.
//
// Claiming is safe because sign-in is still limited to ALLOWED_EMAIL: the
// only person who can ever claim existing data is its owner. If sign-in is
// opened to others, the unclaimed owner must be claimed (or removed)
// before that happens; see docs/multi-user.md.
export function findOrClaimUserId(db: AppDb, email: string): number {
  return db.transaction((tx) => {
    const existing = tx.select({ id: users.id }).from(users).where(eq(users.email, email)).get();
    if (existing) return existing.id;

    const unclaimed = tx.select({ id: users.id }).from(users).where(isNull(users.email)).get();
    if (unclaimed) {
      tx.update(users).set({ email }).where(eq(users.id, unclaimed.id)).run();
      return unclaimed.id;
    }

    return tx.insert(users).values({ email }).returning({ id: users.id }).get().id;
  });
}
