import type { ReactNode } from "react";
import { PencilIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getMode, isWritable } from "@/server/mode";
import { requireSession } from "@/server/require-session";
import { loadProfile } from "@/server/db/profile";
import { getActiveResume } from "@/server/db/resumes";
import { entryHeadingText } from "@/lib/profile/items";
import { skillHasContext } from "@/lib/profile/context";
import type { Profile, ProfileEntry, ProfileSkill } from "@/lib/profile/types";
import type { ProfileSource } from "@/lib/schemas/profile";
import {
  createBulletAction,
  createEntryAction,
  createHighlightAction,
  createSkillAction,
  deleteBulletAction,
  deleteEntryAction,
  deleteHighlightAction,
  deleteSkillAction,
  updateBulletAction,
  updateEntryAction,
  updateHighlightAction,
  updateSkillAction,
} from "./actions";
import { DeleteButton } from "./_components/delete-button";
import { EntryFields, SkillFields, TextFields } from "./_components/fields";
import { ImportButton } from "./_components/import-button";
import { ProfileDialog } from "./_components/profile-dialog";
import { EXPERIENCE_LABELS, PROFICIENCY_LABELS, SOURCE_LABELS } from "@/lib/profile/labels";

// The profile: everything you've done, which tailoring draws from. A
// Server Component: the profile is read at render time, and only the
// dialogs, delete buttons, and import button are Client Components.
// See docs/tailored-resumes.md, "The profile".
export default async function ProfilePage() {
  await requireSession();

  const mode = await getMode();
  const writable = isWritable();
  const disabled = !writable;
  const [profile, activeResume] = await Promise.all([loadProfile(), getActiveResume()]);

  const importBlocker = disabled
    ? "Disabled in demo mode"
    : !activeResume
      ? "Upload a resume first"
      : !activeResume.latexSource
        ? "Your active resume has no LaTeX source"
        : undefined;

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
          <p className="text-sm text-muted-foreground">
            {mode === "demo" && !writable
              ? "Demo mode: browsing a sample profile. Editing is disabled."
              : "Everything you've done, including what doesn't fit on one page. Tailored resumes only use what's here, so nothing gets made up."}
          </p>
        </div>
        <ImportButton disabled={importBlocker !== undefined} disabledMessage={importBlocker ?? ""} />
      </div>

      {isEmpty(profile) ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Your profile is empty. Upload a resume with its .tex to fill it, then add what didn&apos;t fit.
        </p>
      ) : null}

      <HighlightsCard profile={profile} disabled={disabled} />
      <SkillsCard profile={profile} disabled={disabled} />
      <EntriesSection profile={profile} disabled={disabled} />
    </div>
  );
}

function isEmpty(profile: Profile): boolean {
  return profile.skills.length === 0 && profile.entries.length === 0 && profile.highlights.length === 0;
}

// ---- Small display pieces ----

function Badge({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "warning" | "accent" }) {
  const tones = {
    muted: "border-border text-muted-foreground",
    warning: "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    accent: "border-primary/40 text-primary",
  };
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${tones[tone]}`}>{children}</span>;
}

// Imported items are the default, so only the other sources are labeled.
function SourceBadge({ source }: { source: ProfileSource }) {
  return source === "resume" ? null : <Badge tone="accent">{SOURCE_LABELS[source]}</Badge>;
}

function EditButton({ label }: { label: string }) {
  return (
    <Button variant="ghost" size="icon-xs" aria-label={label} title={label}>
      <PencilIcon />
    </Button>
  );
}

function AddButton({ children, disabled }: { children: ReactNode; disabled: boolean }) {
  return (
    <Button variant="outline" size="sm" disabled={disabled}>
      <PlusIcon />
      {children}
    </Button>
  );
}

// ---- Highlights ----

function HighlightsCard({ profile, disabled }: { profile: Profile; disabled: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Highlights</CardTitle>
        <CardDescription>Short facts a tailored summary and cover letter may use.</CardDescription>
        <CardAction>
          <ProfileDialog
            title="Add a highlight"
            description="A short fact about you, e.g. “5+ years building React apps.”"
            trigger={<AddButton disabled={disabled}>Add</AddButton>}
            action={createHighlightAction}
            submitLabel="Add"
            disabled={disabled}
          >
            <TextFields id="highlight-new" label="Highlight" maxLength={300} />
          </ProfileDialog>
        </CardAction>
      </CardHeader>
      <CardContent>
        {profile.highlights.length === 0 ? (
          <p className="text-sm text-muted-foreground">No highlights yet.</p>
        ) : (
          <ul className="space-y-2">
            {profile.highlights.map((highlight) => (
              <li key={highlight.id} className="flex items-start justify-between gap-3 text-sm">
                <span className="flex flex-wrap items-center gap-2">
                  {highlight.text}
                  <SourceBadge source={highlight.source} />
                </span>
                {!disabled && (
                  <span className="flex shrink-0">
                    <ProfileDialog
                      title="Edit highlight"
                      trigger={<EditButton label="Edit highlight" />}
                      action={updateHighlightAction}
                      submitLabel="Save"
                      disabled={disabled}
                    >
                      <TextFields
                        id={`highlight-${highlight.id}`}
                        hidden={{ id: highlight.id }}
                        label="Highlight"
                        defaultValue={highlight.text}
                        maxLength={300}
                      />
                    </ProfileDialog>
                    <DeleteButton
                      id={highlight.id}
                      action={deleteHighlightAction}
                      label="Delete highlight"
                      confirmText="Delete this highlight?"
                      disabled={disabled}
                    />
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ---- Skills ----

function SkillsCard({ profile, disabled }: { profile: Profile; disabled: boolean }) {
  // Grouped by category, in the order categories first appear.
  const groups = new Map<string, ProfileSkill[]>();
  for (const skill of profile.skills) {
    const category = skill.category ?? "Other";
    groups.set(category, [...(groups.get(category) ?? []), skill]);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Skills</CardTitle>
        <CardDescription>
          Levels are never printed on your resume; they decide what tailoring puts first, and what it
          leaves out. “No context” skills can be listed but not claimed in a summary or bullet.
        </CardDescription>
        <CardAction>
          <ProfileDialog
            title="Add a skill"
            trigger={<AddButton disabled={disabled}>Add</AddButton>}
            action={createSkillAction}
            submitLabel="Add"
            disabled={disabled}
          >
            <SkillFields />
          </ProfileDialog>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-5">
        {groups.size === 0 && <p className="text-sm text-muted-foreground">No skills yet.</p>}
        {[...groups].map(([category, skills]) => (
          <section key={category} className="space-y-2">
            <h3 className="text-sm font-medium">{category}</h3>
            <ul className="divide-y rounded-md border">
              {skills.map((skill) => (
                <SkillRow key={skill.id} skill={skill} profile={profile} disabled={disabled} />
              ))}
            </ul>
          </section>
        ))}
      </CardContent>
    </Card>
  );
}

function SkillRow({ skill, profile, disabled }: { skill: ProfileSkill; profile: Profile; disabled: boolean }) {
  return (
    <li className="flex items-start justify-between gap-3 px-3 py-2 text-sm">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{skill.name}</span>
          {skill.proficiency && <Badge>{PROFICIENCY_LABELS[skill.proficiency]}</Badge>}
          {skill.experience && <Badge>{EXPERIENCE_LABELS[skill.experience]}</Badge>}
          <SourceBadge source={skill.source} />
          {!skillHasContext(skill, profile) && <Badge tone="warning">No context</Badge>}
        </div>
        {skill.aliases.length > 0 && (
          <p className="text-xs text-muted-foreground">Also: {skill.aliases.join(", ")}</p>
        )}
        {skill.note && <p className="text-xs text-muted-foreground">{skill.note}</p>}
      </div>
      {!disabled && (
        <span className="flex shrink-0">
          <ProfileDialog
            title={`Edit ${skill.name}`}
            trigger={<EditButton label={`Edit ${skill.name}`} />}
            action={updateSkillAction}
            submitLabel="Save"
            disabled={disabled}
          >
            <SkillFields skill={skill} />
          </ProfileDialog>
          <DeleteButton
            id={skill.id}
            action={deleteSkillAction}
            label={`Delete ${skill.name}`}
            confirmText={`Delete ${skill.name} from your profile?`}
            disabled={disabled}
          />
        </span>
      )}
    </li>
  );
}

// ---- Entries ----

function EntriesSection({ profile, disabled }: { profile: Profile; disabled: boolean }) {
  // Grouped by resume section, in the order sections first appear.
  const sections = new Map<string, ProfileEntry[]>();
  for (const entry of profile.entries) {
    sections.set(entry.section, [...(sections.get(entry.section) ?? []), entry]);
  }
  const sectionNames = [...sections.keys()];

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-semibold">Experience, projects, and education</h2>
          <p className="text-sm text-muted-foreground">
            Entries marked “Not on resume” aren&apos;t in your .tex; tailoring can add them when they fit a job.
          </p>
        </div>
        <ProfileDialog
          title="Add an entry"
          description="A job, project, school, or anything else with a heading and bullets."
          trigger={<AddButton disabled={disabled}>Add entry</AddButton>}
          action={createEntryAction}
          submitLabel="Add"
          disabled={disabled}
        >
          <EntryFields sections={sectionNames} />
        </ProfileDialog>
      </div>

      {sections.size === 0 && <p className="text-sm text-muted-foreground">No entries yet.</p>}
      {[...sections].map(([section, entries]) => (
        <div key={section} className="space-y-3">
          <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">{section}</h3>
          {entries.map((entry) => (
            <EntryCard key={entry.id} entry={entry} sectionNames={sectionNames} disabled={disabled} />
          ))}
        </div>
      ))}
    </section>
  );
}

function EntryCard({
  entry,
  sectionNames,
  disabled,
}: {
  entry: ProfileEntry;
  sectionNames: string[];
  disabled: boolean;
}) {
  return (
    <Card size="sm">
      <CardHeader>
        {/* Under "Experience, projects, and education" (h2) and its section (h3). */}
        <CardTitle as="h4" className="flex flex-wrap items-center gap-2">
          {entryHeadingText(entry)}
          {entry.latexKey === null && <Badge tone="warning">Not on resume</Badge>}
          <SourceBadge source={entry.source} />
        </CardTitle>
        {entry.detail && <CardDescription>{entry.detail}</CardDescription>}
        {!disabled && (
          <CardAction className="flex">
            <ProfileDialog
              title="Edit entry"
              trigger={<EditButton label={`Edit ${entry.title}`} />}
              action={updateEntryAction}
              submitLabel="Save"
              disabled={disabled}
            >
              <EntryFields entry={entry} sections={sectionNames} />
            </ProfileDialog>
            <DeleteButton
              id={entry.id}
              action={deleteEntryAction}
              label={`Delete ${entry.title}`}
              confirmText={`Delete “${entry.title}” and its ${entry.bullets.length} bullet(s) from your profile?`}
              disabled={disabled}
            />
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {entry.bullets.length > 0 && (
          <ul className="space-y-1.5">
            {entry.bullets.map((bullet) => (
              <li key={bullet.id} className="flex items-start justify-between gap-3 text-sm">
                {/* The dot gets its own column, so a long bullet wraps
                    under its text rather than leaving the dot alone on a line. */}
                <span className="flex min-w-0 gap-2">
                  <span aria-hidden>•</span>
                  <span className="min-w-0">
                    {bullet.text}
                    {bullet.source !== "resume" && " "}
                    <SourceBadge source={bullet.source} />
                  </span>
                </span>
                {!disabled && (
                  <span className="flex shrink-0">
                    <ProfileDialog
                      title="Edit bullet"
                      trigger={<EditButton label="Edit bullet" />}
                      action={updateBulletAction}
                      submitLabel="Save"
                      disabled={disabled}
                    >
                      <TextFields
                        id={`bullet-${bullet.id}`}
                        hidden={{ id: bullet.id }}
                        label="Bullet"
                        defaultValue={bullet.text}
                        maxLength={500}
                      />
                    </ProfileDialog>
                    <DeleteButton
                      id={bullet.id}
                      action={deleteBulletAction}
                      label="Delete bullet"
                      confirmText="Delete this bullet?"
                      disabled={disabled}
                    />
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        {!disabled && (
          <ProfileDialog
            title="Add a bullet"
            description={`For ${entry.title}. Write what you did in your own words; tailoring may lightly reword it, never invent it.`}
            trigger={
              <Button variant="ghost" size="xs">
                <PlusIcon />
                Add bullet
              </Button>
            }
            action={createBulletAction}
            submitLabel="Add"
            disabled={disabled}
          >
            <TextFields id={`bullet-new-${entry.id}`} hidden={{ entryId: entry.id }} label="Bullet" maxLength={500} />
          </ProfileDialog>
        )}
      </CardContent>
    </Card>
  );
}
