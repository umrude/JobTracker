// Compiles every LaTeX document the demo can show into committed PDFs,
// named by demoPdfKey(), so demo mode serves them without a TeX engine.
// Run `pnpm demo:pdfs` after changing the demo resume (or, later, its
// tailored fixtures), and commit the result. Needs Tectonic installed.
import fs from "node:fs";
import path from "node:path";
import { runTectonic } from "@/server/latex/tectonic";
import { DEMO_PDF_DIR, demoPdfKey } from "@/server/latex/demo-pdfs";

const DEMO_RESUME_TEX = path.join(process.cwd(), "src/server/db/fixtures/demo-resume.tex");

// Every demo LaTeX variant. Tailored versions get added here in a later step.
function demoDocuments(): { name: string; tex: string }[] {
  return [{ name: "demo resume", tex: fs.readFileSync(DEMO_RESUME_TEX, "utf8") }];
}

async function main() {
  const tectonicPath = process.env.TECTONIC_PATH ?? "tectonic";
  fs.mkdirSync(DEMO_PDF_DIR, { recursive: true });

  const wanted = new Set<string>();
  for (const { name, tex } of demoDocuments()) {
    const file = `${demoPdfKey(tex)}.pdf`;
    wanted.add(file);

    const result = await runTectonic(tex, { tectonicPath });
    if (!result.ok) {
      console.error(`Failed to compile the ${name}: ${result.error.message}`);
      process.exitCode = 1;
      return;
    }
    if (result.pages > 1) console.warn(`Warning: the ${name} is ${result.pages} pages.`);
    fs.writeFileSync(path.join(DEMO_PDF_DIR, file), result.pdf);
    console.log(`${file}  ${name}, ${result.pages} page(s)`);
  }

  // Remove PDFs for LaTeX that no longer exists, so stale files don't pile up.
  for (const file of fs.readdirSync(DEMO_PDF_DIR)) {
    if (file.endsWith(".pdf") && !wanted.has(file)) {
      fs.rmSync(path.join(DEMO_PDF_DIR, file));
      console.log(`removed stale ${file}`);
    }
  }
}

void main();
