import { PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getMode } from "@/server/mode";
import { listApplicationsWithJob } from "@/server/db/applications";
import { Board } from "./_components/board";
import { ApplicationForm } from "./_components/application-form";

export default function BoardPage() {
  const mode = getMode();
  const disabled = mode === "demo";
  const applications = listApplicationsWithJob();

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Applications</h1>
          {disabled && (
            <p className="text-sm text-muted-foreground">
              Demo mode: browsing seeded data. Adding, editing, and moving
              cards is disabled.
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
      <Board initialApplications={applications} disabled={disabled} />
    </div>
  );
}
