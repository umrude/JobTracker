import type { ReactNode } from "react";
import { getMode } from "@/server/mode";
import { auth, signOut } from "@/server/auth";
import { env } from "@/server/env";
import { Button } from "@/components/ui/button";
import { toggleDemoModeAction } from "./mode-actions";

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

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="flex items-center justify-between border-b px-6 py-3">
        <span className="font-semibold">Job Tracker</span>
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
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
