// No "server-only" here: pure logic with an injectable clock, tested on
// its own. Used by live-source.ts.
//
// Gmail meters each user in "quota units" per minute (15,000 by default),
// and every call has a price: reading a message costs 5, so 3,000 reads a
// minute at most. Firing requests as fast as they return (8 at a time,
// ~100 ms each) asks for ~24,000 a minute and Google refuses the rest
// ("Quota exceeded ... Units per minute per user"). This paces calls to
// stay under the limit instead.

// What each call costs. https://developers.google.com/workspace/gmail/api/reference/quota
export const GMAIL_UNITS = {
  getProfile: 1,
  historyList: 2,
  messagesList: 5,
  messagesGet: 5,
} as const;

// A token bucket: up to `capacity` units can be spent at once, refilling
// at `perSecond`. The defaults keep a steady 200 units a second (12,000 a
// minute, 80% of Gmail's 15,000) with a small burst, leaving headroom for
// anything else using the same Google project.
export type Clock = { now: () => number; sleep: (ms: number) => Promise<void> };

const realClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

export function createQuotaLimiter({ perSecond = 200, capacity = 400, clock = realClock } = {}) {
  let tokens = capacity;
  let last = clock.now();
  // Callers queue up, so concurrent requests are served in order instead of
  // all waking at once and overspending.
  let queue: Promise<void> = Promise.resolve();

  function refill() {
    const now = clock.now();
    tokens = Math.min(capacity, tokens + ((now - last) / 1000) * perSecond);
    last = now;
  }

  return {
    // Resolves once `units` can be spent.
    take(units: number): Promise<void> {
      const turn = queue.then(async () => {
        refill();
        if (tokens < units) {
          await clock.sleep(Math.ceil(((units - tokens) / perSecond) * 1000));
          refill();
        }
        tokens -= units;
      });
      queue = turn;
      return turn;
    },
  };
}

export type QuotaLimiter = ReturnType<typeof createQuotaLimiter>;

// Whether a failed Google call was a rate or quota refusal worth waiting
// out: HTTP 429, or 403 with one of Gmail's rate-limit reasons.
export function isRateLimited(status: number | undefined, message: string): boolean {
  if (status === 429) return true;
  return status === 403 && /rate ?limit|quota exceeded/i.test(message);
}

// How long to wait before retry `attempt` (1, 2, ...): Google's
// Retry-After if it sent one, else exponential backoff from 2 seconds, with
// jitter so retries don't line up.
export function retryDelayMs(attempt: number, retryAfterSeconds: number | undefined, random = Math.random): number {
  if (retryAfterSeconds !== undefined && Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return retryAfterSeconds * 1000;
  }
  const base = 2000 * 2 ** (attempt - 1);
  return base + Math.floor(random() * 1000);
}
