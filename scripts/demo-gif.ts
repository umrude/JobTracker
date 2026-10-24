// Records the README's demo GIF from a running demo:
//
//   DEMO_MODE=true pnpm dev        (in one terminal)
//   pnpm demo:gif                  (in another)
//
// Chrome's screencast (through Playwright's CDP session) streams PNG frames
// with timestamps as the page changes. They're resampled to a steady frame
// rate and encoded in plain JavaScript (pngjs, gifenc), so no ffmpeg is
// needed. To keep the file small, every frame after the first stores only
// the pixels that changed; the rest are transparent and show the frame
// before. Demo data only, so the GIF is safe to commit. BASE_URL overrides
// the address.
import fs from "node:fs";
import path from "node:path";
import { chromium, type Locator, type Page } from "@playwright/test";
import { PNG } from "pngjs";
import { applyPalette, GIFEncoder, quantize, type Color } from "gifenc";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const OUT_FILE = path.join(process.cwd(), "docs", "screenshots", "demo.gif");
const VIEWPORT = { width: 1280, height: 800 };
// The GIF's size: Chrome scales the frames down to fit.
const GIF_WIDTH = 960;
const GIF_HEIGHT = Math.round((GIF_WIDTH * VIEWPORT.height) / VIEWPORT.width);
const FPS = 10;
// How long the last frame stays up before the GIF loops.
const HOLD_LAST_MS = 2500;

type RawFrame = { png: Buffer; time: number };
type Frame = { png: Buffer; durationMs: number };

// Hides the dev-only Next.js badge, and draws a cursor (headless Chrome has
// none) that follows the mouse and pulses on click. Added after the page
// has hydrated: React drops nodes added to <body> before then. The rest of
// the recording navigates client-side, so they stay for the whole run.
// A string, not a function: tsx (esbuild) wraps named functions in a
// __name() helper that doesn't exist in the browser.
const DECORATE_PAGE = `(() => {
  const style = document.createElement("style");
  style.textContent = \`
    nextjs-portal { display: none !important; }
    #demo-cursor { position: fixed; z-index: 2147483647; pointer-events: none; width: 22px; height: 22px;
      left: 0; top: 0; transform: translate(-3px, -2px); transition: transform 80ms; }
    #demo-cursor.down { transform: translate(-3px, -2px) scale(0.85); }\`;
  document.head.appendChild(style);
  const cursor = document.createElement("div");
  cursor.id = "demo-cursor";
  cursor.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M4 2l15 11-6.5 1.2L16 21l-3 1.4-3.4-6.7L4 20z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  document.body.appendChild(cursor);
  document.addEventListener("mousemove", (event) => {
    cursor.style.left = event.clientX + "px";
    cursor.style.top = event.clientY + "px";
  });
  document.addEventListener("mousedown", () => cursor.classList.add("down"));
  document.addEventListener("mouseup", () => cursor.classList.remove("down"));
})()`;

const pause = (page: Page, ms: number) => page.waitForTimeout(ms);

// Glides the cursor to the element's center, then clicks it.
async function clickOn(page: Page, target: Locator) {
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (!box) throw new Error("Nothing to click: the element isn't visible.");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 18 });
  await pause(page, 200);
  await page.mouse.down();
  await pause(page, 90);
  await page.mouse.up();
}

async function scrollBy(page: Page, pixels: number, steps: number) {
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, pixels / steps);
    await pause(page, 70);
  }
}

// The story: Today, search, a comparison, the tailored resume with its
// honesty check, dark mode, and an application's history.
async function perform(page: Page) {
  // Today, where the app opens.
  await page.mouse.move(700, 450);
  await pause(page, 2500);

  const search = page.getByRole("combobox", { name: "Search applications and saved jobs" });
  await clickOn(page, search);
  await search.pressSequentially("Northwind", { delay: 110 });
  const result = page.getByRole("option").filter({ hasText: "Northwind Robotics" }).first();
  await result.waitFor();
  await pause(page, 900);
  await clickOn(page, result);
  await page.getByRole("heading", { name: "Senior Frontend Engineer" }).waitFor();
  await page.mouse.move(820, 420, { steps: 12 });
  await pause(page, 2800);

  await clickOn(page, page.getByRole("link", { name: "Prepare application" }));
  await page.getByText("The honesty check changed one thing before showing you this").waitFor();
  await pause(page, 2200);
  await scrollBy(page, 520, 10);
  await pause(page, 2200);
  await scrollBy(page, -520, 6);
  await pause(page, 500);

  await clickOn(page, page.getByRole("radio", { name: "Dark" }));
  await pause(page, 1200);
  await clickOn(page, page.getByRole("link", { name: "Board" }).first());
  await page.getByRole("heading", { name: "Applications" }).waitFor();
  await pause(page, 800);

  // An application's page: how it got to Offer.
  await clickOn(page, page.getByRole("link", { name: "Site Reliability Engineer" }));
  await page.getByRole("heading", { level: 1, name: "Site Reliability Engineer" }).waitFor();
  await page.mouse.move(900, 600, { steps: 12 });
  await pause(page, 2500);
}

async function record(): Promise<RawFrame[]> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: VIEWPORT, colorScheme: "light" });
    await page.goto(`${BASE_URL}/today`, { waitUntil: "networkidle" });
    await pause(page, 500);
    await page.evaluate(DECORATE_PAGE);

    const cdp = await page.context().newCDPSession(page);
    const frames: RawFrame[] = [];
    cdp.on("Page.screencastFrame", (event) => {
      frames.push({ png: Buffer.from(event.data, "base64"), time: event.metadata.timestamp ?? Date.now() / 1000 });
      void cdp.send("Page.screencastFrameAck", { sessionId: event.sessionId }).catch(() => {});
    });
    await cdp.send("Page.startScreencast", { format: "png", maxWidth: GIF_WIDTH, maxHeight: GIF_HEIGHT });

    await perform(page);

    await cdp.send("Page.stopScreencast");
    return frames;
  } finally {
    await browser.close();
  }
}

// Chrome sends a frame only when something changes, at uneven intervals.
// Resample to a steady rate (the latest frame at each tick), merging runs
// of the same frame into one longer one.
function resample(raw: RawFrame[]): Frame[] {
  if (raw.length === 0) throw new Error("No frames were captured.");
  const sorted = [...raw].sort((a, b) => a.time - b.time);
  const step = 1 / FPS;
  const frames: Frame[] = [];
  let next = 0;
  let current = sorted[0];
  for (let t = sorted[0].time; t <= sorted[sorted.length - 1].time; t += step) {
    while (next < sorted.length && sorted[next].time <= t) current = sorted[next++];
    const last = frames[frames.length - 1];
    if (last && last.png === current.png) last.durationMs += step * 1000;
    else frames.push({ png: current.png, durationMs: step * 1000 });
  }
  frames[frames.length - 1].durationMs += HOLD_LAST_MS;
  return frames;
}

function encode(frames: Frame[]): Uint8Array {
  const images = frames.map((frame) => PNG.sync.read(frame.png));
  const { width, height } = images[0];
  if (images.some((image) => image.width !== width || image.height !== height)) {
    throw new Error("Frames changed size mid-recording.");
  }

  // One palette for the whole GIF, from pixels sampled across it (light
  // and dark both), leaving the last slot for "unchanged".
  const samples = images.filter((_, i) => i % Math.max(1, Math.floor(images.length / 16)) === 0);
  const sample = new Uint8Array(samples.length * width * height * 4);
  samples.forEach((image, i) => sample.set(image.data, i * width * height * 4));
  const palette: Color[] = quantize(sample, 255);
  const unchanged = palette.length;
  const fullPalette = [...palette, [0, 0, 0]];

  const gif = GIFEncoder();
  let previous: Uint8Array | null = null;
  images.forEach((image, i) => {
    const index = applyPalette(image.data, palette);
    const delay = Math.round(frames[i].durationMs);
    if (!previous) {
      gif.writeFrame(index, width, height, { palette: fullPalette, delay, repeat: 0, dispose: 1 });
    } else {
      const diff = new Uint8Array(index.length);
      for (let p = 0; p < index.length; p++) diff[p] = index[p] === previous[p] ? unchanged : index[p];
      gif.writeFrame(diff, width, height, { delay, transparent: true, transparentIndex: unchanged, dispose: 1 });
    }
    previous = index;
  });
  gif.finish();
  return gif.bytes();
}

async function main() {
  const raw = await record();
  const frames = resample(raw);
  const bytes = encode(frames);
  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, bytes);
  const seconds = frames.reduce((sum, frame) => sum + frame.durationMs, 0) / 1000;
  console.log(
    `${path.relative(process.cwd(), OUT_FILE)}: ${frames.length} frames (from ${raw.length} captured), ` +
      `${seconds.toFixed(1)}s, ${(bytes.length / 1024 / 1024).toFixed(2)} MB`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
