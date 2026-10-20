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
import { COVER_LENGTHS, COVER_TONES } from "@/lib/schemas/cover-letter";

// Accounts. The app is multi-user *ready*: every other table has a
// user_id and every query filters by it, but sign-in is still limited to
// ALLOWED_EMAIL. See docs/multi-user.md.
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  // Null only for the "unclaimed owner" the multi-user migration created
  // to own data that existed before users did; the first sign-in claims
  // it. SQLite allows any number of nulls in a unique column.
  email: text("email").unique(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

// Every table has an owner, including child tables (bullets, comparisons)
// that could inherit one through their parent. One rule ("every query
// filters by user_id") is harder to get wrong than "filter, or join to
// something that does". Deleting a user deletes everything they own.
const ownerColumn = () =>
  integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" });

// A job with no application row is a saved job: one you're considering
// but haven't applied to yet.
export const jobs = sqliteTable(
  "jobs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: ownerColumn(),
    company: text("company").notNull(),
    title: text("title").notNull(),
    url: text("url"),
    listingText: text("listing_text"),
    source: text("source"),
    notes: text("notes"),
    savedAt: integer("saved_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [index("jobs_user_id_idx").on(table.userId)],
);

export const applications = sqliteTable(
  "applications",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: ownerColumn(),
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
  },
  (table) => [index("applications_user_id_idx").on(table.userId)],
);

export const resumes = sqliteTable(
  "resumes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: ownerColumn(),
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
    // Versions are numbered per user: everyone's first resume is v1.
    uniqueIndex("resumes_user_version_unique").on(table.userId, table.version),
    // A partial unique index: uniqueness only applies to rows matching the
    // WHERE, so any number of rows can be inactive but each user can have
    // at most one active. The database enforces "one active resume" itself,
    // so a bug in app code can't leave two active.
    uniqueIndex("resumes_user_one_active")
      .on(table.userId)
      .where(sql`${table.isActive} = 1`),
  ],
);

export const comparisons = sqliteTable(
  "comparisons",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: ownerColumn(),
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
  (table) => [
    index("comparisons_job_id_idx").on(table.jobId),
    index("comparisons_user_id_idx").on(table.userId),
  ],
);

// Each comparison's matched and missing skills, one row per skill, with
// the skill's canonical key (see lib/skills/resolver.ts). The comparison's
// result JSON has the same skills as the model wrote them; these rows make
// them countable across listings ("missing in 9 of your last 20"), which
// is the data for the Phase 5 skill-gap recap.
export const COMPARISON_SKILL_STATUSES = ["matched", "missing"] as const;

export const comparisonSkills = sqliteTable(
  "comparison_skills",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: ownerColumn(),
    comparisonId: integer("comparison_id")
      .notNull()
      .references(() => comparisons.id, { onDelete: "cascade" }),
    // Canonical key, e.g. "postgresql", for counting.
    skillKey: text("skill_key").notNull(),
    // Canonical display name at the time, e.g. "PostgreSQL".
    name: text("name").notNull(),
    status: text("status", { enum: COMPARISON_SKILL_STATUSES }).notNull(),
  },
  (table) => [
    index("comparison_skills_comparison_id_idx").on(table.comparisonId),
    index("comparison_skills_user_skill_idx").on(table.userId, table.skillKey),
  ],
);

// A tailored resume for one job: what the model proposed (after the
// honesty checker), and later what you approved. Each generation is a new
// version per job. See docs/tailored-resumes.md, Step 5.
export const TAILORING_STATUSES = ["draft", "approved"] as const;

export const tailoredResumes = sqliteTable(
  "tailored_resumes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: ownerColumn(),
    jobId: integer("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    // The resume version (and its .tex) this was tailored from.
    resumeId: integer("resume_id")
      .notNull()
      .references(() => resumes.id, { onDelete: "cascade" }),
    // 1, 2, 3... per job.
    version: integer("version").notNull(),
    status: text("status", { enum: TAILORING_STATUSES }).notNull().default("draft"),
    // The checked proposal and the checker's issues. Typed unknown on
    // purpose, like comparisons.result: re-validated with Zod on every read.
    proposal: text("proposal_json", { mode: "json" }).$type<unknown>().notNull(),
    issues: text("issues_json", { mode: "json" }).$type<unknown>().notNull(),
    // Set on approval (Step 5c): the changes you accepted, and a snapshot
    // of the profile text they used, so later profile edits never change
    // what was approved.
    approved: text("approved_json", { mode: "json" }).$type<unknown>(),
    snapshot: text("snapshot_json", { mode: "json" }).$type<unknown>(),
    // Page count of the compiled PDF, once compiled.
    pages: integer("pages"),
    // The model that proposed it ("demo" for canned fixtures).
    model: text("model").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    approvedAt: integer("approved_at", { mode: "timestamp" }),
  },
  (table) => [
    uniqueIndex("tailored_resumes_user_job_version_unique").on(table.userId, table.jobId, table.version),
  ],
);

// A cover letter for one job. Each generation is a new version per job.
// `generatedText` is the model's letter as written; `text` is the current
// letter, which you can edit. See docs/cover-letters.md.
export const coverLetters = sqliteTable(
  "cover_letters",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: ownerColumn(),
    jobId: integer("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    // The approved tailored resume it was written from, if there was one
    // (otherwise it was written from the active resume).
    tailoringId: integer("tailoring_id").references(() => tailoredResumes.id, { onDelete: "set null" }),
    resumeId: integer("resume_id")
      .notNull()
      .references(() => resumes.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    tone: text("tone", { enum: COVER_TONES }).notNull(),
    length: text("length", { enum: COVER_LENGTHS }).notNull(),
    generatedText: text("generated_text").notNull(),
    text: text("text").notNull(),
    // The checker's warnings, re-validated with Zod on read.
    warnings: text("warnings_json", { mode: "json" }).$type<unknown>().notNull(),
    model: text("model").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [
    uniqueIndex("cover_letters_user_job_version_unique").on(table.userId, table.jobId, table.version),
  ],
);

// The profile: everything you've done, a superset of any one resume.
// Tailoring draws only from it. See docs/tailored-resumes.md, "The profile".
// One profile per user.

export const profileSkills = sqliteTable(
  "profile_skills",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: ownerColumn(),
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
  // Unique per user: your skills can't collide with someone else's.
  (table) => [uniqueIndex("profile_skills_user_name_key_unique").on(table.userId, table.nameKey)],
);

// An experience, project, education, or other entry. The four heading
// fields follow \resumeSubheading's four arguments, whose meaning depends
// on the section: for a job, title / dates / organization / location; for
// a project, name / dates / description / tech.
export const profileEntries = sqliteTable(
  "profile_entries",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: ownerColumn(),
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
  (table) => [uniqueIndex("profile_entries_user_latex_key_unique").on(table.userId, table.latexKey)],
);

export const profileBullets = sqliteTable(
  "profile_bullets",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: ownerColumn(),
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
  (table) => [
    index("profile_bullets_entry_id_idx").on(table.entryId),
    index("profile_bullets_user_id_idx").on(table.userId),
  ],
);

// Short facts the tailored summary and cover letter may draw on.
export const profileHighlights = sqliteTable(
  "profile_highlights",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: ownerColumn(),
    text: text("text").notNull(),
    source: text("source", { enum: PROFILE_SOURCES }).notNull(),
    sourceJobId: integer("source_job_id").references(() => jobs.id, { onDelete: "set null" }),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [index("profile_highlights_user_id_idx").on(table.userId)],
);

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
