"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * Shown while a city's guide is being built. On mount it asks the server to build the guide
 * (the server claims the city, so this is a no-op while another import is running), then polls
 * the status endpoint and refreshes the page when the import finishes or fails.
 */
type Status = "none" | "pending" | "done" | "failed";

/** An import always ends within 4 minutes; past 6 it was cut off and can be started again. */
const STUCK_AFTER_S = 360;

export function ImportStatus({
  cityId,
  initialStatus,
  startedAt,
}: {
  cityId: number;
  initialStatus: Status;
  /** When the current import was claimed (ISO), if one is pending. */
  startedAt: string | null;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>(initialStatus === "done" ? "done" : "pending");
  const [since, setSince] = useState<number | null>(startedAt ? Date.parse(startedAt) : null);
  const [elapsed, setElapsed] = useState(0);
  const [note, setNote] = useState<string | null>(null);

  const build = useCallback(async () => {
    try {
      const res = await fetch(`/api/cities/${cityId}/build`, { method: "POST" });
      const data = (await res.json()) as { status?: Status; started?: boolean };
      if (data.started) {
        setSince(Date.now());
        setStatus("pending");
        setNote(null);
      }
      return Boolean(data.started);
    } catch {
      return false;
    }
  }, [cityId]);

  // Ask for a build on every visit that isn't done; the server decides whether one is needed.
  useEffect(() => {
    if (initialStatus === "done") return;
    fetch(`/api/cities/${cityId}/build`, { method: "POST" })
      .then((res) => res.json() as Promise<{ started?: boolean }>)
      .then((data) => {
        if (data.started) setSince(Date.now());
      })
      .catch(() => {});
  }, [initialStatus, cityId]);

  useEffect(() => {
    if (status === "done") return;
    const tick = setInterval(() => {
      setElapsed(since ? Math.max(0, Math.round((Date.now() - since) / 1000)) : 0);
    }, 1000);
    const poll = setInterval(async () => {
      try {
        const res = await fetch(`/api/cities/${cityId}/status`, { cache: "no-store" });
        const data = (await res.json()) as { status: Status; importedAt: string | null };
        if (data.status === "pending" && data.importedAt) setSince(Date.parse(data.importedAt));
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
  }, [cityId, status, since, router]);

  async function retry() {
    setNote(null);
    const started = await build();
    if (!started) setNote("The last attempt only just ended. Please try again in a minute or two.");
  }

  const stuck = status === "pending" && elapsed > STUCK_AFTER_S;

  if (status === "failed" || stuck) {
    return (
      <div className="border-bad/30 bg-bad-soft/50 space-y-3 rounded-xl border p-5 text-sm">
        <div>
          <p className="font-medium">
            {stuck
              ? "This is taking longer than usual."
              : "We couldn't build this guide right now."}
          </p>
          <p className="text-muted-foreground">
            The map data service didn&apos;t answer in time. You can try again now, or come back
            later; it is also retried automatically.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={retry}>
          Try again
        </Button>
        {note && <p className="text-muted-foreground text-xs">{note}</p>}
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
          Collecting restaurants, parks, sights and more from OpenStreetMap. This usually takes
          under a minute; big cities can take a few
          {elapsed > 5
            ? ` · ${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`
            : ""}
          .
        </p>
      </div>
    </div>
  );
}
