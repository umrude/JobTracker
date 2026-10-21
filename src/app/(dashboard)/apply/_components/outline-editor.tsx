"use client";

import { useState } from "react";
import { ArrowDownIcon, ArrowUpIcon, PencilIcon, RotateCcwIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { EditRequest } from "@/lib/schemas/tailoring";
import type { Outline } from "@/lib/tailoring/edits";

// The whole proposed resume (every change applied), for edits the change
// list can't express: removing or moving an entry or bullet the model
// didn't touch, or rewording any bullet. Each edit is saved right away and
// shows up as a change above, already accepted. Collapsed by default:
// most reviews only need the change list.
export function OutlineEditor({
  outline,
  onEdit,
  busy,
  disabled,
}: {
  outline: Outline;
  onEdit: (request: EditRequest) => void;
  busy: boolean;
  disabled: boolean;
}) {
  const off = disabled || busy;
  return (
    <details className="rounded-lg border p-4 text-sm">
      <summary className="cursor-pointer font-medium">Edit the resume yourself: move, remove, or reword</summary>
      <p className="mt-2 text-muted-foreground">
        The proposed resume with every change applied. Your edits appear as changes above, already accepted. To fit one
        page, remove an entry or bullet here, then use “Check length”.
      </p>
      <div className="mt-3 space-y-4">
        {outline.sections.map((section) => (
          <section key={section.title} className="space-y-2">
            <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {section.title}
              {section.isNew && " (new)"}
            </h4>
            <ul className="space-y-2">
              {section.entries.map((entry, index) => (
                <li key={entry.entryId} className="rounded-md border p-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{entry.heading}</span>
                    <span className="flex gap-1">
                      <IconButton label="Move up" disabled={off || index === 0} onClick={() => onEdit({ edit: { op: "move_entry", entryId: entry.entryId, direction: "up" } })}>
                        <ArrowUpIcon />
                      </IconButton>
                      <IconButton
                        label="Move down"
                        disabled={off || index === section.entries.length - 1}
                        onClick={() => onEdit({ edit: { op: "move_entry", entryId: entry.entryId, direction: "down" } })}
                      >
                        <ArrowDownIcon />
                      </IconButton>
                      <IconButton
                        label={`Remove ${entry.heading}`}
                        disabled={off || section.entries.length === 1}
                        onClick={() => {
                          if (window.confirm(`Remove ${entry.heading} from this version? Your profile keeps it.`)) {
                            onEdit({ edit: { op: "remove_entry", entryId: entry.entryId } });
                          }
                        }}
                      >
                        <XIcon />
                      </IconButton>
                      {entry.edited && (
                        <IconButton label="Reset this entry" disabled={off} onClick={() => onEdit({ reset: entry.entryId })}>
                          <RotateCcwIcon />
                        </IconButton>
                      )}
                    </span>
                  </div>
                  <ul className="mt-1 space-y-1">
                    {entry.bullets.map((bullet, bulletIndex) => (
                      <BulletRow
                        key={bullet.bulletId}
                        text={bullet.text}
                        edited={bullet.edited}
                        first={bulletIndex === 0}
                        last={bulletIndex === entry.bullets.length - 1}
                        only={entry.bullets.length === 1}
                        disabled={off}
                        onMove={(direction) => onEdit({ edit: { op: "move_bullet", bulletId: bullet.bulletId, direction } })}
                        onRemove={() => onEdit({ edit: { op: "remove_bullet", bulletId: bullet.bulletId } })}
                        onText={(text) => onEdit({ edit: { op: "text", itemId: bullet.bulletId, text } })}
                        onReset={() => onEdit({ reset: bullet.bulletId })}
                      />
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </details>
  );
}

function BulletRow({
  text,
  edited,
  first,
  last,
  only,
  disabled,
  onMove,
  onRemove,
  onText,
  onReset,
}: {
  text: string;
  edited: boolean;
  first: boolean;
  last: boolean;
  only: boolean;
  disabled: boolean;
  onMove: (direction: "up" | "down") => void;
  onRemove: () => void;
  onText: (text: string) => void;
  onReset: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(text);

  if (editing) {
    return (
      <li className="space-y-1">
        <Textarea value={value} onChange={(event) => setValue(event.target.value)} rows={3} aria-label="Your wording" />
        <div className="flex gap-2">
          <Button
            type="button"
            size="xs"
            disabled={disabled || value.trim() === ""}
            onClick={() => {
              onText(value);
              setEditing(false);
            }}
          >
            Save
          </Button>
          <Button type="button" size="xs" variant="outline" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </div>
      </li>
    );
  }

  return (
    <li className="flex items-start justify-between gap-2">
      <span className="text-muted-foreground">
        • {text}
        {edited && <span className="ml-1 text-xs">(yours)</span>}
      </span>
      <span className="flex shrink-0 gap-1">
        <IconButton label="Move up" disabled={disabled || first} onClick={() => onMove("up")}>
          <ArrowUpIcon />
        </IconButton>
        <IconButton label="Move down" disabled={disabled || last} onClick={() => onMove("down")}>
          <ArrowDownIcon />
        </IconButton>
        <IconButton
          label="Reword"
          disabled={disabled}
          onClick={() => {
            setValue(text);
            setEditing(true);
          }}
        >
          <PencilIcon />
        </IconButton>
        <IconButton label="Remove" disabled={disabled || only} onClick={onRemove}>
          <XIcon />
        </IconButton>
        {edited && (
          <IconButton label="Reset" disabled={disabled} onClick={onReset}>
            <RotateCcwIcon />
          </IconButton>
        )}
      </span>
    </li>
  );
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button type="button" size="icon-xs" variant="ghost" aria-label={label} title={label} disabled={disabled} onClick={onClick}>
      {children}
    </Button>
  );
}
