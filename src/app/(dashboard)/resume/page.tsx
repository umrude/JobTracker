import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { MaybeDisabledTooltip } from "@/components/demo-tooltip";
import { getMode, isWritable } from "@/server/mode";
import { requireSession } from "@/server/require-session";
import { listResumes, type Resume } from "@/server/db/resumes";
import { ResumeUpload } from "./_components/resume-upload";
import { activateResumeAction } from "./actions";

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

// A Server Component: the versions are read from the database at render
// time. Only the upload/preview flow is a Client Component, since it
// holds the draft text in state between the parse and save steps.
export default async function ResumePage() {
  await requireSession();

  const mode = await getMode();
  const writable = isWritable();
  const resumes = await listResumes();
  const active = resumes.find((resume) => resume.isActive);

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div>
        <h1 className="text-xl font-semibold">Resume</h1>
        <p className="text-sm text-muted-foreground">
          {mode === "demo" && !writable
            ? "Demo mode: showing a sample resume. Uploading is disabled."
            : "The active version is what comparisons and cover letters use."}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Upload a new version</CardTitle>
          <CardDescription>
            Saving makes it the active version. Older versions stay in the
            history below.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResumeUpload disabled={!writable} />
        </CardContent>
      </Card>

      {active ? (
        <Card>
          <CardHeader>
            <CardTitle>Active: version {active.version}</CardTitle>
            <CardDescription>
              Saved {dateFormat.format(active.createdAt)}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="max-h-96 overflow-y-auto whitespace-pre-wrap rounded-md border p-3 font-mono text-xs">
              {active.text}
            </p>
          </CardContent>
        </Card>
      ) : (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No resume yet. Upload one to start comparing it against saved jobs.
        </p>
      )}

      {resumes.length > 1 && (
        <section className="space-y-2">
          <h2 className="font-medium">Version history</h2>
          <ul className="grid gap-2">
            {resumes.map((resume) => (
              <li key={resume.id}>
                <VersionRow resume={resume} disabled={!writable} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function VersionRow({ resume, disabled }: { resume: Resume; disabled: boolean }) {
  return (
    <details className="rounded-md border p-3 text-sm">
      <summary className="flex cursor-pointer items-center justify-between gap-4">
        <span>
          <span className="font-medium">Version {resume.version}</span>
          <span className="text-muted-foreground">
            {" "}
            · {dateFormat.format(resume.createdAt)} ·{" "}
            {resume.text.length.toLocaleString("en-US")} characters
          </span>
        </span>
        {resume.isActive ? (
          <span className="text-xs font-medium text-primary">Active</span>
        ) : (
          <form action={activateResumeAction}>
            <input type="hidden" name="id" value={resume.id} />
            <MaybeDisabledTooltip disabled={disabled} message="Disabled in demo mode">
              <Button type="submit" size="sm" variant="outline" disabled={disabled}>
                Make active
              </Button>
            </MaybeDisabledTooltip>
          </form>
        )}
      </summary>
      <p className="mt-2 max-h-80 overflow-y-auto whitespace-pre-wrap font-mono text-xs text-muted-foreground">
        {resume.text}
      </p>
    </details>
  );
}
