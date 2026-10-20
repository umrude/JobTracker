"use client";

import { useActionState, useState } from "react";
import { CheckIcon, CopyIcon, SaveIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { FormState } from "@/lib/form-state";
import { COVER_LETTER_MAX } from "@/lib/schemas/cover-letter";
import { saveCoverLetterAction } from "../actions";

const initialState: FormState = { status: "idle" };

// The letter as editable text, with Save and Copy. A Client Component for
// the text being edited and the clipboard. The page keys it by version, so
// switching versions starts fresh.
export function LetterEditor({
  id,
  jobId,
  text,
  disabled,
}: {
  id: number;
  jobId: number;
  text: string;
  disabled: boolean;
}) {
  const [draft, setDraft] = useState(text);
  const [copied, setCopied] = useState(false);
  const [state, formAction, pending] = useActionState(saveCoverLetterAction, initialState);
  const changed = draft !== text;

  async function copy() {
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be refused; the text can still be selected by hand.
      setCopied(false);
    }
  }

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="jobId" value={jobId} />
      <Textarea
        name="text"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        rows={18}
        maxLength={COVER_LETTER_MAX}
        readOnly={disabled}
        aria-label="Cover letter"
        className="max-h-[36rem] font-serif text-sm leading-relaxed"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={copy}>
          {copied ? <CheckIcon /> : <CopyIcon />}
          {copied ? "Copied" : "Copy"}
        </Button>
        {!disabled && (
          <Button type="submit" size="sm" disabled={!changed || pending}>
            <SaveIcon />
            {pending ? "Saving..." : "Save edits"}
          </Button>
        )}
        {changed && !pending && <span className="text-xs text-muted-foreground">Unsaved changes</span>}
        {state.status === "error" && (
          <p role="alert" className="text-sm text-destructive">
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}
