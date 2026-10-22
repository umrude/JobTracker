"use client";

import { useActionState, useState } from "react";
import { ScissorsIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MessageState } from "@/lib/form-state";
import { trimTailoringAction } from "../actions";
import { ActionMessage } from "@/components/action-message";

const initialState: MessageState = { status: "idle" };

// Shown when an approved resume runs past one page: the model's
// suggestions for what to cut, least important first, and every entry
// that could go as a whole. You pick, and the PDF is rebuilt. A Client
// Component for the checkboxes.
export function TrimPanel({
  tailoringId,
  jobId,
  suggestions,
  entries,
  disabled,
}: {
  tailoringId: number;
  jobId: number;
  suggestions: { bulletId: string; text: string }[];
  entries: { entryId: string; heading: string }[];
  disabled: boolean;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [selectedEntries, setSelectedEntries] = useState<string[]>([]);
  const toggleEntry = (id: string) =>
    setSelectedEntries((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));
  const count = selected.length + selectedEntries.length;
  const [state, formAction, pending] = useActionState(trimTailoringAction, initialState);

  const toggle = (id: string) =>
    setSelected((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="tailoringId" value={tailoringId} />
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="bulletIds" value={JSON.stringify(selected)} />
      <input type="hidden" name="entryIds" value={JSON.stringify(selectedEntries)} />
      {suggestions.length > 0 && <p className="text-sm text-muted-foreground">Suggested cuts, least important first:</p>}
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
      {entries.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">Or remove a whole entry</summary>
          <ul className="mt-2 space-y-1.5">
            {entries.map((entry) => (
              <li key={entry.entryId}>
                <label className="flex cursor-pointer items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={selectedEntries.includes(entry.entryId)}
                    onChange={() => toggleEntry(entry.entryId)}
                    disabled={disabled}
                  />
                  {entry.heading}
                </label>
              </li>
            ))}
          </ul>
        </details>
      )}
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={disabled || pending || count === 0}>
          <ScissorsIcon />
          {pending ? "Rebuilding..." : `Remove ${count || ""} and rebuild`}
        </Button>
        <ActionMessage state={state} showSuccess />
      </div>
    </form>
  );
}
