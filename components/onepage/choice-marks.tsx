"use client"

import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

/*
  A PICK FADES IN, THE OLD ONE OUT. The dark border and the check used to
  be the card's own classes and a check mounted on the pick, so choosing
  swapped both in one frame; on a touch screen app/globals.css also turns
  off the border transition of anything with a hover border, and in the
  app every button's transition is replaced with its own, so there was no
  fade to be had from the button. The marks are elements of their own now,
  always there, faded and scaled in and out (opacity and `scale`, 180ms),
  so the new pick arrives as the old one leaves. The card keeps its
  hairline and its text keeps its weight: nothing moves but the marks.
*/
const markMotion = "transition-[opacity,scale] duration-[180ms] ease-out"

/** The dark border of a picked card, over its hairline. Inside a `relative` parent with the card's rounding. */
export function ChoiceMark({ on, className }: { on: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      data-choice-mark=""
      className={cn(
        "pointer-events-none absolute -inset-px rounded-[inherit] border border-[#1a1a2e] shadow-[0_0_0_0.5px_#1a1a2e]",
        markMotion,
        on ? "scale-100 opacity-100" : "scale-[0.985] opacity-0",
        className,
      )}
    />
  )
}

/** The ring round a picked swatch, 2px out from it, drawn outside it. */
export function SwatchMark({ on, className }: { on: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      data-choice-mark=""
      className={cn(
        "pointer-events-none absolute -inset-[3.5px] border-[1.5px] border-[#1a1a2e]",
        markMotion,
        on ? "scale-100 opacity-100" : "scale-[0.92] opacity-0",
        className,
      )}
    />
  )
}

/** The small dark check in a picked tile's corner, scaled up from nothing. */
export function CheckMark({ on, className, small = false }: { on: boolean; className?: string; small?: boolean }) {
  return (
    <span
      aria-hidden
      data-check-mark=""
      className={cn(
        "pointer-events-none absolute grid place-items-center rounded-full bg-[#1a1a2e] text-white shadow-[0_1px_2px_rgba(0,0,0,0.25)]",
        small ? "h-[18px] w-[18px]" : "h-5 w-5",
        markMotion,
        on ? "scale-100 opacity-100" : "scale-50 opacity-0",
        className,
      )}
    >
      <Check className={small ? "h-2.5 w-2.5" : "h-3 w-3"} strokeWidth={3} />
    </span>
  )
}

/** A chip's dark fill when it is chosen, under its words. */
export function ChipFill({ on, className }: { on: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      data-choice-mark=""
      className={cn("pointer-events-none absolute -inset-px rounded-[inherit] bg-[#1a1a2e]", markMotion, on ? "scale-100 opacity-100" : "scale-95 opacity-0", className)}
    />
  )
}

/**
 * A picked option card in a block's settings (a layout, a divider, how an
 * image fits): its dark border and its grey tint, under the card's
 * content and over its white, faded in. The card must be `relative isolate`.
 */
export function CardMark({ on, width = 2, tint = "#f7f7f8" }: { on: boolean; width?: number; tint?: string }) {
  return (
    <span
      aria-hidden
      data-choice-mark=""
      className={cn("pointer-events-none absolute -z-10 rounded-[inherit] border-solid border-[#1a1a2e]", markMotion, on ? "scale-100 opacity-100" : "scale-[0.985] opacity-0")}
      style={{ inset: -width, borderWidth: width, background: tint }}
    />
  )
}
