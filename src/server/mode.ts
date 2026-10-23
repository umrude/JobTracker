import "server-only";
import { cookies } from "next/headers";
import { env } from "@/server/env";

export type Mode = "live" | "demo";

export const DEMO_MODE_COOKIE = "demo-mode";

// Pure decision logic, kept separate from reading the cookie so it can be
// unit tested without a request context (cookies() only works inside an
// actual Next.js request). A public demo deployment (DEMO_MODE=true)
// always wins; the cookie only matters on a live deployment, where it lets
// a local developer preview the demo dataset.
export function resolveMode(
  envDemoMode: boolean,
  cookieValue: string | undefined,
): Mode {
  if (envDemoMode) return "demo";
  return cookieValue === "true" ? "demo" : "live";
}

// The only place that decides live vs. demo. Everything else asks this
// function instead of reading DEMO_MODE or the cookie directly.
export async function getMode(): Promise<Mode> {
  const cookieStore = await cookies();
  return resolveMode(isPublicDemo(), cookieStore.get(DEMO_MODE_COOKIE)?.value);
}

// Whether this deployment is the public demo (DEMO_MODE=true): read-only,
// no sign-in, no secrets. Unlike getMode(), the cookie never changes it,
// so it's the check for trust decisions (sessions, writes, auth routes).
// Every such check goes through here rather than reading env.DEMO_MODE.
export function isPublicDemo(): boolean {
  return env.DEMO_MODE;
}

// Whether writes are allowed at all. Deliberately keyed off the deployment
// env var, not getMode(): a public demo deployment is read-only, but a
// locally cookie-toggled demo preview is just a disposable DB swap and
// stays writable, so CRUD features can be developed/tested against
// realistic seed data.
export function isWritable(): boolean {
  return !isPublicDemo();
}

// Every Server Action or route handler that writes must call this first.
// Read-only is enforced here, on the server, not just by disabling buttons.
export function assertWritable(): void {
  if (!isWritable()) {
    throw new Error("This action is disabled in demo mode.");
  }
}
