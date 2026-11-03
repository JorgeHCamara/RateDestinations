"use client";

import { Info } from "lucide-react";
import { Popover } from "radix-ui";
import { useRef, useState } from "react";
import { DIMENSION_META, type CityDimension } from "@/lib/dimensions";

/**
 * A small "i" next to a rating dimension's name; its bubble says what the dimension covers.
 * Mouse: opens on hover. Touch: a tap toggles it, a tap anywhere else closes it. Keyboard:
 * Enter or Space toggles it, Escape closes it. (A popover rather than a tooltip: tooltips are
 * hover-only, so phones could never open them.)
 */
export function DimensionInfo({ dimension }: { dimension: CityDimension }) {
  const [open, setOpen] = useState(false);
  const pointer = useRef<string>("");
  const { label, description } = DIMENSION_META[dimension];
  const hover = (e: React.PointerEvent, next: boolean) => {
    pointer.current = e.pointerType;
    if (e.pointerType === "mouse") setOpen(next);
  };
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={`What ${label} means`}
          className="text-muted-foreground/70 hover:text-foreground data-[state=open]:text-foreground focus-visible:ring-ring/60 -m-1 inline-grid shrink-0 place-items-center rounded-full p-1 transition-colors focus-visible:ring-2 focus-visible:outline-none"
          onPointerEnter={(e) => hover(e, true)}
          onPointerLeave={(e) => hover(e, false)}
          onPointerDown={(e) => (pointer.current = e.pointerType)}
          onClick={(e) => {
            // With a mouse, hovering already shows it: a click shouldn't hide it again.
            if (pointer.current === "mouse") e.preventDefault();
            pointer.current = "";
          }}
        >
          <Info className="size-3.5" aria-hidden />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          sideOffset={6}
          collisionPadding={12}
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="bg-foreground text-background data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 z-50 max-w-64 rounded-md px-3 py-1.5 text-xs leading-snug shadow-md"
        >
          <span className="font-semibold">{label}.</span> {description}
          <Popover.Arrow className="fill-foreground" width={10} height={5} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
