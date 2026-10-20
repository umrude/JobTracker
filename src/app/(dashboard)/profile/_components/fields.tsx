import type { ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EXPERIENCE_KINDS, PROFICIENCY_LEVELS } from "@/lib/schemas/profile";
import type { ProfileEntry, ProfileSkill } from "@/lib/profile/types";
import { EXPERIENCE_LABELS, PROFICIENCY_LABELS } from "@/lib/profile/labels";

// Form fields for the profile dialogs. Plain inputs with no client code:
// the page (a Server Component) renders them and passes them into
// ProfileDialog as children. Edits submit every field (a full replace).

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

// A native <select>: it submits with the form like any input, so no client
// state is needed. Styled to match <Input>.
const selectClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

export function SkillFields({ skill }: { skill?: ProfileSkill }) {
  const prefix = skill ? `skill-${skill.id}` : "skill-new";
  return (
    <>
      {skill && <input type="hidden" name="id" value={skill.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id={`${prefix}-name`} label="Name">
          <Input id={`${prefix}-name`} name="name" defaultValue={skill?.name} required maxLength={100} />
        </Field>
        <Field id={`${prefix}-category`} label="Category" hint="e.g. Languages, Frameworks">
          <Input id={`${prefix}-category`} name="category" defaultValue={skill?.category ?? ""} maxLength={60} />
        </Field>
        <Field id={`${prefix}-proficiency`} label="Proficiency">
          <select id={`${prefix}-proficiency`} name="proficiency" defaultValue={skill?.proficiency ?? ""} className={selectClass}>
            <option value="">Not set</option>
            {PROFICIENCY_LEVELS.map((level) => (
              <option key={level} value={level}>
                {PROFICIENCY_LABELS[level]}
              </option>
            ))}
          </select>
        </Field>
        <Field id={`${prefix}-experience`} label="Experience">
          <select id={`${prefix}-experience`} name="experience" defaultValue={skill?.experience ?? ""} className={selectClass}>
            <option value="">Not set</option>
            {EXPERIENCE_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {EXPERIENCE_LABELS[kind]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field
        id={`${prefix}-aliases`}
        label="Other names"
        hint="Comma-separated, e.g. Postgres, PG. Listings using these count as this skill."
      >
        <Input id={`${prefix}-aliases`} name="aliases" defaultValue={skill?.aliases.join(", ") ?? ""} />
      </Field>
      <Field
        id={`${prefix}-note`}
        label="Where you used it"
        hint="Optional, in your own words. Without it (or a bullet mentioning the skill), tailoring can list the skill but not claim it in a summary or bullet."
      >
        <Textarea id={`${prefix}-note`} name="note" defaultValue={skill?.note ?? ""} maxLength={500} rows={2} />
      </Field>
    </>
  );
}

export function EntryFields({ entry, sections }: { entry?: ProfileEntry; sections: string[] }) {
  const prefix = entry ? `entry-${entry.id}` : "entry-new";
  return (
    <>
      {entry && <input type="hidden" name="id" value={entry.id} />}
      <Field id={`${prefix}-section`} label="Section" hint="Pick an existing section or type a new one.">
        <Input
          id={`${prefix}-section`}
          name="section"
          list={`${prefix}-sections`}
          defaultValue={entry?.section ?? sections[0] ?? "Experience"}
          required
          maxLength={80}
        />
        {/* Suggestions without restricting: a native datalist. */}
        <datalist id={`${prefix}-sections`}>
          {sections.map((section) => (
            <option key={section} value={section} />
          ))}
        </datalist>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id={`${prefix}-title`} label="Title" hint="Job title, or project name">
          <Input id={`${prefix}-title`} name="title" defaultValue={entry?.title} required maxLength={200} />
        </Field>
        <Field id={`${prefix}-dates`} label="Dates" hint="As printed, e.g. Jan 2024 -- Present">
          <Input id={`${prefix}-dates`} name="dates" defaultValue={entry?.dates ?? ""} maxLength={80} />
        </Field>
        <Field id={`${prefix}-subtitle`} label="Subtitle" hint="Company, or project description">
          <Input id={`${prefix}-subtitle`} name="subtitle" defaultValue={entry?.subtitle ?? ""} maxLength={200} />
        </Field>
        <Field id={`${prefix}-detail`} label="Detail" hint="Location, or tech used">
          <Input id={`${prefix}-detail`} name="detail" defaultValue={entry?.detail ?? ""} maxLength={200} />
        </Field>
      </div>
    </>
  );
}

export function TextFields({
  id,
  hidden,
  label,
  defaultValue,
  maxLength,
}: {
  id: string;
  hidden?: Record<string, number>;
  label: string;
  defaultValue?: string;
  maxLength: number;
}) {
  return (
    <>
      {Object.entries(hidden ?? {}).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <Field id={id} label={label}>
        <Textarea id={id} name="text" defaultValue={defaultValue} required maxLength={maxLength} rows={3} />
      </Field>
    </>
  );
}
