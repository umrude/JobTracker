// No "server-only" here, like demo-inbox.ts: pure functions, no I/O or
// secrets, tested on their own. Turns Gmail API messages into what the
// app reads. Only a type is imported from the Gmail package.
import type { gmail_v1 } from "@googleapis/gmail";
import { emailMetaSchema, type EmailMeta } from "@/lib/schemas/email";

type GmailMessage = gmail_v1.Schema$Message;
type GmailPart = gmail_v1.Schema$MessagePart;

// The classifier reads the start of a body; the rest rarely changes the
// answer and costs tokens. Bodies are never stored either way.
export const MAX_BODY_CHARS = 4000;

// Gmail's snippets come HTML-escaped ("We&#39;re", "&amp;").
const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === "#") {
      const code = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return ENTITIES[entity.toLowerCase()] ?? match;
  });
}

// "Cobalt Harbor Recruiting <no-reply@greenhouse-mail.io>", a quoted name,
// or a bare address.
export function parseFrom(header: string): { name: string; address: string } {
  const angled = header.match(/^\s*(.*?)\s*<([^<>]+)>\s*$/);
  if (angled) {
    const name = angled[1].replace(/^"(.*)"$/, "$1").replace(/\\"/g, '"').trim();
    return { name, address: angled[2].trim().toLowerCase() };
  }
  return { name: "", address: header.trim().toLowerCase() };
}

function header(message: GmailMessage, name: string): string {
  const found = message.payload?.headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase());
  return found?.value ?? "";
}

// Null if Gmail sent something without the basics (no id, no date), so
// one odd message is skipped instead of failing the whole sync.
export function toEmailMeta(message: GmailMessage): EmailMeta | null {
  const from = parseFrom(header(message, "From"));
  const parsed = emailMetaSchema.safeParse({
    id: message.id,
    threadId: message.threadId,
    fromAddress: from.address,
    fromName: from.name,
    subject: header(message, "Subject"),
    snippet: decodeEntities(message.snippet ?? ""),
    // internalDate: when Gmail received it, in epoch milliseconds.
    receivedAt: message.internalDate ? new Date(Number(message.internalDate)) : undefined,
    labels: message.labelIds ?? [],
  });
  if (!parsed.success || Number.isNaN(parsed.data.receivedAt.getTime())) return null;
  return parsed.data;
}

function decodePart(part: GmailPart): string {
  const data = part.body?.data;
  return data ? Buffer.from(data, "base64url").toString("utf8") : "";
}

function findPart(part: GmailPart, mimeType: string): GmailPart | undefined {
  if (part.mimeType === mimeType && part.body?.data && !part.filename) return part;
  for (const child of part.parts ?? []) {
    const found = findPart(child, mimeType);
    if (found) return found;
  }
  return undefined;
}

export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>|<\/(p|div|li|tr|h\d)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  );
}

// The readable text of a message: the plain-text part if there is one,
// else the HTML part with its tags removed. Whitespace is collapsed and it
// is cut to MAX_BODY_CHARS.
export function extractBodyText(payload: GmailPart | undefined): string {
  if (!payload) return "";
  const plain = findPart(payload, "text/plain");
  const html = plain ? undefined : findPart(payload, "text/html");
  const text = plain ? decodePart(plain) : html ? htmlToText(decodePart(html)) : "";
  return text
    .replace(/[ \t ]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim()
    .slice(0, MAX_BODY_CHARS);
}
