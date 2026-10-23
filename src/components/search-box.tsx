"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SearchIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { STATUS_LABELS } from "@/lib/schemas/status";
import { searchResponseSchema, type SearchResult } from "@/lib/search/response";
import { cn } from "@/lib/utils";

const FIELD_LABELS: Record<SearchResult["field"], string> = { company: "Company", title: "Role", listing: "Listing" };
const DEBOUNCE_MS = 180;

// The header's search: your applications and saved jobs, ranked company,
// then role, then listing text (lib/search/search.ts). A Client Component
// for typing, the dropdown, and the keyboard:
// - "/" anywhere focuses it; Up/Down move; Enter opens; Escape closes.
// - It waits for a short pause in typing, and cancels a request that's no
//   longer needed, so results never arrive out of order.
// Follows the ARIA combobox pattern, so screen readers announce results.
export function SearchBox() {
  const router = useRouter();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);

  // "/" focuses the box, unless you're typing somewhere else.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing = target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
      if (event.key === "/" && !typing) {
        event.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Search after a pause; cancel what's in flight when the query changes.
  // Only the async result sets state here: what depends on the query
  // alone (too short to search) is worked out while rendering.
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, { signal: controller.signal });
        const parsed = searchResponseSchema.safeParse(await response.json());
        setResults(parsed.success ? parsed.data.results : []);
        setActive(0);
      } catch {
        // Aborted (a newer query replaced it) or offline: keep what's shown.
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  // An application opens its own page (history, emails); a saved job, its
  // comparison, the most useful page for a job you haven't applied to.
  const href = (result: SearchResult) =>
    result.applicationId !== null ? `/applications/${result.applicationId}` : `/compare/${result.jobId}`;
  function go(path: string) {
    setOpen(false);
    inputRef.current?.blur();
    router.push(path);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (!open || shown.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => (i + 1) % shown.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => (i - 1 + shown.length) % shown.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const result = shown[active];
      if (result) go(href(result));
    }
  }

  const searchable = query.trim().length >= 2;
  const shown = searchable ? results : [];
  const showList = open && searchable;
  const optionId = (index: number) => `${listId}-option-${index}`;

  return (
    <div className="relative w-full max-w-xs">
      <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={inputRef}
        type="search"
        role="combobox"
        aria-label="Search applications and saved jobs"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && shown.length > 0 ? optionId(active) : undefined}
        placeholder="Search jobs  ( / )"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          setLoading(event.target.value.trim().length >= 2);
        }}
        onFocus={() => setOpen(true)}
        // Lets a click on a result land before the list closes.
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={onKeyDown}
        className="pl-8"
      />
      {showList && (
        <div className="absolute top-full right-0 z-50 mt-1 w-[min(32rem,90vw)] rounded-lg border bg-popover p-1 text-popover-foreground shadow-md">
          <ul id={listId} role="listbox" aria-label="Search results" className="max-h-[70vh] overflow-y-auto">
            {shown.map((result, index) => {
              const heading = index === 0 || shown[index - 1].field !== result.field;
              return (
                <li key={result.jobId} role="presentation">
                  {heading && <p className="px-2 pt-2 pb-1 text-xs font-medium text-muted-foreground">{FIELD_LABELS[result.field]}</p>}
                  <div
                    id={optionId(index)}
                    role="option"
                    aria-selected={index === active}
                    onMouseEnter={() => setActive(index)}
                    // mousedown, not click: it fires before the input's blur.
                    onMouseDown={(event) => {
                      event.preventDefault();
                      go(href(result));
                    }}
                    className={cn("cursor-pointer rounded-md px-2 py-1.5 text-sm", index === active && "bg-muted")}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate">
                        <span className="font-medium">{result.company}</span>
                        <span className="text-muted-foreground"> · {result.title}</span>
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">{result.status ? STATUS_LABELS[result.status] : "Saved"}</span>
                    </div>
                    {result.snippet && (
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                        {result.snippet.before}
                        <mark className="rounded-sm bg-amber-200/70 px-0.5 text-foreground dark:bg-amber-500/30">{result.snippet.match}</mark>
                        {result.snippet.after}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          {!loading && shown.length === 0 && <p className="px-2 py-3 text-sm text-muted-foreground">No jobs match “{query.trim()}”.</p>}
          {loading && shown.length === 0 && <p className="px-2 py-3 text-sm text-muted-foreground">Searching...</p>}
          <button
            type="button"
            onMouseDown={(event) => {
              event.preventDefault();
              go(`/board?q=${encodeURIComponent(query.trim())}`);
            }}
            className="mt-1 w-full rounded-md border-t px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted"
          >
            Filter the board by “{query.trim()}”
          </button>
        </div>
      )}
    </div>
  );
}
