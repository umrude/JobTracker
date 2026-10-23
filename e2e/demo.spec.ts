import { expect, test } from "@playwright/test";

// The main flows through the public demo, as a visitor would use it. The
// demo is read-only and seeded with fake data (src/server/db/seed.ts), so
// these tests can name seeded companies and expect them to be there.

test("the board shows seeded applications and filters them", async ({ page }) => {
  await page.goto("/board");
  await expect(page.getByRole("heading", { name: "Applications" })).toBeVisible();
  await expect(page.getByText("Fenwick & Vale").first()).toBeVisible();

  await page.getByRole("searchbox", { name: "Filter cards by company or role" }).fill("Fenwick");
  await expect(page.getByRole("status").filter({ hasText: /^\d+ of \d+ applications$/ })).toBeVisible();
  await expect(page.getByText("Fenwick & Vale").first()).toBeVisible();
  await expect(page.getByText("Cobalt Harbor")).toHaveCount(0);
});

test("the demo is read-only", async ({ page }) => {
  await page.goto("/board");
  await expect(page.getByText("Read-only demo with sample data.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add application" })).toBeDisabled();
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
