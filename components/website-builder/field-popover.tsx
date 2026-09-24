"use client"

import * as React from "react"

import { cn } from "@/lib/utils"
import { useSheetExpand } from "@/components/website-builder/mobile-editor-sheet"

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
 *
 * ---------------------------------------------------------------------------
 *  ON A PHONE, NOTHING TAKES THE KEYBOARD AND THE PANEL IS SCROLLED TO
 * ---------------------------------------------------------------------------
 * Both pickers autofocus their search box, which is right at a keyboard and
 * wrong at a thumb. In the editor's bottom sheet the keyboard comes up over
 * the panel that has just opened underneath the field, so the list of pages
 * and products a person came for is entirely behind it and the only thing on
 * screen is the field they already had. "I cannot select anything."
 *
 * So the search box takes focus only where focusing is free, and the panel
 * scrolls itself into view in the sheet's own scroller, because a panel that
 * opens below the fold has opened somewhere nobody is looking. Typing still
 * works: tapping the box brings the keyboard up, and the sheet already
 * shrinks itself around one.
 */

/** The editor swaps to its phone layout here; see the editor page. */
const PHONE_MAX_WIDTH = 639

/**
 * True on a phone-sized screen. Exported because the pickers own their own
 * search inputs, and whether a field grabs the keyboard is the same question
 * for all of them.
 */
export function usePhoneLayout(): boolean {
  const [phone, setPhone] = React.useState(false)
  React.useEffect(() => {
    const query = window.matchMedia(`(max-width: ${PHONE_MAX_WIDTH}px)`)
    const read = () => setPhone(query.matches)
    read()
    query.addEventListener("change", read)
    return () => query.removeEventListener("change", read)
  }, [])
  return phone
}
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
  const panel = React.useRef<HTMLDivElement>(null)

  /**
   * INTO VIEW, IN WHATEVER IS SCROLLING IT.
   *
   * `block: "nearest"` moves the least that works, so a panel already on
   * screen does not jump, and one that opened under the fold comes up to it.
   * After a frame, because the panel has to be laid out before its height is
   * a number anything can scroll to.
   */
  /**
   * The sheet this field is in, if it is in one, asked for its full height
   * while the panel is open. At the middle stop the list opens below the
   * bottom of the window and there is nothing to tap.
   */
  const sheet = useSheetExpand()
  const expandId = React.useId()
  React.useEffect(() => {
    if (!sheet) return
    if (open) sheet.expand(expandId)
    else sheet.release(expandId)
    return () => sheet.release(expandId)
  }, [expandId, open, sheet])

  React.useEffect(() => {
    if (!open) return
    const id = requestAnimationFrame(() => {
      /**
       * THE PANEL'S OWN SCROLLER, AND NOTHING ABOVE IT. `scrollIntoView`
       * walks every scrollable ancestor, clipped ones and the window
       * included, and leaves each wherever it went. The one container the
       * field lives in is scrolled by hand, by the least that shows the panel.
       */
      const el = panel.current
      const scroller = el?.closest("[data-sheet-scroll], [data-wb-sidebar-scroll]") as HTMLElement | null
      if (!el || !scroller) return
      const r = el.getBoundingClientRect()
      const box = scroller.getBoundingClientRect()
      if (r.bottom <= box.bottom && r.top >= box.top) return
      const delta = r.bottom > box.bottom ? Math.min(r.bottom - box.bottom, r.top - box.top) : r.top - box.top
      scroller.scrollBy({ top: delta, behavior: "smooth" })
    })
    return () => cancelAnimationFrame(id)
  }, [open])

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
          ref={panel}
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
