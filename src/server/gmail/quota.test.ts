import { describe, it, expect } from "vitest";
import { createQuotaLimiter, isRateLimited, retryDelayMs, type Clock } from "@/server/gmail/quota";

// A fake clock: sleeping just moves time forward.
function fakeClock(): Clock & { slept: number[] } {
  let time = 0;
  const slept: number[] = [];
  return {
    slept,
    now: () => time,
    sleep: async (ms) => {
      slept.push(ms);
      time += ms;
    },
  };
}

describe("quota limiter", () => {
  it("lets a burst through, then paces to the refill rate", async () => {
    const clock = fakeClock();
    const limiter = createQuotaLimiter({ perSecond: 200, capacity: 400, clock });
    // 80 reads at 5 units: the first 80 fit in the burst...
    for (let i = 0; i < 80; i++) await limiter.take(5);
    expect(clock.slept).toEqual([]);
    // ...after that, each one waits for 5 units to refill (25 ms).
    await limiter.take(5);
    expect(clock.slept).toEqual([25]);
  });

  it("never spends more than the rate allows over a minute", async () => {
    const clock = fakeClock();
    const limiter = createQuotaLimiter({ perSecond: 200, capacity: 400, clock });
    // As many concurrent reads as a sync would make, all at once.
    await Promise.all(Array.from({ length: 3000 }, () => limiter.take(5)));
    // 15,000 units at 200 a second, less the 400 burst: at least 73 s.
    expect(clock.now()).toBeGreaterThanOrEqual(73_000);
  });
});

describe("rate-limit errors", () => {
  it("recognizes 429 and 403 quota refusals, not other 403s", () => {
    expect(isRateLimited(429, "Too Many Requests")).toBe(true);
    expect(isRateLimited(403, "Quota exceeded for quota metric 'Total Query Cost'")).toBe(true);
    expect(isRateLimited(403, "User-rate limit exceeded")).toBe(true);
    expect(isRateLimited(403, "Insufficient Permission")).toBe(false);
    expect(isRateLimited(500, "Quota exceeded")).toBe(false);
  });

  it("waits as long as Google asks, else backs off exponentially", () => {
    expect(retryDelayMs(1, 30)).toBe(30_000);
    expect(retryDelayMs(1, undefined, () => 0)).toBe(2000);
    expect(retryDelayMs(3, undefined, () => 0)).toBe(8000);
  });
});
