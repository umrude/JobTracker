import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, BadgeCheckIcon, ExternalLinkIcon, FileTextIcon, GitCompareArrowsIcon, PencilIcon } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusPill } from "@/components/status-pill";
import { CompanyAvatar } from "@/components/company-avatar";
import { requireSession } from "@/server/require-session";
import { isWritable } from "@/server/mode";
import { getApplicationDetails, getStatusHistory } from "@/server/db/applications";
import { listEmailsForApplication } from "@/server/db/email-events";
import type { ApplicationEmail } from "@/server/db/email-event-store";
import { getLatestComparison } from "@/server/comparisons";
import { idSchema } from "@/lib/schemas/form";
import { EMAIL_TYPE_LABELS } from "@/lib/schemas/email";
import { formatDate, plural } from "@/lib/format";
import { ApplicationForm } from "../../board/_components/application-form";
import { Timeline } from "../_components/timeline";
import { InterviewList } from "../_components/interview-list";
import { AddInterviewDialog } from "../_components/add-interview-dialog";
import { listInterviews } from "@/server/db/today";

// One application, everything about it in one place: where it stands, how
// it got there (the status history, docs/status-history.md), the emails
// about it, and the way to its comparison and tailored resume.
//
// A Server Component that only reads. The one client piece is the edit
// dialog shared with the board, which loads its own details when opened.
export default async function ApplicationPage({ params }: PageProps<"/applications/[id]">) {
  await requireSession();

  // Route params are untrusted strings from the URL.
  const parsedId = idSchema.safeParse((await params).id);
  if (!parsedId.success) notFound();

  const application = await getApplicationDetails(parsedId.data);
  if (!application) notFound();

  const [history, emails, comparison, interviews] = await Promise.all([
    getStatusHistory(application.id),
    listEmailsForApplication(application.id),
    getLatestComparison(application.jobId),
    listInterviews(application.id),
  ]);
  const writable = isWritable();
  const now = new Date();
  const score = comparison?.status === "ok" ? comparison.comparison.score : null;

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <Link href="/board" className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-3.5" />
        Board
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <CompanyAvatar name={application.company} className="mt-1 size-10 text-sm" />
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight">{application.title}</h1>
            <p className="text-sm text-muted-foreground">
              {application.company}
              {application.url && (
                <>
                  {" · "}
                  <a
                    href={application.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 underline-offset-4 hover:underline"
                  >
                    View listing
                    <ExternalLinkIcon className="size-3" />
                  </a>
                </>
              )}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <StatusPill status={application.status} />
              {application.appliedAt && <span>Applied {formatDate(application.appliedAt)}</span>}
              {application.followedUpAt && <span>Followed up {formatDate(application.followedUpAt)}</span>}
              {application.passedScreening && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 font-medium text-emerald-800 dark:text-emerald-300">
                  <BadgeCheckIcon className="size-3" />
                  Passed screening
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/compare/${application.jobId}`} className={buttonVariants({ variant: "outline" })}>
            <GitCompareArrowsIcon />
            {score === null ? "Comparison" : `Comparison · ${score}`}
          </Link>
          <Link href={`/apply/${application.jobId}`} className={buttonVariants({ variant: "outline" })}>
            <FileTextIcon />
            Prepare application
          </Link>
          <ApplicationForm
            mode="edit"
            applicationId={application.id}
            company={application.company}
            disabled={!writable}
            afterDelete="/board"
            trigger={
              <Button disabled={!writable}>
                <PencilIcon />
                Edit
              </Button>
            }
          />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>History</CardTitle>
              <CardDescription>Every status it&apos;s had, when, and what moved it.</CardDescription>
            </CardHeader>
            <CardContent>
              <Timeline history={history} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Emails</CardTitle>
              <CardDescription>
                {emails.length === 0
                  ? "No emails linked to this application."
                  : `${plural(emails.length, "email")} about this application, newest first.`}
              </CardDescription>
            </CardHeader>
            {emails.length > 0 && (
              <CardContent>
                <ul className="divide-y">
                  {emails.map((email) => (
                    <EmailRow key={email.id} email={email} />
                  ))}
                </ul>
              </CardContent>
            )}
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Interviews</CardTitle>
              <CardAction>
                <AddInterviewDialog applicationId={application.id} disabled={!writable} />
              </CardAction>
            </CardHeader>
            <CardContent>
              <InterviewList interviews={interviews} now={now} writable={writable} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Notes</CardTitle>
            </CardHeader>
            <CardContent>
              {application.notes ? (
                <p className="text-sm whitespace-pre-wrap">{application.notes}</p>
              ) : (
                <p className="text-sm text-muted-foreground">No notes.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Listing</CardTitle>
              {!application.listingText && (
                <CardDescription>None yet, so it isn&apos;t compared or counted in insights. Add it with Edit.</CardDescription>
              )}
            </CardHeader>
            {application.listingText && (
              <CardContent>
                {/* Focusable, so the keyboard can scroll it. */}
                <div
                  tabIndex={0}
                  role="region"
                  aria-label="Listing text"
                  className="max-h-96 overflow-y-auto rounded-md border p-3 text-sm whitespace-pre-wrap outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {application.listingText}
                </div>
              </CardContent>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

const STATE_LABELS: Record<ApplicationEmail["state"], string> = {
  pending: "Waiting in Inbox",
  confirmed: "Confirmed",
  dismissed: "Dismissed",
};

function EmailRow({ email }: { email: ApplicationEmail }) {
  return (
    <li className="space-y-1 py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        {email.emailType && <span className="rounded-full border px-2 py-0.5 font-medium text-foreground">{EMAIL_TYPE_LABELS[email.emailType]}</span>}
        {email.receivedAt && <time dateTime={email.receivedAt.toISOString()}>{formatDate(email.receivedAt)}</time>}
        <span>·</span>
        {email.state === "pending" ? (
          <Link href="/inbox-review" className="underline underline-offset-4 hover:text-foreground">
            {STATE_LABELS.pending}
          </Link>
        ) : (
          <span>{STATE_LABELS[email.state]}</span>
        )}
      </div>
      <h3 className="text-sm font-medium break-words">{email.subject || "(no subject)"}</h3>
      {(email.fromName || email.fromAddress) && (
        <p className="text-xs text-muted-foreground">From {email.fromName || email.fromAddress}</p>
      )}
      {email.snippet && <p className="line-clamp-2 text-sm text-muted-foreground">{email.snippet}</p>}
    </li>
  );
}
