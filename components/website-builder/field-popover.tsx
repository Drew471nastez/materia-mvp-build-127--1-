"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * ===========================================================================
 *  A PANEL THAT OPENS WHERE THE FIELD IS
 * ===========================================================================
 * Both the icon picker and the link picker need the same thing: a control
 * that looks like the sidebar's other inputs, and a panel that opens under it
 * without leaving the sidebar.
 *
 * IN FLOW, NOT FLOATING. A popover positioned against the viewport has to be
 * measured, re-measured on every scroll of the panel it sits in, and flipped
 * when it runs off the bottom — and the sidebar is itself a scroller inside a
 * canvas that is inside a phone sheet. Opening in the flow instead means the
 * settings below it move down, which is what a person expects of a thing that
 * expands, and it cannot be clipped by a scroller it is inside of or land
 * under the fold with nothing to scroll it into view.
 *
 * Closing is Escape, a click outside, or picking something. Not a hover:
 * these are chosen deliberately, and a panel that vanishes when the pointer
 * strays is a panel you have to chase.
 */
export function FieldPopover({
  open,
  onOpenChange,
  trigger,
  children,
  className,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The closed state — a button that looks like the sidebar's inputs. */
  trigger: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  const root = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (root.current?.contains(e.target as Node)) return
      onOpenChange(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      // Only this panel: an Escape meant for a picker should not also close
      // the sheet the sidebar is in, or the editor behind that.
      e.stopPropagation()
      onOpenChange(false)
    }
    document.addEventListener("pointerdown", onDown)
    document.addEventListener("keydown", onKey, true)
    return () => {
      document.removeEventListener("pointerdown", onDown)
      document.removeEventListener("keydown", onKey, true)
    }
  }, [open, onOpenChange])

  return (
    <div ref={root} className="relative">
      {trigger}
      {open && (
        <div
          className={cn(
            "wb-field-panel mt-1.5 overflow-hidden rounded-xl border border-border bg-background shadow-[0_12px_32px_-16px_rgba(15,23,42,0.35)]",
            className,
          )}
        >
          {children}
        </div>
      )}
    </div>
  )
}

/** The closed state of both pickers: the sidebar's input, with a chevron. */
export const FIELD_TRIGGER =
  "flex h-9 w-full items-center gap-2 rounded-lg border border-border bg-background px-2.5 text-left text-sm transition-colors hover:border-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
