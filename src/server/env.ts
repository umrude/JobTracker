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

export type Env = z.infer<typeof envSchema>;

export const env: Env = envSchema.parse(process.env);
