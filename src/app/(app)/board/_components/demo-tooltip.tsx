"use client";

import type { ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

// Wraps a control in a tooltip explaining why it's disabled, but only when
// it actually is -- a disabled native control fires no pointer events, so
// the hover target has to be a wrapping span rather than the control itself.
export function MaybeDisabledTooltip({
  disabled,
  message,
  children,
}: {
  disabled: boolean;
  message: string;
  children: ReactNode;
}) {
  if (!disabled) return <>{children}</>;

  return (
    <Tooltip>
      <TooltipTrigger render={<span className="inline-flex" />}>
        {children}
      </TooltipTrigger>
      <TooltipContent>{message}</TooltipContent>
    </Tooltip>
  );
}
