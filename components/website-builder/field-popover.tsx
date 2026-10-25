"use client"

import * as React from "react"
import { createPortal } from "react-dom"

import { cn } from "@/lib/utils"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { useSheetExpand } from "@/components/website-builder/mobile-editor-sheet"
import { tt } from "@/lib/i18n/text"
import { scrollMoves } from "@/lib/website-builder/scroll-moves"

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
 * The link picker asks for `float`, and at a computer gets a panel that
 * hangs from the field instead (FloatingFieldPanel, at the foot of this
 * file): the owner wanted Shopify's, and a list that pushed every setting
 * under it down and back up was the sidebar jumping twice per link. On a
 * phone a `float` panel opens in the app's bottom sheet instead (the owner:
 * "on mobile it doesn't act as an inline modal, it opens as a mobile bottom
 * sheet"), and only the other pickers stay in the flow as described here.
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
  float = false,
  onEscape,
  sheetHeader,
  sheetLabel,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The closed state — a button that looks like the sidebar's inputs. */
  trigger: React.ReactNode
  children: React.ReactNode
  className?: string
  /**
   * At a computer, hang the panel from the field instead of opening it in
   * the flow (FloatingFieldPanel, below). A phone keeps the flow either way.
   */
  float?: boolean
  /** Asked first on Escape: true when the panel used it (a list going back a level), so it stays open. */
  onEscape?: () => boolean
  /**
   * On a phone, a `float` panel opens in the app's own bottom sheet rather
   * than in the flow of the sidebar: drawn above the editor, with the pill to
   * drag it away, the way every other choice on a phone is made. This goes at
   * the top of the sheet (the link picker's search box, which in the sidebar
   * is the field itself and would be behind the sheet).
   */
  sheetHeader?: React.ReactNode
  /** What the sheet is called, for a screen reader: it has no visible title. */
  sheetLabel?: string
}) {
  const phone = usePhoneLayout()
  if (float && phone) {
    return (
      <div className={className}>
        {trigger}
        <BottomSheet
          isOpen={open}
          onClose={() => onOpenChange(false)}
          label={sheetLabel ?? tt("Choose")}
          hideFrom="sm"
          aboveKeyboard
          maxHeight="min(80dvh, 640px)"
        >
          <div data-field-sheet="" className="flex min-h-0 flex-col pb-[max(8px,env(safe-area-inset-bottom))]">
            {sheetHeader}
            {children}
          </div>
        </BottomSheet>
      </div>
    )
  }
  if (float && !phone) {
    return (
      <FloatingFieldPanel open={open} onOpenChange={onOpenChange} trigger={trigger} className={className} onEscape={onEscape}>
        {children}
      </FloatingFieldPanel>
    )
  }
  return (
    <InFlowPanel open={open} onOpenChange={onOpenChange} trigger={trigger} className={className} onEscape={onEscape}>
      {children}
    </InFlowPanel>
  )
}

type PanelProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  trigger: React.ReactNode
  children: React.ReactNode
  className?: string
  onEscape?: () => boolean
}

function InFlowPanel({ open, onOpenChange, trigger, children, className, onEscape }: PanelProps) {
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
      if (onEscape?.()) return
      onOpenChange(false)
    }
    document.addEventListener("pointerdown", onDown)
    document.addEventListener("keydown", onKey, true)
    return () => {
      document.removeEventListener("pointerdown", onDown)
      document.removeEventListener("keydown", onKey, true)
    }
  }, [open, onOpenChange, onEscape])

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

/**
 * ===========================================================================
 *  AT A COMPUTER, A PANEL THAT HANGS FROM THE FIELD
 * ===========================================================================
 * "Like Shopify's." Opening in the flow pushed every setting below the field
 * down by the height of the list, and back up when it closed: the sidebar
 * jumped twice for every link chosen. At a computer the panel now floats,
 * anchored to the field, and nothing under it moves.
 *
 * WHERE IT GOES. Under the field, or over it when the sidebar has not got
 * the room underneath and has more above. "The room" is what is visible of
 * every scroller the field is inside, the window included, so a field near
 * the foot of the sidebar opens upward instead of under the fold. The side
 * is chosen when it opens and kept while it still fits, so going into a
 * list and out again does not flip it.
 *
 * IT FOLLOWS THE FIELD. The sidebar scrolls under an open panel; the panel
 * is placed again on every scroll of anything, written straight to its
 * style in the scroll event so it moves in the same frame, and React never
 * hears about it. When the field has scrolled entirely out of its sidebar
 * the panel closes, because a list hanging from nothing is a list of what?
 *
 * Over it, the window's own `document.body`, at FIELD_FLOAT_Z: above
 * Project settings (150), where the navigation's link fields live, and its
 * backups dialog (160); under the leave confirmation (320).
 *
 * Opening is opacity and a 4px drop toward the field's side; closing is the
 * same, shorter, and then it goes. When what is in it changes height (a list
 * opened, a search narrowing) its height moves there over 160ms rather than
 * jumping. All of it by the Web Animations API on transform, opacity and
 * the one height, and none of it under reduced motion.
 */
export const FIELD_FLOAT_Z = 200
/** The tallest the panel gets: a back row and eight 36px rows fit without scrolling. */
export const FIELD_FLOAT_MAX_H = 360
const FLOAT_MIN_H = 132
const FLOAT_GAP = 6
const FLOAT_EDGE = 8
const FLOAT_MIN_W = 260
const EASE_OUT = "cubic-bezier(0.32, 0.72, 0, 1)"

type Side = "below" | "above"

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

/**
 * Every scroller the field is inside: what of the field can be seen is what
 * is inside all of them. Scrollers only, not every `overflow: hidden` box:
 * the panel is not inside those (it is in the body), so a card that rounds
 * its corners is not the room the panel has.
 */
function scrollingAncestors(el: HTMLElement): HTMLElement[] {
  const out: HTMLElement[] = []
  for (let n = el.parentElement; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
    if (/(auto|scroll)/.test(getComputedStyle(n).overflowY)) out.push(n)
  }
  return out
}

function FloatingFieldPanel({ open, onOpenChange, trigger, children, className, onEscape }: PanelProps) {
  const root = React.useRef<HTMLDivElement>(null)
  const panel = React.useRef<HTMLDivElement>(null)
  /** In the page while open, and for as long as its close plays. */
  const [present, setPresent] = React.useState(open)
  if (open && !present) setPresent(true)
  /**
   * What it showed when it was last open, drawn for the length of its close.
   * A pick resets the list behind it (back to the first list, the search
   * cleared), and a panel that changed its rows while fading out would show
   * the wrong list on its way out.
   */
  const [shownChildren, setShownChildren] = React.useState(children)
  if (open && shownChildren !== children) setShownChildren(children)
  const side = React.useRef<Side | null>(null)
  const shownHeight = React.useRef(0)
  const clips = React.useRef<HTMLElement[]>([])
  const onOpenChangeRef = React.useRef(onOpenChange)
  React.useEffect(() => {
    onOpenChangeRef.current = onOpenChange
  })

  const sheet = useSheetExpand()
  const expandId = React.useId()
  React.useEffect(() => {
    if (!sheet) return
    if (open) sheet.expand(expandId)
    else sheet.release(expandId)
    return () => sheet.release(expandId)
  }, [expandId, open, sheet])

  /**
   * Places the panel. Reads the field, the clipping scrollers and the
   * panel's own natural height; writes top or bottom, left, width and the
   * height it may take. `tween` is false while scrolling: a height that
   * changes because the room did is not a change anybody asked to watch.
   */
  const place = React.useCallback((tween: boolean) => {
    const anchor = root.current
    const el = panel.current
    if (!anchor || !el) return
    const a = anchor.getBoundingClientRect()
    const vw = document.documentElement.clientWidth
    const vh = document.documentElement.clientHeight
    let top = 0
    let bottom = vh
    for (const c of clips.current) {
      const r = c.getBoundingClientRect()
      top = Math.max(top, r.top)
      bottom = Math.min(bottom, r.bottom)
    }
    /* Scrolled entirely out of the sidebar it is in: closed. */
    if (a.bottom <= top || a.top >= bottom) {
      onOpenChangeRef.current(false)
      return
    }
    /* Its natural height: what the list would be with room for all of it, plus everything around the list. */
    const scroller = el.querySelector<HTMLElement>("[data-float-scroll]")
    const natural = scroller ? scroller.scrollHeight + (el.offsetHeight - scroller.clientHeight) : el.scrollHeight
    const want = Math.min(natural, FIELD_FLOAT_MAX_H)
    const below = bottom - FLOAT_EDGE - (a.bottom + FLOAT_GAP)
    const above = a.top - FLOAT_GAP - (top + FLOAT_EDGE)
    let s = side.current
    if (!s || (s === "below" ? below : above) < want) {
      s = below >= want ? "below" : above >= want ? "above" : below >= above ? "below" : "above"
    }
    side.current = s
    const room = s === "below" ? below : above
    const maxH = Math.max(FLOAT_MIN_H, Math.min(FIELD_FLOAT_MAX_H, room))
    const width = Math.max(a.width, FLOAT_MIN_W)
    const left = Math.max(FLOAT_EDGE, Math.min(a.left, vw - FLOAT_EDGE - width))
    el.style.left = `${left}px`
    el.style.width = `${width}px`
    el.style.maxHeight = `${maxH}px`
    if (s === "below") {
      el.style.top = `${a.bottom + FLOAT_GAP}px`
      el.style.bottom = ""
    } else {
      el.style.top = ""
      el.style.bottom = `${vh - a.top + FLOAT_GAP}px`
    }
    el.dataset.side = s
    const h = Math.min(natural, maxH)
    const from = shownHeight.current
    shownHeight.current = h
    if (tween && from > 0 && Math.abs(from - h) > 1 && !reducedMotion()) {
      /**
       * From the height it was drawn at. The new rows are already laid out
       * by now, so the box itself measures the new height; mid-tween it is
       * where the last tween had got to, which is not where it was going.
       */
      const running = el.getAnimations().find((a) => a.id === "height" && a.playState === "running")
      const start = running ? el.getBoundingClientRect().height : from
      running?.cancel()
      const anim = el.animate([{ height: `${start}px` }, { height: `${h}px` }], { duration: 180, easing: EASE_OUT })
      anim.id = "height"
    }
  }, [])

  /* Built: placed before it is painted, then brought in from its side. */
  React.useLayoutEffect(() => {
    if (!present) return
    const anchor = root.current
    const el = panel.current
    if (!anchor || !el) return
    clips.current = scrollingAncestors(anchor)
    side.current = null
    shownHeight.current = 0
    place(false)
    if (!reducedMotion()) {
      const dy = side.current === "above" ? 4 : -4
      el.animate(
        [
          { opacity: 0, transform: `translate3d(0, ${dy}px, 0) scale(0.985)` },
          { opacity: 1, transform: "none" },
        ],
        { duration: 160, easing: EASE_OUT },
      )
    }
  }, [present, place])

  /* Closed: played out, then gone. Opened again mid-close: the close is dropped. */
  React.useEffect(() => {
    if (open || !present) return
    const el = panel.current
    if (!el || reducedMotion()) {
      setPresent(false)
      return
    }
    const dy = side.current === "above" ? 4 : -4
    const anim = el.animate(
      [
        { opacity: 1, transform: "none" },
        { opacity: 0, transform: `translate3d(0, ${dy}px, 0) scale(0.985)` },
      ],
      { duration: 110, easing: "ease-in", fill: "forwards" },
    )
    anim.onfinish = () => setPresent(false)
    return () => anim.cancel()
  }, [open, present])

  /* Follows the field: every scroll of anything, the window resizing, the field or the list changing size. */
  React.useEffect(() => {
    if (!present) return
    /* Only a scroll that moves the field: never the canvas scrolling past (lib/website-builder/scroll-moves.ts). */
    const onScroll = (e: Event) => {
      if (e.type === "scroll" && !scrollMoves(e, root.current)) return
      place(false)
    }
    window.addEventListener("scroll", onScroll, { capture: true, passive: true })
    window.addEventListener("resize", onScroll)
    window.visualViewport?.addEventListener("resize", onScroll)
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(() => place(true)) : null
    if (root.current) ro?.observe(root.current)
    const content = panel.current?.querySelector<HTMLElement>("[data-float-scroll]")
    const watch = () => {
      for (const child of Array.from(content?.children ?? [])) ro?.observe(child)
    }
    watch()
    if (content) ro?.observe(content)
    const mo = content && typeof MutationObserver === "function" ? new MutationObserver(() => {
      watch()
      place(true)
    }) : null
    if (content) mo?.observe(content, { childList: true })
    return () => {
      window.removeEventListener("scroll", onScroll, { capture: true })
      window.removeEventListener("resize", onScroll)
      window.visualViewport?.removeEventListener("resize", onScroll)
      ro?.disconnect()
      mo?.disconnect()
    }
  }, [present, place])

  React.useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (root.current?.contains(t) || panel.current?.contains(t)) return
      onOpenChange(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      e.stopPropagation()
      if (onEscape?.()) return
      onOpenChange(false)
    }
    document.addEventListener("pointerdown", onDown)
    document.addEventListener("keydown", onKey, true)
    return () => {
      document.removeEventListener("pointerdown", onDown)
      document.removeEventListener("keydown", onKey, true)
    }
  }, [open, onOpenChange, onEscape])

  return (
    <div ref={root} className="relative">
      {trigger}
      {present &&
        createPortal(
          <div
            ref={panel}
            data-state={open ? "open" : "closed"}
            inert={!open}
            style={{ position: "fixed", zIndex: FIELD_FLOAT_Z }}
            className={cn(
              "wb-field-panel flex flex-col overflow-hidden rounded-xl border border-border bg-background shadow-[0_16px_40px_-18px_rgba(15,23,42,0.4),0_2px_6px_-2px_rgba(15,23,42,0.08)]",
              className,
            )}
          >
            {open ? children : shownChildren}
          </div>,
          document.body,
        )}
    </div>
  )
}

/** The closed state of both pickers: the sidebar's input, with a chevron. */
export const FIELD_TRIGGER =
  "flex h-9 w-full items-center gap-2 rounded-lg border border-border bg-background px-2.5 text-left text-sm transition-colors hover:border-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
