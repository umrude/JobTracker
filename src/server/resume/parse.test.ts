import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { parseResumeFile } from "@/server/resume/parse";
import { buildPdf } from "@/test/build-pdf";

// These run the real unpdf and mammoth libraries against small files
// built in memory, so they check that parsing actually works in Node and
// that library failures become friendly errors. No fixture files are
// committed, and no real resume is involved.

// A minimal DOCX: a ZIP holding the three parts Word needs.
async function buildDocx(paragraphs: string[]): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
  );
  const body = paragraphs.map((text) => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`).join("");
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`,
  );
  return zip.generateAsync({ type: "uint8array" });
}

function toFile(bytes: Uint8Array, name: string): File {
  // Copy into a fresh ArrayBuffer-backed array: File's constructor types
  // reject a Uint8Array that might be backed by a SharedArrayBuffer.
  return new File([new Uint8Array(bytes)], name);
}

describe("parseResumeFile", () => {
  it("extracts text from a PDF", async () => {
    const file = toFile(buildPdf(["Alex Rivera", "Skills: React, TypeScript"]), "resume.pdf");
    const result = await parseResumeFile(file);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text).toContain("Alex Rivera");
    expect(result.text).toContain("Skills: React, TypeScript");
  });

  it("extracts text from a DOCX", async () => {
    const file = toFile(
      await buildDocx(["Alex Rivera", "Skills: React, TypeScript"]),
      "resume.docx",
    );
    expect(await parseResumeFile(file)).toEqual({
      ok: true,
      text: "Alex Rivera\n\nSkills: React, TypeScript",
    });
  });

  it("reports a PDF with no text, such as a scan, as no_text", async () => {
    const result = await parseResumeFile(toFile(buildPdf([]), "scan.pdf"));
    expect(result).toMatchObject({ ok: false, error: { kind: "no_text" } });
  });

  it("reports a damaged DOCX as unreadable, not a raw parser error", async () => {
    const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...new Array(200).fill(0)]);
    const result = await parseResumeFile(toFile(bytes, "broken.docx"));
    expect(result).toMatchObject({ ok: false, error: { kind: "unreadable" } });
  });

  it("reports a damaged PDF as unreadable", async () => {
    const bytes = new TextEncoder().encode("%PDF-1.4\nthis is not really a pdf");
    const result = await parseResumeFile(toFile(bytes, "broken.pdf"));
    expect(result).toMatchObject({ ok: false, error: { kind: "unreadable" } });
  });

  it("rejects a renamed file before parsing", async () => {
    const result = await parseResumeFile(toFile(buildPdf(["Hi"]), "resume.docx"));
    expect(result).toMatchObject({ ok: false, error: { kind: "content_mismatch" } });
  });
});
