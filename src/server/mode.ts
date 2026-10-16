import "server-only";
import { env } from "@/server/env";

export type Mode = "live" | "demo";

// The only place that decides live vs. demo. Everything else asks this
// function instead of reading DEMO_MODE (or, later, the local cookie).
export function getMode(): Mode {
  return env.DEMO_MODE ? "demo" : "live";
}

// Every Server Action or route handler that writes must call this first.
// Read-only is enforced here, on the server, not just by disabling buttons.
export function assertWritable(): void {
  if (getMode() === "demo") {
    throw new Error("This action is disabled in demo mode.");
  }
}
