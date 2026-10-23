import { AxeBuilder } from "@axe-core/playwright";
import { devices, expect, test, type Page } from "@playwright/test";

// Every page of the demo, checked by axe-core against WCAG 2.1 A and AA in
// light and dark, and at phone size. axe catches what can be checked
// mechanically (contrast, names, roles, landmarks, headings); keyboard use
// and screen-reader wording are covered in docs/accessibility.md.
const PAGES = [
  "/board",
  "/saved",
  "/compare",
  "/compare/1", // a saved job's comparison
  "/compare/36", // an application's, with its status pill
  "/apply/1",
  "/applications/7", // an application's page: timeline and emails
  "/applications/10", // one the ghosted rule moved
  "/inbox-review",
  "/insights",
  "/resume",
  "/profile",
];

async function expectNoViolations(page: Page, route: string) {
  await page.goto(route);
  await page.waitForLoadState("networkidle");
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    // The dev-only Next.js badge isn't part of the app.
    .exclude("nextjs-portal")
    .analyze();
  // On failure, list what broke and where, not just a count.
  expect(violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(" ")).join(", ")})`)).toEqual([]);
}

for (const theme of ["light", "dark"] as const) {
  test.describe(`${theme} theme`, () => {
    test.use({ colorScheme: theme });
    for (const route of PAGES) {
      test(`${route} has no accessibility violations`, async ({ page }) => {
        await expectNoViolations(page, route);
      });
    }
  });
}

test.describe("phone", () => {
  // The device's size and touch settings, in the Chromium project (a
  // describe block can't switch browsers, which the full preset would).
  const { viewport, deviceScaleFactor, isMobile, hasTouch, userAgent } = devices["iPhone 13"];
  test.use({ viewport, deviceScaleFactor, isMobile, hasTouch, userAgent });
  for (const route of PAGES) {
    test(`${route} has no accessibility violations`, async ({ page }) => {
      await expectNoViolations(page, route);
    });
  }

  test("no page scrolls sideways", async ({ page }) => {
    for (const route of PAGES) {
      await page.goto(route);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, route).toBeLessThanOrEqual(0);
    }
  });
});

test("a skip link jumps past the navigation to the page", async ({ page }) => {
  await page.goto("/board");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to content" });
  await expect(skip).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("main#content")).toBeFocused();
});
