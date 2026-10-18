import { z } from "zod";

// Forms submit "" for an empty optional field, not undefined. Normalize
// before validating so an untouched URL/notes field doesn't fail url() or
// get stored as an empty string.
const emptyToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

export const optionalUrl = z.preprocess(
  emptyToUndefined,
  z.string().url().optional(),
);

export function optionalText(maxLength?: number, message?: string) {
  const base = z.string();
  return z.preprocess(
    emptyToUndefined,
    (maxLength === undefined ? base : base.max(maxLength, message)).optional(),
  );
}

// Ids arrive from FormData as strings.
export const idSchema = z.coerce.number().int().positive();
