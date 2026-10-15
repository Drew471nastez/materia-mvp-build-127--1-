"use client"

/**
 * ===========================================================================
 *  A ROW THAT OPENS WHAT IT IS (round 31)
 * ===========================================================================
 * The owner: "clicking a space row does nothing; you must click Edit
 * separately". A row in Spaces, Feed, Learn and Calendar now opens its
 * editor (or its post) wherever it is pressed, the way a row in Products
 * opens the product. Its words are one button, so a keyboard reaches it
 * with Tab and opens it with Enter or Space, and a screen reader hears what
 * pressing it does. The row's own controls (its arrows, its menu) sit in
 * RowControls, which keeps their presses to themselves: a menu item picked
 * in its dropdown or sheet, drawn elsewhere in the page, would otherwise
 * reach the row through React and open the editor as well.
 */
import * as React from "react"
import { cn } from "@/lib/utils"

/** A pressable row: the pointer, a soft grey under it and while pressed, and the same when its button has the keyboard's focus. */
export const ROW_PRESS =
  "cursor-pointer transition-colors duration-100 hover:bg-[#fafafb] active:bg-[#f5f6f7] has-[[data-row-open]:focus-visible]:bg-[#f5f6f7] has-[[data-row-open]:focus-visible]:shadow-[inset_2px_0_0_#1a1a2e] [-webkit-tap-highlight-color:transparent]"

/** What pressing the row does: nothing when the press ended a text selection (so words can still be copied) or was on a link, which goes by itself. */
export function rowPress(open: () => void) {
  return (e: React.MouseEvent) => {
    if ((e.target as Element | null)?.closest?.("a[href]")) return
    const sel = typeof window !== "undefined" ? window.getSelection?.() : null
    if (sel && sel.type === "Range" && String(sel).trim()) return
    open()
  }
}

/** The row's words, as the one button a keyboard reaches. Its press reaches the row, which opens it. */
export function RowOpen({ label, children, className, ...rest }: { label: string; children: React.ReactNode; className?: string } & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children">) {
  return (
    <button type="button" data-row-open="" aria-label={label} className={cn("block min-w-0 cursor-pointer bg-transparent p-0 text-left outline-none", className)} {...rest}>
      {children}
    </button>
  )
}

/** The row's own controls: their presses stay theirs. */
export function RowControls({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div data-row-control="" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} className={cn("flex shrink-0 items-center", className)}>
      {children}
    </div>
  )
}
