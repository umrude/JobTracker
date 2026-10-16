import { defineConfig } from "drizzle-kit";

// Deliberately reads process.env directly instead of the app's Zod env.ts:
// drizzle-kit is a standalone CLI, not part of the Next.js runtime, and
// shouldn't have to satisfy the full app env schema (ALLOWED_EMAIL,
// AUTH_SECRET, etc.) just to generate or run migrations.
export default defineConfig({
  schema: "./src/server/db/schema.ts",
  out: "./src/server/db/migrations",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.DATABASE_PATH ?? "./data/app.db",
  },
});
