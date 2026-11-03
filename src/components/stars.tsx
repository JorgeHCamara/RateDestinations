"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/** Accessible 1–5 star input (radio group) or read-only display. */
export function Stars({
  name,
  value,
  onChange,
  size = "md",
  readOnly = false,
  label,
}: {
  name?: string;
  value: number;
  onChange?: (v: number) => void;
  size?: "sm" | "md" | "lg";
  readOnly?: boolean;
  label?: string;
}) {
  const [hover, setHover] = useState(0);
  const dim = size === "lg" ? "size-9" : size === "sm" ? "size-4" : "size-7";
  const shown = hover || value;
  return (
    <div
      role={readOnly ? "img" : "radiogroup"}
      aria-label={label ?? "Rating"}
      className="inline-flex items-center gap-0.5"
      onMouseLeave={() => setHover(0)}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role={readOnly ? undefined : "radio"}
          aria-checked={readOnly ? undefined : value === n}
          aria-label={`${n} star${n > 1 ? "s" : ""}`}
          disabled={readOnly}
          tabIndex={readOnly ? -1 : value === n || (!value && n === 1) ? 0 : -1}
          onMouseEnter={() => !readOnly && setHover(n)}
          onFocus={() => !readOnly && setHover(n)}
          onBlur={() => setHover(0)}
          onClick={() => onChange?.(n)}
          onKeyDown={(e) => {
            if (readOnly) return;
            if (e.key === "ArrowRight" || e.key === "ArrowUp") {
              e.preventDefault();
              onChange?.(Math.min(5, (value || 0) + 1));
            }
            if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
              e.preventDefault();
              onChange?.(Math.max(1, (value || 1) - 1));
            }
          }}
          className={cn(
            "rounded-sm transition-transform",
            !readOnly &&
              "focus-visible:outline-ring cursor-pointer hover:scale-110 focus-visible:outline-2",
            dim,
          )}
        >
          <svg
            viewBox="0 0 24 24"
            className={cn(
              "h-full w-full",
              n <= shown ? "fill-ok text-ok" : "fill-muted text-muted-foreground/40",
            )}
            stroke="currentColor"
            strokeWidth="1"
            aria-hidden
          >
            <path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.4l-5.9 3.2 1.3-6.6L2.5 9.4l6.6-.8z" />
          </svg>
        </button>
      ))}
      {name && <input type="hidden" name={name} value={value || ""} />}
    </div>
  );
}
