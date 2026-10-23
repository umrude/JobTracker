import { defineConfig, devices } from "@playwright/test";

// End-to-end tests run against the read-only demo (DEMO_MODE=true): seeded,
// fake data, no sign-in, and no external calls, so they need no secrets.
// In CI the server is the production build (the workflow builds first);
// locally it's the dev server, on its own port so it doesn't clash with
// yours. Seeding first makes every run start from the same data.
const PORT = 3100;
const CI = Boolean(process.env.CI);

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  reporter: CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `pnpm db:seed && pnpm ${CI ? "start" : "dev"} --port ${PORT}`,
    url: `http://localhost:${PORT}/board`,
    // Locally, reuse a demo server you already started on this port.
    reuseExistingServer: !CI,
    env: { DEMO_MODE: "true" },
    timeout: 120_000,
  },
});
