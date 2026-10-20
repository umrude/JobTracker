import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { getDb } from "@/server/db/client";
import { DEMO_USER_EMAIL } from "@/server/db/paths";
import { findOrClaimUserId, findUserIdByEmail } from "@/server/db/user-store";
import { getMode } from "@/server/mode";
import { requireSession } from "@/server/require-session";

// The id of the user every query is scoped to. The data layer calls this
// itself (it's never passed in by a caller), and it only ever comes from
// the session or demo mode, never from a URL or form. cache() makes it
// one lookup per request however many queries run.
//
// - Demo mode (the public demo, or a local preview toggled by cookie):
//   always the seeded demo user, from the demo database. A local preview
//   has your real session, but must show the demo user's data.
// - Live mode: the account for the signed-in email, claiming the data
//   from before users existed on first sign-in (see findOrClaimUserId).
export const requireUserId = cache(async (): Promise<number> => {
  const mode = await getMode();
  const db = getDb(mode);

  if (mode === "demo") {
    const demoUserId = findUserIdByEmail(db, DEMO_USER_EMAIL);
    if (demoUserId === undefined) {
      throw new Error("The demo database has no demo user. Run `pnpm db:seed`.");
    }
    return demoUserId;
  }

  const session = await requireSession();
  const email = session?.user?.email;
  if (!email) redirect("/login");
  return findOrClaimUserId(db, email);
});
