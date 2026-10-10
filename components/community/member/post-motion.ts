/**
 * ===========================================================================
 *  AN OPENED POST ON A PHONE: THE RULES OF ITS MOVES (rounds 15 and 16)
 * ===========================================================================
 * The numbers and decisions of post-fullscreen.tsx, as plain functions with
 * no DOM and no React, so tests/communities-post15.test.ts and
 * tests/communities-post16.test.ts hold them as they are written.
 *
 * THE MODEL IS iOS's PAGE SHEET (round 16, page-sheet.ts says why). The post
 * rises from the foot over the community, which eases back and stays where
 * it was; every close (Back, Escape, the browser's Back, a pull, the app's
 * edge swipe) is the same motion in reverse, down. Round 15 pushed it in
 * from the right and let a pull drop it downwards: in one way, out another,
 * which the owner read as wrong ("it opens sideways and closes downward").
 *
 * THE CLOSE, IN ORDER (closeSteps). The feed is put back to the scroll it had
 * when the post opened while the post still covers the screen, so it is
 * already exactly in place before anything moves; the community is then
 * taken back to where a covered sheet leaves it (eased back, unseen); then
 * the one move down; then the page is hidden on the move's last frame, the
 * community let go (at that frame it is at its own size, so nothing shows),
 * the layer let go, the post taken out and the history step given back, in
 * that order and nothing after.
 */
import { judgeMove, shouldComplete, completeMs, cancelMs, startsAtEdge, releaseVelocity } from "@/lib/navigation/edge-swipe"
import { rubberBand } from "@/components/website-builder/sheet-gestures"
import { keyboardInsetFrom } from "@/lib/ui/keyboard-safe-sheet"
import { RECEDE_DIM } from "./page-sheet"

export { judgeMove, shouldComplete, completeMs, cancelMs, startsAtEdge, releaseVelocity }

/* ── THE SHEET ──────────────────────────────────────────────────────────── */

export { OPEN_MS, CLOSE_MS } from "./page-sheet"
/** The feed's dim at its deepest, under an opened post (page-sheet.ts RECEDE_DIM). */
export { RECEDE_DIM as DIM } from "./page-sheet"

/* ── THE CLOSE, IN ORDER ───────────────────────────────────────────────── */

/** What closed it. */
export type CloseTrigger =
  /** The back button. */
  | "back"
  /** Escape on a keyboard. */
  | "escape"
  /** The browser's or the phone's Back (a popstate), or anything else that set it closed. */
  | "history"
  /** A Back that the browser has already drawn as its own swipe (Safari's edge swipe): nothing more is moved. */
  | "browser-swipe"
  /** Pulled down past the line, or flicked down. */
  | "pull"
  /** The app's edge swipe, let go past the line. */
  | "edge"

export type CloseStep =
  /** The feed put back where it was when the post opened (instantly; the post still covers it). */
  | "hold-feed"
  /** The community taken back to where the covered sheet leaves it, eased back (unseen: the post still covers it). */
  | "recede"
  /** Down off the screen, the community coming forward with it. */
  | "slide-down"
  /** No move at all (reduced motion, or the browser has already drawn one). */
  | "cut"
  /** The page hidden, on the move's last frame. */
  | "hide-page"
  /** The community let go of (no scale, no shift: at that frame it is at its own size). */
  | "release-community"
  /** The tab bar's layer let go (lib/ui/layers.ts). */
  | "release-layer"
  /** The post and its comments taken out of the page. */
  | "unmount"
  /** The post's history entry stepped back over (when it was not a Back that closed it). */
  | "step-back"

/** The close, step by step: the feed first, then one move down, then gone. Nothing animates after "hide-page". */
export function closeSteps(trigger: CloseTrigger, reduced = false): CloseStep[] {
  const cut = reduced || trigger === "browser-swipe"
  const steps: CloseStep[] = cut ? ["hold-feed", "cut", "hide-page", "release-community", "release-layer", "unmount"] : ["hold-feed", "recede", "slide-down", "hide-page", "release-community", "release-layer", "unmount"]
  /* A Back has already stepped over the entry; anything else gives it back. */
  if (trigger !== "history" && trigger !== "browser-swipe") steps.push("step-back")
  return steps
}

/**
 * A Back the browser drew itself. Safari's (and Chrome on iOS's) edge swipe
 * slides a picture of the page behind across and then fires popstate: moving
 * the post out again after that would be a second animation of the same
 * close. A popstate within this long of a touch that landed at the screen's
 * left edge is taken to be that swipe.
 */
export const BROWSER_SWIPE_MS = 1200
export const BROWSER_EDGE_PX = 24
export function closedByBrowserSwipe(sinceEdgeTouchMs: number, inApp: boolean): boolean {
  return !inApp && sinceEdgeTouchMs >= 0 && sinceEdgeTouchMs < BROWSER_SWIPE_MS
}

/** Whether the feed has to be put back before the close moves, and where. */
export function feedRestore(noted: number, now: number): number | null {
  return Math.abs(now - noted) >= 1 ? noted : null
}

/* ── PULL DOWN TO CLOSE ────────────────────────────────────────────────── */

/** Pulled this far it closes (a fifth of the page, never more than 140px). */
export function pullCloseDistance(height: number): number {
  return Math.min(140, Math.max(80, height * 0.2))
}
/** Let go moving down this fast (px per ms) it closes, once it has moved at least PULL_FLICK_MIN. */
export const PULL_FLICK = 0.6
export const PULL_FLICK_MIN = 16
/** How long a finger has to move down before the pull is the page's and not a scroll. */
export const PULL_SLOP = 6

/** Where the page is drawn for a finger `dy` from where it landed: with it going down, on a rubber band going up. */
export function pullOffset(dy: number): number {
  if (dy >= 0) return dy
  return -rubberBand(-dy, 48)
}

/** Let go: close, or spring back. */
export function pullVerdict(m: { dy: number; velocity: number; height: number }): "close" | "stay" {
  if (m.dy >= pullCloseDistance(m.height)) return "close"
  if (m.velocity >= PULL_FLICK && m.dy >= PULL_FLICK_MIN) return "close"
  return "stay"
}

/** The dim under the page as it is pulled or swiped away: all of it at rest, none once it has gone. */
export function dimFor(progress: number): number {
  return RECEDE_DIM * Math.max(0, Math.min(1, 1 - progress))
}

/** The app's edge swipe moves the sheet down by the finger's sideways travel, scaled so a swipe across is a close all the way. */
export function edgeOffset(dx: number, width: number, height: number): number {
  if (width <= 0) return 0
  return Math.max(0, Math.min(height, (dx * height) / width))
}

/* ── THE BACK BUTTON ───────────────────────────────────────────────────── */

/**
 * The owner: "the back icon should have a much bigger area around it". The
 * circle drawn is 40px; the button that takes the tap is BACK_HIT, from the
 * screen's left edge (x 0, the margin included) and the whole height of the
 * bar under the status bar.
 */
export const BAR_PX = 52
export const BACK_HIT = { left: 0, width: 64, height: BAR_PX }
export const BACK_CIRCLE = 40

/* ── THE PAGE ON THE VISIBLE SCREEN ────────────────────────────────────── */

/**
 * The standard keyboard with its bar of arrows and Done, in CSS px, on an
 * iPhone held upright, keyed by the screen's width x height. Used only in the
 * app, where WKWebView tells the page nothing about the keyboard: the
 * published floor (lib/ui/keyboard-safe-sheet.ts, half the screen) leaves a
 * gap of 5 to 12% of the screen between the comment box and the keys
 * (images/73.webp: 422px where the keyboard is 380). Measured: 390x844 from
 * the owner's own screenshot (the keys from 521px, the bar from 464px),
 * 402x874, 440x956 and 375x667 from keyboard-safe-sheet.ts's table; the rest
 * are the same keyboard classes.
 */
const IOS_KEYBOARD: Record<string, number> = {
  "375x667": 304,
  "375x812": 380,
  "390x844": 380,
  "393x852": 383,
  "402x874": 389,
  "414x896": 390,
  "428x926": 390,
  "430x932": 390,
  "440x956": 390,
}
export function iosKeyboardFor(width: number, height: number): number | null {
  return IOS_KEYBOARD[`${Math.round(width)}x${Math.round(height)}`] ?? null
}

export type PostBox = {
  /** From the top of the layout viewport (fixed coordinates). */
  top: number
  height: number
  /** True when the tab bar is on screen under it (no keyboard): the page ends at the bar's top. */
  aboveTabs: boolean
  /** What the keyboard's place was read from. */
  source: "screen" | "visual" | "table" | "floor"
}

/**
 * The opened post's box: the part of the screen that can be seen, so its
 * comment box (sticky at its foot) sits on the keyboard, flush, wherever the
 * platform says the keyboard is.
 *
 *   iPhone Safari, Android Chrome   the visual viewport (vvTop, vvH)
 *   the Android app                 the web view itself shrinks: vvH again
 *   the iOS app                     WKWebView says nothing (reported 0): the
 *                                   iPhone's own keyboard height when the
 *                                   screen is a known one, else the published
 *                                   floor (half the screen)
 *   no keyboard                     the whole screen down to the tab bar
 *
 * A white skirt under the page (post-fullscreen.tsx) covers whatever is left
 * between the page and the keys when the platform's number is off.
 */
export function postBox(m: {
  /** The fixed box's height (what a fixed element is laid out against). */
  layoutH: number
  innerH: number
  vvTop: number
  vvH: number
  /** A text field inside the post has the focus. */
  typing: boolean
  /** --kb-inset as ViewportVars published it (the floor, when the platform says nothing). */
  publishedInset: number
  /** The iPhone keyboard for this screen, in the app; null elsewhere. */
  appKeyboard: number | null
}): PostBox {
  const reported = keyboardInsetFrom({ layoutHeight: m.layoutH, innerHeight: m.innerH, vvTop: m.vvTop, vvHeight: m.vvH })
  /* The platform says where the keyboard is: what is visible is the visual viewport. */
  if (reported > 0 || m.layoutH - m.vvH > 80) return { top: m.vvTop, height: m.vvH, aboveTabs: false, source: "visual" }
  if (m.typing) {
    if (m.appKeyboard) return { top: 0, height: Math.max(120, m.layoutH - m.appKeyboard), aboveTabs: false, source: "table" }
    if (m.publishedInset > 0) return { top: 0, height: Math.max(120, m.layoutH - m.publishedInset), aboveTabs: false, source: "floor" }
    /* A web view that shrank itself (the Android app): it is all visible. */
    return { top: m.vvTop, height: m.vvH, aboveTabs: false, source: "visual" }
  }
  return { top: m.vvTop, height: m.vvH, aboveTabs: true, source: "screen" }
}

/** The page's CSS height for a box: down to the tab bar's top when the bar is under it. */
export function postBoxHeightCss(box: PostBox): string {
  return box.aboveTabs ? `calc(${Math.round(box.height)}px - var(--buyer-tabs-h, 0px))` : `${Math.round(box.height)}px`
}
