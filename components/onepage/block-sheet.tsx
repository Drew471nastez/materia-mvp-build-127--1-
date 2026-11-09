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
import { KEYBOARD_CHANGE_EVENT, readPublishedKeyboardInset } from "@/lib/ui/keyboard-safe-sheet"

export type OpenMode = "sheet" | "direct"

/* The contract (the request, the API, the context and its hook) lives in ./block-sheet-context (round AN), so asking for the sheet does not load it. */
import { BlockSheetContext, type BlockSheetApi, type BlockSheetRequest } from "./block-sheet-context"
export { BlockSheetContext, type BlockSheetApi, type BlockSheetRequest } from "./block-sheet-context"

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
  /* A field in the sheet has the keyboard up: the foot bar steps aside (round AP). */
  const [typing, setTyping] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)
  useStillPage(true, rootRef)

  const closeRef = useRef(onClose)
  const goneRef = useRef(onGone)
  const requestRef = useRef(request)
  useEffect(() => {
    closeRef.current = onClose
    goneRef.current = onGone
    requestRef.current = request
  })

  const fill = !!request.fill

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
      if (!after.current.run && requestRef.current.onGone) after.current.run = requestRef.current.onGone
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
    let seen = false
    let frame = 0
    const touch = () => {
      try {
        return window.matchMedia("(hover: none) and (pointer: coarse)").matches
      } catch {
        return false
      }
    }
    const read = () => {
      frame = 0
      const f = document.activeElement
      const field = f instanceof HTMLElement && panel.contains(f) && f.matches(FIELDS)
      const inset = readPublishedKeyboardInset()
      if (!field) seen = false
      else if (inset > 0) seen = true
      setTyping(field && (inset > 0 || (touch() && !seen)))
    }
    const later = () => {
      if (!frame) frame = requestAnimationFrame(read)
    }
    const onFocusIn = () => {
      seen = false
      read()
    }
    panel.addEventListener("focusin", onFocusIn)
    panel.addEventListener("focusout", later)
    window.addEventListener(KEYBOARD_CHANGE_EVENT, later)
    vv?.addEventListener("resize", later)
    return () => {
      cancelAnimationFrame(frame)
      panel.removeEventListener("focusin", onFocusIn)
      panel.removeEventListener("focusout", later)
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

  const { title, body, cta, shareUrl } = request

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
        <span aria-hidden data-block-sheet-grip="" className="pointer-events-none absolute left-1/2 top-[6px] h-[4px] w-9 -translate-x-1/2 rounded-full bg-[var(--sheet-muted)] opacity-35" />
        <h2
          className="shrink-0 cursor-grab select-none truncate px-14 pb-2.5 pt-4 text-center text-[15px] font-medium text-[var(--sheet-ink)] active:cursor-grabbing"
          data-block-sheet-title=""
          data-block-sheet-handle=""
        >
          {title}
        </h2>
        <div
          /* It scrolls with no bar drawn (round AN): a sheet is a small window, and a bar down its side read as a page squeezed into it. */
          className={cn("relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 [scrollbar-width:none] sm:px-4 [&::-webkit-scrollbar]:hidden", fill ? "flex flex-col" : "pb-2")}
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
          <div ref={contentRef} className={cn("relative", fill && "flex min-h-0 flex-1 flex-col [&>*]:min-h-0 [&>*]:flex-1")}><InBlockSheetContext.Provider value>{body}</InBlockSheetContext.Provider></div>
        </div>
        <div
          className={cn("shrink-0 items-center gap-2 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3", typing ? "hidden" : "flex")}
          data-block-sheet-foot=""
          data-block-sheet-typing={typing ? "" : undefined}
        >
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
