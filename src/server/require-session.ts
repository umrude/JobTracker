import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { isPublicDemo } from "@/server/mode";

// The DAL-style auth check recommended by Next.js: call this close to the
// data (in each page/Server Action), not only in a layout -- a layout's
// check doesn't re-run on client-side navigation between sibling routes.
// cache() dedupes repeated calls within one render pass.
//
// Keyed off the deployment env var, not getMode(): a cookie-toggled local
// demo preview still runs on a live deployment and must still require a
// real session -- the cookie is just a UI preference, not a trust boundary.
export const requireSession = cache(async () => {
  if (isPublicDemo()) return null;

  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  return session;
});
