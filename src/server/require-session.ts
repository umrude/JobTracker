import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { getMode } from "@/server/mode";

// The DAL-style auth check recommended by Next.js: call this close to the
// data (in each page/Server Action), not only in a layout -- a layout's
// check doesn't re-run on client-side navigation between sibling routes.
// cache() dedupes repeated calls within one render pass.
//
// In demo mode, auth is skipped entirely (per CLAUDE.md): there's no
// Google sign-in, so this returns null instead of redirecting.
export const requireSession = cache(async () => {
  if (getMode() === "demo") return null;

  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  return session;
});
