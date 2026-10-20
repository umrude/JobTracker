// Pure string constants, no I/O or secrets, so this is safe to import from
// both the Next.js runtime (client.ts) and standalone CLI scripts (seed.ts,
// which runs via tsx and can't tolerate "server-only"'s unconditional throw).
export const DEMO_DB_PATH = "./data/demo.db";

// The seeded demo database's only user. Demo mode always acts as this
// user, whether it's the public demo (no sign-in) or a local preview (a
// real session, but demo data). An .invalid domain can never be a real
// address.
export const DEMO_USER_EMAIL = "demo@jobtracker.invalid";
