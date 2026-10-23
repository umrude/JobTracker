import { PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getMode, isWritable } from "@/server/mode";
import { requireSession } from "@/server/require-session";
import { listApplicationSummaries } from "@/server/db/applications";
import { Board } from "./_components/board";
import { ApplicationForm } from "./_components/application-form";

export default async function BoardPage({ searchParams }: PageProps<"/board">) {
  await requireSession();
  const { q } = await searchParams;
  const initialFilter = typeof q === "string" ? q.slice(0, 200) : "";

  const mode = await getMode();
  const writable = isWritable();
  // Controls are disabled only on a true read-only deployment. A
  // cookie-toggled local demo preview still shows the demo dataset but
  // stays writable, so developing/testing CRUD against it works normally.
  const disabled = !writable;
  const applications = await listApplicationSummaries();

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Applications</h1>
          {mode === "demo" && (
            <p className="text-sm text-muted-foreground">
              {writable
                ? "Previewing demo data (writable; resets when the server restarts)."
                : "Demo mode: browsing seeded data. Adding, editing, and moving cards is disabled."}
            </p>
          )}
        </div>
        <ApplicationForm
          mode="add"
          disabled={disabled}
          trigger={
            <Button disabled={disabled}>
              <PlusIcon />
              Add application
            </Button>
          }
        />
      </div>
      <Board initialApplications={applications} initialFilter={initialFilter} disabled={disabled} />
    </div>
  );
}
