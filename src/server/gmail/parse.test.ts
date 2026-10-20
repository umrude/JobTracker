import { describe, it, expect } from "vitest";
import { decodeEntities, extractBodyText, MAX_BODY_CHARS, parseFrom, toEmailMeta } from "@/server/gmail/parse";

const b64 = (text: string) => Buffer.from(text, "utf8").toString("base64url");

describe("parseFrom", () => {
  it("reads a name and address, quoted or not, or a bare address", () => {
    expect(parseFrom("Cobalt Harbor Recruiting <No-Reply@greenhouse-mail.io>")).toEqual({
      name: "Cobalt Harbor Recruiting",
      address: "no-reply@greenhouse-mail.io",
    });
    expect(parseFrom('"Vale, Fenwick" <talent@hire.lever.co>')).toEqual({ name: "Vale, Fenwick", address: "talent@hire.lever.co" });
    expect(parseFrom("jobs@acme.example")).toEqual({ name: "", address: "jobs@acme.example" });
  });
});

describe("toEmailMeta", () => {
  it("maps a metadata message, decoding the snippet", () => {
    const meta = toEmailMeta({
      id: "m1",
      threadId: "t1",
      internalDate: "1792000000000",
      labelIds: ["INBOX", "CATEGORY_UPDATES"],
      snippet: "We&#39;ve received your application &amp; will be in touch",
      payload: {
        headers: [
          { name: "From", value: "Acme Talent <talent@acme.example>" },
          { name: "subject", value: "Thanks for applying" },
        ],
      },
    });
    expect(meta).toEqual({
      id: "m1",
      threadId: "t1",
      fromAddress: "talent@acme.example",
      fromName: "Acme Talent",
      subject: "Thanks for applying",
      snippet: "We've received your application & will be in touch",
      receivedAt: new Date(1792000000000),
      labels: ["INBOX", "CATEGORY_UPDATES"],
    });
  });

  it("skips a message without an id or a date", () => {
    expect(toEmailMeta({ threadId: "t", internalDate: "1" })).toBeNull();
    expect(toEmailMeta({ id: "m", threadId: "t" })).toBeNull();
  });
});

describe("extractBodyText", () => {
  it("prefers the plain-text part of a multipart message", () => {
    const text = extractBodyText({
      mimeType: "multipart/alternative",
      parts: [
        { mimeType: "text/plain", body: { data: b64("Hi Alex,\n\n  We'd love to   chat.") } },
        { mimeType: "text/html", body: { data: b64("<p>ignored</p>") } },
      ],
    });
    expect(text).toBe("Hi Alex,\nWe'd love to chat.");
  });

  it("falls back to HTML without tags, scripts, or styles", () => {
    const text = extractBodyText({
      mimeType: "text/html",
      body: { data: b64("<style>p{}</style><p>Offer &amp; next steps</p><div>Reply by Friday</div>") },
    });
    expect(text).toBe("Offer & next steps\nReply by Friday");
  });

  it("ignores attachments and cuts long bodies", () => {
    const payload = {
      mimeType: "multipart/mixed",
      parts: [
        { mimeType: "text/plain", filename: "notes.txt", body: { data: b64("attachment") } },
        { mimeType: "text/plain", body: { data: b64("x".repeat(MAX_BODY_CHARS + 50)) } },
      ],
    };
    expect(extractBodyText(payload)).toHaveLength(MAX_BODY_CHARS);
    expect(extractBodyText(undefined)).toBe("");
  });
});

describe("decodeEntities", () => {
  it("decodes named and numeric entities and leaves unknown ones", () => {
    expect(decodeEntities("&lt;b&gt; &#x27;hi&#x27; &unknown;")).toBe("<b> 'hi' &unknown;");
  });
});
