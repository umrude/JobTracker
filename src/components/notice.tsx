import type { ReactNode } from "react";

// A highlighted note above page content: something you should know before
// acting ("This was tailored from an older resume version"), not an error.
export function Notice({ children }: { children: ReactNode }) {
  return <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">{children}</p>;
}
