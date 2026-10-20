"use client";

import { useActionState, useState, type ReactNode } from "react";
import { CheckIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { FormState } from "@/lib/form-state";
import { EXPERIENCE_KINDS, PROFICIENCY_LEVELS } from "@/lib/schemas/profile";
import { EXPERIENCE_LABELS, PROFICIENCY_LABELS } from "@/lib/profile/labels";
import { confirmGapAction } from "../actions";

type GapDialogProps = {
  jobId: number;
  // The gap, as the comparison wrote it.
  name: string;
  // Profile skills with similar names, for "Is this the same as …?".
  suggestions: { id: number; name: string }[];
  // Existing skill categories, suggested in the category field.
  categories: string[];
};

// "I have this" on a comparison gap. A Client Component for the dialog's
// open state and the form state. Every answer posts to the same action;
// they differ only in `mode` (see confirmGapSchema). Only rendered when
// writes are allowed, so it has no disabled state of its own.
export function GapDialog(props: GapDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="ghost" size="xs" className="h-5 px-1.5 text-xs">
            I have this
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Do you have “{props.name}”?</DialogTitle>
          <DialogDescription>
            This listing asks for it, and your resume doesn&apos;t show it. Your answer goes in your
            profile, so tailored resumes can use it. The score itself won&apos;t change: it&apos;s for
            your resume as written.
          </DialogDescription>
        </DialogHeader>
        {/* Unmounts on close, which resets the form state. */}
        <GapForms {...props} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

const initialState: FormState = { status: "idle" };

const selectClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

function GapForms({ jobId, name, suggestions, categories, onDone }: GapDialogProps & { onDone: () => void }) {
  const [state, formAction, pending] = useActionState(
    async (prevState: FormState, formData: FormData) => {
      const next = await confirmGapAction(prevState, formData);
      if (next.status === "success") onDone();
      return next;
    },
    initialState,
  );
  const prefix = `gap-${jobId}-${name.replace(/\W+/g, "-")}`;

  // The fields every answer shares.
  const hidden = (mode: string) => (
    <>
      <input type="hidden" name="mode" value={mode} />
      <input type="hidden" name="jobId" value={jobId} />
    </>
  );

  return (
    <div className="space-y-5">
      {state.status === "error" && (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      )}

      {suggestions.length > 0 && (
        <Section title="Is it a skill you already have under another name?">
          <div className="flex flex-wrap gap-2">
            {suggestions.map((skill) => (
              <form key={skill.id} action={formAction}>
                {hidden("alias")}
                <input type="hidden" name="name" value={name} />
                <input type="hidden" name="skillId" value={skill.id} />
                <Button type="submit" variant="outline" size="sm" disabled={pending}>
                  <CheckIcon />
                  Same as {skill.name}
                </Button>
              </form>
            ))}
          </div>
        </Section>
      )}

      <Section title="Add it as a skill">
        <form action={formAction} className="space-y-3">
          {hidden("skill")}
          <input type="hidden" name="name" value={name} />
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor={`${prefix}-category`}>Category</Label>
              <Input id={`${prefix}-category`} name="category" list={`${prefix}-categories`} maxLength={60} />
              <datalist id={`${prefix}-categories`}>
                {categories.map((category) => (
                  <option key={category} value={category} />
                ))}
              </datalist>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${prefix}-proficiency`}>Proficiency</Label>
              <select id={`${prefix}-proficiency`} name="proficiency" defaultValue="" className={selectClass}>
                <option value="">Not set</option>
                {PROFICIENCY_LEVELS.filter((level) => level !== "learning").map((level) => (
                  <option key={level} value={level}>
                    {PROFICIENCY_LABELS[level]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${prefix}-experience`}>Experience</Label>
              <select id={`${prefix}-experience`} name="experience" defaultValue="" className={selectClass}>
                <option value="">Not set</option>
                {EXPERIENCE_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {EXPERIENCE_LABELS[kind]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${prefix}-note`}>Where did you use it? (optional)</Label>
            <Textarea id={`${prefix}-note`} name="note" rows={2} maxLength={500} />
            <p className="text-xs text-muted-foreground">
              Without this, tailoring can list the skill but not claim it in a summary or bullet.
            </p>
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving..." : "Add skill"}
          </Button>
        </form>
      </Section>

      <Section title="Not yet?">
        <form action={formAction}>
          {hidden("learning")}
          <input type="hidden" name="name" value={name} />
          <Button type="submit" variant="outline" size="sm" disabled={pending}>
            No, but I&apos;m learning it
          </Button>
        </form>
        <p className="text-xs text-muted-foreground">
          Learning skills never go on your resume. A cover letter may mention them as learning.
        </p>
      </Section>

      <Section title="Not a skill? Add it as a highlight">
        <form action={formAction} className="space-y-2">
          {hidden("highlight")}
          <Textarea name="text" defaultValue={name} rows={2} maxLength={300} aria-label="Highlight" />
          <Button type="submit" variant="outline" size="sm" disabled={pending}>
            Add highlight
          </Button>
        </form>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2 border-t pt-4 first:border-t-0 first:pt-0">
      <h3 className="text-sm font-medium">{title}</h3>
      {children}
    </section>
  );
}
