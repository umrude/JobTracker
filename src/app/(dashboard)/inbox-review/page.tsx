import { MailIcon, TriangleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MaybeDisabledTooltip } from "@/components/demo-tooltip";
import { isWritable } from "@/server/mode";
import { requireSession } from "@/server/require-session";
import { getGmailStatus, type GmailStatus } from "@/server/db/gmail-connections";
import { listPendingSuggestions, listRecentlyDecided } from "@/server/db/email-events";
import { listApplicationsWithJob } from "@/server/db/applications";
import { EMAIL_TYPE_LABELS } from "@/lib/schemas/email";
import { STATUS_LABELS } from "@/lib/schemas/status";
import { GMAIL_NOTICE_TEXT, parseGmailNotice } from "@/lib/email/connect-notices";
import { MAX_LOOKBACK_DAYS } from "@/lib/email/sync-window";
import { cn } from "@/lib/utils";
import { connectGmailAction, disconnectGmailAction } from "./actions";
import { SyncStartForm } from "./_components/sync-start-form";
import { SyncButton } from "./_components/sync-button";
import { SuggestionCard } from "./_components/suggestion-card";

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });
const dateTimeFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });

// "YYYY-MM-DD" in UTC, as <input type="date"> wants. Sync dates are whole
// UTC days (see sync-window.ts).
const isoDay = (date: Date) => date.toISOString().slice(0, 10);

// A Server Component: the connection and the suggestions are read at
// render time. Only the buttons, the link picker, and the start date are
// Client Components.
export default async function InboxReviewPage({ searchParams }: PageProps<"/inbox-review">) {
  await requireSession();

  const { gmail } = await searchParams;
  const notice = parseGmailNotice(gmail);
  const status = await getGmailStatus();
  const writable = isWritable();
  const [pending, decided, applications] = await Promise.all([
    listPendingSuggestions(),
    listRecentlyDecided(),
    listApplicationsWithJob(),
  ]);
  const choices = applications
    .map((app) => ({ id: app.id, label: `${app.job.company} · ${app.job.title}` }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const gmailAccount = status.kind === "connected" ? status.email : null;

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div>
        <h1 className="text-xl font-semibold">Inbox review</h1>
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

      <section className="space-y-2">
        <h2 className="font-medium">To review{pending.length > 0 ? ` (${pending.length})` : ""}</h2>
        {pending.length === 0 ? (
          <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            Nothing to review. Sync to check for new email.
          </p>
        ) : (
          <ul className="grid gap-2">
            {pending.map((row) => (
              <li key={row.id}>
                <SuggestionCard row={row} applications={choices} gmailAccount={gmailAccount} writable={writable} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {decided.length > 0 && (
        <details className="rounded-lg border p-4 text-sm">
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
          Connected {dateTimeFormat.format(status.connectedAt)} ·{" "}
          {status.lastSyncedAt ? `last synced ${dateTimeFormat.format(status.lastSyncedAt)}` : "not synced yet"}
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
            Synced from {dateFormat.format(status.syncStartAt)}. Each sync now fetches only new email.
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
