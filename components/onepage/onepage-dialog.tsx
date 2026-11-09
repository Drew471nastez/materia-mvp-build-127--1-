"use client"

/**
 * ===========================================================================
 *  ONE DIALOG FOR WHAT A OnePage OPENS OVER ITSELF
 * ===========================================================================
 * Share, Subscribe, and the Terms and Privacy policy a visitor reads from the
 * footer all open through this. On a phone it is the app's own sheet
 * (components/ui/bottom-sheet): the same rise, drag and flick as every sheet
 * in Storelib. From 640px it is a centred card that fades and settles in.
 * Only one of the two is ever mounted, chosen by the width of the window the
 * page is drawn in (the editor's phone preview is a phone).
 *
 * THE PAGE'S OWN LIGHT. A dark page opens a dark card and a light page a
 * white one: `dark` picks one set of colours, handed to everything inside
 * as --sheet-* variables (and --legal-*, which the legal text reads), so no
 * part of the card is drawn in a colour of its own.
 *
 * ONE SURFACE, NO CORNERS SHOWING THROUGH. The card's colour is the card's
 * own background and its corners are its own: nothing inside is drawn edge
 * to edge in another colour behind the same radius, which is what left a
 * white hairline around the share card's coloured top.
 *
 * ROUND 41: THE PAGE BEHIND NEVER MOVES. Opening set `overflow: hidden` on
 * <html>, which takes the page's scrollbar away: on a computer the whole page
 * jumped sideways by the scrollbar's width and back on close. Nothing on html
 * or body is touched now. The page behind is kept still another way
 * (useStillPage): a wheel, a finger or a scrolling key is refused unless it
 * would scroll something inside the dialog that can still scroll that way.
 * The scrollbar stays, so nothing shifts.
 *
 * `centered` keeps the centred card on a phone too (Share, as it was before
 * round 40), and `bare` leaves the card's surface to what is inside it, for a
 * card made of two surfaces (Share's band in the page's colour over its
 * body): the card's own clip then cuts both at its corners, with nothing of
 * another colour behind them to show at the edge.
 */
import type React from "react"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { cn } from "@/lib/utils"

const LIGHT = {
  "--sheet-bg": "#ffffff",
  "--sheet-ink": "#1a1a2e",
  "--sheet-body": "#374151",
  "--sheet-muted": "#6b7280",
  "--sheet-rule": "#eef0f2",
  "--sheet-field": "#f3f4f6",
  "--sheet-hover": "#f3f4f6",
  "--sheet-on-ink": "#ffffff",
  "--sheet-error": "#dc2626",
}
const DARK = {
  "--sheet-bg": "#18181c",
  "--sheet-ink": "#f4f4f5",
  "--sheet-body": "#d4d4d8",
  "--sheet-muted": "#a1a1aa",
  "--sheet-rule": "rgba(255,255,255,0.09)",
  "--sheet-field": "rgba(255,255,255,0.07)",
  "--sheet-hover": "rgba(255,255,255,0.08)",
  "--sheet-on-ink": "#18181c",
  "--sheet-error": "#f87171",
}

/** The colours, as variables, for the sheet and the legal text inside it. */
export function sheetTokens(dark: boolean): React.CSSProperties {
  const t = dark ? DARK : LIGHT
  return {
    ...t,
    "--legal-ink": t["--sheet-ink"],
    "--legal-body": t["--sheet-body"],
    "--legal-muted": t["--sheet-muted"],
    "--legal-rule": t["--sheet-rule"],
    "--legal-rule-strong": dark ? "rgba(255,255,255,0.3)" : "#c9ccd2",
    "--legal-panel": t["--sheet-field"],
    "--legal-on-ink": t["--sheet-on-ink"],
    colorScheme: dark ? "dark" : "light",
  } as React.CSSProperties
}

const PHONE = "(max-width: 639px)"

/** Whether the window is a phone's width. Read before the first paint, so the right one of the two mounts. */
export function usePhoneWidth(): boolean | null {
  const [phone, setPhone] = useState<boolean | null>(null)
  useLayoutEffect(() => {
    const mq = window.matchMedia(PHONE)
    const read = () => setPhone(mq.matches)
    read()
    mq.addEventListener("change", read)
    return () => mq.removeEventListener("change", read)
  }, [])
  return phone
}

export function OnePageDialog({
  open,
  onClose,
  dark,
  label,
  header,
  children,
  width = 400,
  tall = false,
  scrollKey,
  centered = false,
  bare = false,
  phoneTop,
}: {
  open: boolean
  onClose: () => void
  dark: boolean
  label: string
  /** The centred card at every width, a phone's too. */
  centered?: boolean
  /** No surface of its own: what is inside draws it (see the note above). */
  bare?: boolean
  /** Drawn above the content: on a phone it is part of what drags the sheet. */
  header?: React.ReactNode
  children: React.ReactNode
  /** The card's width from 640px. */
  width?: number
  /** A reading sheet: a fixed height, so a document that arrives late does not move the top edge. */
  tall?: boolean
  /** When this changes the content goes back to its top. */
  scrollKey?: string | number
  /** Round AP: on a phone, the colour of the sheet's top behind its grip, where the header is drawn in a colour of its own (Share's band). */
  phoneTop?: string
}) {
  const phone = usePhoneWidth()
  const style = sheetTokens(dark)
  if (phone === null) return null
  if (phone && !centered) {
    return (
      <BottomSheet
        isOpen={open}
        onClose={onClose}
        label={label}
        header={header ? <div style={style}>{header}</div> : undefined}
        height={tall ? "88dvh" : undefined}
        maxHeight={tall ? "88dvh" : "min(86dvh, 640px)"}
        aboveKeyboard={!tall}
        scrollKey={scrollKey}
        handleBackground={phoneTop}
        className={dark ? "bg-[#18181c]" : "bg-white"}
      >
        <div style={style} className="text-[var(--sheet-body)]">
          {children}
        </div>
      </BottomSheet>
    )
  }
  return (
    <CenteredCard open={open} onClose={onClose} label={label} style={style} width={width} tall={tall} scrollKey={scrollKey} header={header} bare={bare} phone={phone}>
      {children}
    </CenteredCard>
  )
}

const EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)"
const IN_MS = 220
const OUT_MS = 160

function CenteredCard({
  open,
  onClose,
  label,
  style,
  width,
  tall,
  scrollKey,
  header,
  children,
  bare = false,
  phone = false,
}: {
  open: boolean
  onClose: () => void
  label: string
  bare?: boolean
  phone?: boolean
  style: React.CSSProperties
  width: number
  tall: boolean
  scrollKey?: string | number
  header?: React.ReactNode
  children: React.ReactNode
}) {
  const [mounted, setMounted] = useState(open)
  const [shown, setShown] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  useStillPage(open, rootRef)
  /* What it showed while open, kept while it leaves, so it never empties on the way out. */
  const kept = useRef<React.ReactNode>(children)
  const keptHeader = useRef<React.ReactNode>(header)
  if (open) {
    kept.current = children
    keptHeader.current = header
  }

  useEffect(() => {
    if (open) {
      setMounted(true)
      let second = 0
      const f = requestAnimationFrame(() => { second = requestAnimationFrame(() => setShown(true)) })
      return () => { cancelAnimationFrame(f); cancelAnimationFrame(second) }
    }
    setShown(false)
    const t = window.setTimeout(() => setMounted(false), OUT_MS)
    return () => window.clearTimeout(t)
  }, [open])

  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  })

  /* Focus moves into the card and back to whatever opened it; Escape closes; the page behind does not scroll. */
  useEffect(() => {
    if (!open || !mounted) return
    const before = document.activeElement as HTMLElement | null
    const f = requestAnimationFrame(() => panelRef.current?.focus({ preventScroll: true }))
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current()
      if (e.key === "Tab") {
        const nodes = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]') ?? []).filter(el => el.getClientRects().length > 0)
        const first = nodes[0]
        if (!first) { e.preventDefault(); return }
        const index = nodes.indexOf(document.activeElement as HTMLElement)
        e.preventDefault()
        const next = index < 0 ? (e.shiftKey ? nodes.length - 1 : 0) : (index + (e.shiftKey ? -1 : 1) + nodes.length) % nodes.length
        nodes[next].focus({preventScroll:true})
      }
    }
    document.addEventListener("keydown", onKey, true)
    return () => {
      cancelAnimationFrame(f)
      document.removeEventListener("keydown", onKey, true)
      if (before?.isConnected) before.focus({ preventScroll: true })
    }
  }, [open, mounted])

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }, [scrollKey])

  if (!mounted) return null
  return createPortal(
    <div ref={rootRef} className={cn("fixed inset-0 z-[200] flex items-center justify-center overscroll-contain", phone ? "p-4" : "p-6")} role="dialog" aria-modal="true" aria-label={label} data-onepage-dialog="">
      <div
        aria-hidden
        onClick={onClose}
        className="absolute inset-0 bg-black/45"
        style={{ opacity: shown ? 1 : 0, transition: `opacity ${shown ? IN_MS : OUT_MS}ms ${EASE}` }}
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        style={{
          ...style,
          width: "100%",
          maxWidth: width,
          height: tall ? "min(86vh, 820px)" : undefined,
          maxHeight: "min(86vh, 820px)",
          opacity: shown ? 1 : 0,
          /* translate and scale, named: the compositor moves them, and nothing transitions `transform`. */
          translate: bare || shown ? "0 0" : "0 8px",
          scale: bare || shown ? "1" : "0.985",
          transition: `opacity ${shown ? IN_MS : OUT_MS}ms ${EASE}, translate ${shown ? IN_MS : OUT_MS}ms ${EASE}, scale ${shown ? IN_MS : OUT_MS}ms ${EASE}`,
        }}
        className={cn(
          bare
            ? "relative flex flex-col overflow-hidden rounded-[28px] bg-transparent text-[var(--sheet-body)] shadow-[0_24px_64px_rgba(0,0,0,0.22),0_2px_8px_rgba(0,0,0,0.08)] outline-none"
            : "relative flex flex-col overflow-hidden rounded-[24px] bg-[var(--sheet-bg)] text-[var(--sheet-body)] shadow-[0_24px_64px_rgba(0,0,0,0.22),0_2px_8px_rgba(0,0,0,0.08)] outline-none",
        )}
        data-onepage-dialog-panel=""
      >
        {keptHeader.current ? <div className="shrink-0">{keptHeader.current}</div> : null}
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain" data-onepage-dialog-scroll="">
          {kept.current}
        </div>
      </div>
    </div>,
    document.body,
  )
}

const SCROLL_KEYS = new Set([" ", "PageUp", "PageDown", "Home", "End", "ArrowUp", "ArrowDown"])

/** Whether something from `from` up to `root` can still scroll by `dy` (down when positive). */
export function canScrollWithin(from: Element | null, root: Element | null, dy: number): boolean {
  for (let n: Element | null = from; n && root && root.contains(n); n = n.parentElement) {
    const el = n as HTMLElement
    const oy = getComputedStyle(el).overflowY
    if ((oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight + 1) {
      if (dy < 0 ? el.scrollTop > 0 : el.scrollTop + el.clientHeight < el.scrollHeight - 1) return true
    }
    if (n === root) break
  }
  return false
}

/**
 * THE PAGE BEHIND STAYS STILL, WITH ITS SCROLLBAR. While `open`, a wheel, a
 * finger or a scrolling key that would not scroll something inside `root` is
 * refused, so the page under the dialog cannot be scrolled; html and body are
 * never touched, so the page keeps its scrollbar and its width.
 */
export function useStillPage(open: boolean, rootRef: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return
    let startY = 0
    const inside = (t: EventTarget | null) => (t instanceof Element ? t : null)
    const onWheel = (e: WheelEvent) => {
      if (!e.cancelable) return
      if (!canScrollWithin(inside(e.target), rootRef.current, e.deltaY)) e.preventDefault()
    }
    const onStart = (e: TouchEvent) => {
      startY = e.touches[0]?.clientY ?? 0
    }
    const onMove = (e: TouchEvent) => {
      if (!e.cancelable) return
      const y = e.touches[0]?.clientY ?? startY
      if (!canScrollWithin(inside(e.target), rootRef.current, startY - y)) e.preventDefault()
      startY = y
    }
    const onKey = (e: KeyboardEvent) => {
      if (!SCROLL_KEYS.has(e.key)) return
      const t = inside(e.target) as HTMLElement | null
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return
      /* Space on a button or a link presses it. */
      if (e.key === " " && t?.closest("button, a, [role=button], [role=radio], [role=checkbox]")) return
      /* Arrows inside a group of choices move between them. */
      if (e.key.startsWith("Arrow") && t?.closest("[role=radiogroup], [role=listbox], [role=menu], [role=tablist]")) return
      /* The key would scroll the page behind (the card itself is focused, not its list): the list takes it instead. */
      e.preventDefault()
      const up = e.key === "PageUp" || e.key === "Home" || e.key === "ArrowUp" || (e.key === " " && e.shiftKey)
      const scroller = rootRef.current?.querySelector<HTMLElement>("[data-onepage-dialog-scroll]") ?? null
      if (!scroller || !canScrollWithin(scroller, rootRef.current, up ? -1 : 1)) return
      if (e.key === "Home" || e.key === "End") scroller.scrollTo({ top: e.key === "Home" ? 0 : scroller.scrollHeight })
      else scroller.scrollBy({ top: (up ? -1 : 1) * (e.key.startsWith("Arrow") ? 48 : scroller.clientHeight * 0.85) })
    }
    const opts = { passive: false, capture: true } as const
    window.addEventListener("wheel", onWheel, opts)
    window.addEventListener("touchstart", onStart, { passive: true, capture: true })
    window.addEventListener("touchmove", onMove, opts)
    window.addEventListener("keydown", onKey, true)
    return () => {
      window.removeEventListener("wheel", onWheel, opts)
      window.removeEventListener("touchstart", onStart, { capture: true })
      window.removeEventListener("touchmove", onMove, opts)
      window.removeEventListener("keydown", onKey, true)
    }
  }, [open, rootRef])
}

/** The round close button every one of these cards has, top right. */
export function SheetClose({ onClose, label = "Close" }: { onClose: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label={label}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--sheet-field)] text-[var(--sheet-muted)] transition-colors hover:text-[var(--sheet-ink)]"
    >
      <svg aria-hidden viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
        <path d="M5.5 5.5l9 9M14.5 5.5l-9 9" />
      </svg>
    </button>
  )
}
