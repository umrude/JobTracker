// No "server-only" here: drizzle-kit's CLI imports this file directly,
// outside Next's bundler aliasing, and the real "server-only" package
// throws unconditionally when loaded that way. This file is pure table
// metadata with no I/O or secrets, so the risk that rule guards against
// doesn't apply.
import { relations, sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { STATUSES } from "@/lib/schemas/status";

export const jobs = sqliteTable("jobs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  company: text("company").notNull(),
  title: text("title").notNull(),
  url: text("url"),
  listingText: text("listing_text"),
  source: text("source"),
  savedAt: integer("saved_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const applications = sqliteTable("applications", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobId: integer("job_id")
    .notNull()
    .references(() => jobs.id, { onDelete: "cascade" }),
  status: text("status", { enum: STATUSES }).notNull().default("saved"),
  appliedAt: integer("applied_at", { mode: "timestamp" }),
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const jobsRelations = relations(jobs, ({ many }) => ({
  applications: many(applications),
}));

export const applicationsRelations = relations(applications, ({ one }) => ({
  job: one(jobs, { fields: [applications.jobId], references: [jobs.id] }),
}));
