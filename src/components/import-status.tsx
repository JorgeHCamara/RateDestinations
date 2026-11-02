"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Shown while a city's guide is being built on first visit. Polls the status endpoint and
 * refreshes the page when the import finishes (or fails).
 */
type Status = "none" | "pending" | "done" | "failed";

export function ImportStatus({ cityId, initialStatus }: { cityId: number; initialStatus: Status }) {
  const router = useRouter();
  // A fresh or previously failed city is being (re)built as soon as this mounts: show it as pending.
  const [status, setStatus] = useState<Status>(initialStatus === "done" ? "done" : "pending");
  const [elapsed, setElapsed] = useState(0);

  // First visit (or a retry after a failure): ask the server to build the guide. The
  // endpoint claims the city, so repeat calls and concurrent visitors are no-ops.
  useEffect(() => {
    if (initialStatus !== "none" && initialStatus !== "failed") return;
    fetch(`/api/cities/${cityId}/build`, { method: "POST" }).catch(() => {});
  }, [cityId, initialStatus]);

  useEffect(() => {
    if (status === "done") return;
    const tick = setInterval(() => setElapsed((e) => e + 1), 1000);
    const poll = setInterval(async () => {
      try {
        const res = await fetch(`/api/cities/${cityId}/status`, { cache: "no-store" });
        const data = (await res.json()) as { status: Status };
        if (data.status !== status) {
          setStatus(data.status);
          if (data.status === "done" || data.status === "failed") router.refresh();
        }
      } catch {
        /* retry on next tick */
      }
    }, 4000);
    return () => {
      clearInterval(tick);
      clearInterval(poll);
    };
  }, [cityId, status, router]);

  if (status === "failed") {
    return (
      <div className="border-bad/30 bg-bad-soft/50 rounded-xl border p-5 text-sm">
        <p className="font-medium">We couldn&apos;t build this guide right now.</p>
        <p className="text-muted-foreground">
          OpenStreetMap&apos;s servers were busy. It will be retried automatically; please check
          back in a bit.
        </p>
      </div>
    );
  }
  return (
    <div className="bg-card flex items-center gap-4 rounded-xl border p-5">
      <span
        className="border-muted-foreground/30 border-t-brand size-6 shrink-0 animate-spin rounded-full border-2"
        aria-hidden
      />
      <div className="text-sm">
        <p className="font-medium">Building this guide for the first time…</p>
        <p className="text-muted-foreground">
          Collecting restaurants, parks, sights and more from OpenStreetMap. Usually under a minute
          {elapsed > 5 ? ` · ${elapsed}s` : ""}.
        </p>
      </div>
    </div>
  );
}
