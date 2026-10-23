// Takes the README's screenshots from a running demo:
//
//   DEMO_MODE=true pnpm dev        (in one terminal)
//   pnpm screenshots               (in another)
//
// Demo mode only: the seeded data is fake, so the images are safe to
// commit. Rerun after a visible UI change. BASE_URL overrides the address.
import fs from "node:fs";
import path from "node:path";
import { chromium, type Page } from "@playwright/test";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const OUT_DIR = path.join(process.cwd(), "docs", "screenshots");
const VIEWPORT = { width: 1440, height: 900 };

// The dev-only Next.js badge isn't part of the app.
const HIDE_DEV_OVERLAY = "nextjs-portal { display: none !important; }";

async function open(page: Page, route: string) {
  await page.goto(BASE_URL + route, { waitUntil: "networkidle" });
  await page.addStyleTag({ content: HIDE_DEV_OVERLAY });
}

// The demo job with the richest comparison and a tailored resume draft.
async function showcaseJobId(page: Page): Promise<string> {
  await open(page, "/compare");
  const href = await page
    .locator("a[href^='/compare/']", { hasText: "Northwind" })
    .first()
    .getAttribute("href");
  if (!href) throw new Error("No Northwind comparison in the demo. Is this the demo (DEMO_MODE=true)?");
  return href.split("/").pop() ?? "";
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const theme of ["light", "dark"] as const) {
      const page = await browser.newPage({ viewport: VIEWPORT, colorScheme: theme });
      const shots: { name: string; route: string }[] =
        theme === "dark"
          ? [{ name: "board-dark", route: "/board" }]
          : [
              { name: "board", route: "/board" },
              { name: "comparison", route: `/compare/${await showcaseJobId(page)}` },
              { name: "tailored-resume", route: `/apply/${await showcaseJobId(page)}` },
              { name: "inbox", route: "/inbox-review" },
              { name: "insights", route: "/insights" },
            ];
      for (const { name, route } of shots) {
        await open(page, route);
        const file = path.join(OUT_DIR, `${name}.png`);
        await page.screenshot({ path: file });
        console.log(`${route} -> ${path.relative(process.cwd(), file)}`);
      }
      await page.close();
    }
  } finally {
    await browser.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
