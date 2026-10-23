import type { ReactNode } from "react";
import Link from "next/link";
import { cookies } from "next/headers";
import { BellIcon, FlaskConicalIcon, LogOutIcon } from "lucide-react";
import { getMode } from "@/server/mode";
import { auth, signOut } from "@/server/auth";
import { env } from "@/server/env";
import { Button, buttonVariants } from "@/components/ui/button";
import { gmailNeedsReconnect } from "@/server/db/gmail-connections";
import { countPendingSuggestions } from "@/server/db/email-events";
import { SearchBox } from "@/components/search-box";
import { ThemeToggle } from "@/components/theme";
import { Logo } from "@/components/logo";
import { toggleDemoModeAction } from "./mode-actions";
import { NavLinks } from "./nav-links";
import { Sidebar } from "./sidebar";
import { SIDEBAR_COOKIE } from "@/lib/sidebar";

// Text that the collapsed sidebar hides visually, keeping it for screen
// readers (see sidebar.tsx).
const COLLAPSED_SR_ONLY = "group-data-[collapsed=true]/sidebar:sr-only";

// The app's frame: a sidebar (wide screens) or a nav bar (small screens),
// and a header with search, the theme, the Inbox, and who's signed in.
// Content sits on the grey canvas (docs/design.md).
//
// Not an auth gate on its own: per Next.js's auth guidance, a layout's
// check doesn't re-run on client-side navigation between sibling routes.
// Each page under this group calls requireSession() itself (see
// board/page.tsx). This layout just reads the session, if any, to show
// who's signed in.
export default async function AppLayout({ children }: { children: ReactNode }) {
  const mode = await getMode();
  // A public demo deployment never has a session; a cookie-toggled local
  // demo preview still runs on a live deployment, so it does.
  const session = !env.DEMO_MODE ? await auth() : null;
  // On every page, since an expired connection quietly stops sync. Only
  // with a session: without one, the page itself redirects to sign-in.
  const reconnectGmail = session?.user ? await gmailNeedsReconnect() : false;
  // The public demo has no session but does have suggestions to show.
  const inboxCount = session?.user || env.DEMO_MODE ? await countPendingSuggestions() : 0;
  const email = session?.user?.email ?? null;
  const sidebarCollapsed = (await cookies()).get(SIDEBAR_COOKIE)?.value === "1";

  return (
    <div className="flex min-h-full flex-1">
      <Sidebar initialCollapsed={sidebarCollapsed}>
        <div className="px-5 pt-5 pb-6 group-data-[collapsed=true]/sidebar:px-3.5">
          <Logo nameClassName={COLLAPSED_SR_ONLY} />
        </div>
        <div className="flex-1 overflow-x-hidden overflow-y-auto px-3">
          <NavLinks inboxCount={inboxCount} variant="sidebar" />
        </div>
        <div className="border-t p-3 pb-0 group-data-[collapsed=true]/sidebar:px-2">
          {env.DEMO_MODE ? (
            <p
              title="Read-only demo with sample data."
              className="flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-xs text-accent-foreground group-data-[collapsed=true]/sidebar:justify-center group-data-[collapsed=true]/sidebar:px-0"
            >
              <FlaskConicalIcon className="size-4 shrink-0" />
              <span className={COLLAPSED_SR_ONLY}>Read-only demo with sample data.</span>
            </p>
          ) : (
            <DemoToggle
              inDemo={mode === "demo"}
              className="w-full justify-start group-data-[collapsed=true]/sidebar:justify-center"
              labelClassName={COLLAPSED_SR_ONLY}
            />
          )}
        </div>
      </Sidebar>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-card/85 px-4 backdrop-blur md:px-6">
          <Logo compact className="md:hidden" />
          <SearchBox />
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle className="hidden sm:flex" />
            <Link
              href="/inbox-review"
              aria-label={inboxCount > 0 ? `Inbox: ${inboxCount} to review` : "Inbox"}
              className={buttonVariants({ variant: "ghost", size: "icon", className: "relative" })}
            >
              <BellIcon />
              {inboxCount > 0 && <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-primary ring-2 ring-card" />}
            </Link>
            {email && (
              <form
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/login" });
                }}
                className="flex items-center gap-2"
              >
                <span
                  title={email}
                  className="flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-sm font-semibold text-white"
                >
                  {email[0]?.toUpperCase()}
                </span>
                <span className="hidden max-w-40 truncate text-sm font-medium lg:block">{email}</span>
                <Button type="submit" variant="ghost" size="icon" aria-label="Sign out" title="Sign out">
                  <LogOutIcon />
                </Button>
              </form>
            )}
          </div>
        </header>

        <div className="border-b bg-card md:hidden">
          <NavLinks inboxCount={inboxCount} variant="bar" />
          <div className="flex items-center justify-between gap-2 px-4 pb-2 sm:justify-end">
            <ThemeToggle className="sm:hidden" />
            {!env.DEMO_MODE && <DemoToggle inDemo={mode === "demo"} />}
          </div>
        </div>

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
    </div>
  );
}

// "Preview demo mode" / "Back to live data" (the local, writable preview;
// see mode.ts). Not shown on the public demo, which is always demo.
function DemoToggle({ inDemo, className, labelClassName }: { inDemo: boolean; className?: string; labelClassName?: string }) {
  const label = inDemo ? "Back to live data" : "Preview demo mode";
  return (
    <form action={toggleDemoModeAction}>
      <Button type="submit" variant="ghost" size="sm" title={label} className={`gap-2 text-muted-foreground ${className ?? ""}`}>
        <FlaskConicalIcon />
        <span className={labelClassName}>{label}</span>
      </Button>
    </form>
  );
}
