import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { describe, it, expect } from "vitest";
import * as schema from "@/server/db/schema";
import { findOrClaimUserId, findUserIdByEmail } from "@/server/db/user-store";

function freshDb() {
  const db = drizzle(new Database(":memory:"), { schema });
  migrate(db, { migrationsFolder: path.join(process.cwd(), "src/server/db/migrations") });
  return db;
}

describe("findOrClaimUserId", () => {
  it("returns the existing account for a known email", () => {
    const db = freshDb();
    db.insert(schema.users).values({ id: 7, email: "me@example.com" }).run();
    expect(findOrClaimUserId(db, "me@example.com")).toBe(7);
  });

  it("claims the unclaimed owner (pre-users data) on first sign-in", () => {
    const db = freshDb();
    db.insert(schema.users).values({ id: 1, email: null }).run();
    expect(findOrClaimUserId(db, "me@example.com")).toBe(1);
    expect(findUserIdByEmail(db, "me@example.com")).toBe(1);
    // Signing in again finds the now-claimed account.
    expect(findOrClaimUserId(db, "me@example.com")).toBe(1);
  });

  it("creates an account when there's nothing to claim", () => {
    const db = freshDb();
    db.insert(schema.users).values({ id: 1, email: "owner@example.com" }).run();
    const id = findOrClaimUserId(db, "new@example.com");
    expect(id).not.toBe(1);
    expect(findUserIdByEmail(db, "new@example.com")).toBe(id);
  });
});
