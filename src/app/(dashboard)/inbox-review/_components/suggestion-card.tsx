import { ArrowRightIcon, ExternalLinkIcon } from "lucide-react";
import { EMAIL_TYPE_LABELS } from "@/lib/schemas/email";
import { STATUS_LABELS } from "@/lib/schemas/status";
import { CONFIDENT_AT } from "@/lib/email/propose";
import { cn } from "@/lib/utils";
import type { SuggestionRow } from "@/server/db/email-event-store";
import { DecisionButtons, LinkForm } from "./suggestion-actions";

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

// One suggestion. A Server Component: everything here is display, except
// the buttons and the link picker, which are small Client Components.
export function SuggestionCard({
  row,
  applications,
  gmailAccount,
  writable,
}: {
  row: SuggestionRow;
  applications: { id: number; label: string }[];
  // The connected Gmail address, for "Open in Gmail". Null in demo mode.
  gmailAccount: string | null;
  writable: boolean;
}) {
  const ghosted = row.source === "ghosted";
  const linked = row.applicationId !== null && row.company !== null;

  return (
    <article className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <TypeBadge row={row} />
          {row.receivedAt && <span className="text-muted-foreground">{dateFormat.format(row.receivedAt)}</span>}
          {row.matchMethod === "thread" && <span className="text-muted-foreground">· linked by thread</span>}
        </div>

        {ghosted ? (
          <p className="font-medium">
            No reply from {row.company} about {row.title}. Ghosted?
          </p>
        ) : (
          <>
            <p className="font-medium break-words">{row.subject || "(no subject)"}</p>
            <p className="text-sm text-muted-foreground">
              From {row.fromName || row.fromAddress}
              {row.fromName && row.fromAddress ? ` <${row.fromAddress}>` : ""}
            </p>
            {row.snippet && <p className="line-clamp-2 text-sm text-muted-foreground">{row.snippet}</p>}
          </>
        )}

        {row.reason && <p className="text-sm">{row.reason}</p>}

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          {linked ? (
            <span>
              {row.company} · {row.title}
              {row.currentStatus && <span className="text-muted-foreground"> (now {STATUS_LABELS[row.currentStatus]})</span>}
            </span>
          ) : (
            <span className="text-muted-foreground">Not linked to an application.</span>
          )}
          {row.proposedStatus && row.currentStatus && (
            <span className="inline-flex items-center gap-1 font-medium">
              {STATUS_LABELS[row.currentStatus]} <ArrowRightIcon className="size-3.5" /> {STATUS_LABELS[row.proposedStatus]}
            </span>
          )}
          {linked && !row.proposedStatus && row.emailType && row.emailType !== "not_relevant" && (
            <span className="text-muted-foreground">No status change: it&apos;s already there or past it.</span>
          )}
        </div>

        {!ghosted && (
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <LinkForm id={row.id} applications={applications} currentId={row.applicationId} disabled={!writable} />
            {gmailAccount && row.gmailMessageId && (
              <a
                href={`https://mail.google.com/mail/?authuser=${encodeURIComponent(gmailAccount)}#all/${row.gmailMessageId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:underline"
              >
                Open in Gmail <ExternalLinkIcon className="size-3.5" />
              </a>
            )}
          </div>
        )}
      </div>

      <DecisionButtons
        id={row.id}
        confirmLabel={row.proposedStatus ? `Move to ${STATUS_LABELS[row.proposedStatus]}` : null}
        dismissLabel={ghosted ? "Not ghosted" : row.proposedStatus ? "Dismiss" : "Got it"}
        disabled={!writable}
      />
    </article>
  );
}

function TypeBadge({ row }: { row: SuggestionRow }) {
  const base = "rounded-full border px-2 py-0.5 font-medium";
  if (row.source === "ghosted") return <span className={cn(base, "text-muted-foreground")}>Ghosted rule</span>;
  if (!row.emailType) return <span className={cn(base, "border-destructive/40 text-destructive")}>Couldn&apos;t classify</span>;
  const unsure = row.confidence !== null && row.confidence < CONFIDENT_AT;
  return (
    <span className={cn(base, unsure && "border-dashed")}>
      {EMAIL_TYPE_LABELS[row.emailType]}
      {row.confidence !== null && (
        <span className="font-normal text-muted-foreground">
          {" "}
          · {Math.round(row.confidence * 100)}%{unsure ? ", unsure" : ""}
        </span>
      )}
    </span>
  );
}
