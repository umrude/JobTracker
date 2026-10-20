import { z } from "zod";

// What a form Server Action returns to useActionState. Validation failures
// come back as data, not thrown errors: a thrown error would hit the error
// boundary and lose what the person typed, while returned field errors can
// be shown next to the fields in a form that's still filled in.
export type FormState =
  | { status: "idle" }
  | { status: "success" }
  | {
      status: "error";
      message: string;
      fieldErrors: Partial<Record<string, string[]>>;
    };

// For actions that report an outcome as a sentence rather than per-field
// errors, e.g. "Added 12 skills and 3 entries."
export type MessageState =
  | { status: "idle" }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

export function validationError<T>(error: z.ZodError<T>): FormState {
  return {
    status: "error",
    message: "Please fix the highlighted fields.",
    fieldErrors: z.flattenError(error).fieldErrors,
  };
}

export function formError(message: string): FormState {
  return { status: "error", message, fieldErrors: {} };
}
