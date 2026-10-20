"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MaybeDisabledTooltip } from "@/components/demo-tooltip";
import { syncResponseSchema, type SyncResponse } from "@/lib/email/sync-response";
import { cn } from "@/lib/utils";

// "Sync now". Calls POST /api/sync (a route handler, see its comment) and
// shows the one-line summary it returns, then refreshes the page so new
// suggestions appear. A Client Component for the pending state and the
// message.
export function SyncButton({ disabled, disabledMessage }: { disabled: boolean; disabledMessage: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<SyncResponse | null>(null);

  function sync() {
    startTransition(async () => {
      try {
        const response = await fetch("/api/sync", { method: "POST" });
        // Our own API, but still JSON from the network: validated before use.
        const parsed = syncResponseSchema.safeParse(await response.json());
        setResult(parsed.success ? parsed.data : { ok: false, message: "The sync answered unexpectedly. Try again." });
      } catch {
        setResult({ ok: false, message: "Couldn't reach the app to sync. Try again." });
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <MaybeDisabledTooltip disabled={disabled} message={disabledMessage}>
        <Button type="button" size="sm" onClick={sync} disabled={disabled || pending}>
          <RefreshCwIcon className={cn(pending && "animate-spin")} />
          {pending ? "Syncing..." : "Sync now"}
        </Button>
      </MaybeDisabledTooltip>
      {result && (
        <p role={result.ok ? "status" : "alert"} className={cn("text-sm", result.ok ? "text-muted-foreground" : "text-destructive")}>
          {result.message}
        </p>
      )}
    </div>
  );
}
