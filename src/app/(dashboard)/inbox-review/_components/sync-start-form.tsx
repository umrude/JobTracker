"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { MessageState } from "@/lib/form-state";
import { chooseSyncStartAction } from "../actions";

const initialState: MessageState = { status: "idle" };

// The first sync's start date. A Client Component for the pending state
// and the message; the date itself is a plain input, submitted as
// "YYYY-MM-DD" and checked again on the server.
export function SyncStartForm({ value, min, max }: { value: string; min: string; max: string }) {
  const [state, formAction, pending] = useActionState(chooseSyncStartAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-1">
      <Label htmlFor="sync-start">First sync looks back to</Label>
      <div className="flex items-center gap-2">
        <Input id="sync-start" name="start" type="date" defaultValue={value} min={min} max={max} className="w-44" />
        <Button type="submit" variant="outline" size="sm" disabled={pending}>
          {pending ? "Saving..." : "Save"}
        </Button>
      </div>
      {state.status !== "idle" && (
        <p
          role={state.status === "error" ? "alert" : "status"}
          className={state.status === "error" ? "text-sm text-destructive" : "text-sm text-muted-foreground"}
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
