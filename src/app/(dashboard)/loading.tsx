// Shown while a dashboard page renders on the server, so clicking a nav
// link responds right away instead of appearing to do nothing. Next.js
// wraps each page in a Suspense boundary with this as its fallback; the
// header and nav (the layout) stay on screen. See docs/performance.md.
export default function Loading() {
  return (
    <div className="flex flex-1 flex-col gap-4 p-6" aria-busy="true" aria-label="Loading">
      <div className="h-7 w-48 animate-pulse rounded-md bg-muted" />
      <div className="h-4 w-80 animate-pulse rounded-md bg-muted" />
      <div className="mt-2 grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-28 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    </div>
  );
}
