import "server-only";
import { envSchema, type Env } from "@/server/env-schema";

// The single validated source of configuration. Parsed when first
// imported, so a bad or missing value fails at startup with a clear
// message rather than halfway through a request. The rules are in
// env-schema.ts.
export type { Env };

export const env: Env = envSchema.parse(process.env);
