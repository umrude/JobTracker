// Runs once when a new Next.js server instance starts, before it accepts
// requests. Rebuilds the demo database from the seed every time:
// - the local "writable demo preview" (see mode.ts) always starts from a
//   fresh, known seed ("resets on restart" per CLAUDE.md);
// - the public demo (DEMO_MODE=true) has no disk to keep it on, and since
//   it's read-only there's no visitor state to lose. Reseeding also keeps
//   the seed's relative dates ("applied 3 weeks ago") relative to today,
//   however long the deployment runs.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { seedDemoDatabase } = await import("@/server/db/seed");
  const count = await seedDemoDatabase();
  console.log(`[instrumentation] Reseeded demo DB with ${count} jobs`);
}
