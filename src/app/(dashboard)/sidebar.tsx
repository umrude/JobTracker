"use client";

import { useState, type ReactNode } from "react";
import { PanelLeftCloseIcon, PanelLeftOpenIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { SIDEBAR_COOKIE } from "@/lib/sidebar";

const ONE_YEAR = 60 * 60 * 24 * 365;

// The wide-screen sidebar, full or collapsed to icons. A Client Component
// only for the toggle; everything inside it (the logo, nav, demo controls)
// is rendered by the layout and passed in as children, so it stays server
// code. They adapt with CSS: this sets data-collapsed, and they use the
// group-data-[collapsed=true]/sidebar: variant (docs/design.md).
//
// The layout reads the cookie for the first render, so there's no flash;
// after that, this state is the source of truth and the cookie just
// remembers it for next time. No Server Action: it's a display preference,
// not data, so it works in the read-only demo too.
export function Sidebar({ initialCollapsed, children }: { initialCollapsed: boolean; children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `${SIDEBAR_COOKIE}=${next ? "1" : "0"}; path=/; max-age=${ONE_YEAR}; samesite=lax`;
  }

  const label = collapsed ? "Expand sidebar" : "Collapse sidebar";
  return (
    <aside
      data-collapsed={collapsed}
      className={cn(
        "group/sidebar sticky top-0 hidden h-screen shrink-0 flex-col overflow-hidden border-r bg-sidebar transition-[width] duration-200 md:flex",
        collapsed ? "w-16" : "w-64",
      )}
    >
      {children}
      <div className="p-3 pt-1 group-data-[collapsed=true]/sidebar:px-2">
        <button
          type="button"
          onClick={toggle}
          aria-label={label}
          aria-expanded={!collapsed}
          title={label}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors outline-none group-data-[collapsed=true]/sidebar:justify-center group-data-[collapsed=true]/sidebar:px-0 hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {collapsed ? <PanelLeftOpenIcon className="size-[18px] shrink-0" /> : <PanelLeftCloseIcon className="size-[18px] shrink-0" />}
          <span className="group-data-[collapsed=true]/sidebar:sr-only">Collapse</span>
        </button>
      </div>
    </aside>
  );
}
