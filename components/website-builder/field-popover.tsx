"use client"

import * as React from "react"
import { ArrowLeft } from "lucide-react"

import { cn } from "@/lib/utils"
import { MobileEditorSheet } from "@/components/website-builder/mobile-editor-sheet"

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
 * Being its own sheet, it is outside the first one's flow entirely, so
 * nothing it does can change what that sheet measures.
 *
 * IT IS THE EDITOR'S SHEET, not one that looks like it. The first version
 * drew its own panel: a div that appeared, with no slide, no grabber to drag
 * and a header of its own invention. Next to the sections sheet it read as a
 * different piece of software. MobileEditorSheet is that sheet — the same
 * 360ms cubic-bezier(0.32, 0.72, 0, 1) travel, the same backdrop fade, the
 * same corner and shadow, the same drag to dismiss, the same reserve under
 * the keyboard — and `layer="raised"` is the slot it already keeps for a
 * sheet opened from a sheet.
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
   * THE SAME SHEET THE SECTIONS PANEL USES, on the layer it keeps for one
   * opened from another. Its header is the editor's own: an arrow, a name,
   * a hairline under it — the row you see at the top of Header Settings.
   */
  const screen = phone ? (
    <MobileEditorSheet open={open} onOpenChange={onOpenChange} layer="raised" detents={[0.92]}>
      <div data-field-screen className="flex min-h-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="Back"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-semibold">{title ?? "Choose"}</span>
        </div>
        <div className="wb-field-screen flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
      </div>
    </MobileEditorSheet>
  ) : null

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
