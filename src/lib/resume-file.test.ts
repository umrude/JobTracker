import { describe, it, expect } from "vitest";
import {
  checkExtractedText,
  checkResumeFile,
  checkResumeSignature,
  cleanExtractedText,
} from "@/lib/resume-file";
import { RESUME_MAX_BYTES, RESUME_TEXT_MAX } from "@/lib/schemas/resume";

const PDF_HEADER = new TextEncoder().encode("%PDF-1.7");
const ZIP_HEADER = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14]);

describe("checkResumeFile", () => {
  it("accepts a PDF by extension", () => {
    expect(checkResumeFile({ name: "resume.pdf", size: 1000 })).toEqual({
      ok: true,
      kind: "pdf",
    });
  });

  it("accepts a DOCX, ignoring extension case", () => {
    expect(checkResumeFile({ name: "Resume.DOCX", size: 1000 })).toEqual({
      ok: true,
      kind: "docx",
    });
  });

  it("rejects an empty file as missing", () => {
    expect(checkResumeFile({ name: "resume.pdf", size: 0 })).toMatchObject({
      ok: false,
      error: { kind: "missing" },
    });
  });

  it("rejects a file over the size limit", () => {
    expect(
      checkResumeFile({ name: "resume.pdf", size: RESUME_MAX_BYTES + 1 }),
    ).toMatchObject({ ok: false, error: { kind: "too_large" } });
  });

  it("accepts a file exactly at the size limit", () => {
    expect(
      checkResumeFile({ name: "resume.pdf", size: RESUME_MAX_BYTES }).ok,
    ).toBe(true);
  });

  it("rejects other extensions, including legacy .doc", () => {
    for (const name of ["resume.doc", "resume.txt", "resume", "resume.pdf.exe"]) {
      expect(checkResumeFile({ name, size: 1000 })).toMatchObject({
        ok: false,
        error: { kind: "unsupported_type" },
      });
    }
  });
});

describe("checkResumeSignature", () => {
  it("passes when the bytes match the extension", () => {
    expect(checkResumeSignature("pdf", PDF_HEADER)).toBeUndefined();
    expect(checkResumeSignature("docx", ZIP_HEADER)).toBeUndefined();
  });

  it("fails when the bytes don't match the extension", () => {
    expect(checkResumeSignature("pdf", ZIP_HEADER)?.kind).toBe("content_mismatch");
    expect(checkResumeSignature("docx", PDF_HEADER)?.kind).toBe("content_mismatch");
  });

  it("fails on a header shorter than the signature", () => {
    expect(checkResumeSignature("pdf", new Uint8Array([0x25]))?.kind).toBe(
      "content_mismatch",
    );
  });
});

describe("cleanExtractedText", () => {
  it("normalizes line endings, spaces, and blank-line runs", () => {
    expect(
      cleanExtractedText("  Jane Doe  \r\n\r\n\r\n\r\nSkills: \tReact,   TypeScript \n"),
    ).toBe("Jane Doe\n\nSkills: React, TypeScript");
  });

  it("keeps single line breaks", () => {
    expect(cleanExtractedText("Line one\nLine two")).toBe("Line one\nLine two");
  });
});

describe("checkExtractedText", () => {
  it("returns the cleaned text", () => {
    expect(checkExtractedText("  Jane Doe \n")).toEqual({
      ok: true,
      text: "Jane Doe",
    });
  });

  it("treats whitespace-only text as no text (e.g. a scanned PDF)", () => {
    expect(checkExtractedText(" \n\n \t")).toMatchObject({
      ok: false,
      error: { kind: "no_text" },
    });
  });

  it("rejects text over the saved-text limit", () => {
    expect(checkExtractedText("a".repeat(RESUME_TEXT_MAX + 1))).toMatchObject({
      ok: false,
      error: { kind: "too_long" },
    });
  });
});
