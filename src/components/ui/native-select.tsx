import type * as React from "react";
import { cn } from "cn";

// A native <select> styled like the other inputs. Used where a plain form
// field is all that's needed: it submits with its form like any input and
// needs no client code, unlike the Select component (base-ui), which is
// for richer menus. Pass width classes with className.
export function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="native-select"
      className={cn(
        "h-8 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30",
        className,
      )}
      {...props}
    />
  );
}
