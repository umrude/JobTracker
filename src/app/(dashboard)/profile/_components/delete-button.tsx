"use client";

import { useTransition } from "react";
import { Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";

// A small delete button with a confirmation. A Client Component only for
// window.confirm and the pending state. Hidden on the read-only demo
// (the actions refuse there anyway).
export function DeleteButton({
  id,
  action,
  label,
  confirmText,
  disabled,
}: {
  id: number;
  action: (formData: FormData) => Promise<void>;
  label: string;
  confirmText: string;
  disabled: boolean;
}) {
  const [pending, startTransition] = useTransition();
  if (disabled) return null;

  function handleClick() {
    if (!window.confirm(confirmText)) return;
    const formData = new FormData();
    formData.set("id", String(id));
    startTransition(() => action(formData));
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      aria-label={label}
      title={label}
      onClick={handleClick}
      disabled={pending}
    >
      <Trash2Icon />
    </Button>
  );
}
