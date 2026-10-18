"use client";

import { useActionState, useState, type ChangeEvent } from "react";
import { ClipboardPasteIcon, UploadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MaybeDisabledTooltip } from "@/components/demo-tooltip";
import type { FormState } from "@/lib/form-state";
import {
  RESUME_FILE_ERRORS,
  type ParseResumeState,
} from "@/lib/resume-file";
import {
  RESUME_FILE_TYPES,
  RESUME_MAX_BYTES,
  RESUME_TEXT_MAX,
} from "@/lib/schemas/resume";
import { parseResumeAction, saveResumeAction } from "../actions";

type Draft = { text: string; source: string };

const ACCEPT = Object.values(RESUME_FILE_TYPES)
  .flatMap(({ mime, extension }) => [mime, extension])
  .join(",");

// Two stages: pick a file (or start from blank text), then review and
// save. Each stage is its own component, so switching stages unmounts
// the old one and resets its useActionState: cancelling an edit and
// uploading again doesn't show the previous attempt's errors.
export function ResumeUpload({ disabled }: { disabled: boolean }) {
  const [draft, setDraft] = useState<Draft | null>(null);

  if (draft) {
    return (
      <ResumeEditor
        draft={draft}
        onCancel={() => setDraft(null)}
        onSaved={() => setDraft(null)}
      />
    );
  }

  return <ResumePicker disabled={disabled} onParsed={setDraft} />;
}

const initialParseState: ParseResumeState = { status: "idle" };

function ResumePicker({
  disabled,
  onParsed,
}: {
  disabled: boolean;
  onParsed: (draft: Draft) => void;
}) {
  // Same wrapping trick as the saved-job form: move to the edit stage
  // from inside the action's transition instead of a useEffect on state.
  const [state, formAction, pending] = useActionState(
    async (prevState: ParseResumeState, formData: FormData) => {
      const next = await parseResumeAction(prevState, formData);
      if (next.status === "parsed") {
        onParsed({ text: next.text, source: next.fileName });
      }
      return next;
    },
    initialParseState,
  );
  const [tooLarge, setTooLarge] = useState(false);

  // A courtesy check so an oversized file fails instantly instead of
  // after uploading. The server checks again: this one is only UX.
  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setTooLarge(file !== undefined && file.size > RESUME_MAX_BYTES);
  }

  const message = tooLarge
    ? RESUME_FILE_ERRORS.too_large
    : state.status === "error"
      ? state.message
      : undefined;

  return (
    <form action={formAction} className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="file">Resume file (PDF or DOCX, up to 5 MB)</Label>
        <Input
          id="file"
          name="file"
          type="file"
          accept={ACCEPT}
          required
          disabled={disabled || pending}
          onChange={handleFileChange}
        />
      </div>
      {message && (
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <MaybeDisabledTooltip disabled={disabled} message="Disabled in demo mode">
          <Button type="submit" disabled={disabled || pending || tooLarge}>
            <UploadIcon />
            {pending ? "Reading file..." : "Upload and preview"}
          </Button>
        </MaybeDisabledTooltip>
        <MaybeDisabledTooltip disabled={disabled} message="Disabled in demo mode">
          <Button
            type="button"
            variant="outline"
            disabled={disabled || pending}
            onClick={() => onParsed({ text: "", source: "pasted text" })}
          >
            <ClipboardPasteIcon />
            Paste text instead
          </Button>
        </MaybeDisabledTooltip>
      </div>
      <p className="text-xs text-muted-foreground">
        Only the extracted text is kept. The file itself is never stored.
      </p>
    </form>
  );
}

const initialSaveState: FormState = { status: "idle" };

function ResumeEditor({
  draft,
  onCancel,
  onSaved,
}: {
  draft: Draft;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [state, formAction, pending] = useActionState(
    async (prevState: FormState, formData: FormData) => {
      const next = await saveResumeAction(prevState, formData);
      if (next.status === "success") onSaved();
      return next;
    },
    initialSaveState,
  );

  const textErrors = state.status === "error" ? state.fieldErrors.text : undefined;

  return (
    <form action={formAction} className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="text">Review the text from {draft.source}</Label>
        <p className="text-sm text-muted-foreground">
          Parsing isn&apos;t perfect. Fix anything that came out garbled
          before saving. This text is what comparisons will use.
        </p>
        <Textarea
          id="text"
          name="text"
          rows={18}
          maxLength={RESUME_TEXT_MAX}
          className="max-h-[32rem] font-mono text-xs"
          defaultValue={draft.text}
          required
          autoFocus
        />
        {textErrors?.map((error) => (
          <p key={error} className="text-sm text-destructive">
            {error}
          </p>
        ))}
      </div>
      {state.status === "error" && (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : "Save as new version"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
