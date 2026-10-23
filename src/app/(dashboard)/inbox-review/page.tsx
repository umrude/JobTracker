import Link from "next/link";
import { z } from "zod";
import { MailIcon, TriangleAlertIcon } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MaybeDisabledTooltip } from "@/components/demo-tooltip";
import { isWritable } from "@/server/mode";
import { requireSession } from "@/server/require-session";
import { getGmailStatus, type GmailStatus } from "@/server/db/gmail-connections";
import { countUnclassified, listPendingSuggestions, listRecentlyDecided } from "@/server/db/email-events";
import { listApplicationSummaries } from "@/server/db/applications";
import { listSavedJobs } from "@/server/db/jobs";
import type { SuggestionRow } from "@/server/db/email-event-store";
import { matchByClassifier, matchEmail } from "@/lib/email/matching";
import { EMAIL_TYPE_LABELS } from "@/lib/schemas/email";
import { STATUS_LABELS } from "@/lib/schemas/status";
import { GMAIL_NOTICE_TEXT, parseGmailNotice } from "@/lib/email/connect-notices";
import { MAX_LOOKBACK_DAYS } from "@/lib/email/sync-window";
import { cn } from "@/lib/utils";
import { connectGmailAction, disconnectGmailAction } from "./actions";
import { SyncStartForm } from "./_components/sync-start-form";
import { SyncButton } from "./_components/sync-button";
import { SuggestionCard } from "./_components/suggestion-card";
import { LinkChoicesProvider, type LinkOption } from "./_components/link-choices";
import { formatDateTime, formatUtcDate } from "@/lib/format";


// "YYYY-MM-DD" in UTC, as <input type="date"> wants. Sync dates are whole
// UTC days (see sync-window.ts).
const isoDay = (date: Date) => date.toISOString().slice(0, 10);

type Choice = { value: string; label: string; company: string; title: string };

// Suggestions shown at first, and added per "Show more".
const PAGE_SIZE = 25;
const showSchema = z.coerce.number().int().min(PAGE_SIZE).max(5000).catch(PAGE_SIZE);

const strip = ({ value, label }: Choice): LinkOption => ({ value, label });

// One email's likely matches, listed first in its link picker: the same
// matching sync uses, run on what's stored (sender, subject, snippet, and
// the company and role the classifier read). Two near-identical roles at
// one company end up side by side at the top. Every other choice comes
// from the page's shared list.
function likelyMatches(row: SuggestionRow, all: Choice[]): LinkOption[] {
  let likely: Choice[] = [];
  if (row.source === "email") {
    const email = {
      id: String(row.id),
      threadId: "",
      fromAddress: row.fromAddress ?? "",
      fromName: row.fromName ?? "",
      subject: row.subject ?? "",
      snippet: row.snippet ?? "",
      receivedAt: row.receivedAt ?? row.createdAt,
      labels: [],
    };
    const byHeaders = matchEmail(email, all, undefined);
    const match =
      byHeaders.target === null
        ? matchByClassifier({ company: row.extractedCompany, role: row.extractedRole }, all, byHeaders.candidates)
        : byHeaders;
    likely = match.target ? [match.target] : match.candidates;
  }
  return likely.map(strip);
}

// A Server Component: the connection and the suggestions are read at
// render time. Only the buttons, the link picker, and the start date are
// Client Components.
export default async function InboxReviewPage({ searchParams }: PageProps<"/inbox-review">) {
  await requireSession();

  const { gmail, show } = await searchParams;
  const showCount = showSchema.parse(show);
  const notice = parseGmailNotice(gmail);
  const status = await getGmailStatus();
  const writable = isWritable();
  const [pending, decided, applications, savedJobs, unclassified] = await Promise.all([
    listPendingSuggestions(),
    listRecentlyDecided(),
    listApplicationSummaries(),
    listSavedJobs(),
    countUnclassified(),
  ]);
  const byLabel = (a: Choice, b: Choice) => a.label.localeCompare(b.label);
  const appChoices: Choice[] = applications
    .map((app) => ({ value: `app:${app.id}`, label: `${app.company} · ${app.title}`, company: app.company, title: app.title }))
    .sort(byLabel);
  const jobChoices: Choice[] = savedJobs
    .map((job) => ({ value: `job:${job.id}`, label: `${job.company} · ${job.title}`, company: job.company, title: job.title }))
    .sort(byLabel);
  const gmailAccount = status.kind === "connected" ? status.email : null;
  const allChoices = [...appChoices, ...jobChoices];
  const visible = pending.slice(0, showCount);

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Inbox review</h1>
        <p className="text-sm text-muted-foreground">
          Email about your applications becomes suggestions here. Nothing changes until you confirm it.
        </p>
      </div>

      {notice && (
        <p
          role={GMAIL_NOTICE_TEXT[notice].tone === "error" ? "alert" : "status"}
          className={cn(
            "rounded-md border px-3 py-2 text-sm",
            GMAIL_NOTICE_TEXT[notice].tone === "error" ? "border-destructive/40 text-destructive" : "text-muted-foreground",
          )}
        >
          {GMAIL_NOTICE_TEXT[notice].text}
        </p>
      )}

      <GmailCard status={status} writable={writable} />

      {unclassified > 0 && (
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-dashed p-4">
          <div className="space-y-1 text-sm">
            <p className="font-medium">
              {unclassified} {unclassified === 1 ? "email" : "emails"} couldn&apos;t be classified
            </p>
            <p className="text-muted-foreground">
              For example while the Anthropic account was out of credits. Classify them again to get their
              suggestions; nothing is re-read from your inbox except their text.
            </p>
          </div>
          <SyncButton
            endpoint="/api/sync/reclassify"
            label="Classify again"
            pendingLabel="Classifying..."
            variant="outline"
            disabled={!writable}
            disabledMessage="Disabled in demo mode"
          />
        </div>
      )}

      <section className="space-y-2">
        <h2 className="font-medium">To review{pending.length > 0 ? ` (${pending.length})` : ""}</h2>
        {pending.length === 0 ? (
          <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            Nothing to review. Sync to check for new email.
          </p>
        ) : (
          <LinkChoicesProvider applications={appChoices.map(strip)} savedJobs={jobChoices.map(strip)}>
          <ul className="grid gap-2">
            {visible.map((row) => (
              <li key={row.id}>
                <SuggestionCard
                  row={row}
                  likely={likelyMatches(row, allChoices)}
                  gmailAccount={gmailAccount}
                  writable={writable}
                />
              </li>
            ))}
          </ul>
          {pending.length > visible.length && (
            // A link, not a client button: the server renders the next
            // page of cards, so only what's on screen is ever sent.
            <Link
              href={`/inbox-review?show=${showCount + PAGE_SIZE}`}
              scroll={false}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Show {Math.min(PAGE_SIZE, pending.length - visible.length)} more ({pending.length - visible.length} not shown)
            </Link>
          )}
          </LinkChoicesProvider>
        )}
      </section>

      {decided.length > 0 && (
        <details className="rounded-xl border bg-card p-4 text-sm">
          <summary className="cursor-pointer font-medium">Recently reviewed</summary>
          <ul className="mt-3 space-y-1.5">
            {decided.map((row) => (
              <li key={row.id} className="flex flex-wrap gap-x-2 text-muted-foreground">
                <span className="text-foreground">
                  {row.source === "ghosted" ? `Ghosted? ${row.company ?? ""}` : row.subject || "(no subject)"}
                </span>
                <span>
                  · {row.emailType ? EMAIL_TYPE_LABELS[row.emailType] : row.source === "ghosted" ? "Ghosted rule" : "Unclassified"}
                </span>
                <span>
                  ·{" "}
                  {row.state === "confirmed" && row.proposedStatus
                    ? `moved to ${STATUS_LABELS[row.proposedStatus]}`
                    : row.decidedAt && row.decidedAt.getTime() === row.createdAt.getTime()
                      ? "filed away automatically"
                      : "dismissed"}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function GmailCard({ status, writable }: { status: GmailStatus; writable: boolean }) {
  if (status.kind === "demo") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MailIcon className="size-4" /> Demo inbox
          </CardTitle>
          <CardDescription>
            Demo mode reads a set of sample emails instead of Gmail, and never contacts Google. Connecting a real
            inbox is off here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SyncButton disabled={!writable} disabledMessage="The demo inbox is already synced; the read-only demo can't sync again." />
        </CardContent>
      </Card>
    );
  }

  if (status.kind === "none") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MailIcon className="size-4" /> Connect Gmail
          </CardTitle>
          <CardDescription>Find replies to your applications without reading through your inbox.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Read-only access: the app can&apos;t send, delete, or change anything.</li>
            <li>Only the sender, subject, and Gmail&apos;s preview are kept. Email bodies are read when needed and never stored.</li>
            <li>Disconnect any time; that also revokes access at Google.</li>
          </ul>
          <ConnectButton label="Connect Gmail" writable={writable} />
        </CardContent>
      </Card>
    );
  }

  const today = new Date();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MailIcon className="size-4" /> Gmail: {status.email}
        </CardTitle>
        <CardDescription>
          Connected {formatDateTime(status.connectedAt)} ·{" "}
          {status.lastSyncedAt ? `last synced ${formatDateTime(status.lastSyncedAt)}` : "not synced yet"}
        </CardDescription>
        <CardAction>
          <form action={disconnectGmailAction}>
            <MaybeDisabledTooltip disabled={!writable} message="Disabled in demo mode">
              <Button type="submit" variant="outline" size="sm" disabled={!writable}>
                Disconnect
              </Button>
            </MaybeDisabledTooltip>
          </form>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        {!status.needsReconnect && <SyncButton disabled={!writable} disabledMessage="Disabled in demo mode" />}
        {status.needsReconnect && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/40 px-3 py-2">
            <p className="flex items-center gap-2 text-sm text-destructive">
              <TriangleAlertIcon className="size-4 shrink-0" />
              Google no longer accepts this connection, so syncing is paused. Your suggestions are still here.
            </p>
            <ConnectButton label="Reconnect Gmail" writable={writable} />
          </div>
        )}
        {status.synced ? (
          <p className="text-sm text-muted-foreground">
            Synced from {formatUtcDate(status.syncStartAt)}. Each sync now fetches only new email.
          </p>
        ) : (
          <SyncStartForm
            value={isoDay(status.syncStartAt)}
            min={isoDay(new Date(today.getTime() - MAX_LOOKBACK_DAYS * 24 * 60 * 60 * 1000))}
            max={isoDay(today)}
          />
        )}
        {!status.synced && !status.startChosen && (
          <p className="text-xs text-muted-foreground">
            The default is a week before your earliest application, at most six months back.
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          While your Google Cloud app is in Testing, Google ends the connection after 7 days; you&apos;ll see a
          Reconnect button when that happens.
        </p>
      </CardContent>
    </Card>
  );
}

function ConnectButton({ label, writable }: { label: string; writable: boolean }) {
  return (
    <form action={connectGmailAction}>
      <MaybeDisabledTooltip disabled={!writable} message="Disabled in demo mode">
        <Button type="submit" size="sm" disabled={!writable}>
          {label}
        </Button>
      </MaybeDisabledTooltip>
    </form>
  );
}
