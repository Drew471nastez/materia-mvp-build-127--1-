"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import { ChevronLeft } from "lucide-react"

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
 *
 * ---------------------------------------------------------------------------
 *  AND ON A PHONE IT IS A SCREEN, NOT AN EXPANSION
 * ---------------------------------------------------------------------------
 * In flow is right in a sidebar and wrong in a bottom sheet. The sheet
 * measures its own content to decide which detent to sit at, so a panel that
 * opens INSIDE it changes the number the sheet is reading: it re-snapped to
 * half the screen the moment the picker opened, and the list — the thing that
 * had just been asked for — was under the fold with a search box that could
 * not be reached. Reported as the sheet jumping to half and nothing being
 * selectable.
 *
 * So below the editor's own phone breakpoint the panel is a sheet of its own,
 * over the one it came from, with a back arrow and the field's name at the
 * top. That is what every builder that has met this does, and it is what the
 * owner asked for: a sub-page in the sheet rather than a modal inside it.
 * Being a portal, it is outside the first sheet's flow entirely, so nothing
 * it does can change what that sheet measures.
 */

/** The editor swaps to its phone layout here; see the editor page. */
const PHONE_MAX_WIDTH = 639

function usePhoneLayout(): boolean {
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
  title,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The closed state — a button that looks like the sidebar's inputs. */
  trigger: React.ReactNode
  children: React.ReactNode
  className?: string
  /** What the phone screen is called at the top. The field's own name. */
  title?: string
}) {
  const root = React.useRef<HTMLDivElement>(null)
  const phone = usePhoneLayout()

  React.useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (root.current?.contains(e.target as Node)) return
      /* On a phone the panel is a portal, so it is not inside `root` and a
         press in it would read as a press outside. Its own backdrop is what
         closes it there. */
      if ((e.target as HTMLElement | null)?.closest?.("[data-field-screen]")) return
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

  /**
   * A SHEET OVER THE SHEET. z-100 clears the editor's own, which draws its
   * backdrop at 70 and its surface at 80 when raised, so this cannot open
   * underneath the thing it was opened from.
   */
  const screen =
    open && phone && typeof document !== "undefined"
      ? createPortal(
          <div data-field-screen className="fixed inset-0 z-[100] flex flex-col justify-end">
            <button
              type="button"
              aria-label="Close"
              onClick={() => onOpenChange(false)}
              className="absolute inset-0 bg-black/40"
            />
            <div
              className="relative flex max-h-[86svh] min-h-[46svh] flex-col overflow-hidden rounded-t-2xl border-t border-border bg-background"
              style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
            >
              {/* The grabber, because everything else that arrives from the
                  bottom of this editor has one and a screen that does not
                  reads as a different kind of thing. */}
              <div className="flex justify-center pt-2.5">
                <span aria-hidden className="h-1 w-9 rounded-full bg-border" />
              </div>
              <div className="flex items-center gap-1 px-2 pb-2 pt-1.5">
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  aria-label="Back"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted"
                >
                  <ChevronLeft className="h-5 w-5" strokeWidth={2} />
                </button>
                <span className="flex-1 truncate text-center text-[15px] font-semibold">{title ?? "Choose"}</span>
                {/* The same width as the back button, so the title is centred
                    on the screen rather than on what is left of it. */}
                <span aria-hidden className="h-9 w-9 shrink-0" />
              </div>
              <div className="wb-field-screen flex min-h-0 flex-1 flex-col overflow-hidden border-t border-border">
                {children}
              </div>
            </div>
          </div>,
          document.body,
        )
      : null

  return (
    <div ref={root} className="relative">
      {trigger}
      {open && !phone && (
        <div
          className={cn(
            "wb-field-panel mt-1.5 overflow-hidden rounded-xl border border-border bg-background shadow-[0_12px_32px_-16px_rgba(15,23,42,0.35)]",
            className,
          )}
        >
          {children}
        </div>
      )}
      {screen}
    </div>
  )
}

/** The closed state of both pickers: the sidebar's input, with a chevron. */
export const FIELD_TRIGGER =
  "flex h-9 w-full items-center gap-2 rounded-lg border border-border bg-background px-2.5 text-left text-sm transition-colors hover:border-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
