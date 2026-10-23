"use client";

import { useState } from "react";
import { MessageSquarePlusIcon, PencilIcon, RotateCcwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { CheckIssue } from "@/lib/schemas/tailoring";
import type { ReviewChange } from "@/lib/tailoring/changes";

export type Decision = "accepted" | "rejected";

// One change in review. Besides Accept/Reject:
// - Edit: write your own wording (summary and bullets). Saved right away,
//   and accepted, since you wrote it.
// - Reset: back to the suggestion, if you edited it.
// - Suggest a change: a note for "Revise with notes", kept on the page
//   until you revise.
export function ChangeCard({
  change,
  decision,
  onDecide,
  wordedItem,
  edited,
  issues,
  note,
  onNote,
  onEditText,
  onReset,
  busy,
  disabled,
}: {
  change: ReviewChange;
  decision: Decision | undefined;
  onDecide: (decision: Decision) => void;
  // The summary or bullet whose wording this change is (null: structural).
  wordedItem: string | null;
  edited: boolean;
  // Flags on your own wording for this item.
  issues: CheckIssue[];
  note: string;
  onNote: (note: string) => void;
  onEditText: (text: string) => void;
  onReset: () => void;
  busy: boolean;
  disabled: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draftText, setDraftText] = useState(change.after[0] ?? "");
  const [noting, setNoting] = useState(note !== "");

  return (
    <div
      className={cn(
        "rounded-lg border p-3 text-sm transition-colors",
        decision === "accepted" && "border-emerald-500/50 bg-emerald-500/5",
        decision === "rejected" && "border-border bg-muted/40 opacity-70",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="font-medium">
          {change.label}
          {edited && <span className="ml-2 rounded-full border px-1.5 py-px text-xs font-normal text-muted-foreground">your wording</span>}
        </p>
        {/* Wraps on narrow screens (no shrink-0, which kept it one row wide). */}
        <div className="flex flex-wrap gap-1">
          {wordedItem && !editing && (
            <Button
              type="button"
              size="xs"
              variant="ghost"
              onClick={() => {
                setDraftText(change.after[0] ?? "");
                setEditing(true);
              }}
              disabled={disabled || busy}
            >
              <PencilIcon />
              Edit
            </Button>
          )}
          {edited && (
            <Button type="button" size="xs" variant="ghost" onClick={onReset} disabled={disabled || busy}>
              <RotateCcwIcon />
              Reset
            </Button>
          )}
          <Button
            type="button"
            size="xs"
            variant="ghost"
            onClick={() => setNoting((open) => !open)}
            disabled={disabled}
            aria-expanded={noting}
          >
            <MessageSquarePlusIcon />
            {note ? "Note added" : "Suggest a change"}
          </Button>
          <Button
            type="button"
            size="xs"
            variant={decision === "accepted" ? "default" : "outline"}
            onClick={() => onDecide("accepted")}
            disabled={disabled}
            aria-pressed={decision === "accepted"}
          >
            Accept
          </Button>
          <Button
            type="button"
            size="xs"
            variant={decision === "rejected" ? "secondary" : "outline"}
            onClick={() => onDecide("rejected")}
            disabled={disabled}
            aria-pressed={decision === "rejected"}
          >
            Reject
          </Button>
        </div>
      </div>

      <div className="mt-2 grid gap-2 md:grid-cols-2">
        <Lines title="Now" lines={change.before} tone="before" />
        {editing ? (
          <div className="space-y-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2">
            <p className="text-xs text-muted-foreground">Your wording</p>
            <Textarea value={draftText} onChange={(event) => setDraftText(event.target.value)} rows={4} aria-label="Your wording" />
            <div className="flex gap-2">
              <Button
                type="button"
                size="xs"
                onClick={() => {
                  onEditText(draftText);
                  setEditing(false);
                }}
                disabled={busy || draftText.trim() === ""}
              >
                Save
              </Button>
              <Button type="button" size="xs" variant="outline" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Lines title={edited ? "Yours" : "Proposed"} lines={change.after} tone="after" />
        )}
      </div>

      {issues.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs text-amber-700 dark:text-amber-400">
          {issues.map((issue) => (
            <li key={issue.message}>{issue.message}</li>
          ))}
        </ul>
      )}

      {noting && (
        <div className="mt-2 space-y-1">
          <Textarea
            value={note}
            onChange={(event) => onNote(event.target.value)}
            rows={2}
            maxLength={1000}
            placeholder="e.g. Keep this, but drop the last sentence"
            aria-label={`Note on: ${change.label}`}
            disabled={disabled}
          />
          <p className="text-xs text-muted-foreground">Used when you click “Revise with notes” below.</p>
        </div>
      )}
    </div>
  );
}

function Lines({ title, lines, tone }: { title: string; lines: string[]; tone: "before" | "after" }) {
  return (
    <div
      className={cn(
        "rounded-md border px-3 py-2",
        tone === "before" ? "border-rose-500/30 bg-rose-500/5" : "border-emerald-500/30 bg-emerald-500/5",
      )}
    >
      <p className="mb-1 text-xs text-muted-foreground">{title}</p>
      {lines.length === 0 ? (
        <p className="text-muted-foreground italic">{tone === "before" ? "Not on your resume" : "Removed"}</p>
      ) : (
        <ul className="space-y-1">
          {lines.map((line, index) => (
            <li key={`${index}-${line}`}>{line}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
