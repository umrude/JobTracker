import "server-only";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { env } from "@/server/env";
import type { Mode } from "@/server/mode";
import * as schema from "@/server/db/schema";
import { DEMO_DB_PATH } from "@/server/db/paths";

type DbInstance = BetterSQLite3Database<typeof schema>;

const instances = new Map<Mode, DbInstance>();

function resolvePath(mode: Mode): string {
  return mode === "demo" ? DEMO_DB_PATH : env.DATABASE_PATH;
}

function openDb(dbPath: string): DbInstance {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  return drizzle(sqlite, { schema });
}

// The single place other code asks for a database connection. It returns
// the live SQLite file in live mode and the seeded demo file in demo mode,
// caching one connection per mode so repeated calls (e.g. across Server
// Components in the same request) reuse it instead of reopening the file.
// Takes mode explicitly (instead of defaulting to getMode()) since getMode()
// is async -- a default parameter can't await it.
export function getDb(mode: Mode): DbInstance {
  const cached = instances.get(mode);
  if (cached) return cached;

  const db = openDb(resolvePath(mode));
  instances.set(mode, db);
  return db;
}
