import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, describe, it, expect } from "vitest";

// Migration 0005 rebuilds every table to add user_id. Rebuilding a parent
// table can cascade-delete its children's rows if done in the wrong order
// (see the comments in 0005_multi_user_ready.sql), so this test runs it on
// a database full of linked rows and checks nothing was lost.

const MIGRATIONS = path.join(process.cwd(), "src/server/db/migrations");
const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

// A copy of the migrations folder with the journal cut off after `count`
// entries, so a database can be migrated to an earlier point.
function migrationsUpTo(count: number): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jobtracker-migrations-"));
  tempDirs.push(dir);
  fs.cpSync(MIGRATIONS, dir, { recursive: true });
  const journalPath = path.join(dir, "meta/_journal.json");
  const journal = JSON.parse(fs.readFileSync(journalPath, "utf8")) as { entries: unknown[] };
  journal.entries = journal.entries.slice(0, count);
  fs.writeFileSync(journalPath, JSON.stringify(journal));
  return dir;
}

function count(sqlite: Database.Database, table: string): number {
  const row = sqlite.prepare(`select count(*) as n from "${table}"`).get() as { n: number };
  return row.n;
}

const TABLES = [
  "jobs",
  "applications",
  "resumes",
  "comparisons",
  "profile_skills",
  "profile_entries",
  "profile_bullets",
  "profile_highlights",
];

describe("migration 0005 (multi-user ready)", () => {
  it("keeps every row, including children of rebuilt parents, and gives them to the unclaimed owner", () => {
    const sqlite = new Database(":memory:");
    const db = drizzle(sqlite);
    migrate(db, { migrationsFolder: migrationsUpTo(5) }); // 0000 to 0004

    // Linked rows at the pre-users schema. Children reference parents, so
    // a cascade during the rebuild would show up as missing rows.
    sqlite.exec(`
      insert into jobs (id, company, title) values (1, 'Acme', 'Engineer'), (2, 'Globex', 'Developer');
      insert into applications (job_id, status) values (1, 'applied');
      insert into resumes (id, text, version, is_active) values (1, 'v1', 1, 0), (2, 'v2', 2, 1);
      insert into comparisons (job_id, resume_id, result_json, model) values (2, 2, '{}', 'demo');
      insert into profile_skills (name, name_key, source, source_job_id) values ('React', 'react', 'gap', 2);
      insert into profile_entries (id, section, title, source) values (1, 'Experience', 'Engineer', 'resume');
      insert into profile_bullets (entry_id, text, source) values (1, 'Shipped things', 'resume');
      insert into profile_highlights (text, source) values ('5+ years', 'resume');
    `);
    const before = Object.fromEntries(TABLES.map((table) => [table, count(sqlite, table)]));

    migrate(db, { migrationsFolder: MIGRATIONS });

    for (const table of TABLES) {
      expect(count(sqlite, table), table).toBe(before[table]);
      const unowned = sqlite.prepare(`select count(*) as n from "${table}" where user_id is not 1`).get() as { n: number };
      expect(unowned.n, `${table} rows not owned by the unclaimed owner`).toBe(0);
    }
    expect(sqlite.prepare("select id, email from users").all()).toEqual([{ id: 1, email: null }]);

    // References still resolve, and point at the final table names.
    expect(sqlite.prepare("pragma foreign_key_check").all()).toEqual([]);
    const leftovers = sqlite.prepare("select count(*) as n from sqlite_master where sql like '%__new_%'").get() as { n: number };
    expect(leftovers.n).toBe(0);

    // A gap skill's link to its job survived the rebuild.
    expect(sqlite.prepare("select source_job_id from profile_skills").get()).toEqual({ source_job_id: 2 });
  });

  it("creates no users on a fresh, empty database", () => {
    const sqlite = new Database(":memory:");
    migrate(drizzle(sqlite), { migrationsFolder: MIGRATIONS });
    expect(count(sqlite, "users")).toBe(0);
  });

  it("migration 0009 adds comparisons.tailoring_id with ON DELETE cascade", () => {
    const sqlite = new Database(":memory:");
    migrate(drizzle(sqlite), { migrationsFolder: MIGRATIONS });
    const foreignKeys = sqlite.prepare("pragma foreign_key_list(comparisons)").all() as { from: string; on_delete: string }[];
    expect(foreignKeys.find((fk) => fk.from === "tailoring_id")?.on_delete).toBe("CASCADE");
  });

  it("enforces one active resume per user, not one overall", () => {
    const sqlite = new Database(":memory:");
    migrate(drizzle(sqlite), { migrationsFolder: MIGRATIONS });
    sqlite.exec(`
      insert into users (id, email) values (1, 'a@example.com'), (2, 'b@example.com');
      insert into resumes (user_id, text, version, is_active) values (1, 'a', 1, 1), (2, 'b', 1, 1);
    `);
    expect(() =>
      sqlite.exec("insert into resumes (user_id, text, version, is_active) values (1, 'a2', 2, 1)"),
    ).toThrow(/UNIQUE/);
  });
});

describe("migrations 0012 and 0013", () => {
  it("0012 adds email_events.job_id with ON DELETE cascade", () => {
    const sqlite = new Database(":memory:");
    migrate(drizzle(sqlite), { migrationsFolder: MIGRATIONS });
    const foreignKeys = sqlite.prepare("pragma foreign_key_list(email_events)").all() as { from: string; on_delete: string }[];
    expect(foreignKeys.find((fk) => fk.from === "job_id")?.on_delete).toBe("CASCADE");
  });

  it("0013 marks existing interviews and offers as past screening, and leaves the rest unknown", () => {
    const sqlite = new Database(":memory:");
    const db = drizzle(sqlite);
    migrate(db, { migrationsFolder: migrationsUpTo(13) }); // 0000 to 0012
    sqlite.exec(`
      insert into users (id, email) values (1, 'a@example.com');
      insert into jobs (id, user_id, company, title) values (1, 1, 'Acme', 'Engineer');
      insert into applications (user_id, job_id, status, updated_at) values
        (1, 1, 'interviewing', 1000), (1, 1, 'offer', 2000), (1, 1, 'rejected', 3000), (1, 1, 'applied', 4000);
    `);
    migrate(db, { migrationsFolder: MIGRATIONS });
    const rows = sqlite.prepare("select status, passed_screening_at as passed from applications order by id").all();
    expect(rows).toEqual([
      { status: "interviewing", passed: 1000 },
      { status: "offer", passed: 2000 },
      { status: "rejected", passed: null },
      { status: "applied", passed: null },
    ]);
  });
});
