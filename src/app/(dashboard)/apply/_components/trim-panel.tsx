"use client";

import { useActionState, useState } from "react";
import { ScissorsIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { MessageState } from "@/lib/form-state";
import { trimTailoringAction } from "../actions";

const initialState: MessageState = { status: "idle" };

// Shown when an approved resume runs past one page: the model's
// suggestions for what to cut, least important first. You pick which to
// remove, and the PDF is rebuilt. A Client Component for the checkboxes.
export function TrimPanel({
  tailoringId,
  jobId,
  suggestions,
  disabled,
}: {
  tailoringId: number;
  jobId: number;
  suggestions: { bulletId: string; text: string }[];
  disabled: boolean;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [state, formAction, pending] = useActionState(trimTailoringAction, initialState);

  const toggle = (id: string) =>
    setSelected((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="tailoringId" value={tailoringId} />
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="bulletIds" value={JSON.stringify(selected)} />
      <p className="text-sm text-muted-foreground">Suggested cuts, least important first:</p>
      <ul className="space-y-1.5">
        {suggestions.map((suggestion) => (
          <li key={suggestion.bulletId}>
            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={selected.includes(suggestion.bulletId)}
                onChange={() => toggle(suggestion.bulletId)}
                disabled={disabled}
              />
              {suggestion.text}
            </label>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={disabled || pending || selected.length === 0}>
          <ScissorsIcon />
          {pending ? "Rebuilding..." : `Remove ${selected.length || ""} and rebuild`}
        </Button>
        {state.status !== "idle" && (
          <p role={state.status === "error" ? "alert" : "status"} className={cn("text-sm", state.status === "error" && "text-destructive")}>
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}
