// Fills in status history for applications that existed before it was kept
// (docs/status-history.md). Run once on the live database, after
// `pnpm db:migrate`:
//
//   pnpm db:backfill-history
//
// Safe to run again: applications that already have history are skipped.
// It changes nothing else. DATABASE_PATH (from .env) picks the database.
import fs from "node:fs";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "@/server/db/schema";
import { backfillStatusHistory } from "@/server/db/status-history-store";

const dbPath = process.env.DATABASE_PATH ?? "./data/app.db";

function main() {
  if (!fs.existsSync(dbPath)) {
    console.error(`No database at ${dbPath}.`);
    process.exitCode = 1;
    return;
  }
  const sqlite = new Database(dbPath);
  try {
    const hasTable = sqlite.prepare("select 1 from sqlite_master where type = 'table' and name = 'status_events'").get();
    if (!hasTable) {
      console.error("This database has no status_events table yet. Run `pnpm db:migrate` first.");
      process.exitCode = 1;
      return;
    }
    const db = drizzle(sqlite, { schema });
    let filled = 0;
    for (const user of db.select({ id: schema.users.id }).from(schema.users).all()) {
      filled += backfillStatusHistory(db, user.id);
    }
    console.log(
      filled === 0
        ? `Nothing to do: every application in ${dbPath} already has history.`
        : `Filled in status history for ${filled} application(s) in ${dbPath}.`,
    );
  } finally {
    sqlite.close();
  }
}

main();
