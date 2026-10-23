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

// An empty "NAME=" line in .env counts as unset.
const optionalString = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === "" ? undefined : value), schema.optional());

const envShape = z.object({
  DEMO_MODE: booleanFromString,
  // Sign-in only: required in live mode (checked below), unused by the
  // public demo, which has no sign-in. So the demo deploys with no secrets.
  ALLOWED_EMAIL: optionalString(z.email()),
  AUTH_SECRET: optionalString(z.string().min(1)),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  // Optional at startup so demo mode and a fresh checkout boot without it.
  // The LLM client checks for it when a call is actually made and returns
  // a missing_api_key error the UI can show. An empty "ANTHROPIC_API_KEY="
  // line in .env counts as unset.
  ANTHROPIC_API_KEY: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().optional(),
  ),
  ANTHROPIC_MODEL: z.string().optional().default("claude-opus-5-5"),
  // Email classification: short, simple, and many per sync, so the fast,
  // low-cost model. `pnpm eval:classifier` measures it (docs/gmail-sync.md).
  ANTHROPIC_CLASSIFIER_MODEL: z.string().optional().default("claude-haiku-5-5"),
  // The Tectonic executable for compiling LaTeX resumes (live mode only).
  // "tectonic" works when it's on PATH; a full path avoids depending on
  // the PATH of whatever started the server.
  TECTONIC_PATH: z.string().optional().default("tectonic"),
  DATABASE_PATH: z.string().optional().default("./data/app.db"),
  // Where demo mode reads from. Only changed to measure performance against
  // a large generated database (pnpm perf:seed; docs/performance.md).
  DEMO_DATABASE_PATH: z.string().optional(),
  // Encrypts stored Gmail refresh tokens: 32 random bytes, base64. Optional
  // at startup like ANTHROPIC_API_KEY (demo mode never connects Gmail);
  // connecting checks for it. Validated here so a malformed key fails at
  // boot rather than halfway through connecting.
  TOKEN_ENCRYPTION_KEY: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z
      .string()
      .refine((value) => Buffer.from(value, "base64").length === 32, {
        message: "must be 32 random bytes, base64-encoded (see .env.example)",
      })
      .optional(),
  ),
  // Where the app is reached, for the Gmail OAuth redirect URI (which must
  // match the one registered with Google exactly).
  APP_URL: z.url().optional().default("http://localhost:3000"),
});

// Parsed once, in env.ts; tests use it directly.
export const envSchema = envShape.superRefine((value, ctx) => {
  if (value.DEMO_MODE) return;
  for (const key of ["ALLOWED_EMAIL", "AUTH_SECRET"] as const) {
    if (!value[key]) {
      ctx.addIssue({ code: "custom", path: [key], message: `${key} is required unless DEMO_MODE=true (see .env.example)` });
    }
  }
});

export type Env = z.infer<typeof envSchema>;
