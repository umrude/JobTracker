"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/board", label: "Board" },
  { href: "/saved", label: "Saved jobs" },
  { href: "/compare", label: "Compare" },
  { href: "/resume", label: "Resume" },
  { href: "/profile", label: "Profile" },
  { href: "/inbox-review", label: "Inbox" },
] as const;

// A Client Component only because it highlights the current page, which
// needs usePathname(). The layout around it stays a Server Component.
// inboxCount: suggestions waiting for review, shown next to "Inbox".
export function NavLinks({ inboxCount }: { inboxCount: number }) {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-1">
      {LINKS.map(({ href, label }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground",
              active && "bg-muted font-medium text-foreground",
            )}
          >
            {label}
            {href === "/inbox-review" && inboxCount > 0 && (
              <span className="ml-1.5 rounded-full bg-primary px-1.5 text-xs font-medium text-primary-foreground">
                {inboxCount}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
