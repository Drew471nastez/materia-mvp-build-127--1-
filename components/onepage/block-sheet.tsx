"use client"

/**
 * A BLOCK OPENED IN A SHEET ON THE PAGE (round AL).
 *
 * A visitor taps a block (a Calendly booking, a video, a form, a post) and
 * either goes straight to its address or sees it in a sheet that rises over
 * the page: a title at the top, the block's own content, and a bar at the
 * foot with the block's button, Share and Close. The creator picks which, per
 * block, with `open_mode` on the block's data (lib/onepage/block-sheet).
 *
 * This file is the shared contract. Blocks call useBlockSheet().open(...);
 * BlockSheetProvider (drawn once around the public page, which is also what
 * the editor's preview frame draws) owns the sheet itself:
 *
 *   THE MOTION    the owner's Linktree recording: the card rises from a
 *                 smaller card set a little lower, fading in, in 300ms, the
 *                 page behind dimming; Close runs it back down, a little
 *                 smaller and fading, in 250ms (SHEET_MOTION). Web Animations
 *                 on translate, scale and opacity, started before the first
 *                 paint, so the first frame is never the sheet at rest, and a
 *                 close during the opening starts from where the card is.
 *                 With prefers-reduced-motion it only fades, briefly.
 *   THE SHAPE     on a phone, a sheet from the foot of the screen with its
 *                 top corners rounded and a strip of the page showing above
 *                 it; from 640px, a card in the middle of the window.
 *   THE PAGE      stays where it is, scrollbar and all (useStillPage, which
 *                 also holds on iOS where overscroll-behavior is ignored).
 *   FOCUS         moves into the sheet, Tab stays inside it, and goes back to
 *                 the block that opened it once the sheet has gone.
 *   WAYS OUT      Close, the dimmed page, Escape and the browser's Back. The
 *                 sheet stands on a history entry of its own (not in the
 *                 editor's preview, where Back belongs to the editor).
 *   SWIPE DOWN    (round AN) on a touch screen the sheet follows a finger
 *                 drawn down from anywhere on it, and on letting go either
 *                 leaves (dragged past SWIPE.closeAt of its height, or
 *                 flicked faster than SWIPE.flick) or springs back. A drag
 *                 that starts inside something scrolled away from its top
 *                 scrolls that instead, and a sideways one is left to a
 *                 carousel. lib/onepage/block-sheet swipeDecision decides.
 *   ONE AT A TIME the block's own button, when it opens something else on
 *                 the page (a product, a checkout), runs once the sheet has
 *                 gone and its history entry with it, so two windows are
 *                 never up together (as lib/onepage/purchase-flow does for
 *                 the product sheet and the checkout).
 */

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { Check, Share, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { sheetTokens, useStillPage } from "@/components/onepage/onepage-dialog"
import { BLOCK_SHEET_HISTORY_KEY, SHEET_MOTION, SWIPE, blockSheetEntryOf, swipeDecision } from "@/lib/onepage/block-sheet"
import type { ButtonThemeLike } from "@/lib/onepage/button-style"
import { isOnePagePreview, showPreviewNotice } from "@/lib/onepage/preview-notice"
import { backInFlight, backThen } from "@/lib/navigation/go-back"

export type OpenMode = "sheet" | "direct"

export interface BlockSheetRequest {
  /** The block that opened it, for analytics and to restore focus on close. */
  blockId: string
  /** The line at the top of the sheet: "Calendly", the video's title. */
  title: string
  /** What the sheet shows. Rendered lazily: only while the sheet is open. */
  body: ReactNode
  /** The block's own button in the bar at the foot ("Book a call"), when it has one. */
  cta?: { label: string; href?: string | null; icon?: ReactNode; onClick?: () => void } | null
  /** The address Share copies or hands to the system share sheet. Left out, Share is not drawn. */
  shareUrl?: string | null
  /** Let the body use the sheet's full height (an embed) instead of its natural height (a form). */
  fill?: boolean
  /** Told once when the sheet starts to close, however it was closed. */
  onClose?: () => void
}

export interface BlockSheetApi {
  open: (request: BlockSheetRequest) => void
  close: () => void
  /** False where no provider is drawn (a block rendered on its own): callers then go to the address directly. */
  available: boolean
}

const NONE: BlockSheetApi = { open: () => {}, close: () => {}, available: false }

export const BlockSheetContext = createContext<BlockSheetApi>(NONE)

export function useBlockSheet(): BlockSheetApi {
  return useContext(BlockSheetContext)
}

/** A block's chosen behaviour on tap. Blocks that embed something default to the sheet; plain links go direct. */
export function openModeOf(data: unknown, fallback: OpenMode = "direct"): OpenMode {
  const mode = (data as { open_mode?: unknown } | null | undefined)?.open_mode
  return mode === "sheet" || mode === "direct" ? mode : fallback
}

/** True inside the sheet's body: a post drawn there shows whole (components/onepage/compact-post). */
export const InBlockSheetContext = createContext(false)

/**
 * The page's theme, for what a block draws in the page's own button style
 * where it is not handed the theme (an Instagram post's "View full post",
 * components/onepage/compact-post). Null where no page is drawn around it.
 */
export const PageThemeContext = createContext<ButtonThemeLike | null>(null)

/* ── The provider ───────────────────────────────────────────────────────── */

type Shown = { request: BlockSheetRequest; key: number }

export function BlockSheetProvider({
  children,
  dark = false,
  theme = null,
}: {
  children: ReactNode
  /** The page is dark: the sheet is too, so a block drawn in the page's text colour reads inside it. */
  dark?: boolean
  /** The page's theme, handed on to the blocks inside (PageThemeContext). */
  theme?: ButtonThemeLike | null
}) {
  const [shown, setShown] = useState<Shown | null>(null)
  const [open, setOpen] = useState(false)
  const count = useRef(0)
  const api = useMemo<BlockSheetApi>(
    () => ({
      open: (request) => {
        count.current += 1
        setShown({ request, key: count.current })
        setOpen(true)
      },
      close: () => setOpen(false),
      available: true,
    }),
    [],
  )
  const gone = useCallback(() => setShown(null), [])
  return (
    <BlockSheetContext.Provider value={api}>
      <PageThemeContext.Provider value={theme}>
        {children}
        {shown ? <BlockSheetView key={shown.key} request={shown.request} open={open} dark={dark} onClose={api.close} onGone={gone} /> : null}
      </PageThemeContext.Provider>
    </BlockSheetContext.Provider>
  )
}

/* ── The sheet ──────────────────────────────────────────────────────────── */

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),iframe,[tabindex="0"]:not([data-focus-guard])'

/** The sheet's own focusable things, in order, drawn ones only. */
function focusables(panel: HTMLElement | null): HTMLElement[] {
  return Array.from(panel?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter((el) => el.getClientRects().length > 0)
}

/* A spring back with reduced motion: short, but still a move the finger started. */
const M_BACK_REDUCED = 120

function reducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches
  } catch {
    return false
  }
}

/** The history entry's state with our key set or taken off; whatever else it holds (Next's own) is kept. */
function historyWith(mark: string | null): Record<string, unknown> {
  const st: Record<string, unknown> = { ...((window.history.state as Record<string, unknown> | null) ?? {}) }
  delete st[BLOCK_SHEET_HISTORY_KEY]
  return mark ? { ...st, [BLOCK_SHEET_HISTORY_KEY]: mark } : st
}

function BlockSheetView({ request, open, dark, onClose, onGone }: { request: BlockSheetRequest; open: boolean; dark: boolean; onClose: () => void; onGone: () => void }) {
  const rootRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const backdropRef = useRef<HTMLDivElement>(null)
  const opener = useRef<HTMLElement | null>(null)
  /*
    What runs once the sheet is gone AND its history entry with it: the block's own button, when it opens something
    else on the page. Whichever of the two comes last runs it (refs, so a Back that lands after unmount still does).
  */
  const after = useRef<{ run: (() => void) | null; gone: boolean; left: boolean }>({ run: null, gone: false, left: true })
  const runAfter = useCallback(() => {
    const a = after.current
    if (!a.run || !a.gone || !a.left) return
    const run = a.run
    a.run = null
    run()
  }, [])
  const told = useRef(false)
  const mark = useRef<string | null>(null)
  /* Closed by a swipe: Close's motion then carries on from the finger rather than starting over. */
  const swipedOut = useRef(false)
  const [copied, setCopied] = useState(false)
  useStillPage(true, rootRef)

  const closeRef = useRef(onClose)
  const goneRef = useRef(onGone)
  const requestRef = useRef(request)
  useEffect(() => {
    closeRef.current = onClose
    goneRef.current = onGone
    requestRef.current = request
  })

  /* Who opened it, read before anything inside takes focus. */
  useLayoutEffect(() => {
    opener.current = document.activeElement as HTMLElement | null
  }, [])

  /* ── The motion: before the first paint, from where the card is. ── */
  useLayoutEffect(() => {
    const panel = panelRef.current
    const backdrop = backdropRef.current
    if (!panel || !backdrop || typeof panel.animate !== "function") {
      if (!open) goneRef.current()
      return
    }
    const still = reducedMotion()
    const M = SHEET_MOTION
    /* Copied out now: a computed style is live, and cancelling the running animations below would change it. */
    const live = getComputedStyle(panel)
    const was = { translate: live.translate, scale: live.scale, opacity: live.opacity }
    const wasBackdrop = getComputedStyle(backdrop).opacity
    const fromRunning = panel.getAnimations().length > 0
    for (const a of [...panel.getAnimations(), ...backdrop.getAnimations()]) a.cancel()
    const rest = { translate: "0 0", scale: "1", opacity: "1" }
    if (open) {
      const start = fromRunning
        ? { translate: was.translate === "none" ? "0 0" : was.translate, scale: was.scale === "none" ? "1" : was.scale, opacity: was.opacity }
        : still
          ? { translate: "0 0", scale: "1", opacity: "0" }
          : { translate: `0 ${M.from.translateY}`, scale: String(M.from.scale), opacity: "0" }
      const ms = still ? M.reducedMs : M.openMs
      panel.animate([{ translate: start.translate, scale: start.scale }, { translate: rest.translate, scale: rest.scale }], { duration: ms, easing: M.openEase, fill: "both" })
      panel.animate([{ opacity: start.opacity }, { opacity: "1" }], { duration: still ? ms : M.openFadeMs, easing: "ease-out", fill: "both" })
      backdrop.animate([{ opacity: fromRunning ? wasBackdrop : "0" }, { opacity: "1" }], { duration: ms, easing: "ease-out", fill: "both" })
      return
    }
    const from = { translate: was.translate === "none" ? "0 0" : was.translate, scale: was.scale === "none" ? "1" : was.scale, opacity: was.opacity }
    let move: Animation
    let ms: number
    if (swipedOut.current) {
      /* Let go past the line or flicked: it carries on down from under the finger, off the foot of the screen, and stays solid until late. */
      ms = still ? M.reducedMs : SWIPE.outMs
      move = panel.animate([from, { translate: still ? from.translate : "0 100%", scale: from.scale, opacity: "0" }], { duration: ms, easing: still ? "linear" : SWIPE.outEase, fill: "both" })
    } else {
      ms = still ? M.reducedMs : M.closeMs
      const end = still ? { translate: "0 0", scale: "1" } : { translate: `0 ${M.to.translateY}`, scale: String(M.to.scale) }
      move = panel.animate([from, { ...end, opacity: "0" }], { duration: ms, easing: M.closeEase, fill: "both" })
    }
    backdrop.animate([{ opacity: wasBackdrop }, { opacity: "0" }], { duration: ms, easing: "ease-in", fill: "both" })
    let done = false
    const finish = () => {
      if (done) return
      done = true
      goneRef.current()
    }
    move.finished.then(finish, () => {})
    /* A background tab never finishes an animation: gone regardless, a little after it should have. */
    const t = window.setTimeout(finish, ms + 120)
    return () => window.clearTimeout(t)
  }, [open])

  /* ── Told once that it is closing; the floating page buttons hide while it is up, as under every window on the page. ── */
  useEffect(() => {
    if (open) {
      told.current = false
      return
    }
    if (told.current) return
    told.current = true
    requestRef.current.onClose?.()
  }, [open])
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("pdfModalStateChange", { detail: { isOpen: true } }))
    return () => {
      window.dispatchEvent(new CustomEvent("pdfModalStateChange", { detail: { isOpen: false } }))
      const back = opener.current
      if (back && back !== document.body && back.isConnected) back.focus({ preventScroll: true })
      after.current.gone = true
      runAfter()
    }
  }, [runAfter])

  /* ── History: the sheet stands on an entry of its own, so Back closes it. ── */
  useEffect(() => {
    if (isOnePagePreview()) return
    const m = `${request.blockId}:${Date.now().toString(36)}`
    try {
      window.history.pushState(historyWith(m), "", window.location.href)
      mark.current = m
    } catch {
      mark.current = null
    }
    const onPop = () => {
      if (mark.current && blockSheetEntryOf(window.history.state) !== mark.current) {
        mark.current = null
        closeRef.current()
      }
    }
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* Closed some other way than Back: step off our entry, so Back from the page leaves the page and nothing else. */
  const leaveHistory = useCallback((then?: () => void) => {
    const m = mark.current
    mark.current = null
    const strip = () => {
      try {
        if (blockSheetEntryOf(window.history.state) === m) window.history.replaceState(historyWith(null), "", window.location.href)
      } catch {
        /* the entry stays marked; Back from it does nothing */
      }
    }
    if (!m || blockSheetEntryOf(window.history.state) !== m || backInFlight()) {
      strip()
      then?.()
      return
    }
    let settled = false
    const done = () => {
      if (settled) return
      settled = true
      window.removeEventListener("popstate", done)
      then?.()
    }
    window.addEventListener("popstate", done)
    /* Back off our entry, watched (lib/navigation/go-back): should it do nothing, the entry is unmarked instead. */
    backThen(() => {
      strip()
      done()
    }, 500)
  }, [])

  useEffect(() => {
    if (!open && mark.current) leaveHistory()
  }, [open, leaveHistory])

  /* ── Swipe down to close, on a touch screen. ── */
  useEffect(() => {
    const panel = panelRef.current
    const backdrop = backdropRef.current
    if (!open || !panel || !backdrop) return
    let start: { x: number; y: number } | null = null
    let from = 0
    let dragging = false
    let dy = 0
    let trail: { y: number; t: number }[] = []
    /* Something between the finger and the sheet scrolled away from its top: the finger scrolls that back first. */
    const scrolledAbove = (target: EventTarget | null) => {
      for (let el = target instanceof Element ? target : null; el && el !== panel; el = el.parentElement) if (el.scrollTop > 0) return true
      return false
    }
    const onStart = (e: TouchEvent) => {
      dragging = false
      start = null
      if (e.touches.length !== 1) return
      const t = e.target instanceof Element ? e.target : null
      if (t?.closest("input,textarea,select,[contenteditable='true'],[data-no-swipe]") || scrolledAbove(t)) return
      start = { x: e.touches[0].clientX, y: e.touches[0].clientY }
    }
    const onMove = (e: TouchEvent) => {
      if (!start) return
      const p = e.touches[0]
      if (!dragging) {
        const dx = p.clientX - start.x
        const d = p.clientY - start.y
        if (Math.abs(d) < SWIPE.slopPx && Math.abs(dx) < SWIPE.slopPx) return
        /* Up, or sideways: the sheet's own scroll or a carousel's, not ours. */
        if (d <= 0 || Math.abs(dx) > Math.abs(d)) {
          start = null
          return
        }
        dragging = true
        from = p.clientY
        /* Whatever the opening left behind (its fill), written down as the sheet's own style, so the finger moves it from where it is. */
        for (const a of [...panel.getAnimations(), ...backdrop.getAnimations()]) {
          try {
            a.commitStyles()
          } catch {
            /* not drawn: nothing to keep */
          }
          a.cancel()
        }
        panel.dataset.blockSheetDragging = ""
      }
      if (e.cancelable) e.preventDefault()
      dy = Math.max(0, p.clientY - from)
      const now = performance.now()
      trail.push({ y: p.clientY, t: now })
      trail = trail.filter((s) => now - s.t <= 100)
      panel.style.translate = `0 ${dy}px`
      backdrop.style.opacity = String(1 - Math.min(1, dy / Math.max(1, panel.offsetHeight)) * 0.9)
    }
    const onEnd = () => {
      if (!dragging) {
        start = null
        return
      }
      dragging = false
      start = null
      delete panel.dataset.blockSheetDragging
      const first = trail[0]
      const last = trail[trail.length - 1]
      const speed = first && last && last.t > first.t ? (last.y - first.y) / (last.t - first.t) : 0
      trail = []
      if (swipeDecision(dy, panel.offsetHeight, speed) === "close") {
        swipedOut.current = true
        closeRef.current()
        return
      }
      /* Not far enough, nor fast enough: back up into place. */
      const ms = reducedMotion() ? M_BACK_REDUCED : SWIPE.backMs
      panel.animate([{ translate: `0 ${dy}px` }, { translate: "0 0" }], { duration: ms, easing: SWIPE.backEase, fill: "both" })
      backdrop.animate([{ opacity: backdrop.style.opacity || "1" }, { opacity: "1" }], { duration: ms, easing: "ease-out", fill: "both" })
      dy = 0
    }
    panel.addEventListener("touchstart", onStart, { passive: true })
    panel.addEventListener("touchmove", onMove, { passive: false })
    panel.addEventListener("touchend", onEnd)
    panel.addEventListener("touchcancel", onEnd)
    return () => {
      panel.removeEventListener("touchstart", onStart)
      panel.removeEventListener("touchmove", onMove)
      panel.removeEventListener("touchend", onEnd)
      panel.removeEventListener("touchcancel", onEnd)
    }
  }, [open])

  /* ── Focus in, Tab kept inside, Escape out. ── */
  useEffect(() => {
    if (!open) return
    const panel = panelRef.current
    const f = requestAnimationFrame(() => panel?.focus({ preventScroll: true }))
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation()
        closeRef.current()
        return
      }
      if (e.key !== "Tab" || !panel) return
      const nodes = focusables(panel)
      if (!nodes.length) {
        e.preventDefault()
        return
      }
      const index = nodes.indexOf(document.activeElement as HTMLElement)
      const first = nodes[0]
      const last = nodes[nodes.length - 1]
      if (index < 0) {
        e.preventDefault()
        ;(e.shiftKey ? last : first).focus({ preventScroll: true })
      } else if (e.shiftKey && index === 0) {
        e.preventDefault()
        last.focus({ preventScroll: true })
      } else if (!e.shiftKey && index === nodes.length - 1) {
        e.preventDefault()
        first.focus({ preventScroll: true })
      }
    }
    /* Tab inside an embed's own document never reaches onKey; a step out of it that lands outside the sheet is brought back. */
    const onFocusIn = (e: FocusEvent) => {
      const t = e.target as Node | null
      if (!t || rootRef.current?.contains(t)) return
      ;(focusables(panel)[0] ?? panel)?.focus({ preventScroll: true })
    }
    document.addEventListener("keydown", onKey, true)
    document.addEventListener("focusin", onFocusIn, true)
    return () => {
      cancelAnimationFrame(f)
      document.removeEventListener("keydown", onKey, true)
      document.removeEventListener("focusin", onFocusIn, true)
    }
  }, [open])

  /* The guards at either end of the sheet: Tab past the last thing (or Shift+Tab out of an embed) comes round again. */
  const guard = (to: "first" | "last") => () => {
    const nodes = focusables(panelRef.current)
    ;(to === "first" ? nodes[0] : nodes[nodes.length - 1])?.focus({ preventScroll: true })
  }

  const { title, body, cta, shareUrl, fill } = request

  const pressCta = (e: React.MouseEvent) => {
    if (!cta) return
    if (cta.onClick) {
      e.preventDefault()
      /* After the sheet and its history entry are gone, so the next window opens over the page, not under this one. */
      after.current.run = cta.onClick
      if (mark.current) {
        after.current.left = false
        leaveHistory(() => {
          after.current.left = true
          runAfter()
        })
      }
      closeRef.current()
      return
    }
    if (cta.href && isOnePagePreview()) {
      e.preventDefault()
      showPreviewNotice("link")
    }
  }

  const share = async () => {
    if (!shareUrl) return
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> }
    if (nav.share && !isOnePagePreview() && window.matchMedia?.("(pointer: coarse)").matches) {
      try {
        await nav.share({ title, url: shareUrl })
        return
      } catch {
        /* dismissed, or not allowed here: copy instead */
      }
    }
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      /* no clipboard in this window */
    }
  }

  const round =
    "grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[var(--sheet-bg)] text-[var(--sheet-ink)] shadow-[0_1px_2px_rgba(0,0,0,0.08),0_4px_14px_rgba(0,0,0,0.10)] ring-1 ring-[var(--sheet-rule)] transition-[scale] duration-150 [-webkit-tap-highlight-color:transparent] active:scale-95 outline-none focus-visible:ring-2 focus-visible:ring-[var(--sheet-ink)]"
  const external = !!cta?.href && /^https?:/i.test(cta.href)

  return createPortal(
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      data-block-sheet=""
      data-block-sheet-open={open ? "" : undefined}
      className="fixed inset-0 z-[200] flex items-end justify-center overscroll-contain sm:items-center sm:p-6"
    >
      <div ref={backdropRef} aria-hidden onClick={onClose} data-block-sheet-backdrop="" className="absolute inset-0" style={{ background: `rgba(0,0,0,${SHEET_MOTION.backdrop})`, opacity: 0 }} />
      <div
        ref={panelRef}
        tabIndex={-1}
        data-block-sheet-panel=""
        style={{ ...sheetTokens(dark), opacity: 0 }}
        className={cn(
          "relative mx-2 flex w-full origin-bottom flex-col overflow-hidden rounded-t-[24px] bg-[var(--sheet-bg)] text-[var(--sheet-body)] shadow-[0_-8px_40px_rgba(0,0,0,0.18)] outline-none will-change-[translate,scale,opacity]",
          "sm:mx-0 sm:origin-center sm:rounded-[24px] sm:shadow-[0_24px_64px_rgba(0,0,0,0.24),0_2px_8px_rgba(0,0,0,0.08)]",
          fill ? "h-[calc(100dvh-env(safe-area-inset-top)-16px)] sm:h-[min(760px,calc(100dvh-64px))] sm:max-w-[520px]" : "max-h-[calc(100dvh-env(safe-area-inset-top)-16px)] sm:max-h-[min(760px,calc(100dvh-64px))] sm:max-w-[480px]",
        )}
      >
        <span tabIndex={0} data-focus-guard="" aria-hidden onFocus={guard("last")} className="sr-only" />
        {/* The grip on a phone: the sheet can be drawn down. Drawn over the title's top padding, so nothing moves. */}
        <span aria-hidden data-block-sheet-grip="" className="pointer-events-none absolute left-1/2 top-[6px] h-[4px] w-9 -translate-x-1/2 rounded-full bg-[var(--sheet-muted)] opacity-35 sm:hidden" />
        <h2 className="shrink-0 truncate px-14 pb-2.5 pt-4 text-center text-[15px] font-medium text-[var(--sheet-ink)]" data-block-sheet-title="">
          {title}
        </h2>
        <div
          className={cn("relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 sm:px-4", fill ? "flex flex-col" : "pb-2")}
          data-onepage-dialog-scroll=""
          data-block-sheet-body=""
        >
          {fill ? (
            <span aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center gap-1.5" data-block-sheet-dots="">
              {[0, 1, 2].map((i) => (
                <span key={i} className="h-1.5 w-1.5 rounded-full bg-[var(--sheet-muted)] opacity-60 motion-safe:animate-pulse" style={{ animationDelay: `${i * 160}ms` }} />
              ))}
            </span>
          ) : null}
          <div className={cn("relative", fill && "flex min-h-0 flex-1 flex-col [&>*]:min-h-0 [&>*]:flex-1")}><InBlockSheetContext.Provider value>{body}</InBlockSheetContext.Provider></div>
        </div>
        <div className="flex shrink-0 items-center gap-2 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3" data-block-sheet-foot="">
          {cta ? (
            cta.href ? (
              <a
                href={cta.href}
                target={external ? "_blank" : undefined}
                rel={external ? "noopener noreferrer" : undefined}
                onClick={pressCta}
                data-block-sheet-cta=""
                className="flex h-11 min-w-0 max-w-[60%] items-center gap-2 rounded-full bg-[var(--sheet-ink)] px-4 text-[14px] font-semibold text-[var(--sheet-on-ink)] transition-[scale] duration-150 active:scale-[0.97] outline-none focus-visible:ring-2 focus-visible:ring-[var(--sheet-ink)] focus-visible:ring-offset-2"
              >
                {cta.icon ? <span aria-hidden className="grid h-5 w-5 shrink-0 place-items-center [&>svg]:h-[18px] [&>svg]:w-[18px]">{cta.icon}</span> : null}
                <span className="truncate">{cta.label}</span>
              </a>
            ) : (
              <button
                type="button"
                onClick={pressCta}
                data-block-sheet-cta=""
                className="flex h-11 min-w-0 max-w-[60%] items-center gap-2 rounded-full bg-[var(--sheet-ink)] px-4 text-[14px] font-semibold text-[var(--sheet-on-ink)] transition-[scale] duration-150 active:scale-[0.97] outline-none focus-visible:ring-2 focus-visible:ring-[var(--sheet-ink)] focus-visible:ring-offset-2"
              >
                {cta.icon ? <span aria-hidden className="grid h-5 w-5 shrink-0 place-items-center [&>svg]:h-[18px] [&>svg]:w-[18px]">{cta.icon}</span> : null}
                <span className="truncate">{cta.label}</span>
              </button>
            )
          ) : null}
          <span className="flex-1" />
          {shareUrl ? (
            <button type="button" onClick={() => void share()} aria-label={copied ? tt("Link copied") : tt("Share")} data-block-sheet-share="" className={round}>
              {copied ? <Check aria-hidden className="h-[18px] w-[18px]" /> : <Share aria-hidden className="h-[18px] w-[18px]" />}
            </button>
          ) : null}
          <button type="button" onClick={onClose} aria-label={tt("Close")} data-block-sheet-close="" className={round}>
            <X aria-hidden className="h-[18px] w-[18px]" />
          </button>
          <span aria-live="polite" className="sr-only">
            {copied ? tt("Link copied") : ""}
          </span>
        </div>
        <span tabIndex={0} data-focus-guard="" aria-hidden onFocus={guard("first")} className="sr-only" />
      </div>
    </div>,
    document.body,
  )
}
