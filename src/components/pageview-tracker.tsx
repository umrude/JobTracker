"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

// GoatCounter's script counts the page a visit starts on. Moving around
// the app after that is client-side navigation with no page load, so this
// counts each later page. The first render is skipped: the script already
// counted it. A Client Component only for usePathname(). See
// demo-analytics.tsx for when it's on the page at all.

// window.goatcounter comes from a third-party script, so it's treated as
// unknown and narrowed, not trusted: if it isn't there (blocked by an ad
// blocker, still loading), nothing happens.
function countPageview(path: string) {
  const goatcounter: unknown = Reflect.get(window, "goatcounter");
  if (typeof goatcounter !== "object" || goatcounter === null) return;
  const count: unknown = Reflect.get(goatcounter, "count");
  if (typeof count === "function") count.call(goatcounter, { path });
}

export function PageviewTracker() {
  const pathname = usePathname();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    countPageview(pathname);
  }, [pathname]);
  return null;
}
