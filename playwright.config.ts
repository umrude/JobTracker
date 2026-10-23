import { defineConfig, devices } from "@playwright/test";

// End-to-end tests run against the read-only demo (DEMO_MODE=true): seeded,
// fake data, no sign-in, and no external calls, so they need no secrets.
// In CI the server is the production build (the workflow builds first);
// locally it's the dev server, on its own port so it doesn't clash with
// yours. The server reseeds the demo when it starts (src/instrumentation.ts),
// so every run starts from the same data.
//
// E2E_BASE_URL points the same tests at a deployed demo instead, with no
// local server: E2E_BASE_URL=https://job-tracker-demo-f7ye.onrender.com pnpm test:e2e
const PORT = 3100;
const CI = Boolean(process.env.CI);
const DEPLOYED = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  reporter: CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: DEPLOYED ?? `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: DEPLOYED
    ? undefined
    : {
        command: `pnpm ${CI ? "start" : "dev"} --port ${PORT}`,
        url: `http://localhost:${PORT}/board`,
        // Locally, reuse a demo server you already started on this port.
        reuseExistingServer: !CI,
        env: { DEMO_MODE: "true" },
        timeout: 120_000,
      },
});
