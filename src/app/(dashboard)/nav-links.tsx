"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookmarkIcon,
  CalendarCheckIcon,
  ChartColumnIcon,
  FileTextIcon,
  GitCompareArrowsIcon,
  InboxIcon,
  KanbanSquareIcon,
  UserRoundIcon,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type NavLink = { href: string; label: string; Icon: LucideIcon };

// Grouped like the work: the search itself, then you.
const GROUPS: { label: string; links: NavLink[] }[] = [
  {
    label: "Job search",
    links: [
      { href: "/today", label: "Today", Icon: CalendarCheckIcon },
      { href: "/board", label: "Board", Icon: KanbanSquareIcon },
      { href: "/saved", label: "Saved jobs", Icon: BookmarkIcon },
      { href: "/compare", label: "Compare", Icon: GitCompareArrowsIcon },
      { href: "/inbox-review", label: "Inbox", Icon: InboxIcon },
      { href: "/insights", label: "Insights", Icon: ChartColumnIcon },
    ],
  },
  {
    label: "You",
    links: [
      { href: "/resume", label: "Resume", Icon: FileTextIcon },
      { href: "/profile", label: "Profile", Icon: UserRoundIcon },
    ],
  },
];

// A Client Component only because it highlights the current page, which
// needs usePathname(). The layout around it stays a Server Component.
// "sidebar": grouped and vertical (wide screens); "bar": one scrollable
// row under the header (small screens).
export function NavLinks({
  inboxCount,
  todayCount,
  variant,
}: {
  inboxCount: number;
  // Follow-ups due and interviews within a day (server/db/today.ts).
  todayCount: number;
  variant: "sidebar" | "bar";
}) {
  const countFor = (href: string) => (href === "/inbox-review" ? inboxCount : href === "/today" ? todayCount : 0);
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  const link = ({ href, label, Icon }: NavLink) => {
    const active = isActive(href);
    return (
      <Link
        key={href}
        href={href}
        title={label}
        aria-current={active ? "page" : undefined}
        className={cn(
          "relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
          // In the collapsed sidebar (sidebar.tsx): the icon alone, centered.
          "group-data-[collapsed=true]/sidebar:justify-center group-data-[collapsed=true]/sidebar:px-0",
          active && "bg-accent text-accent-foreground hover:bg-accent hover:text-accent-foreground",
        )}
      >
        <Icon className="size-[18px] shrink-0" />
        <span className="group-data-[collapsed=true]/sidebar:sr-only">{label}</span>
        {countFor(href) > 0 && (
          <span className="ml-auto rounded-full bg-primary px-1.5 py-px text-[11px] leading-4 font-semibold text-primary-foreground tabular-nums group-data-[collapsed=true]/sidebar:absolute group-data-[collapsed=true]/sidebar:-top-0.5 group-data-[collapsed=true]/sidebar:right-0 group-data-[collapsed=true]/sidebar:px-1 group-data-[collapsed=true]/sidebar:text-[10px] group-data-[collapsed=true]/sidebar:leading-3.5">
            {countFor(href)}
          </span>
        )}
      </Link>
    );
  };

  if (variant === "bar") {
    return <nav aria-label="Main" className="flex gap-1 overflow-x-auto px-3 py-2">{GROUPS.flatMap((group) => group.links).map(link)}</nav>;
  }

  return (
    <nav aria-label="Main" className="flex flex-col gap-6">
      {GROUPS.map((group) => (
        <div key={group.label} className="flex flex-col gap-1">
          <p className="px-3 pb-1 text-[11px] font-semibold tracking-[0.18em] whitespace-nowrap text-muted-foreground uppercase group-data-[collapsed=true]/sidebar:sr-only">
            {group.label}
          </p>
          {group.links.map(link)}
        </div>
      ))}
    </nav>
  );
}
