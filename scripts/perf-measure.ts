// Measures each page of a running production build (docs/performance.md):
// server time, the size of a full page load (HTML), and the size of what a
// client-side navigation fetches (the RSC payload, requested the way the
// Next.js router does, with the "RSC: 1" header). Each page is fetched a
// few times and the median time reported.
//
//   pnpm perf:measure                      # http://localhost:3100
//   pnpm perf:measure --url http://localhost:3000 --runs 7
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: { url: { type: "string", default: "http://localhost:3100" }, runs: { type: "string", default: "5" } },
});
const RUNS = Math.max(1, Number(values.runs) || 5);
const PAGES = ["/board", "/saved", "/compare", "/inbox-review", "/insights", "/profile", "/resume"];

async function timed(path: string, headers: Record<string, string>): Promise<{ ms: number; bytes: number; status: number }> {
  const start = performance.now();
  const response = await fetch(`${values.url}${path}`, { headers });
  const body = await response.arrayBuffer();
  return { ms: performance.now() - start, bytes: body.byteLength, status: response.status };
}

const median = (numbers: number[]) => [...numbers].sort((a, b) => a - b)[Math.floor(numbers.length / 2)];
const kb = (bytes: number) => `${(bytes / 1024).toFixed(0)} KB`.padStart(8);

async function main() {
  console.log(`${"Page".padEnd(16)}${"Server".padStart(9)}${"HTML".padStart(9)}${"RSC".padStart(9)}`);
  for (const page of PAGES) {
    const html: Awaited<ReturnType<typeof timed>>[] = [];
    for (let i = 0; i < RUNS; i++) html.push(await timed(page, {}));
    const rsc = await timed(page, { RSC: "1" });
    if (html[0].status !== 200) {
      console.log(`${page.padEnd(16)} HTTP ${html[0].status}`);
      continue;
    }
    const ms = `${median(html.map((r) => r.ms)).toFixed(0)} ms`.padStart(9);
    console.log(`${page.padEnd(16)}${ms}${kb(html[0].bytes)}${kb(rsc.bytes)}`);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
