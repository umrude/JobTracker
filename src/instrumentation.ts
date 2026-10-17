// Runs once when a new Next.js server instance starts, before it accepts
// requests. Used here to keep the local "writable demo preview" cookie
// toggle (see mode.ts) always starting from a fresh, known seed -- "resets
// on restart" per CLAUDE.md.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // A public demo deployment seeds its DB at deploy time (pnpm db:seed),
  // not on every server restart -- reseeding a running public demo on
  // every cold start would be surprising, and it's read-only anyway.
  if (process.env.DEMO_MODE === "true") return;

  const { seedDemoDatabase } = await import("@/server/db/seed");
  const count = seedDemoDatabase();
  console.log(`[instrumentation] Reseeded demo DB with ${count} applications`);
}
