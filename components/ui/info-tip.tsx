"use client"

import { useEffect, useId, useRef, useState } from "react"
import { cn } from "@/lib/utils"

/**
 * ===========================================================================
 *  THE LITTLE "i" BESIDE A HEADING
 * ===========================================================================
 *
 * A form asks for things whose answer is obvious to whoever wrote the form and
 * not to whoever is filling it in — which photograph becomes the thumbnail,
 * what "stare" is being asked about, why a brand is optional here and required
 * there. The answer to each of those is one sentence long, and there are two
 * ordinary places to put a sentence like that, both of which are worse than
 * this one:
 *
 *   UNDER THE HEADING, always visible. Every field grows a line of grey text,
 *   the form doubles in height, and the sentences are read exactly once — after
 *   which they are permanent furniture between you and the control you came to
 *   use.
 *
 *   IN A HELP PAGE. Nobody leaves a half-filled form to read one.
 *
 * So it is on demand: a mark you can ignore, and one sentence when you ask.
 *
 * ---------------------------------------------------------------------------
 * THE MARK ITSELF APPEARS ON HOVER — on a pointer, and only on a pointer
 * ---------------------------------------------------------------------------
 * At rest the heading is the heading. Bring a cursor near it and the mark fades
 * up; that is the whole affordance, and it costs the layout nothing because the
 * mark occupies its box either way — it changes opacity, never `display`, so a
 * heading does not reflow under the pointer.
 *
 * On a touch screen there is no hover to reveal anything with, and a control
 * that is invisible until an event that cannot happen is a control that does
 * not exist. So it is simply there, at low contrast. `@media (hover: hover)` is
 * the discriminator rather than a breakpoint, because a tablet is a wide screen
 * with no pointer and would otherwise get the desktop's invisible version.
 *
 * ---------------------------------------------------------------------------
 * AND THE BUBBLE OPENS BELOW-LEFT, NOT BESIDE
 * ---------------------------------------------------------------------------
 * Beside the mark is prettier and it is what the reference does. It is also the
 * one placement that cannot be made safe here without measuring: these sit at
 * the end of a heading, headings vary in length, and a bubble anchored to the
 * right of a long one leaves the card. Below-left is anchored to a point that
 * is always inside the card, is the same on every screen width, and needs no
 * layout read to be correct.
 */
export function InfoTip({
  children,
  className,
  label = "Mai multe informații",
}: {
  /** One sentence. If it needs two, it is not a tooltip. */
  children: React.ReactNode
  className?: string
  label?: string
}) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const wrap = useRef<HTMLSpanElement>(null)

  /**
   * A tap anywhere else closes it.
   *
   * Hover handles this for free on a pointer — the bubble goes when the cursor
   * does. On touch the bubble is opened by a tap and there is no matching
   * "untap", so without this the only way to dismiss one is to tap the mark
   * again, which nobody does: they tap the thing they were trying to reach, the
   * bubble stays over it, and the form appears stuck.
   *
   * `pointerdown` rather than `click`, so the bubble is gone before whatever
   * was underneath it receives the press.
   */
  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("pointerdown", away)
    document.addEventListener("keydown", esc)
    return () => {
      document.removeEventListener("pointerdown", away)
      document.removeEventListener("keydown", esc)
    }
  }, [open])

  return (
    <span ref={wrap} className={cn("info-tip relative inline-flex align-middle", className)}>
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "info-tip-mark flex h-[17px] w-[17px] items-center justify-center rounded-full",
          "bg-[#7c3aed]/10 text-[11px] font-bold leading-none text-[#7c3aed]",
          open && "info-tip-mark-open",
        )}
      >
        i
      </button>

      {/* ALWAYS IN THE DOM, never conditionally mounted.
          A mounted element can transition in both directions; an unmounted one
          can only pop — and this is opened by a hover, so it would pop on every
          pass of the cursor. `visibility` is in the transition list with a
          delay so it can be taken out of the accessibility tree and off the hit
          testing when closed, without that removal cutting the fade short. */}
      <span
        id={id}
        role="tooltip"
        className={cn("info-tip-bubble", open && "info-tip-bubble-open")}
      >
        {children}
        <span aria-hidden className="info-tip-arrow" />
      </span>
    </span>
  )
}
