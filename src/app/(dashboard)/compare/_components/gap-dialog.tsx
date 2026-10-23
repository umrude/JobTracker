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
import { ActionMessage } from "@/components/action-message";
import { NativeSelect } from "@/components/ui/native-select";
import type { SkillCandidate } from "@/lib/skills/candidates";
import { plural } from "@/lib/format";

type GapDialogProps = {
  jobId: number;
  // The gap, as the comparison wrote it.
  name: string;
  // Profile skills with similar names, for "Is this the same as …?".
  suggestions: { id: number; name: string }[];
  // The skills inside the gap's phrase, to tick (lib/skills/candidates.ts).
  // Empty when the phrase has no skill-like part: then it's the whole name.
  candidates: SkillCandidate[];
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

function GapForms({ jobId, name, suggestions, candidates, categories, onDone }: GapDialogProps & { onDone: () => void }) {
  // With no skills found in the phrase, the phrase itself is the one
  // choice, ticked; otherwise nothing is ticked until you pick.
  const choices: SkillCandidate[] = candidates.length > 0 ? candidates : [{ name, inProfile: false }];
  const [ticked, setTicked] = useState<string[]>(candidates.length > 0 ? [] : [name]);
  const [other, setOther] = useState("");
  const names = [...new Set([...ticked, other.trim()])].filter(Boolean);
  const toggle = (choice: string) =>
    setTicked((current) => (current.includes(choice) ? current.filter((n) => n !== choice) : [...current, choice]));

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
  // The ticked names, one field each, for both "add" and "learning": the
  // checklist sits outside the two forms, so each form carries a copy.
  const nameFields = names.map((n) => <input key={n} type="hidden" name="names" value={n} />);

  return (
    <div className="space-y-5">
      <ActionMessage state={state} />

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

      <Section title={candidates.length > 0 ? "Which of these do you have?" : "Add it as a skill"}>
        <ul className="space-y-1.5">
          {choices.map((choice) => (
            <li key={choice.name}>
              <label className="flex cursor-pointer items-center gap-2 text-sm has-disabled:cursor-default">
                <input
                  type="checkbox"
                  checked={choice.inProfile || ticked.includes(choice.name)}
                  onChange={() => toggle(choice.name)}
                  disabled={choice.inProfile || pending}
                />
                {choice.name}
                {choice.inProfile && <span className="text-xs text-muted-foreground">· in your profile</span>}
              </label>
            </li>
          ))}
        </ul>
        <div className="space-y-1.5">
          <Label htmlFor={`${prefix}-other`}>Another name (optional)</Label>
          <Input
            id={`${prefix}-other`}
            value={other}
            onChange={(event) => setOther(event.target.value)}
            maxLength={100}
            placeholder="If it's called something else, or split differently"
          />
        </div>
        <form action={formAction} className="space-y-3">
          {hidden("skill")}
          {nameFields}
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
              <NativeSelect id={`${prefix}-proficiency`} name="proficiency" defaultValue="" className="w-full">
                <option value="">Not set</option>
                {PROFICIENCY_LEVELS.filter((level) => level !== "learning").map((level) => (
                  <option key={level} value={level}>
                    {PROFICIENCY_LABELS[level]}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${prefix}-experience`}>Experience</Label>
              <NativeSelect id={`${prefix}-experience`} name="experience" defaultValue="" className="w-full">
                <option value="">Not set</option>
                {EXPERIENCE_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {EXPERIENCE_LABELS[kind]}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${prefix}-note`}>Where did you use it? (optional)</Label>
            <Textarea id={`${prefix}-note`} name="note" rows={2} maxLength={500} />
            <p className="text-xs text-muted-foreground">
              Without this, tailoring can list the skill but not claim it in a summary or bullet.
              {names.length > 1 && " The details here apply to every skill you ticked."}
            </p>
          </div>
          <Button type="submit" disabled={pending || names.length === 0}>
            {pending ? "Saving..." : names.length > 1 ? `Add ${plural(names.length, "skill")}` : "Add skill"}
          </Button>
        </form>
      </Section>

      <Section title="Not yet?">
        <form action={formAction}>
          {hidden("learning")}
          {nameFields}
          <Button type="submit" variant="outline" size="sm" disabled={pending || names.length === 0}>
            {names.length > 1 ? "No, but I'm learning these" : "No, but I'm learning it"}
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
