"use client";

import { useActionState, useState, useTransition } from "react";
import { CheckIcon, RulerIcon, SparklesIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { MessageState } from "@/lib/form-state";
import type { CheckIssue, Decisions, EditRequest } from "@/lib/schemas/tailoring";
import type { ReviewChange } from "@/lib/tailoring/changes";
import { wordedItemOf, type Outline } from "@/lib/tailoring/edits";
import {
  approveTailoringAction,
  checkTailoringLengthAction,
  editTailoringAction,
  reviseTailoringAction,
  type LengthState,
} from "../actions";
import { ChangeCard, type Decision } from "./change-card";
import { OutlineEditor } from "./outline-editor";

const idle: MessageState = { status: "idle" };
const lengthIdle: LengthState = { status: "idle" };

// Reviewing a tailoring proposal, change by change, like reviewing an
// edit in an editor. A Client Component because it holds your decisions
// and notes until you approve or revise. Every change starts undecided
// (unless you made it yourself), and Approve stays disabled until each
// one has a decision, so nothing is approved by accident. "Accept all"
// asks for confirmation first.
//
// Three ways to shape the draft before approving:
// - Edit it yourself: wording on a change card, or move/remove/reword in
//   the outline. Saved right away, with your decisions so far.
// - Suggest a change: notes on cards or on the whole draft, sent together
//   by "Revise with notes", which makes a new version.
// - Check length: builds the PDF for what you've accepted, saving nothing.
//
// The page renders one panel per version (keyed by its id), so notes are
// cleared when a revision succeeds and kept if it fails.
export function ReviewPanel({
  tailoringId,
  jobId,
  changes,
  outline,
  initialDecisions,
  yourIssues,
  disabled,
}: {
  tailoringId: number;
  jobId: number;
  changes: ReviewChange[];
  outline: Outline | null;
  initialDecisions: Decisions;
  yourIssues: CheckIssue[];
  disabled: boolean;
}) {
  const [decisions, setDecisions] = useState<Decisions>(initialDecisions);
  // After an edit, the server sends your decisions carried over to the new
  // list of changes: take them. Adjusting state during render is React's
  // pattern for "reset state when a prop changes", without an effect.
  const serverKey = JSON.stringify([initialDecisions, changes.map((c) => c.id)]);
  const [syncedKey, setSyncedKey] = useState(serverKey);
  if (serverKey !== syncedKey) {
    setSyncedKey(serverKey);
    setDecisions(initialDecisions);
  }

  const [notes, setNotes] = useState<Record<string, string>>({});
  const [generalNote, setGeneralNote] = useState("");

  const [approveState, approveAction, approving] = useActionState(approveTailoringAction, idle);
  const [editState, editAction, editing] = useActionState(editTailoringAction, idle);
  const [lengthState, lengthAction, checking] = useActionState(checkTailoringLengthAction, lengthIdle);
  const [reviseState, reviseAction, revising] = useActionState(reviseTailoringAction, idle);
  const [, startTransition] = useTransition();
  const busy = editing || revising || approving;

  const decided = changes.filter((change) => decisions[change.id]).length;
  const accepted = changes.filter((change) => decisions[change.id] === "accepted").map((change) => change.id);
  const allDecided = decided === changes.length;
  const notesToSend = changes.flatMap((c) => (notes[c.id]?.trim() ? [{ changeId: c.id, note: notes[c.id].trim() }] : []));
  const noteCount = notesToSend.length + (generalNote.trim() ? 1 : 0);

  const decide = (id: string, decision: Decision) => setDecisions((current) => ({ ...current, [id]: decision }));
  const decideAll = (decision: Decision) => setDecisions(Object.fromEntries(changes.map((change) => [change.id, decision])));

  function acceptAll() {
    const undecided = changes.length - decided;
    const message =
      undecided > 0
        ? `Accept all ${changes.length} changes, including ${undecided} you haven't looked at yet?`
        : `Accept all ${changes.length} changes?`;
    if (window.confirm(message)) decideAll("accepted");
  }

  // These are sent from buttons rather than a form, so each dispatch goes
  // inside a transition (useActionState's action requires one).
  function send(action: (formData: FormData) => void, fields: Record<string, string>) {
    const formData = new FormData();
    for (const [key, value] of Object.entries(fields)) formData.set(key, value);
    startTransition(() => action(formData));
  }

  const base = { tailoringId: String(tailoringId), jobId: String(jobId) };
  const submitEdit = (request: EditRequest) =>
    send(editAction, { ...base, request: JSON.stringify(request), decisions: JSON.stringify(decisions) });
  const checkLength = () => send(lengthAction, { ...base, accepted: JSON.stringify(accepted) });
  // The last length check's page count goes along, so "keep it to one
  // page" can be followed.
  const revise = () =>
    send(reviseAction, {
      ...base,
      request: JSON.stringify({
        notes: notesToSend,
        generalNote: generalNote.trim(),
        pages: lengthState.status === "done" ? lengthState.pages : null,
      }),
      decisions: JSON.stringify(decisions),
    });

  // Your wording, by item, for the "your wording" badge and Reset.
  const editedItems = new Set([
    ...(outline?.summary?.edited ? ["summary"] : []),
    ...(outline?.sections.flatMap((s) => s.entries.flatMap((e) => e.bullets.filter((b) => b.edited).map((b) => b.bulletId))) ?? []),
  ]);
  const groups = [...new Set(changes.map((change) => change.group))];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 px-4 py-3">
        <p className="text-sm">
          <span className="font-medium">
            {decided} of {changes.length}
          </span>{" "}
          changes reviewed · {accepted.length} accepted
        </p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={acceptAll} disabled={disabled || changes.length === 0}>
            <CheckIcon />
            Accept all
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => decideAll("rejected")} disabled={disabled || changes.length === 0}>
            <XIcon />
            Reject all
          </Button>
        </div>
      </div>

      <StateMessage state={editState} />

      {changes.length === 0 && (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          No changes: your current resume already fits this listing as well as your profile allows. You can still edit it
          below.
        </p>
      )}

      {groups.map((group) => (
        <section key={group} className="space-y-2">
          <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">{group}</h3>
          {changes
            .filter((change) => change.group === group)
            .map((change) => {
              const wordedItem = wordedItemOf(change.id);
              return (
                <ChangeCard
                  key={change.id}
                  change={change}
                  decision={decisions[change.id]}
                  onDecide={(decision) => decide(change.id, decision)}
                  wordedItem={wordedItem}
                  edited={wordedItem !== null && editedItems.has(wordedItem)}
                  issues={wordedItem ? yourIssues.filter((issue) => issue.itemId === wordedItem) : []}
                  note={notes[change.id] ?? ""}
                  onNote={(note) => setNotes((current) => ({ ...current, [change.id]: note }))}
                  onEditText={(text) => wordedItem && submitEdit({ edit: { op: "text", itemId: wordedItem, text } })}
                  onReset={() => wordedItem && submitEdit({ reset: wordedItem })}
                  busy={busy}
                  disabled={disabled}
                />
              );
            })}
        </section>
      ))}

      {outline && <OutlineEditor outline={outline} onEdit={submitEdit} busy={busy} disabled={disabled} />}

      <div className="space-y-2 rounded-lg border p-4">
        <label htmlFor={`general-note-${tailoringId}`} className="text-sm font-medium">
          Suggest changes to the whole draft
        </label>
        <Textarea
          id={`general-note-${tailoringId}`}
          value={generalNote}
          onChange={(event) => setGeneralNote(event.target.value)}
          rows={2}
          maxLength={2000}
          placeholder="e.g. This runs to two pages: drop WisePub rather than Stock Scanner"
          disabled={disabled}
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            Revising sends your notes, decisions, and own wording to the model for a new version (one call, like
            generating). It can&apos;t add anything that isn&apos;t in your profile.
          </p>
          <Button type="button" variant="outline" size="sm" onClick={revise} disabled={disabled || busy || noteCount === 0}>
            <SparklesIcon />
            {revising ? "Revising..." : `Revise with ${noteCount === 1 ? "1 note" : `${noteCount} notes`}`}
          </Button>
        </div>
        <StateMessage state={reviseState} />
      </div>

      <div className="flex flex-col items-end gap-2 border-t pt-4">
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" onClick={checkLength} disabled={checking || busy}>
            <RulerIcon />
            {checking ? "Checking..." : "Check length"}
          </Button>
          <form action={approveAction}>
            <input type="hidden" name="tailoringId" value={tailoringId} />
            <input type="hidden" name="jobId" value={jobId} />
            <input type="hidden" name="accepted" value={JSON.stringify(accepted)} />
            <Button type="submit" disabled={disabled || busy || !allDecided}>
              {approving ? "Approving..." : "Approve and build PDF"}
            </Button>
          </form>
        </div>
        {lengthState.status === "done" && (
          <p role="status" className={cn("text-sm", !lengthState.fits && "text-amber-700 dark:text-amber-400")}>
            {lengthState.message}
          </p>
        )}
        {!allDecided && !disabled && <p className="text-xs text-muted-foreground">Accept or reject every change to approve.</p>}
        <StateMessage state={approveState} />
      </div>
    </div>
  );
}

function StateMessage({ state }: { state: MessageState }) {
  if (state.status === "idle") return null;
  return (
    <p role={state.status === "error" ? "alert" : "status"} className={cn("text-sm", state.status === "error" && "text-destructive")}>
      {state.message}
    </p>
  );
}
