// Pure string constants, no I/O or secrets, so this is safe to import from
// both the Next.js runtime (client.ts) and standalone CLI scripts (seed.ts,
// which runs via tsx and can't tolerate "server-only"'s unconditional throw).
export const DEMO_DB_PATH = "./data/demo.db";
