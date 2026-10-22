import { cn } from "@/lib/utils";

// The line under a form or button saying how its Server Action went: the
// error (read out to screen readers as an alert), and, where it's useful,
// a success message. With `slow`, it says "This can take up to a minute."
// while the action runs (generating, comparing, tailoring).
//
// Takes both shapes actions return (FormState and MessageState): only the
// status and message are used.
type ActionState = { status: "idle" } | { status: "success"; message?: string } | { status: "error"; message: string };

export function ActionMessage({
  state,
  pending = false,
  slow = false,
  showSuccess = false,
  className,
}: {
  state: ActionState;
  pending?: boolean;
  slow?: boolean;
  showSuccess?: boolean;
  className?: string;
}) {
  if (pending) {
    return slow ? <p className={cn("text-xs text-muted-foreground", className)}>This can take up to a minute.</p> : null;
  }
  if (state.status === "error") {
    return (
      <p role="alert" className={cn("text-sm text-destructive", className)}>
        {state.message}
      </p>
    );
  }
  if (state.status === "success" && showSuccess && state.message) {
    return (
      <p role="status" className={cn("text-sm text-muted-foreground", className)}>
        {state.message}
      </p>
    );
  }
  return null;
}
