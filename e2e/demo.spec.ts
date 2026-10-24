import { expect, test } from "@playwright/test";

// The main flows through the public demo, as a visitor would use it. The
// demo is read-only and seeded with fake data (src/server/db/seed.ts), so
// these tests can name seeded companies and expect them to be there.

test("the app opens on Today: interviews, follow-ups, and the week", async ({ page, request }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.getByRole("heading", { level: 1, name: "Today" })).toBeVisible();

  await expect(page.getByRole("link", { name: "Technical: QA Automation Engineer at Marrow Biotech" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 3, name: "Backend Engineer (Node.js) at Cobalt Harbor" })).toBeVisible();
  // Read-only demo: the nudge is shown, but following up is disabled.
  await expect(page.getByRole("button", { name: "I followed up" }).first()).toBeDisabled();

  // Each interview downloads as a calendar file.
  const href = await page.getByRole("link", { name: "Add to calendar: the interview with Marrow Biotech" }).getAttribute("href");
  const ics = await request.get(href ?? "");
  expect(ics.status()).toBe(200);
  expect(ics.headers()["content-type"]).toContain("text/calendar");
  expect(await ics.text()).toContain("SUMMARY:Technical: QA Automation Engineer at Marrow Biotech");
});

test("the board shows seeded applications and filters them", async ({ page }) => {
  await page.goto("/board");
  await expect(page.getByRole("heading", { name: "Applications" })).toBeVisible();
  await expect(page.getByText("Fenwick & Vale").first()).toBeVisible();

  await page.getByRole("searchbox", { name: "Filter cards by company or role" }).fill("Fenwick");
  await expect(page.getByRole("status").filter({ hasText: /^\d+ of \d+ applications$/ })).toBeVisible();
  await expect(page.getByText("Fenwick & Vale").first()).toBeVisible();
  await expect(page.getByText("Cobalt Harbor")).toHaveCount(0);
});

test("the demo is read-only and has no sign-in", async ({ page, request }) => {
  await page.goto("/board");
  await expect(page.getByText("Read-only demo with sample data.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add application" })).toBeDisabled();

  // Writes are refused on the server, not just disabled in the UI.
  const sync = await request.post("/api/sync");
  expect(sync.status()).toBe(403);
  expect(await sync.json()).toMatchObject({ ok: false });
  // Nothing to sign in to: the login page sends you to Today, and the
  // auth routes don't exist (the demo has no AUTH_SECRET).
  await page.goto("/login");
  await expect(page).toHaveURL(/\/today$/);
  expect((await request.get("/api/auth/session")).status()).toBe(404);
});

test("PDFs are served pre-built, never compiled", async ({ page, request }) => {
  await page.goto("/resume");
  const href = await page.getByRole("link", { name: "View PDF" }).first().getAttribute("href");
  expect(href).toMatch(/^\/api\/resumes\/\d+\/pdf$/);
  const response = await request.get(href ?? "");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toBe("application/pdf");
});

test("search finds a company and opens it", async ({ page }) => {
  await page.goto("/board");
  const search = page.getByRole("combobox", { name: "Search applications and saved jobs" });
  await search.fill("Northwind");
  const result = page.getByRole("option").filter({ hasText: "Northwind Robotics" }).first();
  await expect(result).toBeVisible();
  await result.click();
  await expect(page).not.toHaveURL(/\/board$/);
  await expect(page.getByText("Northwind Robotics").first()).toBeVisible();
});

test("a comparison leads to a tailored resume checked for honesty", async ({ page }) => {
  await page.goto("/compare");
  await page.locator("a[href^='/compare/']", { hasText: "Northwind" }).first().click();

  await expect(page.getByRole("heading", { name: "Senior Frontend Engineer" })).toBeVisible();
  await expect(page.getByText("Match score for resume v2")).toBeVisible();
  await expect(page.getByText("Gaps", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Prepare application" }).click();
  await expect(page.getByRole("heading", { name: "Prepare application" })).toBeVisible();
  // The seeded draft contains one deliberate violation, which the checker
  // reverts and reports (docs/tailored-resumes.md, "Demo").
  await expect(page.getByText("The honesty check changed one thing before showing you this")).toBeVisible();
});

test("a card opens its application's page, with its history and emails", async ({ page }) => {
  await page.goto("/board");
  await page.getByRole("link", { name: "Site Reliability Engineer" }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Site Reliability Engineer" })).toBeVisible();
  const history = page.getByRole("list").filter({ hasText: "Moved to Offer" });
  await expect(history.getByText("Applied", { exact: true })).toBeVisible();
  await expect(history.getByText(/From an email: “Interview availability/)).toBeVisible();
  await expect(page.getByRole("heading", { level: 3, name: "Offer letter: Site Reliability Engineer" })).toBeVisible();

  // And its status pill on the comparison page leads back here.
  await page.getByRole("link", { name: /Comparison/ }).click();
  await page.getByRole("link", { name: "Offer" }).click();
  await expect(page).toHaveURL(/\/applications\/\d+$/);
});

test("email suggestions wait in the inbox for confirmation", async ({ page }) => {
  await page.goto("/inbox-review");
  await expect(page.getByRole("heading", { name: "Inbox review" })).toBeVisible();
  await expect(page.getByText(/^To review \(\d+\)$/)).toBeVisible();
  await expect(page.getByText("Ghosted rule").first()).toBeVisible();
});

test("insights load from the seeded history", async ({ page }) => {
  await page.goto("/insights");
  await expect(page.getByRole("heading", { name: "Insights" })).toBeVisible();
  await expect(page.getByText(/^\d+ listings analyzed$/)).toBeVisible();
  await expect(page.getByText("Most often missing")).toBeVisible();
});

test("the theme and the collapsed sidebar are remembered across reloads", async ({ page }) => {
  await page.goto("/board");
  await page.getByRole("radio", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveClass(/\bdark\b/);

  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await expect(page.getByRole("button", { name: "Expand sidebar" })).toBeVisible();

  await page.reload();
  await expect(page.locator("html")).toHaveClass(/\bdark\b/);
  await expect(page.getByRole("button", { name: "Expand sidebar" })).toBeVisible();
});
