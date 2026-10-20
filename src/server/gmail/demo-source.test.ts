import { describe, it, expect } from "vitest";
import { demoMailSource, DEMO_HISTORY_ID } from "@/server/gmail/demo-source";

const now = new Date("2026-10-20T12:00:00Z");
const source = demoMailSource(now);

describe("demoMailSource", () => {
  it("lists the demo inbox since a date, newest first", async () => {
    const batch = await source.listSince(new Date("2026-10-15T00:00:00Z"));
    expect(batch.historyId).toBe(DEMO_HISTORY_ID);
    expect(batch.truncated).toBe(false);
    expect(batch.messages.length).toBeGreaterThan(0);
    for (const message of batch.messages) expect(message.receivedAt.getTime()).toBeGreaterThanOrEqual(Date.parse("2026-10-15"));
    const times = batch.messages.map((m) => m.receivedAt.getTime());
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  it("returns the whole inbox as new, since it has no history", async () => {
    const all = await source.listNew(DEMO_HISTORY_ID);
    expect(all?.messages).toHaveLength((await source.listSince(new Date(0))).messages.length);
  });

  it("reads a body, and refuses an unknown id", async () => {
    expect(await source.body("demo-driftwood-interview")).toContain("45-minute call");
    await expect(source.body("nope")).rejects.toThrow();
  });
});
