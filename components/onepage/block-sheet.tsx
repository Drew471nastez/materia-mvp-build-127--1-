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
 *                 Round AP: a mouse draws it down the same way by its grip
 *                 and title, at a phone's width and on a computer.
 *   THE KEYBOARD  (round AP) a field in the sheet with the keyboard up
 *                 hides the foot bar; it comes back when the keyboard goes.
 *   LATE CONTENT  (round AP) content that grows after the press (a form's
 *                 questions, a post's height) eases the sheet to its new
 *                 height instead of moving its top edge in one frame.
 *   ONE AT A TIME the block's own button, when it opens something else on
 *                 the page (a product, a checkout), runs once the sheet has
 *                 gone and its history entry with it, so two windows are
 *                 never up together (as lib/onepage/purchase-flow does for
 *                 the product sheet and the checkout).
 */

import { createContext, memo, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { Check, Share, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { sheetTokens, useStillPage } from "@/components/onepage/onepage-dialog"
import { BLOCK_SHEET_HISTORY_KEY, SHEET_MOTION, SWIPE, blockSheetEntryOf, swipeDecision } from "@/lib/onepage/block-sheet"
import type { ButtonThemeLike } from "@/lib/onepage/button-style"
import { isOnePagePreview, showPreviewNotice } from "@/lib/onepage/preview-notice"
import { backInFlight, backThen } from "@/lib/navigation/go-back"
import { KEYBOARD_CHANGE_EVENT, readPublishedKeyboardInset } from "@/lib/ui/keyboard-safe-sheet"
import { keyboardState, revealDelta, type KeyboardMemory } from "@/lib/onepage/feel"
import { keepableSheet, pauseFrames } from "@/lib/onepage/embed-warm"

export type OpenMode = "sheet" | "direct"

/* The contract (the request, the API, the context and its hook) lives in ./block-sheet-context (round AN), so asking for the sheet does not load it. */
import { BlockSheetContext, InBlockSheetContext, SheetBackContext, type BlockSheetApi, type BlockSheetRequest, type SheetBackApi } from "./block-sheet-context"
export { BlockSheetContext, type BlockSheetApi, type BlockSheetRequest } from "./block-sheet-context"

export function useBlockSheet(): BlockSheetApi {
  return useContext(BlockSheetContext)
}

/** A block's chosen behaviour on tap. Blocks that embed something default to the sheet; plain links go direct. */
export function openModeOf(data: unknown, fallback: OpenMode = "direct"): OpenMode {
  const mode = (data as { open_mode?: unknown } | null | undefined)?.open_mode
  return mode === "sheet" || mode === "direct" ? mode : fallback
}

/* True inside the sheet's body (./block-sheet-context, round AS: there, so an embed asks without loading the sheet). */
export { InBlockSheetContext } from "./block-sheet-context"

/**
 * The page's theme, for what a block draws in the page's own button style
 * where it is not handed the theme (an Instagram post's "View full post",
 * components/onepage/compact-post). Null where no page is drawn around it.
 */
export const PageThemeContext = createContext<ButtonThemeLike | null>(null)

/* ── The provider ───────────────────────────────────────────────────────── */

/*
 * KEPT (round AS). A sheet that held an embed (a player, a map, a post) is
 * not thrown away when it closes: it stays mounted, hidden and out of reach,
 * and the next tap on the same block shows it again with its frame already
 * loaded, nothing asked for twice. A player in it is told to pause as the
 * sheet goes (lib/onepage/embed-warm pauseFrames); a frame whose service
 * cannot be told is not kept. The same hidden sheet is how a sheet is
 * started before the tap (prewarm). At most KEEP_SHEETS are kept, the
 * longest unused going first. A sheet without a frame (a form, a list) goes
 * as it always did, so it opens fresh each time.
 */
const KEEP_SHEETS = 3

type SheetState = "open" | "closing" | "kept"
type Shown = { request: BlockSheetRequest; key: number; state: SheetState; session: number; used: number }

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
  const [sheets, setSheets] = useState<Shown[]>([])
  const count = useRef(0)
  const api = useMemo<BlockSheetApi>(() => {
    const trim = (list: Shown[]) => {
      const kept = list.filter((x) => x.state === "kept").sort((a, b) => b.used - a.used)
      const drop = new Set(kept.slice(KEEP_SHEETS).map((x) => x.key))
      return drop.size ? list.filter((x) => !drop.has(x.key)) : list
    }
    return {
      open: (request) => {
        count.current += 1
        const n = count.current
        setSheets((list) => {
          const same = list.find((x) => x.request.blockId === request.blockId && x.state !== "open")
          /* One window at a time: anything else still up goes at once, as a new sheet always replaced the last. */
          const rest = list.filter((x) => x !== same && x.state === "kept")
          const next: Shown = same ? { ...same, request, state: "open", session: n, used: n } : { request, key: n, state: "open", session: n, used: n }
          return trim([...rest, next])
        })
      },
      close: () => setSheets((list) => (list.some((x) => x.state === "open") ? list.map((x) => (x.state === "open" ? { ...x, state: "closing" as const } : x)) : list)),
      prewarm: (request) => {
        setSheets((list) => {
          if (list.some((x) => x.request.blockId === request.blockId)) return list
          count.current += 1
          return trim([...list, { request, key: count.current, state: "kept", session: 0, used: count.current }])
        })
      },
      available: true,
    }
  }, [])
  /* Gone from the screen: kept for the next tap when it holds what is worth keeping, else unmounted. */
  const gone = useCallback((key: number, keep: boolean) => {
    setSheets((list) => list.flatMap((x) => (x.key !== key || x.state !== "closing" ? [x] : keep ? [{ ...x, state: "kept" as const }] : [])))
  }, [])
  return (
    <BlockSheetContext.Provider value={api}>
      <PageThemeContext.Provider value={theme}>
        {children}
        {sheets.map((x) => (
          <BlockSheetView key={x.key} sheetKey={x.key} request={x.request} open={x.state === "open"} kept={x.state === "kept"} session={x.session} dark={dark} onClose={api.close} onGone={gone} />
        ))}
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

/* What a phone raises its keyboard for. */
const FIELDS = "input:not([type=button]):not([type=submit]):not([type=checkbox]):not([type=radio]),textarea,select,[contenteditable='true']"

/* A spring back with reduced motion: short, but still a move the finger started. */
const M_BACK_REDUCED = 120

/* A mouse is exact: the sheet follows once it has moved this far, not a finger's slop. */
const MOUSE_SLOP_PX = 3

/* Late content: the growth eases in over this long. */
const GROW_MS = 320
/* Gentle at the start, unlike the rise: the first frame of a growth is a few pixels, never a step. */
const GROW_EASE = "cubic-bezier(0.25, 0.1, 0.25, 1)"
const FLIP_ID = "block-sheet-grow"
const PHONE_QUERY = "(max-width: 639px)"

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

/* Memoised: a kept sheet (and the frames in it) is not drawn again each time another opens or closes. */
const BlockSheetView = memo(function BlockSheetView({
  sheetKey,
  request,
  open,
  kept,
  session,
  dark,
  onClose,
  onGone,
}: {
  sheetKey: number
  request: BlockSheetRequest
  open: boolean
  /** Hidden and out of reach, its content kept for the next tap (KEPT above). */
  kept: boolean
  /** Which opening this is: what belongs to one opening (history, focus, the page held still) starts again with each. */
  session: number
  dark: boolean
  onClose: () => void
  onGone: (key: number, keep: boolean) => void
}) {
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
  /* A field in the sheet has the keyboard up: the foot bar steps aside (round AP). */
  const [typing, setTyping] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  useStillPage(!kept, rootRef)
  /*
    Back inside the sheet (round AR): a form or a booking with steps takes Back while it has a step to go back to
    (SheetBackContext). The newest taker answers first.
  */
  const backTakers = useRef<(() => boolean)[]>([])
  const backApi = useMemo<SheetBackApi>(
    () => ({
      take: (handler) => {
        backTakers.current.push(handler)
        return () => {
          backTakers.current = backTakers.current.filter((h) => h !== handler)
        }
      },
    }),
    [],
  )
  const stepBack = useCallback((): boolean => {
    for (let i = backTakers.current.length - 1; i >= 0; i--) if (backTakers.current[i]()) return true
    return false
  }, [])

  const closeRef = useRef(onClose)
  /* Gone from the screen: kept when its content holds frames that can be (lib/onepage/embed-warm keepableSheet). */
  const goneRef = useRef(() => onGone(sheetKey, keepableSheet(bodyRef.current)))
  const requestRef = useRef(request)
  useEffect(() => {
    closeRef.current = onClose
    goneRef.current = () => onGone(sheetKey, keepableSheet(bodyRef.current))
    requestRef.current = request
  })

  /* A new opening of a kept sheet starts clean: nothing of the last one's closing carries over. */
  useLayoutEffect(() => {
    if (kept) return
    after.current = { run: null, gone: false, left: true }
    swipedOut.current = false
    setTyping(false)
    setCopied(false)
  }, [session, kept])

  const fill = !!request.fill

  /* Who opened it, read before anything inside takes focus. */
  useLayoutEffect(() => {
    if (kept) return
    opener.current = document.activeElement as HTMLElement | null
  }, [session, kept])

  /* ── The motion: before the first paint, from where the card is. ── */
  useLayoutEffect(() => {
    const panel = panelRef.current
    const backdrop = backdropRef.current
    if (kept) {
      /* Put away: nothing of the last motion stays, so the next opening rises from the start. */
      if (panel && backdrop && typeof panel.getAnimations === "function") for (const a of [...panel.getAnimations(), ...backdrop.getAnimations()]) a.cancel()
      return
    }
    if (!panel || !backdrop || typeof panel.animate !== "function") {
      if (!open) goneRef.current()
      return
    }
    const still = reducedMotion()
    const M = SHEET_MOTION
    /*
      The rise's share of the sheet's height, in pixels as it is now (round AP). As a percentage it was a share of
      the height as it would be on each frame, so content arriving during the rise pushed the sheet down again.
    */
    const share = (pct: string) => `${Math.round((parseFloat(pct) / 100) * panel.offsetHeight)}px`
    /* Copied out now: a computed style is live, and cancelling the running animations below would change it. */
    const live = getComputedStyle(panel)
    const was = { translate: live.translate, scale: live.scale, opacity: live.opacity }
    const wasBackdrop = getComputedStyle(backdrop).opacity
    const fromRunning = panel.getAnimations().some((a) => a.id !== FLIP_ID)
    for (const a of [...panel.getAnimations(), ...backdrop.getAnimations()]) if (a.id !== FLIP_ID) a.cancel()
    const rest = { translate: "0 0", scale: "1", opacity: "1" }
    if (open) {
      const start = fromRunning
        ? { translate: was.translate === "none" ? "0 0" : was.translate, scale: was.scale === "none" ? "1" : was.scale, opacity: was.opacity }
        : still
          ? { translate: "0 0", scale: "1", opacity: "0" }
          : { translate: `0 ${share(M.from.translateY)}`, scale: String(M.from.scale), opacity: "0" }
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
      const end = still ? { translate: "0 0", scale: "1" } : { translate: `0 ${share(M.to.translateY)}`, scale: String(M.to.scale) }
      move = panel.animate([from, { ...end, opacity: "0" }], { duration: ms, easing: M.closeEase, fill: "both" })
    }
    backdrop.animate([{ opacity: wasBackdrop }, { opacity: "0" }], { duration: ms, easing: "ease-in", fill: "both" })
    /* A player in it stops as the sheet goes, whether or not the sheet is kept. */
    pauseFrames(bodyRef.current)
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
  }, [open, kept])

  /* ── Told once that it is closing; the floating page buttons hide while it is up, as under every window on the page. ── */
  useEffect(() => {
    if (open) {
      told.current = false
      return
    }
    if (kept || told.current) return
    told.current = true
    requestRef.current.onClose?.()
  }, [open, kept])
  useEffect(() => {
    if (kept) return
    window.dispatchEvent(new CustomEvent("pdfModalStateChange", { detail: { isOpen: true } }))
    return () => {
      window.dispatchEvent(new CustomEvent("pdfModalStateChange", { detail: { isOpen: false } }))
      const back = opener.current
      if (back && back !== document.body && back.isConnected) back.focus({ preventScroll: true })
      after.current.gone = true
      if (!after.current.run && requestRef.current.onGone) after.current.run = requestRef.current.onGone
      runAfter()
    }
  }, [runAfter, session, kept])

  /* ── History: the sheet stands on an entry of its own, so Back closes it. ── */
  useEffect(() => {
    if (kept || isOnePagePreview()) return
    const m = `${requestRef.current.blockId}:${Date.now().toString(36)}`
    try {
      window.history.pushState(historyWith(m), "", window.location.href)
      mark.current = m
    } catch {
      mark.current = null
    }
    const onPop = () => {
      if (mark.current && blockSheetEntryOf(window.history.state) !== mark.current) {
        /*
          Back with a step to go back to (round AR): the form moves a step back and the sheet stands on its entry
          again, so the next Back does the same or closes it. Nothing navigates and nothing reloads.
        */
        if (stepBack()) {
          try {
            window.history.pushState(historyWith(mark.current), "", window.location.href)
            return
          } catch {
            /* the entry could not be set again: close as before */
          }
        }
        mark.current = null
        closeRef.current()
      }
    }
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [session, kept, stepBack])

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
    if (!open && mark.current) {
      /* Whatever runs once the sheet is gone (onGone) waits for this step off our entry as well. */
      after.current.left = false
      leaveHistory(() => {
        after.current.left = true
        runAfter()
      })
    }
  }, [open, leaveHistory, runAfter])

  /*
    ── Drawn down to close: a finger from anywhere on the sheet, a mouse from its grip and title (round AP). ──
    One gesture for both. A finger's path is the one round AN measured: it follows once it has moved SWIPE.slopPx
    straight down. A mouse (the editor's preview is a phone driven by one) takes the sheet by its top bar only, so
    it still selects text and presses buttons everywhere else; it is captured, so a release outside the window
    ends it, and the sheet follows from the first few pixels. Each move writes the translate straight onto the
    sheet, so it keeps up with the pointer at the display's own rate and React hears nothing until it is let go.
  */
  useEffect(() => {
    const panel = panelRef.current
    const backdrop = backdropRef.current
    if (!open || !panel || !backdrop) return
    let start: { x: number; y: number } | null = null
    let from = 0
    let dragging = false
    let dy = 0
    let trail: { y: number; t: number }[] = []
    let pointerId: number | null = null
    /* Something between the finger and the sheet scrolled away from its top: the finger scrolls that back first. */
    const scrolledAbove = (target: EventTarget | null) => {
      for (let el = target instanceof Element ? target : null; el && el !== panel; el = el.parentElement) if (el.scrollTop > 0) return true
      return false
    }
    const begin = (x: number, y: number) => {
      dragging = false
      start = { x, y }
    }
    /* Whatever the opening left behind (its fill), written down as the sheet's own style, so the pointer moves it from where it is. */
    const take = () => {
      for (const a of [...panel.getAnimations(), ...backdrop.getAnimations()]) {
        if (a.id === FLIP_ID) continue
        try {
          a.commitStyles()
        } catch {
          /* not drawn: nothing to keep */
        }
        a.cancel()
      }
      panel.dataset.blockSheetDragging = ""
    }
    /* Whether the move is the sheet's, so the caller keeps the page from scrolling under it. */
    const move = (x: number, y: number, t: number, slop: number, exact: boolean): boolean => {
      if (!start) return false
      if (!dragging) {
        const dx = x - start.x
        const d = y - start.y
        if (Math.abs(d) < slop && Math.abs(dx) < slop) return false
        /* Up, or sideways: the sheet's own scroll or a carousel's, not ours. */
        if (d <= 0 || Math.abs(dx) > Math.abs(d)) {
          start = null
          return false
        }
        dragging = true
        /* A finger picks it up where it is once past the slop; a mouse from where it was pressed, so the sheet sits under it. */
        from = exact ? start.y : y
        take()
      }
      dy = Math.max(0, y - from)
      trail.push({ y, t })
      trail = trail.filter((s) => t - s.t <= 100)
      panel.style.translate = `0 ${dy}px`
      backdrop.style.opacity = String(1 - Math.min(1, dy / Math.max(1, panel.offsetHeight)) * 0.9)
      return true
    }
    const end = (cancelled: boolean) => {
      if (!dragging) {
        start = null
        return
      }
      dragging = false
      start = null
      delete panel.dataset.blockSheetDragging
      const first = trail[0]
      const last = trail[trail.length - 1]
      const speed = !cancelled && first && last && last.t > first.t ? (last.y - first.y) / (last.t - first.t) : 0
      trail = []
      if (!cancelled && swipeDecision(dy, panel.offsetHeight, speed) === "close") {
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

    const onStart = (e: TouchEvent) => {
      dragging = false
      start = null
      if (e.touches.length !== 1) return
      const t = e.target instanceof Element ? e.target : null
      if (t?.closest("input,textarea,select,[contenteditable='true'],[data-no-swipe]") || scrolledAbove(t)) return
      /* A field has focus, so on a phone the keyboard is up: a drag then belongs to the page under it, never a close. */
      const focused = document.activeElement
      if (focused instanceof HTMLElement && focused !== panel && panel.contains(focused) && focused.matches(FIELDS)) return
      begin(e.touches[0].clientX, e.touches[0].clientY)
    }
    const onMove = (e: TouchEvent) => {
      const p = e.touches[0]
      if (p && move(p.clientX, p.clientY, performance.now(), SWIPE.slopPx, false) && e.cancelable) e.preventDefault()
    }
    const onEnd = () => end(false)

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === "touch" || e.button !== 0) return
      const t = e.target instanceof Element ? e.target : null
      if (!t?.closest("[data-block-sheet-handle]") || t.closest("button,a,input,textarea,select")) return
      /* No text selection starts from the bar the sheet is held by. */
      e.preventDefault()
      pointerId = e.pointerId
      try {
        panel.setPointerCapture(e.pointerId)
      } catch {
        /* an old engine: the release is still heard on the panel */
      }
      begin(e.clientX, e.clientY)
    }
    const onPointerMove = (e: PointerEvent) => {
      if (pointerId === null || e.pointerId !== pointerId) return
      move(e.clientX, e.clientY, performance.now(), MOUSE_SLOP_PX, true)
    }
    const onPointerEnd = (e: PointerEvent) => {
      if (pointerId === null || e.pointerId !== pointerId) return
      pointerId = null
      try {
        panel.releasePointerCapture(e.pointerId)
      } catch {
        /* already let go */
      }
      end(e.type === "pointercancel")
    }

    panel.addEventListener("touchstart", onStart, { passive: true })
    panel.addEventListener("touchmove", onMove, { passive: false })
    panel.addEventListener("touchend", onEnd)
    panel.addEventListener("touchcancel", onEnd)
    panel.addEventListener("pointerdown", onPointerDown)
    panel.addEventListener("pointermove", onPointerMove)
    panel.addEventListener("pointerup", onPointerEnd)
    panel.addEventListener("pointercancel", onPointerEnd)
    return () => {
      panel.removeEventListener("touchstart", onStart)
      panel.removeEventListener("touchmove", onMove)
      panel.removeEventListener("touchend", onEnd)
      panel.removeEventListener("touchcancel", onEnd)
      panel.removeEventListener("pointerdown", onPointerDown)
      panel.removeEventListener("pointermove", onPointerMove)
      panel.removeEventListener("pointerup", onPointerEnd)
      panel.removeEventListener("pointercancel", onPointerEnd)
    }
  }, [open])

  /*
    ── Content that arrives late (round AP). ──
    The sheet stands on the foot of the screen, so when what is inside grows (a form's questions arriving over
    their placeholder, a booking's times, a picture) its top edge went up in one frame: the owner's "it opens and
    it glitches, and then it opens". Now the growth is drawn from where the top edge was: the sheet is set down by
    what it grew, before that frame is painted, and eases up into place on the compositor (a transform of its own,
    which composes with the rise). Its foot is below the screen meanwhile, so nothing shows there; a computer's
    centred card keeps its top edge and its old foot and eases out to both. The keyboard's
    room (padding, not content) and a sheet of a fixed height are left alone.
  */
  useEffect(() => {
    const panel = panelRef.current
    const content = contentRef.current
    if (!open || !panel || !content || fill || typeof ResizeObserver !== "function" || typeof panel.animate !== "function") return
    const phone = window.matchMedia(PHONE_QUERY)
    let last = panel.offsetHeight
    let lastContent = content.offsetHeight
    const watch = new ResizeObserver(() => {
      const h = panel.offsetHeight
      const c = content.offsetHeight
      const grew = h - last
      const contentGrew = c - lastContent
      last = h
      lastContent = c
      if (grew < 2 || contentGrew < 2 || "blockSheetDragging" in panel.dataset || reducedMotion()) return
      /* Still easing from an earlier growth: from where it is now. */
      let carried = 0
      for (const a of panel.getAnimations()) {
        if (a.id !== FLIP_ID) continue
        const now = getComputedStyle(panel).transform
        carried = now && now !== "none" ? new DOMMatrixReadOnly(now).m42 : 0
        a.cancel()
      }
      /*
        A phone's sheet stands on the foot of the screen: set down by all it grew, its foot below the screen.
        A computer's card is centred, so it grew by half above and half below: set down by half, and the half
        that would show under its old foot clipped away, both easing out together.
      */
      const flip = phone.matches
        ? panel.animate([{ transform: `translateY(${grew + carried}px)` }, { transform: "translateY(0)" }], { duration: GROW_MS, easing: GROW_EASE })
        : panel.animate(
            [
              { transform: `translateY(${grew / 2 + carried}px)`, clipPath: `inset(0 0 ${grew + carried * 2}px 0 round 24px)` },
              { transform: "translateY(0)", clipPath: "inset(0 0 0px 0 round 24px)" },
            ],
            { duration: GROW_MS, easing: GROW_EASE },
          )
      flip.id = FLIP_ID
    })
    watch.observe(panel)
    watch.observe(content)
    return () => watch.disconnect()
  }, [open, fill])

  /*
    ── The keyboard (round AP). ──
    While a field in the sheet has the keyboard up, the bar at its foot (the button, Share, the round Close) goes:
    it sat right on the keyboard, over the field being typed in. It comes back when the keyboard goes. A keyboard
    is taken to be up from the moment a field takes focus on a touch screen (it is on its way), or whenever
    ViewportVars publishes its room; a keyboard put away with the field still focused (Android's Back) brings the
    bar back. A mouse and a hardware keyboard never hide it.
  */
  useEffect(() => {
    const panel = panelRef.current
    if (!open || !panel) return
    const vv = window.visualViewport
    let memory: KeyboardMemory = { saw: false }
    let frame = 0
    let settle = 0
    const touch = () => {
      try {
        return window.matchMedia("(hover: none) and (pointer: coarse)").matches
      } catch {
        return false
      }
    }
    /*
      Round AR: the visible height counts as much as the published inset (lib/onepage/feel keyboardState). Once iOS
      has panned to the field the inset is 0 with the keys still up, and the bar used to come back over them.
    */
    const reveal = (field: HTMLElement) => {
      const body = bodyRef.current
      if (!body || document.activeElement !== field || !body.contains(field)) return
      const visibleBottom = vv ? vv.offsetTop + vv.height : window.innerHeight
      const d = revealDelta(field.getBoundingClientRect(), body.getBoundingClientRect(), visibleBottom)
      if (Math.abs(d) >= 1) body.scrollBy({ top: d, behavior: reducedMotion() ? "auto" : "smooth" })
    }
    const read = () => {
      frame = 0
      const f = document.activeElement
      const field = f instanceof HTMLElement && panel.contains(f) && f.matches(FIELDS)
      const layoutHeight = rootRef.current?.clientHeight || window.innerHeight
      const next = keyboardState(
        { field, touch: touch(), inset: readPublishedKeyboardInset(), layoutHeight, visibleHeight: Math.round(vv?.height ?? layoutHeight) },
        memory,
      )
      memory = next.memory
      setTyping(next.up)
      if (next.up && f instanceof HTMLElement) {
        window.clearTimeout(settle)
        /* Once the keyboard has settled, the field is brought above it inside the sheet's own scroll. */
        settle = window.setTimeout(() => reveal(f), 260)
      }
    }
    const later = () => {
      /* A press in progress reads when it ends (pressDone below), so the keyboard going away under it cannot move the panel either. */
      if (pressing) return
      if (!frame) frame = requestAnimationFrame(read)
    }
    /*
      Round AR (track 2): a press that takes focus from the field (Book, Send, Next) blurs it before its
      click lands. The bar coming back on that blur moved the panel 68px between touchend and click
      (scripts/check-bookings-ar2.mjs, 390 touch), so the click hit what was now under the finger and the
      form was never sent. While a finger is down in the panel, the bar waits for the press to finish
      (its click, or a cancel), then reads as before.
    */
    let pressing = false
    let release = 0
    const pressDone = () => {
      pressing = false
      window.clearTimeout(release)
      later()
    }
    const onPressStart = () => {
      pressing = true
      window.clearTimeout(release)
      release = window.setTimeout(pressDone, 600)
    }
    const onPressEnd = () => {
      if (pressing) window.setTimeout(pressDone, 0)
    }
    const onFocusOut = () => {
      if (!pressing) later()
    }
    const onFocusIn = (e: FocusEvent) => {
      memory = { saw: false }
      /* The pressed button taking focus is the same press: it reads when the press ends, not now. */
      if (pressing && !(e.target instanceof HTMLElement && e.target.matches(FIELDS))) return
      read()
    }
    panel.addEventListener("focusin", onFocusIn)
    panel.addEventListener("focusout", onFocusOut)
    panel.addEventListener("pointerdown", onPressStart, true)
    panel.addEventListener("click", onPressEnd, true)
    panel.addEventListener("pointercancel", onPressEnd, true)
    window.addEventListener(KEYBOARD_CHANGE_EVENT, later)
    vv?.addEventListener("resize", later)
    return () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(settle)
      window.clearTimeout(release)
      panel.removeEventListener("focusin", onFocusIn)
      panel.removeEventListener("focusout", onFocusOut)
      panel.removeEventListener("pointerdown", onPressStart, true)
      panel.removeEventListener("click", onPressEnd, true)
      panel.removeEventListener("pointercancel", onPressEnd, true)
      window.removeEventListener(KEYBOARD_CHANGE_EVENT, later)
      vv?.removeEventListener("resize", later)
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

  const { title, body, cta, shareUrl, footless } = request

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

  /* The sheet's own marks, which the page's probes and drag-scroll look for, only while it is up: a kept sheet carries none. */
  const tag = (name: string): Record<string, string> => (kept ? {} : { [name]: "" })

  return createPortal(
    <div
      ref={rootRef}
      role={kept ? undefined : "dialog"}
      aria-modal={kept ? undefined : true}
      aria-label={kept ? undefined : title}
      aria-hidden={kept ? true : undefined}
      inert={kept ? true : undefined}
      data-block-sheet-kept={kept ? "" : undefined}
      {...tag("data-block-sheet")}
      data-block-sheet-open={open ? "" : undefined}
      className="fixed inset-0 z-[200] flex items-end justify-center overscroll-contain sm:items-center sm:p-6"
      /* Kept: laid out where it opens, so its frame keeps its size and nothing reflows when it comes back, but unseen and out of reach. */
      style={kept ? { visibility: "hidden", pointerEvents: "none" } : undefined}
    >
      <div ref={backdropRef} aria-hidden onClick={onClose} {...tag("data-block-sheet-backdrop")} className="absolute inset-0" style={{ background: `rgba(0,0,0,${SHEET_MOTION.backdrop})`, opacity: 0 }} />
      <div
        ref={panelRef}
        tabIndex={-1}
        {...tag("data-block-sheet-panel")}
        style={{ ...sheetTokens(dark, true), opacity: 0 }}
        className={cn(
          "relative mx-2 flex w-full origin-bottom flex-col overflow-hidden rounded-t-[24px] bg-[var(--sheet-bg)] text-[var(--sheet-body)] shadow-[0_-8px_40px_rgba(0,0,0,0.18)] outline-none will-change-[translate,scale,opacity]",
          "sm:mx-0 sm:origin-center sm:rounded-[24px] sm:shadow-[0_24px_64px_rgba(0,0,0,0.24),0_2px_8px_rgba(0,0,0,0.08)]",
          fill ? "h-[calc(100dvh-env(safe-area-inset-top)-16px)] sm:h-[min(760px,calc(100dvh-64px))] sm:max-w-[520px]" : "max-h-[calc(100dvh-env(safe-area-inset-top)-16px)] sm:max-h-[min(760px,calc(100dvh-64px))] sm:max-w-[480px]",
          /*
            ON THE KEYBOARD ON A PHONE (round AN, a form in the sheet). The
            panel stays at the foot of the screen and its content is pushed
            up by the keyboard (--kb-inset, published by ViewportVars), the
            box grown by the same amount and never taller than what is left
            on screen, as every shared sheet does (lib/ui/keyboard-safe-sheet
            sheetOverKeyboard). It eases there with the keyboard rather than
            jumping; KeyboardGuard then keeps the focused field in view in
            the body below.
          */
          "max-sm:pb-[var(--kb-inset,0px)] max-sm:transition-[padding-bottom,max-height,height] max-sm:duration-200 max-sm:ease-out motion-reduce:transition-none",
          fill
            ? "max-sm:h-[calc(min(100dvh_-_env(safe-area-inset-top)_-_16px,var(--vv-h,100dvh)_-_24px)_+_var(--kb-inset,0px))]"
            : "max-sm:max-h-[calc(min(100dvh_-_env(safe-area-inset-top)_-_16px,var(--vv-h,100dvh)_-_24px)_+_var(--kb-inset,0px))]",
        )}
      >
        <span tabIndex={0} data-focus-guard="" aria-hidden onFocus={guard("last")} className="sr-only" />
        {/*
          The grip: the sheet can be drawn down, by a finger from anywhere, by a mouse from here and the title
          (round AP, on a computer too). Drawn over the title's top padding, so nothing moves.
        */}
        <span aria-hidden {...tag("data-block-sheet-grip")} className="pointer-events-none absolute left-1/2 top-[6px] h-[4px] w-9 -translate-x-1/2 rounded-full bg-[var(--sheet-muted)] opacity-35" />
        <h2
          className="shrink-0 cursor-grab select-none truncate px-14 pb-2.5 pt-4 text-center text-[15px] font-medium text-[var(--sheet-ink)] active:cursor-grabbing"
          {...tag("data-block-sheet-title")}
          {...tag("data-block-sheet-handle")}
        >
          {title}
        </h2>
        {footless ? (
          /* Round AS: the sheet's own button is in its body; Close moves up to the top right, a step smaller. */
          <button type="button" onClick={onClose} aria-label={tt("Close")} {...tag("data-block-sheet-close")} className="absolute right-3 top-2.5 z-[1] grid h-9 w-9 place-items-center rounded-full bg-[var(--sheet-field)] text-[var(--sheet-muted)] transition-[scale,color] duration-150 [-webkit-tap-highlight-color:transparent] hover:text-[var(--sheet-ink)] active:scale-95 outline-none focus-visible:ring-2 focus-visible:ring-[var(--sheet-ink)]">
            <X aria-hidden className="h-4 w-4" />
          </button>
        ) : null}
        <div
          /* It scrolls with no bar drawn (round AN): a sheet is a small window, and a bar down its side read as a page squeezed into it. */
          ref={bodyRef}
          className={cn("relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 [scrollbar-width:none] sm:px-4 [&::-webkit-scrollbar]:hidden", fill ? "flex flex-col" : "pb-2", typing && "pb-4", footless && !typing && "pb-[max(16px,env(safe-area-inset-bottom))]")}
          data-onepage-dialog-scroll=""
          {...tag("data-block-sheet-body")}
        >
          {fill ? (
            /* Round AR: nothing that looks like loading for the first half second; a page that answers by then is simply there. */
            <span aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center gap-1.5 [animation:op-late-in_200ms_ease-out_500ms_both] motion-reduce:[animation:none]" {...tag("data-block-sheet-dots")}>
              {[0, 1, 2].map((i) => (
                <span key={i} className="h-1.5 w-1.5 rounded-full bg-[var(--sheet-muted)] opacity-60 motion-safe:animate-pulse" style={{ animationDelay: `${i * 160}ms` }} />
              ))}
            </span>
          ) : null}
          <div ref={contentRef} className={cn("relative", fill && "flex min-h-0 flex-1 flex-col [&>*]:min-h-0 [&>*]:flex-1")}><InBlockSheetContext.Provider value><SheetBackContext.Provider value={backApi}>{body}</SheetBackContext.Provider></InBlockSheetContext.Provider></div>
        </div>
        <div
          className={cn("shrink-0 items-center gap-2 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3", typing || footless ? "hidden" : "flex")}
          {...tag("data-block-sheet-foot")}
          data-block-sheet-typing={typing ? "" : undefined}
        >
          {cta ? (
            cta.href ? (
              <a
                href={cta.href}
                target={external ? "_blank" : undefined}
                rel={external ? "noopener noreferrer" : undefined}
                onClick={pressCta}
                {...tag("data-block-sheet-cta")}
                className="flex h-11 min-w-0 max-w-[60%] items-center gap-2 rounded-full bg-[var(--sheet-ink)] px-4 text-[14px] font-semibold text-[var(--sheet-on-ink)] transition-[scale] duration-150 active:scale-[0.97] outline-none focus-visible:ring-2 focus-visible:ring-[var(--sheet-ink)] focus-visible:ring-offset-2"
              >
                {cta.icon ? <span aria-hidden className="grid h-5 w-5 shrink-0 place-items-center [&>svg]:h-[18px] [&>svg]:w-[18px]">{cta.icon}</span> : null}
                <span className="truncate">{cta.label}</span>
              </a>
            ) : (
              <button
                type="button"
                onClick={pressCta}
                {...tag("data-block-sheet-cta")}
                className="flex h-11 min-w-0 max-w-[60%] items-center gap-2 rounded-full bg-[var(--sheet-ink)] px-4 text-[14px] font-semibold text-[var(--sheet-on-ink)] transition-[scale] duration-150 active:scale-[0.97] outline-none focus-visible:ring-2 focus-visible:ring-[var(--sheet-ink)] focus-visible:ring-offset-2"
              >
                {cta.icon ? <span aria-hidden className="grid h-5 w-5 shrink-0 place-items-center [&>svg]:h-[18px] [&>svg]:w-[18px]">{cta.icon}</span> : null}
                <span className="truncate">{cta.label}</span>
              </button>
            )
          ) : null}
          <span className="flex-1" />
          {shareUrl ? (
            <button type="button" onClick={() => void share()} aria-label={copied ? tt("Link copied") : tt("Share")} {...tag("data-block-sheet-share")} className={round}>
              {copied ? <Check aria-hidden className="h-[18px] w-[18px]" /> : <Share aria-hidden className="h-[18px] w-[18px]" />}
            </button>
          ) : null}
          <button type="button" onClick={onClose} aria-label={tt("Close")} {...tag("data-block-sheet-close")} className={round}>
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
})
