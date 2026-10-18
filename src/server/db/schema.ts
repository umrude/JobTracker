// No "server-only" here: drizzle-kit's CLI imports this file directly,
// outside Next's bundler aliasing, and the real "server-only" package
// throws unconditionally when loaded that way. This file is pure table
// metadata with no I/O or secrets, so the risk that rule guards against
// doesn't apply.
import { relations, sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { STATUSES } from "@/lib/schemas/status";

// A job with no application row is a saved job: one you're considering
// but haven't applied to yet.
export const jobs = sqliteTable("jobs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  company: text("company").notNull(),
  title: text("title").notNull(),
  url: text("url"),
  listingText: text("listing_text"),
  source: text("source"),
  notes: text("notes"),
  savedAt: integer("saved_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const applications = sqliteTable("applications", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobId: integer("job_id")
    .notNull()
    .references(() => jobs.id, { onDelete: "cascade" }),
  status: text("status", { enum: STATUSES }).notNull().default("applied"),
  appliedAt: integer("applied_at", { mode: "timestamp" }),
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const resumes = sqliteTable(
  "resumes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    text: text("text").notNull(),
    version: integer("version").notNull(),
    isActive: integer("is_active", { mode: "boolean" })
      .notNull()
      .default(false),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [
    uniqueIndex("resumes_version_unique").on(table.version),
    // A partial unique index: uniqueness only applies to rows matching the
    // WHERE, so any number of rows can be inactive but at most one can be
    // active. The database enforces "one active resume" itself, so a bug
    // in app code can't leave two active.
    uniqueIndex("resumes_one_active")
      .on(table.isActive)
      .where(sql`${table.isActive} = 1`),
  ],
);

export const comparisons = sqliteTable(
  "comparisons",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    jobId: integer("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    resumeId: integer("resume_id")
      .notNull()
      .references(() => resumes.id, { onDelete: "cascade" }),
    // Typed as unknown on purpose: stored results are re-validated with the
    // comparison Zod schema on every read (safeParse), so an old row written
    // under an earlier schema version shows as "needs re-run" instead of
    // crashing the page or being trusted blindly.
    result: text("result_json", { mode: "json" }).$type<unknown>().notNull(),
    // Which model produced this result ("demo" for canned fixtures), so old
    // results stay traceable after a model change.
    model: text("model").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [index("comparisons_job_id_idx").on(table.jobId)],
);

export const jobsRelations = relations(jobs, ({ many }) => ({
  applications: many(applications),
  comparisons: many(comparisons),
}));

export const applicationsRelations = relations(applications, ({ one }) => ({
  job: one(jobs, { fields: [applications.jobId], references: [jobs.id] }),
}));

export const resumesRelations = relations(resumes, ({ many }) => ({
  comparisons: many(comparisons),
}));

export const comparisonsRelations = relations(comparisons, ({ one }) => ({
  job: one(jobs, { fields: [comparisons.jobId], references: [jobs.id] }),
  resume: one(resumes, {
    fields: [comparisons.resumeId],
    references: [resumes.id],
  }),
}));
