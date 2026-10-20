import type { ReactNode } from "react";
import { getMode } from "@/server/mode";
import { auth, signOut } from "@/server/auth";
import { env } from "@/server/env";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { gmailNeedsReconnect } from "@/server/db/gmail-connections";
import { toggleDemoModeAction } from "./mode-actions";
import { NavLinks } from "./nav-links";

// Not an auth gate on its own: per Next.js's auth guidance, a layout's
// check doesn't re-run on client-side navigation between sibling routes.
// Each page under this group calls requireSession() itself (see
// board/page.tsx). This layout just reads the session, if any, to show
// who's signed in.
export default async function AppLayout({
  children,
}: {
  children: ReactNode;
}) {
  const mode = await getMode();
  // A public demo deployment never has a session; a cookie-toggled local
  // demo preview still runs on a live deployment, so it does.
  const session = !env.DEMO_MODE ? await auth() : null;
  // On every page, since an expired connection quietly stops sync. Only
  // with a session: without one, the page itself redirects to sign-in.
  const reconnectGmail = session?.user ? await gmailNeedsReconnect() : false;

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="flex items-center justify-between border-b px-6 py-3">
        <div className="flex items-center gap-6">
          <span className="font-semibold">Job Tracker</span>
          <NavLinks />
        </div>
        <div className="flex items-center gap-4">
          {!env.DEMO_MODE && (
            <form action={toggleDemoModeAction}>
              <Button type="submit" variant="outline" size="sm">
                {mode === "demo" ? "Back to live data" : "Preview demo mode"}
              </Button>
            </form>
          )}
          {session?.user?.email && (
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/login" });
              }}
              className="flex items-center gap-3"
            >
              <span className="text-sm text-muted-foreground">
                {session.user.email}
              </span>
              <Button type="submit" variant="outline" size="sm">
                Sign out
              </Button>
            </form>
          )}
        </div>
      </header>
      {reconnectGmail && (
        <div role="alert" className="flex items-center justify-between gap-3 border-b border-destructive/40 bg-destructive/5 px-6 py-2 text-sm">
          <span className="text-destructive">Gmail sync is paused: Google ended the connection.</span>
          <Link href="/inbox-review" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Reconnect Gmail
          </Link>
        </div>
      )}
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
