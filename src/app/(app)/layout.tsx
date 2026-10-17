import type { ReactNode } from "react";
import { getMode } from "@/server/mode";
import { auth, signOut } from "@/server/auth";
import { Button } from "@/components/ui/button";

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
  const mode = getMode();
  const session = mode === "live" ? await auth() : null;

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="flex items-center justify-between border-b px-6 py-3">
        <span className="font-semibold">Job Tracker</span>
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
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
