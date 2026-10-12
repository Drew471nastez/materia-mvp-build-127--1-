"use client"

/**
 * ===========================================================================
 *  THE MOBILE SHEET, WITH DETENTS
 * ===========================================================================
 * It had two positions: a peek at the bottom and half the screen. That is
 * enough for a list of sections and not enough for anything you have to READ
 * or TYPE into — a settings panel with twenty fields, or a conversation with
 * a text box at the bottom of it. There was no way to get more room, so the
 * answer for the AI panel had been to not offer it on a phone at all.
 *
 * Now it snaps between a set of DETENTS, the way an iOS sheet does: peek,
 * half, full. Dragging moves between neighbours; a flick carries you one
 * further in the direction you flicked.
 *
 * ---------------------------------------------------------------------------
 *  THE KEYBOARD IS THE HARD PART
 * ---------------------------------------------------------------------------
 * `window.innerHeight` does not change when the on-screen keyboard opens on
 * iOS — the page is simply scrolled under it — so a sheet positioned against
 * it puts its text box behind the keyboard and there is nothing the person can
 * do about it. `visualViewport` is the only API that reports what is actually
 * visible, and its `height` plus `offsetTop` are what a sheet has to be
 * measured against.
 *
 * Falls back to `window.innerHeight` where it is missing, which costs nothing
 * on a browser that has no on-screen keyboard anyway.
 */

import { readPublishedKeyboardInset } from "@/lib/ui/keyboard-safe-sheet"
import * as React from "react"
import { createPortal, flushSync } from "react-dom"
import { sheetBottomReserve } from "@/lib/website-builder/sheet-reserve"
import { cn } from "@/lib/utils"
import { hapticTap } from "@/lib/native-bridge"
import {
  COAST_STOP_SPEED,
  HORIZONTAL_BIAS,
  coastDistance,
  coastVelocity,
  curveCss,
  dragIntent,
  dragPosition,
  expandCarry,
  handOffToSheet,
  isCompatibilityMouse,
  isTap,
  keyboardCeiling,
  keyboardFor,
  offsetsFor,
  sheetHeightWithKeyboard,
  sheetVelocityAt,
  releaseVelocity,
  snapMotion,
  snapTarget,
  tapTarget,
  visibleKeyboard,
  type DragIntent,
  type Sample,
} from "./sheet-gestures"

const PEEK_HEIGHT = 72

/**
 * How tall a scroller's content is, independent of how tall the scroller is.
 *
 * `scrollHeight` is `max(content, client)`, so it answers this correctly only
 * while the scroller is actually overflowing: give the scroller more room
 * than its content needs and it reports the room, not the content, and a
 * sheet sized from it can never shrink again. A `[data-sheet-content]` box
 * inside the scroller is not sized by the scroller, so its rectangle is the
 * content's own height at any sheet height. `scrollHeight` stays as the
 * fallback for a scroller that has not marked its content, where it is right
 * in the overflowing case and no worse than before in the other.
 */
function naturalScrollHeight(scroller: HTMLElement): number {
  const inner = scroller.querySelector<HTMLElement>("[data-sheet-content]")
  if (!inner) return scroller.scrollHeight
  const cs = getComputedStyle(scroller)
  const padding = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0)
  return inner.getBoundingClientRect().height + padding
}

/**
 * The window a keyboard would resize. This one, unless this one is a
 * same-origin frame inside another — the creator page editor's canvas — in
 * which case the keyboard opens over the PARENT and only the parent's
 * `visualViewport` says so. A cross-origin parent throws on access and is
 * treated as none.
 */
function keyboardWindow(): Window {
  if (typeof window === "undefined") return window
  try {
    const top = window.top
    if (top && top !== window && top.location.origin === window.location.origin) return top
  } catch {
    /* Cross-origin: our own window is all there is to read. */
  }
  return window
}

/**
 * ===========================================================================
 *  TWO PROBES FOR THE WHOLE PAGE, READ ONCE PER CHANGE
 * ===========================================================================
 * Both measurements below used to create an element, append it to the body,
 * read its box and remove it, every time they were asked. Appending dirties
 * the layout of the whole document, so each read was a full synchronous
 * layout of the editor, and they were asked a lot: from a resize handler
 * that was not coalesced into a frame, on every callback of the content-fit
 * observer, and by each of the four sheets the editor mounts. Four sheets
 * answering one rotation was four forced layouts before the first paint.
 *
 * Now there is one pair of hidden probes for the page, appended once and
 * left in place, and the numbers are cached until something that can change
 * them happens: a resize, a rotation, the visual viewport moving. Any number
 * of sheets can ask in the same frame and the box is read at most once.
 */
const insetCache: { safe: number | null; gap: number | null; top: number | null; box: number | null; bar: number | null } = {
  safe: null,
  gap: null,
  top: null,
  box: null,
  bar: null,
}
let insetProbes: { safe: HTMLElement; gap: HTMLElement; top: HTMLElement } | null = null
/* The listeners that forget the numbers, added once for the page however
   many times the probes have to be put back. */
let forgetting = false

function probes(): { safe: HTMLElement; gap: HTMLElement; top: HTMLElement } {
  if (insetProbes && insetProbes.safe.isConnected && insetProbes.gap.isConnected && insetProbes.top.isConnected) return insetProbes
  const make = (css: string) => {
    const el = document.createElement("div")
    el.setAttribute("aria-hidden", "true")
    el.style.cssText = css
    document.body.appendChild(el)
    return el
  }
  insetProbes = {
    safe: make("position:fixed;left:0;bottom:0;width:0;height:env(safe-area-inset-bottom,0px);visibility:hidden;pointer-events:none"),
    gap: make("position:fixed;left:0;bottom:0;width:0;height:0;visibility:hidden;pointer-events:none"),
    top: make("position:fixed;left:0;top:0;width:0;height:env(safe-area-inset-top,0px);visibility:hidden;pointer-events:none"),
  }
  /* New probes are new boxes: nothing read off the old ones stands. */
  forgetInsets()
  if (!forgetting) {
    forgetting = true
    window.addEventListener("resize", forgetInsets)
    window.addEventListener("orientationchange", forgetInsets)
    window.visualViewport?.addEventListener("resize", forgetInsets)
    window.visualViewport?.addEventListener("scroll", forgetInsets)
  }
  return insetProbes
}

function forgetInsets() {
  insetCache.safe = null
  insetCache.gap = null
  insetCache.top = null
  insetCache.box = null
  insetCache.bar = null
}

/**
 * The height of the box `position: fixed` is laid out against, which is the
 * box this sheet's `bottom: 0` and its height are measured in. Read off the
 * zero-height probe pinned to its bottom. Not `innerHeight`: that is the same
 * number on most platforms, and on the iOS versions where it shrinks with the
 * keyboard the fixed box does not, so a sheet sized from it collapsed on
 * focus and read the keyboard as nothing.
 */
function fixedBoxHeight(): number {
  if (typeof document === "undefined") return 0
  if (insetCache.box === null) insetCache.box = Math.round(probes().gap.getBoundingClientRect().top)
  return insetCache.box
}

/** The home-indicator inset, as a number, for sizing a content-fit sheet. */
function safeAreaBottom(): number {
  if (typeof document === "undefined") return 0
  if (insetCache.safe === null) insetCache.safe = probes().safe.getBoundingClientRect().height
  return insetCache.safe
}
/**
 * The status bar, as a number. A sheet's top edge never goes above it: see
 * `offsetsFor` and `keyboardCeiling`. Zero in a browser, real in the app.
 */
function safeAreaTop(): number {
  if (typeof document === "undefined") return 0
  if (insetCache.top === null) insetCache.top = probes().top.getBoundingClientRect().height
  return insetCache.top
}
/**
 * The bottom of the page's own bar: the editor's top bar, which marks itself
 * `data-sheet-clear`. MEASURED OFF THE BAR, the one place its height lives
 * (48px plus the status bar, from globals.css), so a sheet never restates it.
 * Read with the other insets and cached until a resize, a rotation or the
 * visual viewport changes. 0 on a page that marks nothing. See `clearOfBar`.
 */
function barBottom(): number {
  if (typeof document === "undefined") return 0
  if (insetCache.bar === null) {
    probes()
    let bottom = 0
    for (const el of document.querySelectorAll<HTMLElement>("[data-sheet-clear]")) {
      const r = el.getBoundingClientRect()
      if (r.width > 0 && r.height > 0) bottom = Math.max(bottom, r.bottom)
    }
    insetCache.bar = Math.round(bottom)
  }
  return insetCache.bar
}
/**
 * How much of a bottom-anchored fixed element the browser's own bar covers.
 *
 * MEASURED, NOT ASSUMED. A zero-height probe pinned to `bottom: 0` reports
 * where the fixed containing block actually ends; `visualViewport.height`
 * reports where the visible area ends. On a browser whose toolbar overlays
 * the page the first is below the second, and the difference is the strip of
 * sheet nobody can see — which is where the Publish button kept ending up.
 * Where the two agree this is zero and nothing changes, which is why it is
 * safe to apply everywhere.
 */
function browserChromeGap(): number {
  if (typeof document === "undefined") return 0
  if (insetCache.gap === null) {
    const probe = probes().gap
    const containingBlockBottom = probe.getBoundingClientRect().top
    const visible = window.visualViewport?.height ?? window.innerHeight
    insetCache.gap = Math.max(0, Math.round(containingBlockBottom - visible))
  }
  return insetCache.gap
}

/** Where the sheet actually is right now, a running transition included. */
function paintedY(el: HTMLElement): number | null {
  try {
    const t = getComputedStyle(el).transform
    if (!t || t === "none") return 0
    return new DOMMatrixReadOnly(t).m42
  } catch {
    return null
  }
}

/** A field that brings a keyboard has the focus (anywhere on the page). */
function typableFocus(): boolean {
  if (typeof document === "undefined") return false
  const t = document.activeElement as HTMLElement | null
  if (!t || t === document.body) return false
  if (t.isContentEditable || t.tagName === "TEXTAREA") return true
  return t.tagName === "INPUT" && /^(text|search|url|tel|email|password|number)$/.test(((t as HTMLInputElement).type || "text").toLowerCase())
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches
  } catch {
    return false
  }
}

/**
 * The time an event happened, which is not the time its handler runs. A
 * handler can run a frame late behind a busy main thread, and timing the
 * finger by when the handler ran makes a steady drag look jerky and a late
 * frame look like a flick. Old engines stamped events with the epoch rather
 * than the page clock; those fall back to now.
 */
function eventTime(e: { timeStamp?: number } | null | undefined): number {
  const t = e?.timeStamp
  const now = performance.now()
  if (typeof t !== "number" || !(t > 0) || t > now + 1000) return now
  return t
}

/**
 * Every scrollable box between the finger and the sheet, nearest first.
 *
 * "Scrollable" means it can actually scroll: `overflow-y-auto` on a box whose
 * content fits is not something a person can scroll, and treating it as one
 * would leave that part of the sheet undraggable for no reason.
 */
function scrollersUnder(target: EventTarget | null, sheet: HTMLElement | null): HTMLElement[] {
  const out: HTMLElement[] = []
  let node = target instanceof HTMLElement ? target : null
  while (node && node !== sheet) {
    const style = window.getComputedStyle(node)
    const scrolls = /(auto|scroll|overlay)/.test(style.overflowY)
    if (scrolls && node.scrollHeight > node.clientHeight + 1) out.push(node)
    node = node.parentElement
  }
  return out
}

/**
 * ===========================================================================
 *  A CONTROL THAT HANDLES ITS OWN TOUCH SAYS SO, ONE WAY OR ANOTHER
 * ===========================================================================
 * `data-sheet-no-drag` was the only way to say it, and only the controls
 * that were written knowing about this sheet said it. The grip on every
 * section row did not: it is `touch-action: none` and reorders on a long
 * press, so a press, a pause and a pull down with the list at its top was a
 * reorder AND a pull on the sheet at once, the row following the finger
 * inside a sheet that was sliding shut under it.
 *
 * `touch-action: none` is the platform's own way for an element to say that
 * every move of a finger on it is its business, and a range input or a
 * `role="slider"` is a control whose drag is its value. Any of them between
 * the finger and the sheet keeps the sheet out of the gesture. The grab bar
 * is `touch-none` for the opposite reason, and is the sheet's own.
 */
function ownsItsTouch(target: EventTarget | null, sheet: HTMLElement, handle: HTMLElement | null): boolean {
  let node = target instanceof Element ? target : null
  while (node && node !== sheet) {
    if (node === handle) return false
    if (node.hasAttribute("data-sheet-no-drag")) return true
    if (node instanceof HTMLInputElement && node.type === "range") return true
    if (node.getAttribute("role") === "slider") return true
    if (getComputedStyle(node).touchAction === "none") return true
    node = node.parentElement
  }
  return false
}

/** How far the content under the finger is from its top, all of it. */
function chainScrollTop(chain: HTMLElement[]): number {
  let sum = 0
  for (const el of chain) sum += Math.max(0, el.scrollTop)
  return sum
}

const SNAP_DURATION_MS = 360
/** A sheet that moves for somebody who asked for less motion moves briefly. */
const REDUCED_MOTION_MS = 180

/**
 * How long a sheet takes to open or close when a tab, a button or the page
 * moves it: the one number, for a caller that has to wait for a sheet to be
 * gone before it moves another (the editor raising the sections sheet once
 * Add a section has closed).
 */
export function sheetMoveMs(): number {
  return prefersReducedMotion() ? REDUCED_MOTION_MS : SNAP_DURATION_MS
}
/**
 * iOS animates its keyboard in about a quarter of a second, and Android is
 * close enough. The sheet resizes over the same time so the two move
 * together rather than the sheet arriving first and waiting.
 */
const KEYBOARD_MS = 250
const SNAP_EASING = "cubic-bezier(0.32, 0.72, 0, 1)"

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  THE SCRIM DOES NOT MOVE, SO IT DOES NOT USE A MOVEMENT'S CURVE
 * ═══════════════════════════════════════════════════════════════════════════
 * The backdrop faded on SNAP_EASING, which is the curve of a thrown object:
 * more than half the distance in the first fifth of the time, then a long
 * settle. On something that travels, that is weight. On an opacity, it is
 * the darkening arriving in one step and then a slow crawl behind it —
 * "direct and laggy", which is exactly what it was.
 *
 * A fade wants its time spread evenly, so this is the ordinary ease-in-out
 * shape, and a little shorter than the sheet so the dimming is finished
 * before the sheet has stopped rather than trailing it.
 */
const FADE_EASING = "cubic-bezier(0.4, 0, 0.2, 1)"
const FADE_MS = 300
/** Never longer than the movement it belongs to. */
const fadeMs = (ms: number) => Math.min(ms, FADE_MS)

/**
 * ===========================================================================
 *  SOMETHING INSIDE THE SHEET NEEDS THE WHOLE SHEET
 * ===========================================================================
 * The sheet opens at its middle stop, which is right for a list of settings
 * you scroll through. A picker opening inside one is not that: it is a list
 * of choices, it appears below the field that opened it, and at the middle
 * stop that is under the bottom of the window. Measured at 390x844 with the
 * link field scrolled to the centre of the panel: the sheet ran 379..1075 in
 * a 757px window and every row of the list sat past 834.
 *
 * So a control can ask for the full height while it is open, and give it
 * back when it closes. Ids rather than a flag, because two fields can be
 * mid-transition at once and the last one to close should not undo the
 * first one's request.
 */
interface SheetExpandHost {
  expand: (id: string) => void
  release: (id: string) => void
}

const SheetExpandContext = React.createContext<SheetExpandHost | null>(null)

/** Null outside a sheet, where there is no detent to ask about. */
export function useSheetExpand(): SheetExpandHost | null {
  return React.useContext(SheetExpandContext)
}

/** Where the sheet rests, for a panel with its own maximize button. */
interface SheetStopHost {
  /** Open and resting at the tallest stop. */
  tallest: boolean
  toTallest: () => void
  /** The stop below the tallest, where a dragged down sheet rests. */
  toMiddle: () => void
}

const SheetStopContext = React.createContext<SheetStopHost | null>(null)

/** Null outside a sheet. */
export function useSheetStop(): SheetStopHost | null {
  return React.useContext(SheetStopContext)
}

/**
 * How far up the screen each stop sits, as a fraction of what is visible.
 * The largest is the sheet's actual height; the others are it, pushed down.
 */
export type Detent = number

const DEFAULT_DETENTS: Detent[] = [0.5, 0.92]

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
  className?: string
  peekHeight?: number
  /** Stops above the peek, smallest first. The last one is the full height. */
  detents?: Detent[]
  /**
   * Open straight to the tallest stop. For a panel whose whole point is room —
   * a conversation — starting at half and making somebody drag is a step that
   * only ever has one answer.
   */
  openFull?: boolean
  /**
   * Which sheets stack above which.
   *
   * The Sections / Pages / Settings sheet is always there, so it is "base".
   * Anything that opens OVER the builder for a moment, the menu, Publish, the
   * AI, is "raised" and sits above it whatever order it landed in the DOM.
   * Without this, all sheets shared one z-index and the last one in the tree
   * won, which put the menu and Publish UNDER the peek they were opened from.
   */
  layer?: "base" | "raised"
  /**
   * Size the sheet to what is in it, up to the tallest detent, instead of to
   * a fraction of the screen. A menu of six rows does not need half a
   * screen; the publish card does not need 62% of one. The sheet measures
   * its content and is exactly that tall, so nothing is clipped at the
   * bottom and nothing is empty under it.
   */
  fit?: boolean
  /**
   * A new value sends an open sheet back to the stop it opens to, wherever
   * a drag left it. The editor changes it when a section has just been
   * added on a phone: the canvas has scrolled the section into the room
   * above that stop, and a sheet left at its tallest would cover it.
   */
  restKey?: number
  /**
   * How long an open or a close the page asks for takes. The house number
   * for every sheet, shorter for a panel that is summoned and put away often
   * (Ask Storelib, 320ms). A drag's own release is timed by the finger.
   */
  moveMs?: number
  /**
   * What a keyboard for a field in this sheet does to it.
   *
   *   "sheet"     the sheet makes room: it grows by the keyboard and pads
   *               its content above it. Right for a form, where the field
   *               being typed into can be anywhere in a scroller.
   *   "composer"  the sheet does not move or resize at all. It publishes
   *               how far the keyboard reaches into it as `--sheet-keys`
   *               and how far iOS panned the page as `--sheet-pan`, and the
   *               content moves ONE row, the composer, by a transform. For a
   *               conversation, where the field is always the last row and a
   *               thread laid out again under a moving keyboard is the jump
   *               and the white gap that were reported.
   */
  keyboard?: "sheet" | "composer"
  /**
   * The sheet fades as it moves when the page opens or closes it: in quickly
   * as it rises, out as it falls. Opacity on the sheet's own layer, so still
   * compositor work. Never while a finger holds it: a dragged sheet is solid.
   */
  fadeOnMove?: boolean
  /**
   * The keyboard's height where the platform says nothing about it (an iOS
   * app's web view): asked in place of the published floor, and in the focus
   * itself, so the sheet has made its room before iOS decides whether to pan
   * the page to the field. The community's composer hands in its decision
   * table's number (components/community/member/keyboard-plan.ts); null keeps
   * the floor; it must answer null whenever no field in the sheet has the
   * focus. Without it, nothing changes.
   */
  keyboardRoom?: () => number | null
  /**
   * How the page behind an open sheet with no peek is held: "overflow" (the
   * default) switches the document's overflow off and puts its scroll back;
   * "scroll" only puts its scroll back, the frame anything moves it. iOS
   * keeps a scroll view stuck for a moment after its overflow comes back,
   * which a feed under a composer cannot have.
   */
  holdPage?: "overflow" | "scroll"
  /** The sheet's own stacking order, over a layer that is not the builder's (the backdrop sits one under it). */
  zIndex?: number
  /**
   * PREPARED BEFORE IT MOVES (round 25, the community's opened post and New
   * post). Mounted closed, a primed sheet is drawn at the stop it will open
   * to, unseen (PRIMED_OPACITY) and untouchable, so what is in it is laid
   * out, painted and rastered while the page gets it ready. The first open
   * then starts from below the screen as any open does, and its first moving
   * frame has nothing new to draw. Not for a sheet with a peek, nor with
   * `fadeOnMove`.
   */
  primed?: boolean
  /**
   * Told when a move the page asked for (an open, a close) has landed, and
   * when a release a finger made has: `open` is where it came to rest. For a
   * page that has to know the sheet is down before it takes it out.
   */
  onMoved?: (open: boolean) => void
  /** The dialog's accessible name. */
  label?: string
}

/** A primed sheet's opacity while it waits: under half a level of any colour on any screen, but not 0 (an opacity of 0 is not rastered). */
export const PRIMED_OPACITY = 0.0015

/**
 * ===========================================================================
 *  A TAP THAT STARTED ON THE SHEET ENDS ON THE SHEET
 * ===========================================================================
 * A browser does not send the click of a tap to the element the finger
 * pressed. It sends it to whatever is under the finger when the click is
 * made, a moment after the finger lifts. If the sheet moved in that moment
 * (a tap that caught it mid-slide, and so let it carry on; a release that
 * snapped it), the click lands on the canvas where the sheet used to be and
 * selects a section nobody tapped. That is the "click through" reported on
 * the Sections / Pages / Theme sheet.
 *
 * So for a short while after a touch that began on the sheet, the mouse
 * events a browser makes up for it are only allowed to land on the sheet.
 * One that lands anywhere else, near where the finger was, is dropped. A
 * real mouse is untouched: it has no touch before it.
 */
const GHOST_CLICK_MS = 700
const GHOST_CLICK_PX = 32

export function MobileEditorSheet({
  open,
  onOpenChange,
  children,
  className,
  peekHeight = PEEK_HEIGHT,
  detents = DEFAULT_DETENTS,
  openFull = false,
  layer = "base",
  fit = false,
  restKey,
  moveMs = SNAP_DURATION_MS,
  keyboard: keyboardMode = "sheet",
  fadeOnMove = false,
  keyboardRoom,
  holdPage = "overflow",
  zIndex,
  primed = false,
  onMoved,
  label,
}: Props) {
  const onMovedRef = React.useRef(onMoved)
  onMovedRef.current = onMoved
  /** A primed sheet that has not opened yet (see `primed`). */
  const primedWaiting = React.useRef(primed)
  const keyboardRoomRef = React.useRef(keyboardRoom)
  keyboardRoomRef.current = keyboardRoom
  /** A keyboard reading put off until a close has landed (see measureViewport). */
  const closingRead = React.useRef(0)
  const composerKeys = keyboardMode === "composer"
  const sheetRef = React.useRef<HTMLDivElement>(null)
  /** The grab bar. A touch that starts here is a drag and needs no arbitration. */
  const handleRef = React.useRef<HTMLDivElement>(null)
  const overlayRef = React.useRef<HTMLDivElement>(null)
  const [mounted, setMounted] = React.useState(false)
  /** What is actually visible, which is not the window once a keyboard is up. */
  const [viewport, setViewport] = React.useState(0)
  /** Pixels of a bottom-pinned element the browser's own bar sits over. */
  const [chromeGap, setChromeGap] = React.useState(0)
  /**
   * How much of the sheet a keyboard is covering. Padded into the content
   * rather than taken out of the sheet's height — see measureViewport.
   */
  const [keyboardInset, setKeyboardInset] = React.useState(0)
  /**
   * How far iOS has panned the visible area down the page to show a focused
   * field, which takes that much off the top of a fixed sheet. Measured in
   * the same frame as `keyboardInset`, from the same viewport; see
   * `visibleKeyboard` in sheet-gestures.ts.
   */
  const [visibleTop, setVisibleTop] = React.useState(0)
  /** The status bar, which no stop and no keyboard puts the sheet's top edge under. */
  const [safeTop, setSafeTop] = React.useState(0)
  /** The page's own bar, which the tallest stop covers or clears but never cuts across. */
  const [barEdge, setBarEdge] = React.useState(0)
  /**
   * The keyboard is up for a field INSIDE this sheet. Then the sheet stands
   * at its tallest stop while it is typed into, the way an iOS sheet goes to
   * its large detent for a keyboard, and goes back to where it was left when
   * the keyboard does. A keyboard some other sheet opened moves nothing here.
   */
  const [keyboardHere, setKeyboardHere] = React.useState(false)
  /**
   * The home indicator, added to the peek rather than subtracted from it.
   *
   * The peek is how much of the sheet stays on screen when it is closed, and
   * the sheet pads its own content clear of the home bar — so a bare 72px
   * peek on a phone with a 34pt indicator left 38px of tab row showing, half
   * a control. Grown by the inset, what stays visible is 72px of sheet in
   * both places. The editor's canvas subtracts `--wb-sheet-peek`, which is
   * this same sum in CSS, so the two agree on where the canvas ends.
   */
  const [peekInset, setPeekInset] = React.useState(0)
  /**
   * ANCHORED BY `bottom: 0`, AND THIS IS DELIBERATE.
   *
   * An earlier attempt placed the sheet by `top`, computed as
   * `visualViewport.offsetTop + visualViewport.height - height`, on the
   * theory that a fixed element is laid out against a taller layout viewport
   * running behind Safari's toolbar. On a real iPhone that lands the sheet
   * LOWER, not higher: Safari already keeps a bottom-anchored fixed element
   * above its toolbar, so the correction was a second one on top of the
   * browser's, and the publish card went under the bar rather than above it.
   *
   * `bottom: 0` is what the browser already gets right. What was actually
   * cutting the sheet off was the stop it opened to, below.
   */

  /**
   * Who is asking for the full height. Functional updates only: an updater
   * runs in the render phase, so anything with a side effect in it is a
   * state update during render and React abandons the tree.
   */
  /**
   * ═══════════════════════════════════════════════════════════════════════
   *  WHERE THE SHEET WAS LEFT, WHICH A RE-RENDER HAS TO AGREE WITH
   * ═══════════════════════════════════════════════════════════════════════
   * A drag ends by writing the transform straight to the node and storing
   * the offset in a ref — fast, and invisible to React. So `renderY` fell
   * back to `openY`, the middle stop, and the NEXT render put it back there:
   * drag the sheet up, type in a field, touch a slider, and it drops to half
   * with nothing to blame. Reported three times over as the sheet becoming
   * half at random, glitching while a slider is dragged, and jumping when
   * something takes focus. All three are one line: the position was never
   * part of the state that draws it.
   *
   * The INDEX rather than the pixel offset, because the offsets are
   * recomputed whenever the window is (a keyboard, a rotation) and a stale
   * pixel is a sheet in the wrong place.
   */
  const [restIndex, setRestIndex] = React.useState<number | null>(null)
  const [expanders, setExpanders] = React.useState<string[]>([])
  const expandApi = React.useMemo<SheetExpandHost>(
    () => ({
      expand: (id) => setExpanders((list) => (list.includes(id) ? list : [...list, id])),
      release: (id) => setExpanders((list) => (list.includes(id) ? list.filter((x) => x !== id) : list)),
    }),
    [],
  )
  /* A sheet that closes owes nobody a height. */
  React.useEffect(() => {
    if (!open) {
      setExpanders([])
      setRestIndex(null)
    }
  }, [open])
  /* Asked to go back to the stop it opens to (see `restKey`): where it was left no longer counts. */
  const restKeySeen = React.useRef(restKey)
  React.useEffect(() => {
    if (restKey === restKeySeen.current) return
    restKeySeen.current = restKey
    setRestIndex(null)
  }, [restKey])

  /**
   * A TAP WHEN IT ARRIVES.
   *
   * Every sheet on a phone that is worth the name answers a press with
   * something felt, and this one is the editor's main surface — it opens on
   * a tap and slides 360ms, which is long enough that a silent arrival reads
   * as a delay. `hapticTap` is the one place that knows how to reach the
   * Taptic Engine inside Capacitor and falls back to navigator.vibrate on
   * the web; see lib/native-bridge.
   *
   * On the way in only. A sheet closing is the result of something else a
   * person already felt — a choice, a press on the backdrop — and a second
   * tap for it is noise.
   */
  const wasOpen = React.useRef(open)
  React.useEffect(() => {
    if (open && !wasOpen.current) hapticTap("light")
    wasOpen.current = open
  }, [open])

  const stops = React.useMemo(() => [...detents].sort((a, b) => a - b), [detents])
  /** What the content wants, when `fit` is on. Handle included, measured live. */
  const contentRef = React.useRef<HTMLDivElement>(null)
  const [contentHeight, setContentHeight] = React.useState(0)
  React.useEffect(() => {
    if (!fit || !mounted) return
    const el = contentRef.current
    const handle = handleRef.current
    if (!el) return
    const measure = () => {
      // The gap is part of the sheet's height as well as its padding: a sheet
      // grown only by padding would push its own content back out of sight.
      const safe = safeAreaBottom() + browserChromeGap()
      /**
       * ===============================================================
       *  A MEASUREMENT THAT CANNOT DEPEND ON THE ANSWER
       * ===============================================================
       * Two attempts at this have now got stuck, and both got stuck the
       * same way: the number was read from boxes whose size the number
       * itself decides. The wrapper holds a scroller that is free to
       * shrink, so the sheet took the height it measured, that squeezed
       * the scroller, the next measurement came back smaller, and the pair
       * settled wherever the collapse ran out — a Publish card a third of
       * the screen tall with its own URL row below the fold.
       *
       * Adding back "whatever the scroller is currently clipping" was
       * supposed to make it converge upward instead. It converges only
       * while the scroller is the thing being clipped; the moment the
       * squeeze lands anywhere else — the wrapper cut by the sheet's own
       * `overflow: hidden`, a scroller handed zero height by a flex line
       * that had none to give — the correction is zero and every height is
       * self-consistent. Any starting height is then a fixed point,
       * including a bad one, which is exactly what shipped.
       *
       * So nothing here is measured from a constrained box. A scroller
       * contributes the height of its CONTENT, which is inside it and
       * therefore never squeezed by it, and the correction is applied as a
       * difference against what that scroller was actually given. The
       * result is the same number whatever height the sheet happens to be
       * at when it is taken, so there is no loop to settle and no fixed
       * point to get caught in.
       */
      let wanted = 0
      for (const child of Array.from(el.children) as HTMLElement[]) {
        let h = child.getBoundingClientRect().height
        const scroller = child.matches("[data-sheet-scroll]")
          ? child
          : child.querySelector<HTMLElement>("[data-sheet-scroll]")
        if (scroller) h += naturalScrollHeight(scroller) - scroller.clientHeight
        wanted += h
      }
      setContentHeight(
        Math.ceil(wanted + (handle?.getBoundingClientRect().height ?? 0) + safe),
      )
    }
    measure()
    // The wrapper's own box stops changing as soon as the sheet settles, so
    // observing only that misses a card whose CONTENT grew: a URL arriving,
    // a status line changing from one word to three. Every marked content
    // box is observed as well.
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    for (const node of el.querySelectorAll<HTMLElement>("[data-sheet-content]")) ro.observe(node)
    return () => ro.disconnect()
    // `open` is in here deliberately. A ResizeObserver reports a box that
    // CHANGED, and a card whose content was laid out once and never touched
    // again presents no change to report — so the one measurement that has
    // to be right, the one taken at the moment the sheet is shown, would be
    // whatever the last one happened to be.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fit, mounted, chromeGap, open])

  React.useEffect(() => {
    setMounted(true)
    const vv = window.visualViewport
    /** The window whose keyboard matters; its viewport is listened to below. */
    const kbvv = keyboardWindow().visualViewport
    /**
     * ONE MEASUREMENT PER FRAME, HOWEVER MANY EVENTS.
     *
     * `visualViewport.scroll` fires on every frame of a keyboard animation
     * and `resize` alongside it, and each `update` appends a probe and reads
     * its box, which is a synchronous layout of the whole editor — the
     * canvas, the site in it, the sheet. Several of those in one frame is the
     * "lags the layout" that was reported. Coalesced into a rAF, the sheet
     * measures once per painted frame and never more.
     */
    let frame = 0
    const update = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        measureViewport()
      })
    }
    const measureViewport = () => {
      /**
       * =====================================================================
       *  THE SHEET IS SIZED TO THE SCREEN, NOT TO WHAT THE KEYBOARD LEFT
       * =====================================================================
       * This used to be `visualViewport.height`, which is the right number
       * for almost everything and the wrong one for a sheet whose geometry
       * is a fraction of it. iOS does not shrink the LAYOUT viewport for the
       * keyboard, it shrinks the VISUAL one and scrolls it — so every input
       * focus rewrote the sheet's height AND every detent offset underneath
       * it at once, and Add Section collapsed to a strip with the search
       * field and the whole library gone behind the keyboard.
       *
       * The fixed box does not move when a keyboard opens, so the sheet's
       * geometry does not either. It was `innerHeight`, which agrees with
       * the fixed box everywhere except the iOS versions that shrink
       * `innerHeight` with the keyboard (see `fixedBoxHeight`). What the
       * keyboard covers is measured separately, below, and padded into the
       * CONTENT.
       */
      setViewport(Math.round(fixedBoxHeight() || window.innerHeight || vv?.height || 0))
      /**
       * The strip the keyboard is sitting over. Rounded away from a
       * sub-pixel: a 0.5px "keyboard" is a rounding artefact on every
       * resize, and moving the content by it is a twitch.
       */
      /**
       * =====================================================================
       *  INSIDE A FRAME, THE KEYBOARD IS THE PARENT'S TO REPORT
       * =====================================================================
       * The creator page editor holds the real page in an iframe, and this
       * sheet opens INSIDE that page. An iframe's own `visualViewport` on
       * iOS is the frame's box and nothing else: it does not shrink when a
       * keyboard opens over the top document, so from in here the keyboard
       * measured as zero, nothing was padded, and iOS did the only thing it
       * could to show the focused field — it scrolled the whole outer page
       * up by the keyboard's height. That is the sheet with its top pushed
       * off the screen and a strip of the workspace showing under it.
       *
       * Same origin, so the parent's viewport is readable. The keyboard is
       * measured from whichever window actually has one; the sheet's own
       * geometry still comes from its own `innerHeight`, because that is the
       * box it is drawn in.
       */
      const kb = keyboardWindow()
      const kvv = kb.visualViewport
      /**
       * ONE READING, TWO NUMBERS: what the keyboard covers at the bottom and
       * how far iOS panned the page at the top to show the field. Both come
       * from this one viewport in this one frame, and both reach the page
       * through the sheet's own geometry (its height, its padding), so the
       * conversation inside never measures a keyboard of its own.
       */
      const box = kb === window ? fixedBoxHeight() : kb.innerHeight
      const seen = kvv
        ? visibleKeyboard({ layoutHeight: box, vvHeight: kvv.height, vvTop: kvv.offsetTop, scale: kvv.scale })
        : { inset: 0, top: 0, reported: false, zoomed: false }
      /* The published floor only where the platform said nothing at all, and
         never a toolbar or a pinch taken for a keyboard: see `keyboardFor`. */
      let keyboard = keyboardFor(seen, keyboardRoomRef.current?.() ?? readPublishedKeyboardInset())
      let panned = seen.top
      if (keyboardRoomRef.current) {
        /*
          ROUND 25, A SHEET THAT MAKES ITS ROOM IN THE FOCUS (keyboardRoom: the
          community's opened post and New post).
          CLOSING, NOTHING INSIDE MOVES. A keyboard going down while the sheet
          slides away relaid its content (the room under the toolbar or the
          comment box gone in the middle of the move). Read again once the
          move is over, when nothing of it is on screen.
          NO FIELD, NO KEYBOARD. A field let go of with nothing typable taking
          the focus is the keyboard leaving, and iOS reports that only once it
          has gone: the room goes now, with the keys, rather than a quarter
          second later as a jump.
        */
        const wait = motionUntil.current - performance.now()
        if (!openRef.current && wait > 0) {
          window.clearTimeout(closingRead.current)
          closingRead.current = window.setTimeout(update, wait + 20)
          return
        }
        if (!typableFocus()) {
          keyboard = 0
          panned = 0
        }
      }
      setKeyboardInset(keyboard)
      setVisibleTop(panned)
      const active = document.activeElement
      setKeyboardHere(
        (keyboard > 0 || panned > 0) && !!active && active !== document.body && !!sheetRef.current?.contains(active),
      )
      /**
       * =====================================================================
       *  THE KEYBOARD IS NOT PART OF THE BROWSER'S CHROME
       * =====================================================================
       * `browserChromeGap` works out how much of a bottom-anchored fixed
       * element the browser's own toolbar covers, and the only way to ask
       * that is `innerHeight - visualViewport.height`. A KEYBOARD SHRINKS
       * THAT NUMBER TOO. So with a keyboard up the gap measured the keyboard,
       * `keyboardInset` measured the same keyboard again, and the panel was
       * padded by the sum: measured at 672px of padding for a 336px keyboard,
       * which left the whole library in a 44px strip with the rest of the
       * sheet showing as blank background. That is the white band.
       *
       * A toolbar does not appear or disappear because somebody tapped a text
       * field, so the gap is simply not re-measured while a keyboard is up:
       * it keeps the value it had, `keyboardInset` carries the keyboard, and
       * the two add up to the strip that is actually covered.
       *
       * This also protects the sheet's GEOMETRY, which depends on chromeGap.
       * A chrome gap that moved with the keyboard would resize the sheet and
       * every detent under it on focus, which is the collapse this file
       * already refuses to do by sizing itself to `innerHeight`.
       *
       * The home indicator is deliberately NOT measured here: a collapsing
       * toolbar genuinely changes mid-scroll so it has to be re-read, and
       * `visualViewport.scroll` fires on every frame of a scroll on iOS, so
       * a probe that appends an element and reads its box is a layout per
       * frame. A home indicator only changes on rotation. It has its own
       * listeners below.
       */
      if (!keyboard && !panned) setChromeGap(browserChromeGap())
    }
    measureViewport()
    window.addEventListener("resize", update)
    vv?.addEventListener("resize", update)
    /* The parent's viewport is where a keyboard shows up when we are framed. */
    if (kbvv && kbvv !== vv) {
      kbvv.addEventListener("resize", update)
      kbvv.addEventListener("scroll", update)
    }
    /**
     * `scroll` as well as `resize`: iOS reports the keyboard by scrolling the
     * visual viewport, not only by resizing it, and a sheet that ignored that
     * would sit correctly the first time and wrongly after any scroll.
     */
    vv?.addEventListener("scroll", update)
    return () => {
      if (frame) cancelAnimationFrame(frame)
      window.clearTimeout(closingRead.current)
      window.removeEventListener("resize", update)
      vv?.removeEventListener("resize", update)
      if (kbvv && kbvv !== vv) {
        kbvv.removeEventListener("resize", update)
        kbvv.removeEventListener("scroll", update)
      }
      vv?.removeEventListener("scroll", update)
    }
  }, [])

  // The home indicator, on the only two events that can change it. Read in a
  // frame rather than in the event: a rotation fires both, and the probe's
  // cache is only forgotten by the listeners that run alongside this one.
  React.useEffect(() => {
    let frame = 0
    const read = () => {
      setPeekInset(safeAreaBottom())
      setSafeTop(safeAreaTop())
      setBarEdge(barBottom())
    }
    const measure = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        read()
      })
    }
    read()
    window.addEventListener("resize", measure)
    window.addEventListener("orientationchange", measure)
    return () => {
      if (frame) cancelAnimationFrame(frame)
      window.removeEventListener("resize", measure)
      window.removeEventListener("orientationchange", measure)
    }
  }, [])
  /* The bar again on every open: a sheet can mount before the page's bar
     has, and a bar is not a resize. One query and one box per open. */
  React.useEffect(() => {
    if (!open) return
    insetCache.bar = null
    setBarEdge(barBottom())
  }, [open])

  /**
   * =====================================================================
   *  THE FIELD BEING TYPED INTO IS BROUGHT ON SCREEN
   * =====================================================================
   * The browser does this by itself, by scrolling the thing that contains
   * the field — and inside the workspace's frame there is nothing it can
   * usefully scroll, because the frame's own viewport never shrinks for a
   * keyboard it cannot see. KeyboardGuard's version has the same blind spot
   * for the same reason.
   *
   * The sheet can see it: `keyboardInset` is measured from whichever window
   * actually has the keyboard. So when it arrives, the sheet scrolls its own
   * scroller to put the focused field in the middle of what is left.
   *
   * Two frames of delay, because the sheet grows on the same change and the
   * scroller's height is not the new one until the browser has laid it out.
   */
  React.useEffect(() => {
    if (!open || keyboardInset <= 0) return
    let raf1 = 0
    let raf2 = 0
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        const active = document.activeElement as HTMLElement | null
        if (!active) return
        const typing = active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.isContentEditable
        if (!typing) return
        const scroller = active.closest<HTMLElement>("[data-sheet-scroll]")
        if (!scroller || !sheetRef.current?.contains(active)) return
        const field = active.getBoundingClientRect()
        const box = scroller.getBoundingClientRect()
        const centreWithin = field.top - box.top + field.height / 2
        scroller.scrollTo({
          top: Math.max(0, scroller.scrollTop + centreWithin - scroller.clientHeight / 2),
          behavior: "smooth",
        })
      })
    })
    return () => {
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
    }
  }, [keyboardInset, open])

  // A sheet with no peek has nothing to grow: `peekHeight={0}` still means
  // gone, not "gone except for the home indicator".
  const peek = peekHeight > 0 ? peekHeight + peekInset : 0
  const natural = offsetsFor({ viewport, detents: stops, peekHeight: peek, safeTop, barBottom: barEdge }).height
  const detentHeight = fit && contentHeight > 0 ? Math.min(contentHeight, natural) : natural
  /**
   * Grown by the keyboard, so the panel above it stays the size the detent
   * asked for, up to the ceiling: the top edge stays where the tallest stop
   * keeps it, under the status bar never, and follows the screen down when
   * iOS pans the page to show the field. With the keyboard up the sheet
   * stands at its tallest stop (`keyboardHere`), so the panel is exactly the
   * strip from that edge to the keyboard, and the composer sits on the keys.
   * sheet-gestures.ts explains why the offsets are left alone.
   */
  const ceiling = keyboardCeiling({ viewport, tallestHeight: natural, safeTop, visibleTop, barBottom: barEdge })
  /* A composer sheet never changes size for a keyboard: see `keyboard` in Props. */
  const height = composerKeys ? detentHeight : sheetHeightWithKeyboard(detentHeight, keyboardInset, ceiling)
  /**
   * WHAT THE COMPOSER RIDES ON, for a "composer" sheet. The keyboard covers
   * `keyboardInset` of the fixed box and iOS may have panned the page by
   * `visibleTop` to show the field; the content is moved back down by the
   * pan (`--sheet-pan`), so the composer has to rise by both, less the home
   * indicator and toolbar strip it already sits above. The sum is the
   * keyboard's whole height, which is why it stays still while iOS pans:
   * the pan moves the page, not the keyboard.
   */
  const bottomReservePx = peekInset + chromeGap
  const composerLift =
    composerKeys && keyboardHere ? Math.max(0, Math.round(keyboardInset + visibleTop - bottomReservePx)) : 0
  const composerPan = composerKeys && keyboardHere ? Math.max(0, Math.round(visibleTop)) : 0

  /**
   * translateY for each stop, tallest first — and SORTED, which is the whole
   * correctness of the thing.
   *
   * A larger fraction is a smaller offset, so mapping the fractions in
   * ascending order produces offsets in DESCENDING order: [336, 0], and with
   * the peek appended, [336, 0, 664]. That array is not monotonic, and the
   * flick logic below moves by index on the assumption that it is — so "one
   * stop further down" from full would have gone to half's index and then
   * jumped to the peek. Sorting is what makes index order and screen order the
   * same thing.
   */
  const offsets = React.useMemo(
    () =>
      fit && contentHeight > 0
        ? // One stop — the content's own height — and the closed position.
          //
          // `detentHeight`, not `height`: the closed position is how far the
          // sheet travels to be gone, and a keyboard is never up while it is
          // closed. Using the grown height here would leave the keyboard's
          // height of sheet showing after a dismissal.
          [0, Math.max(detentHeight - peek, 0)]
        : offsetsFor({ viewport, detents: stops, peekHeight: peek, safeTop, barBottom: barEdge }).offsets,
    [stops, viewport, peek, fit, contentHeight, detentHeight, safeTop, barEdge],
  )

  /**
   * ===================================================================
   *  THE CANVAS RESERVES THE NUMBER THE SHEET ACTUALLY LEAVES SHOWING
   * ===================================================================
   * The editor's canvas has to keep the peek clear, and it used to do that
   * by computing the same sum in CSS: 72px plus env(safe-area-inset-bottom).
   * Two computations of one number, in two languages, from two different
   * readings of the inset — and on a real phone they did not agree. Every
   * pixel they differed by was a strip of canvas the sheet did not cover,
   * showing the dark behind it: the black band above Sections / Pages /
   * Settings.
   *
   * There is only one number now, and it is this one — the peek this sheet
   * is actually translated to, in pixels, measured on the device it is
   * running on. The canvas reads it and cannot disagree with it.
   *
   * Only a sheet WITH a peek publishes. The menu, Publish and the AI are
   * `peekHeight={0}`: they cover the canvas when open and reserve nothing.
   */
  React.useEffect(() => {
    if (peek <= 0) return
    const root = document.documentElement
    root.style.setProperty("--wb-sheet-peek", `${peek}px`)
    return () => {
      root.style.removeProperty("--wb-sheet-peek")
    }
  }, [peek])
  /**
   * AND HOW MUCH OF THE SCREEN IT TAKES WHEN IT IS UP, at the stop it opens
   * to. Published the same way and for the same reason: the editor scrolls a
   * section it has just added into the room above this stop before it
   * raises the sheet there (lib/website-builder/section-arrival.ts), and a
   * second computation of the stop would be a second answer.
   */
  const openCover = Math.max(0, Math.round(detentHeight - (offsets[Math.max(0, offsets.length - 2)] ?? 0)))
  React.useEffect(() => {
    if (peek <= 0 || openCover <= 0) return
    const root = document.documentElement
    root.style.setProperty("--wb-sheet-open", `${openCover}px`)
    return () => {
      root.style.removeProperty("--wb-sheet-open")
    }
  }, [peek, openCover])

  const closedY = offsets[offsets.length - 1]
  /** Something in the sheet needs all of it: a picker, or a field being typed into. */
  const lifted = expanders.length > 0 || keyboardHere
  const openY = openFull || lifted ? offsets[0] : (offsets[Math.max(0, offsets.length - 2)] ?? 0)
  /**
   * WHERE THE SHEET BELONGS RIGHT NOW, for the render and for the effect
   * that moves it, which have to be the same answer or the sheet fights
   * itself.
   *
   * A control asking for the full height outranks where the sheet was left:
   * it is asking BECAUSE what it opened does not fit. Otherwise the last
   * settled stop wins, and `openY` is only the answer before anything has
   * been dragged.
   */
  const settledY =
    lifted
      ? openY
      : restIndex !== null && restIndex < offsets.length
        ? offsets[restIndex]
        : openY

  /**
   * WHETHER THE SHEET IS AT ITS TALLEST, and a way to move it there and back,
   * for a panel that offers its own maximize (Ask Storelib's header). It
   * sets the same resting stop a drag does, so a drag afterwards is a drag
   * from there, and the sync effect below moves it on the usual curve.
   */
  const tallest = open && settledY === offsets[0]
  const stopApi = React.useMemo<SheetStopHost>(
    () => ({
      tallest,
      toTallest: () => setRestIndex(0),
      toMiddle: () => setRestIndex(stops.length > 1 ? 1 : 0),
    }),
    [tallest, stops.length],
  )

  const openRef = React.useRef(open)
  openRef.current = open
  const offsetsRef = React.useRef(offsets)
  offsetsRef.current = offsets
  const onOpenChangeRef = React.useRef(onOpenChange)
  onOpenChangeRef.current = onOpenChange
  /** Where the sheet belongs with nobody touching it, for resuming a caught move. */
  const restYRef = React.useRef(0)
  restYRef.current = open ? settledY : closedY

  const drag = React.useRef({
    startY: 0,
    startX: 0,
    startTime: 0,
    lastY: 0,
    lastTime: 0,
    active: false,
    baseY: 0,
    currentY: 0,
    /** Where the finger would put the sheet, before any resistance. */
    rawY: 0,
    /**
     * Decided ONCE, on the first movement past the threshold, and kept for the
     * rest of the gesture. Re-deciding mid-drag is how a sheet snatches itself
     * away from a finger halfway down a list.
     */
    intent: "undecided" as DragIntent,
    /** The scrollable thing under the finger, if there is one. */
    scroller: null as HTMLElement | null,
    /** It and every scrollable box around it, nearest first. */
    chain: [] as HTMLElement[],
    /** The gesture was decided as sideways, so it stays the scroller's. */
    horizontal: false,
    /**
     * Where a scroll that ran out of list handed the finger to the sheet
     * (`handOffToSheet`). If the finger turns back up past `base`, the list
     * takes it again: scrolled by hand from its top, or by the browser where
     * the browser already owns the scroll (`byHand` false), and the sheet
     * stays at `base` either way. Null for any other gesture.
     */
    carry: null as null | { base: number; byHand: boolean },
    /** The finger landed on a sheet that was still moving and stopped it. */
    caught: false,
    /**
     * Where and when the finger came down, and the furthest it has been from
     * there since. `startY` moves when the sheet takes over; these do not,
     * so a tap can be told from a drag however the gesture was decided.
     */
    downX: 0,
    downY: 0,
    downTime: 0,
    travel: 0,
    /** The gesture began on the grab bar, where a tap steps the sheet. */
    onHandle: false,
    /** Recent positions, for the release speed. */
    samples: [] as Sample[],
  })

  /**
   * ONE WRITE PER FRAME.
   *
   * `touchmove` can fire more than once between paints — on a 120Hz panel it
   * usually does — and every write to `style.transform` in the same frame is
   * work the compositor throws away. Worse, reading nothing and writing twice
   * still costs a style recalculation each time.
   *
   * Coalescing into a rAF means the browser gets exactly one transform per
   * frame, which is the shape a compositor-driven drag is supposed to have.
   */
  const pendingY = React.useRef<number | null>(null)
  const rafId = React.useRef(0)
  /** When and where a finger last touched or left the page; see the grab bar's mousedown. */
  const lastTouch = React.useRef({ at: -Infinity, x: 0, y: 0 })

  const writeTransform = (y: number) => {
    const sheet = sheetRef.current
    const overlay = overlayRef.current
    const cY = offsetsRef.current[offsetsRef.current.length - 1]
    if (sheet) {
      /*
        THE ONLY THING WRITTEN PER FRAME, AND THE ONLY THING THAT CAN BE.
        A transform is handed to the compositor; nothing here is laid out
        again for it. See `layoutHiddenRoom` below for what used to be
        written alongside it and why it could not stay.
      */
      sheet.style.transform = `translateY(${y}px)`
    }
    if (overlay) {
      const opacity = cY > 0 ? Math.max(0, Math.min(1, 1 - y / cY)) : 0
      overlay.style.opacity = String(opacity)
    }
  }

  const applyTransform = (y: number) => {
    pendingY.current = y
    if (rafId.current) return
    rafId.current = requestAnimationFrame(() => {
      rafId.current = 0
      if (pendingY.current !== null) writeTransform(pendingY.current)
      pendingY.current = null
    })
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════════
   *  WHAT THE SHEET HIDES, THE SCROLLER GETS BACK — ONCE IT HAS STOPPED
   * ═══════════════════════════════════════════════════════════════════════════
   * The sheet is always its full height and is slid DOWN by `y`, so at a
   * half-open stop the bottom `y` pixels of it are below the screen. The
   * scroller inside is sized for the whole sheet, and its last `y` pixels of
   * content sit in that hidden part: you scroll to the end and the end is off
   * the bottom of the phone. This is that number, handed to the stylesheet,
   * which adds exactly that much room after the content (see
   * `[data-sheet-scroll]::after` in globals.css).
   *
   * IT USED TO BE WRITTEN EVERY FRAME OF THE DRAG, next to the transform, and
   * that is what made the drag heavy on a phone. The transform is compositor
   * work and costs the main thread nothing. This is a custom property that a
   * `::after` inside the scroller uses as its HEIGHT — so setting it laid the
   * scroller's whole content out again, once per frame, behind a finger, with
   * every section row in the sheet to re-measure. A drag is the one moment
   * that cannot afford layout.
   *
   * Nothing needs it mid-drag: the room only matters to someone SCROLLING the
   * sheet, and a finger that is dragging the sheet is not scrolling it — the
   * arbitration at touchdown picks one or the other and never both. So it is
   * written when the sheet comes to rest, which is the only moment its value
   * is the one that lasts.
   *
   * Zero for a content-fit sheet, whose height is measured from that same
   * content: room added there would be measured, grow the sheet, add more
   * room, and never settle.
   */
  const layoutHiddenRoom = React.useCallback((y: number) => {
    const sheet = sheetRef.current
    if (!sheet) return
    sheet.style.setProperty("--wb-sheet-hidden", fit ? "0px" : `${Math.max(0, Math.round(y))}px`)
  }, [fit])

  /**
   * ═══════════════════════════════════════════════════════════════════════════
   *  AND NOT IN THE FRAME THE SHEET STARTS MOVING, EITHER
   * ═══════════════════════════════════════════════════════════════════════════
   * Taking the room out of the drag was half of it. The snap still wrote it,
   * in the same breath as the transform that starts the snap, so the first
   * frame of every release carried a layout of the scroller's whole content
   * before the compositor could begin the move. On a phone that frame is the
   * one a person watches most closely: it is where the sheet leaves the
   * finger.
   *
   * So the room is written once the move has finished. Nothing is lost by
   * waiting: during the move the sheet is going somewhere, and the room is
   * only for somebody scrolling a sheet that has arrived. `motionUntil` is
   * when the current move ends; a write asked for before then waits for it.
   */
  const motionUntil = React.useRef(0)
  const roomTimer = React.useRef(0)
  const scheduleRoom = React.useCallback((y: number) => {
    window.clearTimeout(roomTimer.current)
    const wait = motionUntil.current - performance.now()
    if (wait <= 0) {
      layoutHiddenRoom(y)
      return
    }
    roomTimer.current = window.setTimeout(() => {
      // A finger that has since taken the sheet will settle it again, and
      // that settle writes the room for wherever it ends up.
      if (drag.current.active && drag.current.intent === "sheet") return
      layoutHiddenRoom(y)
    }, wait + 34)
  }, [layoutHiddenRoom])

  /**
   * The snap has to land exactly, so it writes straight through: a queued rAF
   * carrying the last DRAG position would fire after the transition had been
   * turned on and animate the sheet back to where the finger was.
   */
  const applyTransformNow = (y: number) => {
    if (rafId.current) {
      cancelAnimationFrame(rafId.current)
      rafId.current = 0
    }
    pendingY.current = null
    writeTransform(y)
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════════
   *  A KEYBOARD RESIZE IS A MOVE, SO IT IS ANIMATED AS ONE
   * ═══════════════════════════════════════════════════════════════════════════
   * The sheet grows by the keyboard's height and shrinks back when it goes
   * (see sheetHeightWithKeyboard), and a content-fit sheet grows when its
   * content does. Both used to be a CSS transition on `height` and
   * `padding-bottom`, which is a layout of the sheet and everything in it on
   * every frame of the change, on the phones least able to afford it.
   *
   * The same move, done the way a transform-only animation does it: the new
   * height is laid out ONCE, and in the same frame the sheet is put back where
   * its top edge was by a translate of the difference. Then that translate is
   * animated away on the compositor. The top edge travels exactly as it did
   * when the height was being animated, and the content box, which is height
   * minus padding and changes by neither, is never laid out again.
   *
   * Not while a finger is on the sheet, which owns the transform, and not
   * while another move is running, which it would cut short.
   */
  const lastHeight = React.useRef<number | null>(null)
  const resizeMove = React.useRef<Animation | null>(null)
  const stopResizeMove = () => {
    resizeMove.current?.cancel()
    resizeMove.current = null
  }

  React.useEffect(() => () => {
    if (rafId.current) cancelAnimationFrame(rafId.current)
    window.clearTimeout(roomTimer.current)
    stopResizeMove()
  }, [])

  /**
   * ═════════════════════════════════════════════════════════════════════════
   *  THE BACKDROP'S TWO PROPERTIES ARE SET TOGETHER OR NOT AT ALL
   * ═════════════════════════════════════════════════════════════════════════
   * The drag writes this element's opacity by hand, for the same reason it
   * writes the sheet's transform by hand: React cannot keep up with a finger.
   * What it did NOT do was hand the opacity back at the end. `endDrag`
   * restored `pointer-events` and left the opacity wherever the gesture had
   * put it — and none of the drag path sets React state, so no re-render ever
   * came along to correct it.
   *
   * A backdrop left at opacity 0 with `pointer-events: auto` is a full-screen
   * invisible wall over the whole app. The canvas is plainly visible through
   * it and every touch is swallowed, until the page is reloaded. That is
   * "when I select a section it blocks": tapping a row starts a gesture on
   * the sheet, the row is replaced by that section's settings, and the
   * backdrop is left in that state.
   *
   * Measured on the real editor by scripts/check-editor-scroll.mjs:
   * `div.fixed.inset-0.bg-black/30 opacity=0 pointer-events=auto`, still
   * there three seconds later.
   *
   * So the two are written from one place, from one answer, and cannot
   * disagree again.
   */
  const settleOverlay = (nowOpen: boolean) => {
    const overlay = overlayRef.current
    if (!overlay) return
    overlay.style.opacity = nowOpen ? "1" : "0"
    overlay.style.pointerEvents = nowOpen ? "auto" : "none"
  }

  const setTransition = (on: boolean, ms: number = SNAP_DURATION_MS, easing: string = SNAP_EASING) => {
    const sheet = sheetRef.current
    const overlay = overlayRef.current
    const value = on ? `transform ${ms}ms ${easing}` : "none"
    const overlayValue = on ? `opacity ${fadeMs(ms)}ms ${FADE_EASING}` : "none"
    if (sheet) sheet.style.transition = value
    if (overlay) overlay.style.transition = overlayValue
  }

  /**
   * The sheet's own fade, for `fadeOnMove`: after setTransition, which it adds
   * to. In over the first part of the rise so the panel is solid well before
   * it lands; out over the whole fall, on an ease in, so it is still there
   * while it leaves.
   */
  const fadeSheet = (nowOpen: boolean, ms: number) => {
    const sheet = sheetRef.current
    if (!fadeOnMove || !sheet) return
    const fade = nowOpen ? `opacity ${Math.round(ms * 0.6)}ms ease-out` : `opacity ${ms}ms cubic-bezier(0.4, 0, 1, 1)`
    const moving = sheet.style.transition
    sheet.style.transition = moving && moving !== "none" ? `${moving}, ${fade}` : fade
    sheet.style.opacity = nowOpen ? "1" : "0"
  }

  /**
   * A sheet with no peek is entirely off screen when closed, and a thing that
   * is off screen should not be painted, nor cast its shadow up onto the
   * bottom edge. Hidden once the close has landed, shown the instant it is
   * asked to open again, so the open animation is never skipped.
   */
  const hideTimer = React.useRef(0)
  const settleVisibility = (isOpen: boolean, afterMs: number = SNAP_DURATION_MS) => {
    if (peekHeight > 0) return
    const sheet = sheetRef.current
    if (!sheet) return
    window.clearTimeout(hideTimer.current)
    if (isOpen) {
      sheet.style.visibility = "visible"
      return
    }
    hideTimer.current = window.setTimeout(() => {
      // A drag that closed the sheet has not told the page yet (see
      // `beginSettle`), so what the settle is heading for is the answer.
      const staysOpen = settle.current.active ? settle.current.nowOpen : openRef.current
      if (!staysOpen && !drag.current.active && sheetRef.current) {
        sheetRef.current.style.visibility = "hidden"
      }
    }, afterMs + 20)
  }
  React.useEffect(() => () => window.clearTimeout(hideTimer.current), [])

  /** Short, and on the house curve, for somebody who asked for less motion. */
  const motionMs = (ms: number) => (prefersReducedMotion() ? Math.min(ms, REDUCED_MOTION_MS) : ms)

  /**
   * A MOVE THE PAGE ASKED FOR HAS LANDED (onMoved): the sheet's own
   * `transitionend` for its move, with a timer behind it for a move that
   * never runs (a tab in the background). A newer move takes the place of an
   * older one's word.
   */
  const landing = React.useRef<null | (() => void)>(null)
  const landed = (nowOpen: boolean, ms: number) => {
    landing.current?.()
    landing.current = null
    if (!onMovedRef.current) return
    const sheet = sheetRef.current
    let told = false
    const tell = () => {
      if (told) return
      told = true
      stop()
      onMovedRef.current?.(nowOpen)
    }
    const onEnd = (e: TransitionEvent) => {
      if (e.target === sheet && e.propertyName === "transform") tell()
    }
    const timer = window.setTimeout(tell, ms + 60)
    const stop = () => {
      sheet?.removeEventListener("transitionend", onEnd)
      window.clearTimeout(timer)
      if (landing.current === stop) landing.current = null
    }
    sheet?.addEventListener("transitionend", onEnd)
    landing.current = stop
  }
  React.useEffect(() => () => landing.current?.(), [])

  /**
   * ═══════════════════════════════════════════════════════════════════════════
   *  THE PAGE HEARS ABOUT A RELEASE WHEN THE SHEET HAS ARRIVED
   * ═══════════════════════════════════════════════════════════════════════════
   * A release used to do three things in the handler that started the snap:
   * store the stop it was heading for (a render of the sheet), tell the page
   * whether it was now open (a render of the page, which for the Sections
   * sheet is the whole nine-thousand-line editor), and write the room under
   * the content (a layout). React flushes an update made inside a touch
   * handler before the browser gets to paint, so all of that ran between the
   * finger lifting and the first frame of the snap. On a slow phone that is
   * the hitch at the exact moment the sheet should be carrying on at the
   * finger's speed.
   *
   * None of it changes what is on screen. The transform and the backdrop are
   * written by hand and the compositor runs the move by itself, so the rest
   * waits until the move has finished: `transitionend` for the sheet's own
   * transform, with a timer behind it, because a transition that does not
   * run (a release exactly on a stop, a tab in the background) never ends.
   *
   * Until then, `settle` is what the sheet is doing, and the render and the
   * effects below read it instead of props that have not caught up yet.
   */
  const settle = React.useRef({
    active: false,
    targetY: 0,
    index: 0,
    nowOpen: false,
    /** What the page said when the release began; a different answer since is the page's own. */
    openAtStart: false,
    stop: null as null | (() => void),
  })
  /** Bumped when a settle finishes, so the sync below runs with what the page decided. */
  const [settleTick, setSettleTick] = React.useState(0)

  const finishSettle = (tellPage = true) => {
    const s = settle.current
    if (!s.active) return
    s.stop?.()
    s.stop = null
    s.active = false
    const { index, nowOpen, targetY } = s
    /* Arrived, so the room under the content is the room it will keep. */
    layoutHiddenRoom(targetY)
    if (!tellPage) return
    /* Where it came to rest, so the next render draws it there. */
    setRestIndex(nowOpen ? index : null)
    if (nowOpen !== openRef.current) onOpenChangeRef.current(nowOpen)
    onMovedRef.current?.(nowOpen)
    setSettleTick((n) => n + 1)
  }

  const beginSettle = (targetY: number, index: number, nowOpen: boolean, ms: number, openAtStart = openRef.current) => {
    settle.current.stop?.()
    const sheet = sheetRef.current
    const onEnd = (e: TransitionEvent) => {
      if (e.target === sheet && e.propertyName === "transform") finishSettle()
    }
    sheet?.addEventListener("transitionend", onEnd)
    const timer = window.setTimeout(() => finishSettle(), ms + 60)
    settle.current = {
      active: true,
      targetY,
      index,
      nowOpen,
      openAtStart,
      stop: () => {
        sheet?.removeEventListener("transitionend", onEnd)
        window.clearTimeout(timer)
      },
    }
  }
  React.useEffect(() => () => settle.current.stop?.(), [])

  /**
   * A LIST LET GO WHILE THE SHEET WAS FEEDING IT KEEPS GOING.
   *
   * When a hand-off turns back and the finger carries on into the list, the
   * list is scrolled by hand (the browser was told the gesture is the
   * sheet's), so on release nothing gives it the glide a native scroll would
   * have. This does, with the same deceleration: see `coastDistance`.
   */
  const coastFrame = React.useRef(0)
  const stopCoast = () => {
    if (coastFrame.current) cancelAnimationFrame(coastFrame.current)
    coastFrame.current = 0
  }
  const coast = (el: HTMLElement, speed: number) => {
    stopCoast()
    if (Math.abs(speed) < COAST_STOP_SPEED) return
    const from = el.scrollTop
    const max = el.scrollHeight - el.clientHeight
    const t0 = performance.now()
    const tick = (now: number) => {
      const ms = Math.max(0, now - t0)
      const want = from + coastDistance(speed, ms)
      el.scrollTop = want
      const done = Math.abs(coastVelocity(speed, ms)) < COAST_STOP_SPEED || want <= 0 || want >= max
      coastFrame.current = done ? 0 : requestAnimationFrame(tick)
    }
    coastFrame.current = requestAnimationFrame(tick)
  }
  React.useEffect(() => () => stopCoast(), [])

  /**
   * ===========================================================================
   *  THE PAGE BEHIND A SHEET DOES NOT SCROLL
   * ===========================================================================
   * The scrim catches a TAP, and that is all it ever caught: a drag that
   * started on it, or a drag inside the sheet that reached the end of its own
   * scroller, went through to the document and scrolled the page underneath.
   * So a sheet could be open over a storefront that was quietly moving behind
   * it, and letting go left the sheet pointing at something else.
   *
   * `overflow: hidden` on both elements, because which one scrolls differs by
   * platform, and the scroll position is put back on the way out — locking a
   * document by hiding its overflow throws its scroll away on iOS otherwise,
   * and closing the sheet would jump the page to the top.
   *
   * Only a sheet with NO PEEK locks. A peeking sheet is a permanent part of
   * the builder's chrome, not something opened over a page, and the page
   * behind that one is meant to scroll.
   */
  React.useEffect(() => {
    if (!open || peekHeight > 0 || typeof document === "undefined") return
    const root = document.documentElement
    const body = document.body
    const y = window.scrollY
    const prev = {
      rootOverflow: root.style.overflow,
      bodyOverflow: body.style.overflow,
      bodyTouch: body.style.touchAction,
    }
    if (holdPage === "overflow") {
      root.style.overflow = "hidden"
      body.style.overflow = "hidden"
      body.style.touchAction = "none"
    }
    /**
     * `overflow: hidden` stops a finger scrolling the page. It does not stop
     * the browser: focusing a field near the bottom of a fixed sheet with a
     * keyboard coming up, iOS scrolls the DOCUMENT to show it, and the whole
     * layer the sheet is fixed to goes up with it, header and all, under the
     * status bar. The sheet has already made room for the keyboard itself,
     * so the document is put back the frame it moves. What iOS does to the
     * visual viewport instead of the document is `visibleTop`, which the
     * sheet's height follows.
     */
    let frame = 0
    const hold = () => {
      frame = 0
      if (window.scrollY !== y) window.scrollTo(0, y)
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(hold)
    }
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      window.removeEventListener("scroll", onScroll)
      if (frame) cancelAnimationFrame(frame)
      if (holdPage === "overflow") {
        root.style.overflow = prev.rootOverflow
        body.style.overflow = prev.bodyOverflow
        body.style.touchAction = prev.bodyTouch
      }
      if (window.scrollY !== y) window.scrollTo(0, y)
    }
  }, [open, peekHeight, holdPage])

  /**
   * THE ROOM, IN THE FOCUS ITSELF (keyboardRoom). Where the platform reports
   * nothing, the sheet makes the keyboard's room the moment a field in it
   * takes the focus, drawn before the focus returns, so the field is already
   * above the keys when iOS looks for it and there is nothing to pan for.
   * Only with a keyboardRoom, and only while it has a number.
   */
  React.useEffect(() => {
    if (!open || !keyboardRoom) return
    const onFocusIn = (e: FocusEvent) => {
      const t = e.target as HTMLElement | null
      if (!t || !sheetRef.current?.contains(t)) return
      const types = t.isContentEditable || t.tagName === "TEXTAREA" || (t.tagName === "INPUT" && /^(text|search|url|tel|email|password|number)$/.test(((t as HTMLInputElement).type || "text").toLowerCase()))
      if (!types) return
      const room = keyboardRoomRef.current?.()
      if (!room) return
      flushSync(() => {
        setKeyboardInset((k) => (k > 0 ? k : room))
        setKeyboardHere(true)
      })
    }
    /* The focus gone from the sheet: measured again (keyboardRoom answers null then, so the room goes with the keyboard). */
    const onFocusOut = () => requestAnimationFrame(() => window.visualViewport?.dispatchEvent(new Event("resize")))
    document.addEventListener("focusin", onFocusIn, true)
    document.addEventListener("focusout", onFocusOut, true)
    return () => {
      document.removeEventListener("focusin", onFocusIn, true)
      document.removeEventListener("focusout", onFocusOut, true)
    }
  }, [open, keyboardRoom])

  /**
   * The starting visibility, set ONCE. It used to be an inline style on the
   * element — `visibility: hidden` whenever `open` was false — which meant
   * React wrote "hidden" in the same commit that asked the sheet to slide
   * down: every raised sheet (the menu, Publish, the AI) vanished on the spot
   * instead of closing. settleVisibility hides it after the snap has landed.
   */
  React.useEffect(() => {
    const sheet = sheetRef.current
    if (!sheet) return
    sheet.style.visibility = peekHeight === 0 && !openRef.current && !primedWaiting.current ? "hidden" : "visible"
    if (fadeOnMove) sheet.style.opacity = openRef.current ? "1" : "0"
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted])

  /**
   * ═══════════════════════════════════════════════════════════════════════
   *  THE FIRST OPEN IS A MOVE TOO
   * ═══════════════════════════════════════════════════════════════════════
   * A sheet the page mounts at the moment it is opened (Ask Storelib, the
   * first time its button is pressed) was drawn straight at its stop: the
   * position it renders at IS the open one, so there was nothing for a
   * transition to run from, and the conversation appeared in one frame with
   * the backdrop already dark. Every later open slid, which made the first
   * one feel broken.
   *
   * So its first frame is drawn closed, with the backdrop clear, read back
   * so the browser has that as its starting point, and the move starts on
   * the next frame: the one after the content inside has been built, so the
   * slide does not share its first frame with that work. Transform and
   * opacity only. A sheet that mounts closed, or has a peek, is already
   * where it should start.
   */
  const entered = React.useRef(false)
  const enterFrame = React.useRef(0)
  React.useLayoutEffect(() => {
    if (!mounted || entered.current || viewport <= 0) return
    entered.current = true
    if (peekHeight > 0 || !open || prefersReducedMotion()) return
    const sheet = sheetRef.current
    const overlay = overlayRef.current
    if (!sheet) return
    sheet.style.transition = "none"
    sheet.style.transform = `translateY(${closedY}px)`
    if (fadeOnMove) sheet.style.opacity = "0"
    if (overlay) {
      overlay.style.transition = "none"
      overlay.style.opacity = "0"
    }
    drag.current.currentY = closedY
    /* One read, so the closed position is the style the move starts from. */
    void sheet.getBoundingClientRect()
    enterFrame.current = requestAnimationFrame(() => {
      enterFrame.current = 0
      if (drag.current.active || !openRef.current) return
      const target = restYRef.current
      if (drag.current.currentY === target) return
      const ms = motionMs(moveMs)
      setTransition(true, ms)
      drag.current.currentY = target
      motionUntil.current = performance.now() + ms
      settleVisibility(true, ms)
      applyTransformNow(target)
      settleOverlay(true)
      fadeSheet(true, ms)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, viewport])
  React.useEffect(() => () => cancelAnimationFrame(enterFrame.current), [])

  /**
   * Sync whenever `open` changes from outside — a tab, a menu, the overlay.
   *
   * `settledY`, not `openY`. The two differ the moment the sheet has been
   * dragged, and this effect re-runs on far more than an open: the offsets
   * are rebuilt whenever the window is, which on a phone means EVERY TIME A
   * KEYBOARD APPEARS. Reading `openY` there is what moved a sheet somebody
   * had pulled to full back down to half the instant they tapped a field —
   * "when I select something in an input the sheet becomes mid, randomly,
   * with no reason". It had a reason.
   *
   * The early return is for the frame after a drag lands: `endDrag` has
   * already animated the sheet to exactly this offset on its own duration,
   * and re-applying it here would overwrite that with the default one.
   *
   * While a release is settling the page has not been told yet, so `open`
   * and `settledY` still describe where the sheet WAS; moving to them would
   * drag it back mid-flight. The settle bumps `settleTick` when it finishes
   * and this runs again with the page's answer, which is also how a page that
   * refuses to let the sheet close gets it back. The one thing that cuts a
   * settle short is the page changing `open` by itself in the meantime: a
   * tab or a button outranks a sheet that is still coasting.
   */
  React.useEffect(() => {
    if (drag.current.active) return
    if (primedWaiting.current) {
      const sheet = sheetRef.current
      /* Primed and waiting: it stays drawn at its stop, unseen, until the page opens it. */
      if (!open || !sheet) {
        drag.current.currentY = settledY
        return
      }
      /*
        THE FIRST OPEN OF A PRIMED SHEET: put below the screen and made solid in
        one go (unseen: it is off the screen), read back so that is where the
        move starts, then the open below as for any sheet.
      */
      primedWaiting.current = false
      sheet.style.transition = "none"
      sheet.style.transform = `translateY(${closedY}px)`
      sheet.style.opacity = ""
      sheet.style.pointerEvents = ""
      drag.current.currentY = closedY
      void sheet.getBoundingClientRect()
    }
    if (settle.current.active) {
      if (open === settle.current.openAtStart) return
      finishSettle(false)
    }
    const target = open ? settledY : closedY
    if (drag.current.currentY === target) return
    stopResizeMove()
    const ms = motionMs(moveMs)
    setTransition(true, ms)
    drag.current.currentY = target
    motionUntil.current = performance.now() + ms
    settleVisibility(open, ms)
    applyTransformNow(target)
    settleOverlay(open)
    fadeSheet(open, ms)
    landed(open, ms)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, settledY, closedY, settleTick])

  /*
    The sheet also comes to rest without a finger — opening, closing, the
    keyboard arriving, a stop being re-measured on rotate — and none of those
    go through the snap. This is the other half of `layoutHiddenRoom`: while a
    finger is down it stays out of the way, and the moment there is none the
    room under the content is brought up to date, once the move above has
    finished (see `scheduleRoom`). After that effect, so the move it may just
    have started is the one this waits for.

    IT LIVES UP HERE, ABOVE `if (!mounted) return null`, and that is not
    tidiness. Put below it, this hook runs on every render after the first and
    on none before, which is a different number of hooks between two renders —
    React error #310, the whole sheet gone, and it is invisible in a diff. The
    probe caught it as a sheet that never mounted.
  */
  React.useEffect(() => {
    if (drag.current.active || settle.current.active) return
    scheduleRoom(open ? settledY : closedY)
  }, [open, settledY, closedY, scheduleRoom])

  /* The resize move described above `lastHeight`. Before paint, so the frame
     with the new height is also the frame with the compensating translate. */
  React.useLayoutEffect(() => {
    const sheet = sheetRef.current
    const prev = lastHeight.current
    lastHeight.current = height
    // No real previous height is a first layout, not a resize.
    if (!sheet || prev === null || prev <= 0 || prev === height) return
    if (drag.current.active || settle.current.active || !openRef.current) return
    /*
      ROUND 25: A SECOND RESIZE WHILE THE FIRST STILL MOVES picks up from where
      the first has got to. It was refused (the first one's own time counted as
      "a move running") and the height simply jumped, or, once allowed, it
      started again from the resting place: either way the sheet's top edge
      leapt by the difference, whenever a keyboard was reported in more than
      one step (the keys, the bar above them, a pan). Now the top edge is held
      exactly where it is drawn and carried on from there.
    */
    const resizing = !!resizeMove.current && resizeMove.current.playState === "running"
    if ((performance.now() < motionUntil.current && !resizing) || typeof sheet.animate !== "function") return
    const y = drag.current.currentY
    const drawn = resizing ? paintedY(sheet) : null
    const from = (drawn ?? y) + height - prev
    const ms = motionMs(KEYBOARD_MS)
    stopResizeMove()
    resizeMove.current = sheet.animate(
      [{ transform: `translateY(${from}px)` }, { transform: `translateY(${y}px)` }],
      { duration: ms, easing: SNAP_EASING },
    )
    motionUntil.current = performance.now() + ms
  }, [height])

  /*
    THE SKIRT. Two things can leave a strip of screen under the sheet's bottom
    edge for a moment: the rubber band past the tallest stop lifts it, and a
    keyboard closing shrinks it a frame before the keyboard has gone. The
    sheet's own shadow list carries a solid copy of it, one sheet-height
    below, in its own background colour, so what shows in that strip is more
    sheet. It is read from the element because Publish paints its sheet a
    different colour from the rest.
  */
  React.useLayoutEffect(() => {
    const sheet = sheetRef.current
    if (!sheet) return
    sheet.style.setProperty("--wb-sheet-skirt", getComputedStyle(sheet).backgroundColor)
  }, [mounted, className])

  const startDrag = (
    clientY: number,
    clientX = 0,
    target: EventTarget | null = null,
    immediate = false,
    now: number = performance.now(),
  ) => {
    stopCoast()
    const sheet = sheetRef.current
    /**
     * ===================================================================
     *  A SHEET CAUGHT MID-MOVE STAYS UNDER THE FINGER
     * ===================================================================
     * Turning the transition off below, while a snap or an open is still
     * running, ends it on the spot: the sheet jumps to wherever it was
     * heading, out from under the finger that just landed on it. A native
     * sheet can be caught in flight, so this one reads where the move has
     * actually got to and holds it there. One style read, only while a move
     * is running.
     */
    let caught = false
    if (sheet && performance.now() < motionUntil.current) {
      const y = paintedY(sheet)
      if (y !== null) {
        caught = true
        drag.current.currentY = y
      }
    }
    motionUntil.current = 0
    stopResizeMove()
    /* The move a finger caught has not landed: the release will say where it does. */
    landing.current?.()
    /* A settle in progress is paused, not dropped: `endDrag` either replaces
       it with a new one or picks it back up. */
    settle.current.stop?.()
    settle.current.stop = null

    drag.current.startY = clientY
    drag.current.startX = clientX
    drag.current.downY = clientY
    drag.current.downX = clientX
    drag.current.downTime = now
    drag.current.travel = 0
    drag.current.onHandle = immediate
    drag.current.lastY = clientY
    drag.current.startTime = now
    drag.current.lastTime = now
    drag.current.samples = [{ y: clientY, t: now }]
    /**
     * The handle and the mouse are unambiguous — nothing else could be meant —
     * so they skip the arbitration. A touch anywhere else has to declare
     * itself first.
     */
    drag.current.intent = immediate ? "sheet" : "undecided"
    drag.current.chain = immediate ? [] : scrollersUnder(target, sheet)
    drag.current.scroller = drag.current.chain[0] ?? null
    drag.current.horizontal = false
    drag.current.carry = null
    drag.current.caught = caught
    drag.current.active = true
    /**
     * Measured from where the sheet ACTUALLY IS, not from whether it is
     * "open". With more than two stops those are different questions: a sheet
     * dragged to full is open, and so is one sitting at half.
     */
    drag.current.baseY = drag.current.currentY
    drag.current.rawY = drag.current.currentY
    setTransition(false)
    if (caught) applyTransformNow(drag.current.currentY)
    /* A sheet under a finger is solid, whatever fade it was in. */
    if (fadeOnMove && sheet) sheet.style.opacity = "1"
    settleVisibility(true)
    const overlay = overlayRef.current
    if (overlay) overlay.style.pointerEvents = "none"
  }

  const moveDrag = (
    clientY: number,
    clientX = drag.current.startX,
    now: number = performance.now(),
    cancelable = true,
  ) => {
    if (!drag.current.active) return

    const stepY = clientY - drag.current.lastY
    drag.current.travel = Math.max(
      drag.current.travel,
      Math.abs(clientY - drag.current.downY),
      Math.abs(clientX - drag.current.downX),
    )
    drag.current.samples.push({ y: clientY, t: now })
    // Enough for a 100ms window at any sane touch rate, and bounded so a long
    // drag does not grow an array for ever.
    if (drag.current.samples.length > 12) drag.current.samples.shift()

    const list = offsetsRef.current
    const top = list[0] ?? 0
    const cY = list[list.length - 1]

    /**
     * ONE DECISION PER GESTURE. Until it is made, nothing moves — which is
     * what stops a tap on a button inside the sheet nudging it a pixel.
     */
    if (drag.current.intent === "undecided") {
      const deltaX = clientX - drag.current.startX
      const deltaY = clientY - drag.current.startY
      drag.current.intent = dragIntent({
        deltaX,
        deltaY,
        scrollTop: chainScrollTop(drag.current.chain),
        hasScroller: !!drag.current.scroller,
      })
      drag.current.horizontal = Math.abs(deltaX) > Math.abs(deltaY) * HORIZONTAL_BIAS
      /**
       * The drag starts from where the finger is NOW, not from where it
       * touched down: the threshold has already been travelled, and counting
       * it would make the sheet jump six pixels the instant it takes over.
       */
      if (drag.current.intent === "sheet") {
        drag.current.startY = clientY
        drag.current.startX = clientX
      }
    } else if (
      drag.current.intent === "scroll" &&
      drag.current.scroller &&
      handOffToSheet({ scrollTop: chainScrollTop(drag.current.chain), stepY, horizontal: drag.current.horizontal })
    ) {
      /**
       * The list has run out going this way and the finger has not. From
       * here the sheet follows it, starting where the sheet is, so nothing
       * jumps. If the finger turns back up past this point the list takes it
       * again, by hand where the browser has let the sheet have the gesture;
       * where it has not, the browser is still scrolling the list itself.
       */
      drag.current.intent = "sheet"
      drag.current.startY = clientY
      drag.current.startX = clientX
      drag.current.baseY = drag.current.currentY
      drag.current.carry = { base: drag.current.currentY, byHand: cancelable }
    }
    drag.current.lastY = clientY
    drag.current.lastTime = now
    if (drag.current.intent !== "sheet") return

    const raw = drag.current.baseY + (clientY - drag.current.startY)
    drag.current.rawY = raw
    let nextY: number
    const carry = drag.current.carry
    if (carry && drag.current.scroller) {
      const { sheetY, scrollBy } = expandCarry(raw, carry.base)
      nextY = Math.min(sheetY, cY)
      /* The list was at its top when it handed over, so its top is where it resumes. */
      if (carry.byHand) drag.current.scroller.scrollTop = scrollBy
    } else {
      /* Resisting past the tallest stop, the same number the render reads. */
      nextY = dragPosition(raw, top, cY)
    }
    drag.current.currentY = nextY
    applyTransform(nextY)
  }

  /**
   * Picks up a move the finger interrupted and then turned out not to want:
   * a tap, or a scroll, on a sheet that was still on its way somewhere.
   */
  const resumeMove = () => {
    const s = settle.current
    const target = s.active ? s.targetY : restYRef.current
    const willBeOpen = s.active ? s.nowOpen : openRef.current
    const ms = motionMs(snapMotion(target - drag.current.currentY, 0).ms)
    setTransition(true, ms)
    drag.current.currentY = target
    applyTransformNow(target)
    motionUntil.current = performance.now() + ms
    settleVisibility(willBeOpen, ms)
    settleOverlay(willBeOpen)
    fadeSheet(willBeOpen, ms)
    if (s.active) beginSettle(s.targetY, s.index, s.nowOpen, ms, s.openAtStart)
    else scheduleRoom(target)
  }

  /**
   * Returns true when the gesture was a tap on the grab bar, which it has
   * answered. `cancelled` is a gesture that did not end with a finger
   * lifting: the system took the touch (touchcancel) or a second finger
   * made it a pinch. It is never a tap, and never a flick: the sheet goes
   * to the stop nearest where it was left.
   */
  const endDrag = (now: number = performance.now(), cancelled = false): boolean => {
    if (!drag.current.active) return false
    drag.current.active = false

    const wasDragging = drag.current.intent === "sheet"
    const tapped = drag.current.onHandle && isTap({ distance: drag.current.travel, ms: now - drag.current.downTime, cancelled })
    drag.current.onHandle = false
    const caught = drag.current.caught
    const carry = drag.current.carry
    const scroller = drag.current.scroller
    drag.current.intent = "undecided"
    drag.current.scroller = null
    drag.current.chain = []
    drag.current.carry = null
    drag.current.caught = false
    /**
     * A gesture the sheet never took over is the scroller's business, and
     * snapping on it would move the sheet somebody was only reading in.
     *
     * But `startDrag` has already made the sheet ready to be dragged — the
     * transition off, the overlay deaf — because at touchdown nobody yet knows
     * what the gesture is. Both have to be put back, or one scroll leaves an
     * overlay that no longer closes the sheet when tapped.
     */
    if (!wasDragging) {
      setTransition(true)
      settleOverlay(openRef.current)
      if (caught) resumeMove()
      else if (settle.current.active) finishSettle()
      return false
    }

    const list = offsetsRef.current
    const top = list[0] ?? 0
    /* Where the sheet is DRAWN, a rubber band included, so the snap starts
       from the pixel the finger left it on. */
    const current = drag.current.currentY
    /**
     * A TAP ON THE GRAB BAR steps the sheet: closed to half, half to full,
     * full to half (`tapTarget`). A tap that caught the sheet mid-move steps
     * on from where that move was going, not from the pixel it was stopped
     * on, so two quick taps from closed reach full.
     */
    const tapFrom = caught && settle.current.active ? settle.current.targetY : current
    /* From touchdown, not from where the sheet took over: see FLICK_MIN_DISTANCE. */
    const totalDelta = tapped ? 0 : drag.current.lastY - drag.current.downY
    const fingerVelocity = tapped || cancelled ? 0 : releaseVelocity(drag.current.samples, now)
    /**
     * Fed into a list: the sheet is sitting on its stop and the finger was
     * moving the list, so the list gets the speed and the sheet stays put.
     */
    const intoList = !!carry && carry.byHand && !!scroller && drag.current.rawY < carry.base
    if (intoList && scroller) coast(scroller, -fingerVelocity)
    const velocity = intoList ? 0 : fingerVelocity

    /**
     * Nearest stop, then one further if it was a flick.
     *
     * Nearest alone makes a fast short flick feel ignored — the finger has
     * barely moved, so the nearest stop is the one it started at. Carrying it
     * one further in the direction of the flick is what makes a sheet feel
     * like it has weight.
     */
    const index = tapped ? tapTarget(list, tapFrom) : snapTarget({ offsets: list, current, velocity, totalDelta })
    const targetY = list[index]
    /**
     * Pulled down off the tallest stop while typing: the keyboard goes with
     * it, the way a sheet's keyboard is dismissed by dragging on iOS. The
     * sheet stands at its tallest stop for as long as a field in it has the
     * keyboard, so a lower stop with the field still focused would only be
     * put back.
     */
    if (index > 0) {
      const active = document.activeElement as HTMLElement | null
      if (active && active !== document.body && sheetRef.current?.contains(active)) active.blur()
    }
    /**
     * Timed and curved so the sheet leaves at the speed it was moving: the
     * finger's, or a fraction of it past the tallest stop where the sheet was
     * only following at a rubber band's rate. See `snapMotion`.
     */
    const motion = snapMotion(targetY - current, sheetVelocityAt(drag.current.rawY, top, velocity))
    const reduce = prefersReducedMotion()
    /* A tap has no speed to carry on, so it moves the way a tab opening the
       sheet does: the house curve over the house duration. */
    const ms = reduce ? Math.min(motion.ms, REDUCED_MOTION_MS) : tapped ? SNAP_DURATION_MS : motion.ms
    setTransition(true, ms, reduce || tapped ? SNAP_EASING : curveCss(motion.curve))
    drag.current.currentY = targetY
    applyTransformNow(targetY)
    motionUntil.current = performance.now() + ms

    const nowOpen = index < list.length - 1
    settleVisibility(nowOpen, ms)
    settleOverlay(nowOpen)
    fadeSheet(nowOpen, ms)
    /* The rest of what a release means is told once the sheet has arrived. */
    beginSettle(targetY, index, nowOpen, ms)
    return tapped
  }

  /**
   * =========================================================================
   *  TOUCH, ON THE WHOLE SHEET
   * =========================================================================
   * These used to sit on the 28px grab bar alone. Everywhere else — the tabs,
   * the section list, the settings, the ninety-odd percent of the sheet a
   * thumb actually lands on — a drag did nothing at all. That is what "the
   * dragging is not accurate" is: not an imprecise drag, an absent one.
   *
   * Registered by hand rather than with onTouchMove because React attaches
   * touchmove PASSIVELY at the root, and a passive listener's
   * `preventDefault` is ignored with a console warning. Without it the browser
   * keeps its own overscroll — the rubber-band glow, pull-to-refresh — while
   * the sheet is being dragged, and the two fight over the same finger.
   */
  React.useEffect(() => {
    const sheet = sheetRef.current
    if (!sheet) return

    const noteTouch = (e: TouchEvent) => {
      const t = e.changedTouches[0] ?? e.touches[0]
      lastTouch.current = { at: performance.now(), x: t?.clientX ?? 0, y: t?.clientY ?? 0 }
    }

    /* The tap the ghost-click guard is watching for; see GHOST_CLICK_MS. */
    let press: { x: number; y: number; travel: number } | null = null
    let ghost: { until: number; x: number; y: number } | null = null

    const onStart = (e: TouchEvent) => {
      noteTouch(e)
      const first = e.touches[0]
      press = e.touches.length === 1 && first ? { x: first.clientX, y: first.clientY, travel: 0 } : null
      // A pinch is not a drag. Anything already in flight is abandoned rather
      // than left half-owned by a finger that has stopped reporting, and it
      // was not a tap on the grab bar, however quickly the second finger came.
      if (e.touches.length !== 1) {
        if (drag.current.active) endDrag(eventTime(e), true)
        return
      }
      /**
       * ===================================================================
       *  A CONTROL WITH ITS OWN DRAG KEEPS ITS FINGER
       * ===================================================================
       * The arbitration below decides between "scroll the form" and "move
       * the sheet", and those were the only two things a finger could mean.
       * They are not: the reorder list is dragged by the grip on each row,
       * and the cover is positioned by dragging the picture. Both live
       * INSIDE the scroller, so a downward drag with the scroller at the top
       * read as "pull the sheet down", and reordering a product or placing a
       * cover dismissed the editor instead.
       *
       * Neither threshold nor direction can separate them, because the
       * gestures are the same gesture. What separates them is what the
       * finger landed on, which is knowable at touchdown: a control that
       * owns its own drag says so, and the sheet does not arm at all. The
       * drag never starts, so `moveDrag` returns immediately and nothing
       * about the sheet moves for the length of the gesture.
       */
      if (ownsItsTouch(e.target, sheet, handleRef.current)) return
      const touch = e.touches[0]
      const onHandle = !!handleRef.current?.contains(e.target as Node)
      startDrag(touch.clientY, touch.clientX, e.target, onHandle, eventTime(e))
    }

    const onMove = (e: TouchEvent) => {
      const moved = e.touches[0]
      if (press && moved) press.travel = Math.max(press.travel, Math.hypot(moved.clientX - press.x, moved.clientY - press.y))
      if (!drag.current.active || e.touches.length !== 1) return
      const touch = e.touches[0]
      /* Timed by when the finger was there, not when this ran; see eventTime. */
      moveDrag(touch.clientY, touch.clientX, eventTime(e), e.cancelable)
      /**
       * Only once the sheet owns the gesture. Calling this on an undecided or
       * scrolling touch would kill scrolling inside the sheet entirely, which
       * is the other half of what was asked for.
       */
      if (drag.current.intent === "sheet" && e.cancelable) e.preventDefault()
    }

    const onEnd = (e: TouchEvent) => {
      noteTouch(e)
      /* A tap that began on the sheet: its click may only land on the sheet. */
      const lifted = e.changedTouches[0]
      if (press && e.type === "touchend" && press.travel < 10 && lifted) {
        ghost = { until: performance.now() + GHOST_CLICK_MS, x: lifted.clientX, y: lifted.clientY }
      }
      press = null
      if (!drag.current.active) return
      /**
       * A tap on the grab bar has been answered, so the mouse events a
       * browser makes up after a tap are cancelled: the bar's own mousedown
       * would otherwise catch the sheet a few milliseconds into the step it
       * just started and snap it back to the nearest stop.
       */
      if (endDrag(eventTime(e), e.type === "touchcancel") && e.cancelable) e.preventDefault()
    }

    sheet.addEventListener("touchstart", onStart, { passive: true })
    sheet.addEventListener("touchmove", onMove, { passive: false })
    /**
     * ═════════════════════════════════════════════════════════════════════
     *  THE END OF A GESTURE IS THE WINDOW'S BUSINESS, NOT THE SHEET'S
     * ═════════════════════════════════════════════════════════════════════
     * These two were on the sheet. A touch event is delivered to the element
     * the touch STARTED on, so if React has replaced that element in the
     * meantime the `touchend` has nowhere to go: it never reaches the sheet,
     * `endDrag` never runs, and `drag.current.active` stays true forever.
     *
     * Which is exactly what tapping a section row does. The row is replaced
     * by that section's settings, the finger comes up on an element that is
     * no longer in the document, and the sheet is left mid-drag. A sheet that
     * thinks it is being dragged renders its backdrop at the drag's opacity —
     * zero — while React keeps writing `pointer-events: auto` on it. The
     * result is a full-screen INVISIBLE layer over the whole app: the canvas
     * is plainly visible through it and every touch is swallowed, until the
     * page is reloaded.
     *
     * "When I select a section it blocks." Measured on the real editor by
     * scripts/check-editor-scroll.mjs: `div.fixed.inset-0.bg-black/30
     * opacity=0 pointer-events=auto`, still there three seconds later.
     *
     * The mouse path already knew this — see the window listeners below,
     * added so a mouseup outside the handle still ends a drag. Touch simply
     * never got the same treatment.
     */
    window.addEventListener("touchend", onEnd)
    window.addEventListener("touchcancel", onEnd)

    /*
      THE GUARD ITSELF. Capture on the window, so it is ahead of the canvas's
      own capture handlers and React's. Only near the finger, only for a
      moment, and only off the sheet: the click the tap was for, on the
      sheet, goes through and ends the watch.
    */
    const onGhost = (e: MouseEvent) => {
      const g = ghost
      if (!g) return
      if (performance.now() > g.until) {
        ghost = null
        return
      }
      const target = e.target instanceof Node ? e.target : null
      if (target && sheet.contains(target)) {
        if (e.type === "click") ghost = null
        return
      }
      if (Math.hypot(e.clientX - g.x, e.clientY - g.y) > GHOST_CLICK_PX) return
      e.preventDefault()
      e.stopPropagation()
      if (e.type === "click") ghost = null
    }
    /* A new finger somewhere else is a new tap, not the old one's click. */
    const onAnyTouch = (e: TouchEvent) => {
      if (!(e.target instanceof Node) || !sheet.contains(e.target)) ghost = null
    }
    window.addEventListener("mousedown", onGhost, true)
    window.addEventListener("mouseup", onGhost, true)
    window.addEventListener("click", onGhost, true)
    window.addEventListener("touchstart", onAnyTouch, { capture: true, passive: true })
    return () => {
      sheet.removeEventListener("touchstart", onStart)
      sheet.removeEventListener("touchmove", onMove)
      window.removeEventListener("touchend", onEnd)
      window.removeEventListener("touchcancel", onEnd)
      window.removeEventListener("mousedown", onGhost, true)
      window.removeEventListener("mouseup", onGhost, true)
      window.removeEventListener("click", onGhost, true)
      window.removeEventListener("touchstart", onAnyTouch, true)
    }
    // `mounted` is the dependency that matters: the sheet is not in the DOM
    // until it is true, so an effect that ran once on the server-safe first
    // render would attach to nothing and never try again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted])

  // Global mouse listeners, so a mouseup outside the handle still ends a drag.
  React.useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (drag.current.active) moveDrag(e.clientY, drag.current.startX, eventTime(e))
    }
    const onUp = (e: MouseEvent) => {
      if (drag.current.active) endDrag(eventTime(e))
    }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
    return () => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
    }
  }, [])

  if (!mounted) return null

  /**
   * =========================================================================
   *  PORTALLED, OR THE LAYER IS A LIE
   * =========================================================================
   * `z-index` is only comparable inside one stacking context. The publish
   * sheet is rendered next to the button that opens it, which is inside a
   * `relative z-50` header — so its z-[80] was being compared against the
   * header's other children, and the whole header, at z-50, still lost to the
   * persistent peek sheet at the same z-50 later in the tree.
   *
   * No amount of raising the number fixes that from inside. The sheet has to
   * leave, so it is rendered into `document.body`, where the layers it
   * declares are the layers it gets.
   */
  /**
   * ===========================================================================
   *  WHILE A FINGER IS ON IT, THE FINGER IS THE TRUTH
   * ===========================================================================
   * The drag writes `transform` straight to the element, once per frame, and
   * turns the transition off while it does. React was writing the same two
   * properties from state on every render — so ANY re-render landing in the
   * middle of a drag put the sheet back where state believed it was and
   * switched the 360ms transition back on, which is a sheet that jumps out
   * from under the finger and then eases after it.
   *
   * And re-renders land there constantly on a phone: iOS fires
   * `visualViewport.scroll` while a sheet is being dragged, the content-fit
   * measurement can resolve at any moment, the browser's chrome gap is
   * re-probed on resize. None of those have anything to do with the gesture.
   *
   * So the rendered values MIRROR the drag rather than competing with it.
   * Mid-gesture React writes exactly what the imperative path already wrote,
   * which is a no-op; at rest it writes the state's position with the
   * transition back on, which is how a sheet opens and closes.
   *
   * A release that is still settling counts as held, for the same reason:
   * the page has not been told where the sheet went, so the state it renders
   * from still describes where it was.
   */
  const dragging = drag.current.active
  const held = dragging || settle.current.active
  const renderOpen = settle.current.active ? settle.current.nowOpen : open
  const closedOffset = offsets[offsets.length - 1] ?? 0
  /* Primed and not yet opened: drawn at its stop, unseen (see `primed`); the open effect takes it from there. */
  const waiting = primedWaiting.current
  const renderY = waiting ? settledY : held ? drag.current.currentY : open ? settledY : closedY

  const renderOpacity = dragging
    ? closedOffset > 0
      ? Math.max(0, Math.min(1, 1 - renderY / closedOffset))
      : 0
    : renderOpen
      ? 1
      : 0
  /**
   * =========================================================================
   *  THE KEYBOARD CLOSING IS A MOVE, SO IT MOVES
   * =========================================================================
   * The sheet grows by the keyboard's height and shrinks back when it goes.
   * Only `transform` was in the transition, so the shrink happened in one
   * frame: the whole container snapped down the instant the keyboard began
   * its own 250ms slide, and for a quarter of a second there was a sheet
   * sitting above a keyboard that was still there.
   *
   * It then moved by transitioning `height` and `padding-bottom`, which is a
   * layout of the sheet and its contents on every frame of the keyboard.
   * It still moves, over KEYBOARD_MS to keep time with the keyboard, but as
   * a transform: see the resize move above `lastHeight`. The only property
   * this transitions is the one the compositor can run on its own.
   */
  const motion = dragging
    ? "none"
    : `transform ${moveMs}ms ${SNAP_EASING}${fadeOnMove ? `, opacity ${fadeMs(moveMs)}ms ${FADE_EASING}` : ""}`
  const fade = dragging ? "none" : `opacity ${fadeMs(moveMs)}ms ${FADE_EASING}`

  return createPortal(
    <>
      <div
        ref={overlayRef}
        data-wb-sheet-overlay=""
        aria-hidden="true"
        onClick={() => onOpenChange(false)}
        className="fixed inset-0 bg-black/30"
        style={{
          zIndex: zIndex !== undefined ? zIndex - 1 : layer === "raised" ? 70 : 40,
          opacity: renderOpacity,
          /**
           * WHAT YOU CAN SEE IS WHAT CAN TAKE THE TOUCH.
           *
           * This said `open ? "auto" : "none"`, which sounds right and is
           * not: the sheet can be open while this is drawn at zero opacity —
           * during a drag, and forever if a drag is left unfinished. An
           * invisible full-screen layer with `pointer-events: auto` is the
           * worst thing on a screen, because nothing looks wrong at all.
           *
           * Tied to the opacity, that state cannot exist. A backdrop you can
           * see closes the sheet when tapped, as before; one you cannot see
           * is not there at all.
           */
          pointerEvents: renderOpen && renderOpacity > 0.01 ? "auto" : "none",
          transition: fade,
          // Its own layer, so fading it is a compositor job and not a repaint
          // of everything under it on every frame.
          willChange: "opacity",
        }}
      />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal={open}
        aria-label={label}
        /**
         * CapacitorBounceGuard cancels touchmove at a scroller's boundary to
         * stop WKWebView rubber-banding, and it opts out of anything carrying
         * this. Without it the guard and this sheet's own drag fight over the
         * same finger — the guard wins, because it listens on the document.
         */
        data-mobile-bottom-sheet=""
        className={cn(
          "fixed left-0 right-0 bottom-0 flex flex-col overflow-hidden rounded-t-[20px] bg-background",
          className,
        )}
        style={{
          /**
           * Inline, not a class. A utility class can be merged away by
           * `cn`, or tie with another class of the same specificity and lose
           * on source order — neither of which is visible from here. A number
           * on the element is the one thing that cannot be quietly overridden.
           */
          zIndex: zIndex ?? (layer === "raised" ? 80 : 50),
          height: `${height}px`,
          transform: `translateY(${renderY}px)`,
          transition: motion,
          willChange: "transform",
          /**
           * The soft shadow the sheet always had, and under it the skirt
           * (see `--wb-sheet-skirt` above): a solid copy of the sheet one
           * sheet-height down, so a strip opened under it by a rubber band
           * or a closing keyboard is more sheet and not the canvas. Inline
           * so it lives with the height it depends on.
           */
          boxShadow: `0 -12px 40px -12px rgba(17,24,39,0.22), 0 ${height}px 0 0 var(--wb-sheet-skirt, transparent)`,
          /**
           * Painted on its own, so moving it never repaints the canvas under
           * it, and nothing under it is repainted when its contents change.
           * `paint` only: `layout` containment would also pull any
           * `position: fixed` inside it out of the viewport, and menus that
           * open from the sheet are fixed.
           */
          contain: "paint",
          /**
           * `clip`, over the class's `hidden`, where the browser has it. Both
           * cut the content at the sheet's edge, but `hidden` is still a
           * scroll container a script can scroll: a focused field or a
           * `scrollIntoView` inside slid the whole sheet's content sideways
           * or up inside its own box, with nothing a finger could do to put it
           * back. `clip` is not a scroll container, so there is nothing to
           * scroll. A browser without it drops the value and keeps `hidden`.
           */
          overflow: "clip",
          /**
           * Whatever is actually under the sheet, and only once.
           *
           * With a keyboard up, that is the keyboard. It is drawn over the
           * home indicator and over the browser's bar, so reserving those as
           * well lifted Cancel and Save off the keyboard by a band of empty
           * sheet. See lib/website-builder/sheet-reserve.ts.
           */
          paddingBottom: composerKeys ? sheetBottomReserve(chromeGap, 0) : sheetBottomReserve(chromeGap, keyboardInset, visibleTop > 0),
          /* A composer sheet's keyboard, for the content to move by (see `keyboard` in Props). */
          ...(composerKeys
            ? ({ "--sheet-keys": `${composerLift}px`, "--sheet-pan": `${composerPan}px` } as React.CSSProperties)
            : null),
          /**
           * `pan-y`, not `none`. `none` would hand every touch to us and kill
           * native scrolling inside the sheet — smooth, momentum-carrying,
           * compositor-driven scrolling that no JS reimplementation matches.
           * The arbitration only takes the gestures that are the sheet's.
           * The grab bar is the exception, below.
           */
          touchAction: "pan-y",
          /* Primed and waiting: painted, never seen or touched (see `primed`). */
          ...(primed ? { opacity: waiting ? PRIMED_OPACITY : undefined, pointerEvents: waiting ? ("none" as const) : undefined } : null),
        }}
      >
        {/* THE GRAB BAR PANS NOTHING. A touch here is a drag and nothing
            else, so the browser is told not to start a pan of its own from
            it. With `pan-y` inherited, Android's Chrome could begin one
            before the first move reached the sheet, and from then on every
            move arrives uncancellable and the page underneath gets to
            rubber-band while the sheet is dragged. */}
        <div
          ref={handleRef}
          className="flex shrink-0 cursor-grab touch-none select-none justify-center bg-inherit pb-1.5 pt-2.5 active:cursor-grabbing"
          onMouseDown={(e) => {
            /* The primary button only: a right press is a context menu, and
               its mouseup would otherwise land as a tap that steps the sheet. */
            if (e.button !== 0) return
            /* The mouse events a browser makes up after a touch are that
               touch, which the touch listeners have already handled. A real
               mouse is never refused: see isCompatibilityMouse. */
            const last = lastTouch.current
            const source = (e.nativeEvent as MouseEvent & { sourceCapabilities?: { firesTouchEvents?: boolean } | null }).sourceCapabilities
            if (
              isCompatibilityMouse({
                firesTouchEvents: source?.firesTouchEvents,
                msSinceTouch: performance.now() - last.at,
                distanceFromTouch: Math.hypot(e.clientX - last.x, e.clientY - last.y),
              })
            ) return
            e.preventDefault()
            // A mouse is unambiguous — there is no scroll gesture to confuse
            // it with — so it drags immediately, as it always did.
            startDrag(e.clientY, e.clientX, e.target, true, eventTime(e))
          }}
        >
          <div className="h-1 w-10 rounded-full bg-muted-foreground/30" />
        </div>
        {/* Not flex-1: a flex item that sizes to its content is what makes
            the measurement the content's own height and not the space the
            sheet happened to give it. min-h-0 lets it shrink under the cap,
            and the scrollable region inside takes the rest. */}
        <SheetExpandContext.Provider value={expandApi}>
          <SheetStopContext.Provider value={stopApi}>
            {fit ? (
              <div ref={contentRef} className="flex min-h-0 flex-col">
                {children}
              </div>
            ) : (
              children
            )}
          </SheetStopContext.Provider>
        </SheetExpandContext.Provider>
      </div>
    </>,
    document.body,
  )
}
