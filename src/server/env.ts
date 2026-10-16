import "server-only";
import { z } from "zod";

// Zod's z.coerce.boolean() treats any non-empty string (including "false") as
// true, since it just runs Boolean(value). Compare against the literal
// instead so DEMO_MODE=false actually means false.
const booleanFromString = z
  .string()
  .optional()
  .default("false")
  .transform((value) => value === "true");

const envSchema = z.object({
  DEMO_MODE: booleanFromString,
  ALLOWED_EMAIL: z.string().email(),
  AUTH_SECRET: z.string().min(1),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  DATABASE_PATH: z.string().optional().default("./data/app.db"),
});

export type Env = z.infer<typeof envSchema>;

export const env: Env = envSchema.parse(process.env);
