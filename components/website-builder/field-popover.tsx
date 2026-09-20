"use client"

import * as React from "react"
import { createPortal } from "react-dom"

import { cn } from "@/lib/utils"
import { useSheetScreen } from "@/components/website-builder/mobile-editor-sheet"

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
 * IT IS A SUB-PAGE OF THAT SHEET, NOT A SECOND SHEET OVER IT.
 *
 * Two earlier attempts, each fixing the last one's fault and adding its own.
 * A panel drawn here appeared with no slide, no grabber and a header of its
 * own invention. A second MobileEditorSheet on the raised layer brought the
 * motion and the chrome, and stacked two sheets: the sections panel sat
 * behind the picker, overlapping it, and Back left it there.
 *
 * The sheet hosts a screen stack now. The picker pushes a title and a back
 * handler, and portals its own content into the slot the sheet gives it — so
 * the list stays live as somebody types in its search box. One sheet, one
 * surface, sliding across the way the sections list slides to a section's
 * settings.
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
   * The sheet this field is inside, if it is inside one. Null in the desktop
   * sidebar, which is how the in-flow panel stays the right answer there.
   */
  const host = useSheetScreen()
  const id = React.useId()
  const asScreen = phone && host !== null

  /*
    Pushed and popped as the field opens and closes, so the sheet's stack and
    this control can never disagree about whether a picker is up. The back
    arrow the sheet draws calls straight back into `onOpenChange`, which is
    the same path as picking something or pressing Escape.
  */
  const onOpenChangeRef = React.useRef(onOpenChange)
  onOpenChangeRef.current = onOpenChange
  React.useEffect(() => {
    if (!asScreen || !host) return
    if (open) host.open({ id, title: title ?? "Choose", onBack: () => onOpenChangeRef.current(false) })
    else host.close(id)
  }, [asScreen, host, id, open, title])

  /*
    And closed if the sheet takes the screen away by itself — dragged off, or
    the sheet closed under it.

    ONLY ONCE THE SCREEN HAS BEEN SEEN. The push above happens in an effect,
    so on the render right after `open` turns true the sheet has not processed
    it yet and `activeId` is still null. Without the latch that reads as "the
    sheet dropped my screen" and closes the picker on the frame it opened —
    which it did, silently: no panel, no screen, nothing at all.
  */
  const wasMounted = React.useRef(false)
  React.useEffect(() => {
    if (!asScreen || !open) {
      wasMounted.current = false
      return
    }
    if (host?.activeId === id) {
      wasMounted.current = true
      return
    }
    if (wasMounted.current) onOpenChangeRef.current(false)
  }, [asScreen, host?.activeId, id, open])

  const screen =
    asScreen && open && host?.container ? createPortal(children, host.container) : null

  return (
    <div ref={root} className="relative">
      {trigger}
      {open && !asScreen && (
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
