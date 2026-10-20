// Compiles every LaTeX document the demo can show into committed PDFs,
// named by demoPdfKey(), so demo mode serves them without a TeX engine.
// Run `pnpm db:seed && pnpm demo:pdfs` after changing the demo resume or
// its tailoring fixtures, and commit the result. Needs Tectonic installed.
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { z } from "zod";
import { runTectonic } from "@/server/latex/tectonic";
import { DEMO_PDF_DIR, demoPdfKey } from "@/server/latex/demo-pdfs";
import { DEMO_DB_PATH } from "@/server/db/paths";
import { applyResumeEdits } from "@/lib/latex/resume";
import { resumeEditsSchema } from "@/lib/schemas/resume-edits";

const DEMO_RESUME_TEX = path.join(process.cwd(), "src/server/db/fixtures/demo-resume.tex");

// Every demo LaTeX variant: the demo resume, plus each approved tailored
// resume in the seeded demo database. Reading the approved edits from the
// database (rather than recomputing them) means this script and the seed
// can never disagree about what the demo shows.
function demoDocuments(): { name: string; tex: string }[] {
  const documents = [{ name: "demo resume", tex: fs.readFileSync(DEMO_RESUME_TEX, "utf8") }];

  if (!fs.existsSync(DEMO_DB_PATH)) {
    throw new Error(`No demo database at ${DEMO_DB_PATH}. Run \`pnpm db:seed\` first.`);
  }
  const db = new Database(DEMO_DB_PATH, { readonly: true });
  const rows = db
    .prepare(
      `select t.version, t.approved_json, r.latex_source, j.company
       from tailored_resumes t
       join resumes r on r.id = t.resume_id
       join jobs j on j.id = t.job_id
       where t.status = 'approved'`,
    )
    .all();
  db.close();

  for (const row of rows) {
    const parsed = approvedRow.safeParse(row);
    if (!parsed.success) throw new Error(`Unexpected tailored resume row: ${parsed.error.message}`);
    const { company, version, approved_json, latex_source } = parsed.data;
    const edits = resumeEditsSchema.parse(JSON.parse(approved_json));
    const applied = applyResumeEdits(latex_source, edits);
    if (!applied.ok) throw new Error(`Tailored resume for ${company} doesn't apply: ${applied.message}`);
    documents.push({ name: `tailored resume for ${company} (v${version})`, tex: applied.tex });
  }
  return documents;
}

// The columns read from the demo database, validated rather than cast.
const approvedRow = z.object({
  company: z.string(),
  version: z.number(),
  approved_json: z.string(),
  latex_source: z.string(),
});

async function main() {
  const tectonicPath = process.env.TECTONIC_PATH ?? "tectonic";
  fs.mkdirSync(DEMO_PDF_DIR, { recursive: true });

  const wanted = new Set<string>();
  for (const { name, tex } of demoDocuments()) {
    const file = `${demoPdfKey(tex)}.pdf`;
    wanted.add(file);

    // The name is a hash of the LaTeX, so an existing file is already
    // up to date. Skipping it avoids git churn: every compile embeds a new
    // creation date. Pass --force to rebuild everything anyway.
    if (!process.argv.includes("--force") && fs.existsSync(path.join(DEMO_PDF_DIR, file))) {
      console.log(`${file}  ${name}, already built`);
      continue;
    }

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
