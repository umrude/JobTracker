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
import {
  EXPERIENCE_KINDS,
  PROFICIENCY_LEVELS,
  PROFILE_SOURCES,
} from "@/lib/schemas/profile";

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
    // Optional LaTeX source for this version, stored as text like `text`
    // (the uploaded file itself is never kept). Tailored resumes are built
    // from it; without it, tailoring is unavailable for this version.
    latexSource: text("latex_source"),
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

// The profile: everything you've done, a superset of any one resume.
// Tailoring draws only from it. See docs/tailored-resumes.md, "The profile".
// There's one profile (single user), so these tables have no owner column.

export const profileSkills = sqliteTable(
  "profile_skills",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    // skillKey(name): trimmed, lowercased, whitespace collapsed. Unique, so
    // the same skill can't be added twice under different spacing/case.
    nameKey: text("name_key").notNull(),
    category: text("category"),
    // Other names for this skill ("Postgres" for PostgreSQL), added when
    // you confirm a comparison gap is the same skill.
    aliases: text("aliases", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
    proficiency: text("proficiency", { enum: PROFICIENCY_LEVELS }),
    experience: text("experience", { enum: EXPERIENCE_KINDS }),
    // Where you used it, in your words. A skill with no note and no bullet
    // mentioning it can be listed, but not claimed in a summary or bullet.
    note: text("note"),
    source: text("source", { enum: PROFILE_SOURCES }).notNull(),
    // The job whose comparison prompted it, for source = "gap".
    sourceJobId: integer("source_job_id").references(() => jobs.id, { onDelete: "set null" }),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [uniqueIndex("profile_skills_name_key_unique").on(table.nameKey)],
);

// An experience, project, education, or other entry. The four heading
// fields follow \resumeSubheading's four arguments, whose meaning depends
// on the section: for a job, title / dates / organization / location; for
// a project, name / dates / description / tech.
export const profileEntries = sqliteTable(
  "profile_entries",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    // The resume section it belongs in, e.g. "Experience".
    section: text("section").notNull(),
    title: text("title").notNull(),
    // Free text, exactly as the template prints it.
    dates: text("dates").notNull().default(""),
    subtitle: text("subtitle").notNull().default(""),
    detail: text("detail").notNull().default(""),
    // Links the entry to its \resumeSubheading in the .tex (see
    // entryLatexKey). Set at import and kept on rename, so the link holds.
    // Null for entries you added that aren't in the .tex.
    latexKey: text("latex_key"),
    source: text("source", { enum: PROFILE_SOURCES }).notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [uniqueIndex("profile_entries_latex_key_unique").on(table.latexKey)],
);

export const profileBullets = sqliteTable(
  "profile_bullets",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    entryId: integer("entry_id")
      .notNull()
      .references(() => profileEntries.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    source: text("source", { enum: PROFILE_SOURCES }).notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [index("profile_bullets_entry_id_idx").on(table.entryId)],
);

// Short facts the tailored summary and cover letter may draw on.
export const profileHighlights = sqliteTable("profile_highlights", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  text: text("text").notNull(),
  source: text("source", { enum: PROFILE_SOURCES }).notNull(),
  sourceJobId: integer("source_job_id").references(() => jobs.id, { onDelete: "set null" }),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const profileEntriesRelations = relations(profileEntries, ({ many }) => ({
  bullets: many(profileBullets),
}));

export const profileBulletsRelations = relations(profileBullets, ({ one }) => ({
  entry: one(profileEntries, {
    fields: [profileBullets.entryId],
    references: [profileEntries.id],
  }),
}));

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
