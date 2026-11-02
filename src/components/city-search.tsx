"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type Hit = {
  id: number;
  name: string;
  country_code: string;
  country_name: string;
  admin1: string | null;
  slug: string;
  population: number;
};

export function CitySearch({
  variant = "hero",
  autoFocus = false,
}: {
  variant?: "hero" | "compact";
  autoFocus?: boolean;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const listId = useId();
  const abort = useRef<AbortController | null>(null);

  function onInput(value: string) {
    setQ(value);
    if (value.trim().length < 2) {
      abort.current?.abort();
      setHits([]);
      setLoading(false);
      setOpen(false);
    } else {
      setLoading(true);
    }
  }

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    const t = setTimeout(async () => {
      abort.current?.abort();
      const ac = new AbortController();
      abort.current = ac;
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: ac.signal });
        const data = (await res.json()) as { hits: Hit[] };
        setHits(data.hits);
        setActive(0);
        setOpen(true);
      } catch {
        /* aborted or offline */
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    }, 160);
    return () => clearTimeout(t);
  }, [q]);

  function go(hit: Hit) {
    setOpen(false);
    router.push(`/city/${hit.country_code.toLowerCase()}/${hit.slug}`);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || hits.length === 0) {
      if (e.key === "Enter" && q.trim().length >= 2)
        router.push(`/search?q=${encodeURIComponent(q.trim())}`);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % hits.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a - 1 + hits.length) % hits.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(hits[active]);
    } else if (e.key === "Escape") setOpen(false);
  }

  const hero = variant === "hero";
  return (
    <div className="relative">
      <div
        className={cn(
          "bg-card focus-within:ring-ring/60 flex items-center gap-2 rounded-xl border shadow-sm transition focus-within:ring-2",
          hero ? "h-14 px-4 text-base sm:h-16 sm:text-lg" : "h-9 px-3 text-sm",
        )}
      >
        <svg
          className={cn("text-muted-foreground shrink-0", hero ? "size-5" : "size-4")}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          type="search"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          autoFocus={autoFocus}
          value={q}
          onChange={(e) => onInput(e.target.value)}
          onFocus={() => hits.length && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
          placeholder={hero ? "Search any city in the world…" : "Search a city"}
          className="placeholder:text-muted-foreground w-full bg-transparent outline-none"
        />
        {loading && (
          <span
            className="border-muted-foreground/30 border-t-brand size-4 animate-spin rounded-full border-2"
            aria-label="Searching"
          />
        )}
        {hero && !loading && (
          <kbd className="bg-muted text-muted-foreground hidden rounded border px-1.5 py-0.5 font-mono text-[11px] sm:block">
            Enter
          </kbd>
        )}
      </div>
      {open && hits.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="bg-popover absolute top-full right-0 left-0 z-50 mt-2 overflow-hidden rounded-xl border p-1 shadow-lg"
        >
          {hits.map((h, i) => (
            <li
              key={h.id}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                go(h);
              }}
              onMouseEnter={() => setActive(i)}
              className={cn(
                "flex cursor-pointer items-baseline justify-between gap-3 rounded-lg px-3 py-2 text-sm",
                i === active ? "bg-accent" : "",
              )}
            >
              <span>
                <span className="font-medium">{h.name}</span>
                <span className="text-muted-foreground">
                  {h.admin1 ? `, ${h.admin1}` : ""} · {h.country_name}
                </span>
              </span>
              <span className="text-muted-foreground shrink-0 font-mono text-xs">
                {formatPop(h.population)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatPop(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(n);
}
