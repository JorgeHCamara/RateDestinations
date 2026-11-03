"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Where the column pins on wide screens, below the site header (5rem). */
const TOP = 80;
/** Space kept under it when it pins by its bottom edge. */
const BOTTOM_GAP = 16;

/**
 * A side column that stays in view while the page scrolls, without ever needing its own
 * scrollbar. When it fits the screen it pins at the top. When it is taller than the screen it
 * scrolls with the page only until its bottom edge is in view, then pins there, so whatever is at
 * its bottom (the Save button) is always reachable after a short scroll, never only at the end of
 * the page. Sticky positioning with a negative `top` does this; the offset depends on the column's
 * and the window's heights, which are measured here.
 */
export function StickyAside({
  id,
  className,
  children,
}: {
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  const [top, setTop] = useState(TOP);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setTop(Math.min(TOP, window.innerHeight - el.offsetHeight - BOTTOM_GAP));
    update();
    const observer = new ResizeObserver(update); // the form grows when a message appears
    observer.observe(el);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  return (
    <aside
      ref={ref}
      id={id}
      className={cn("lg:sticky lg:top-(--aside-top) lg:self-start", className)}
      style={{ "--aside-top": `${top}px` } as React.CSSProperties}
    >
      {children}
    </aside>
  );
}
