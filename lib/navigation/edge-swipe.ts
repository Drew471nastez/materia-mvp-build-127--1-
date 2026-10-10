import { anyLayerOpen } from "@/lib/ui/layers"

/**
 * ===========================================================================
 *  THE EDGE SWIPE BACK, DECIDED
 * ===========================================================================
 * "iOS style edge swipe to go back in the app": a finger that lands within
 * EDGE_START_PX of the left edge and moves right drags the page with it, a
 * dimmed surface shows behind, and letting go past COMPLETE_FRACTION of the
 * width (or with a flick) slides the page out and goes back once; anything
 * less springs it back. components/platform/edge-swipe-back.tsx does the
 * moving. This file is the rules, as plain functions where they can be, so
 * tests/edge-swipe-back.test.ts holds them as they are written.
 *
 * ONLY IN THE APP. Mobile Safari and Chrome have their own swipe (Safari's
 * shows a picture of the page behind); a second one in the page would fight
 * it. So the gesture exists only under html.capacitor, and not on Android,
 * where the system's own back gesture owns the left edge and the hardware
 * key already goes back (components/app/native-back-handler.tsx).
 *
 * ===========================================================================
 *  A PICTURE OF THE PAGE BEHIND: NOT FROM THE WEB LAYER
 * ===========================================================================
 * iOS slides the previous screen in from under the current one. A web page
 * cannot do that honestly with client routing: the router unmounts the page
 * it leaves and keeps only its data (the RSC payload), not its DOM, so there
 * is nothing to draw until the back has happened. The ways to fake it all
 * cost more than they give:
 *   - keeping a clone of every page as it is left (lib/navigation/leaving-
 *     still does it once, for the checkout) is a full DOM copy per move,
 *     with frames reloaded, images decoded again and ids to strip;
 *   - drawing it to a canvas (html2canvas and the like) is hundreds of
 *     milliseconds of main thread per page on a phone, and blank for every
 *     cross origin image (most product pictures);
 *   - a view transition captures only the page that is up, and while one
 *     waits the browser draws nothing (see leaving-still's own note).
 * So behind the page is a quiet stand in, BACKDROP below: the white band
 * every Storelib header has, the page grey under it, dimmed while the page
 * covers most of it and clearing as it is revealed. When the back has
 * landed, the stand in fades off the real page.
 *
 * ===========================================================================
 *  THE NATIVE ALTERNATIVE, AND WHY THIS ONE
 * ===========================================================================
 * WKWebView has the gesture built in: `allowsBackForwardNavigationGestures`.
 * One line, for the next App Store release, in ios/App/App/AppDelegate.swift
 * where the bridge's web view is reached (applicationDidBecomeActive):
 *
 *     webView.allowsBackForwardNavigationGestures = true
 *
 * (or a two line CAPBridgeViewController subclass overriding
 * `capacitorDidLoad()` to set it, named in Main.storyboard). It is drawn by
 * UIKit off the main thread and shows WebKit's own snapshot of the entry
 * behind. With client routing it is the weaker choice:
 *   - it knows nothing about the page: it goes back over an open sheet, the
 *     lightbox, the composer with a half written post, a swipe in a
 *     horizontal row that starts near the edge, and it ignores the back hold
 *     (lib/navigation/go-back), so a swipe and a tap go back twice;
 *   - its snapshot of a pushState entry is the page as it was left, and the
 *     router then renders and restores the scroll on its own clock: WebKit
 *     takes the snapshot down on a timer or on first paint, so the picture
 *     and the real page can disagree for a frame (a jump);
 *   - it waits for a store release, and every fix after it does too.
 * The web gesture ships with a deploy, honours every one of those holds and
 * goes back through the same helper as every back control. So this is the
 * one in use. If the native line is ever shipped, the shell must say so
 * (NATIVE_SWIPE_FLAG on window, or NATIVE_SWIPE_UA in the user agent) and
 * this one stands down, so a finger never drives two.
 */

/** A touch has to land this close to the left edge (CSS px) to start one. */
export const EDGE_START_PX = 20
/** It becomes the page's drag once it has moved this far to the right. */
export const CLAIM_PX = 10
/** And moved more sideways than down by this much (a scroll that drifts right stays a scroll). */
export const CLAIM_RATIO = 1.2
/** A vertical move this long before the claim is a scroll: the swipe gives the touch up. */
export const VERTICAL_GIVE_UP_PX = 10
/** Let go past this share of the width and the page goes. */
export const COMPLETE_FRACTION = 0.35
/** A flick to the right at this speed (px per ms) goes, however short. */
export const FLICK_PX_PER_MS = 0.35
/** And the flick has to have moved at least this far, so a jitter at the edge is not one. */
export const FLICK_MIN_PX = 24
/** A flick back to the left at this speed stays, however far the page had gone. */
export const CANCEL_FLICK_PX_PER_MS = -0.3
/** The window the release speed is read over. */
export const VELOCITY_WINDOW_MS = 80

/** The curve the page leaves on: starts at the finger's speed, settles softly. */
export const COMPLETE_EASE = "cubic-bezier(0.25, 0.8, 0.3, 1)"
/** The curve it springs back on: quick, no overshoot past the edge. */
export const CANCEL_EASE = "cubic-bezier(0.2, 0.9, 0.25, 1)"
/** How long the stand in takes to fade off the page that came back. */
export const REVEAL_MS = 200
export const REVEAL_EASE = "cubic-bezier(0.22, 1, 0.36, 1)"
/** The longest the stand in waits for the page behind before it fades anyway. */
export const ARRIVAL_CAP_MS = 4000
/** An entry with the same path (a search screen's own, a #tab) lands without a commit: this long after its popstate. */
export const SAME_PATH_SETTLE_MS = 320

/** The stand in for the page behind. */
export const BACKDROP = {
  /** The page grey, Storelib's own. */
  page: "#f8f9fa",
  /** The header band every Storelib page starts with. */
  band: "#ffffff",
  /** Its hairline. */
  hairline: "rgba(26, 26, 46, 0.06)",
  /** The dim over it while the page covers most of it, in ink. */
  dim: "rgba(26, 26, 46, 0.10)",
  /** The page's own shadow on it, at the page's left edge. */
  shadow: "rgba(26, 26, 46, 0.12)",
  /** How wide that shadow falls. */
  shadowPx: 22,
}

/** Set on window (or the user agent carries NATIVE_SWIPE_UA) when the shell's own swipe is on. */
export const NATIVE_SWIPE_FLAG = "__storelibNativeSwipeBack"
export const NATIVE_SWIPE_UA = "StorelibNativeSwipe"

/** Opt out for anything that handles a sideways drag of its own and is not caught below. */
export const OPT_OUT_ATTR = "data-edge-swipe"

/**
 * Places that are not the buyer's side, or that guard their own way out:
 * the seller app (its layers and its own back), the editors, the start
 * screen, sign in callbacks and the checkout (a payment on its way, a card
 * form at the edge, and its own popstate handling).
 */
const NOT_HERE = ["/app", "/admin", "/dashboard", "/website-builder", "/store-builder", "/onepage-preview", "/native-start", "/checkout", "/purchase", "/auth", "/sites"]

export function edgeSwipeRouteAllowed(pathname: string): boolean {
  const p = (pathname || "/").split("?")[0]
  return !NOT_HERE.some((prefix) => p === prefix || p.startsWith(prefix + "/"))
}

/** Whether a touch landing at `x` (CSS px from the left) may start one. */
export function startsAtEdge(x: number): boolean {
  return x >= 0 && x <= EDGE_START_PX
}

export type MoveVerdict = "wait" | "claim" | "give-up"

/** What a move from the landing point says: not yet, this is the page's drag, or a scroll. */
export function judgeMove(dx: number, dy: number): MoveVerdict {
  const ady = Math.abs(dy)
  if (dx >= CLAIM_PX && dx > ady * CLAIM_RATIO) return "claim"
  if (ady >= VERTICAL_GIVE_UP_PX && ady >= Math.abs(dx)) return "give-up"
  if (dx <= -CLAIM_PX) return "give-up"
  return "wait"
}

/** The page's offset for a finger `dx` from where it landed: with it, never left of the edge. */
export function pageOffset(dx: number, width: number): number {
  return Math.max(0, Math.min(width, dx))
}

/** How far across, 0 to 1. */
export function progressOf(offset: number, width: number): number {
  return width > 0 ? Math.max(0, Math.min(1, offset / width)) : 0
}

/** The dim over the stand in: full while the page covers it, clear when it has gone. */
export function dimOpacity(progress: number): number {
  return Math.max(0, Math.min(1, 1 - progress))
}

/** The page's shadow: there while it moves, gone by the time it has left. */
export function shadowOpacity(progress: number): number {
  return Math.max(0, Math.min(1, (1 - progress) * 1.5))
}

/** Speed (px per ms) over the last VELOCITY_WINDOW_MS of samples [time, x]. */
export function releaseVelocity(samples: ReadonlyArray<readonly [number, number]>): number {
  if (samples.length < 2) return 0
  const [tEnd, xEnd] = samples[samples.length - 1]
  let i = samples.length - 2
  while (i > 0 && tEnd - samples[i][0] < VELOCITY_WINDOW_MS) i--
  const [t0, x0] = samples[i]
  const dt = tEnd - t0
  return dt > 0 ? (xEnd - x0) / dt : 0
}

/** Let go at `offset` with `velocity`: does the page go? */
export function shouldComplete(offset: number, width: number, velocity: number): boolean {
  if (velocity <= CANCEL_FLICK_PX_PER_MS) return false
  if (velocity >= FLICK_PX_PER_MS && offset >= FLICK_MIN_PX) return true
  return offset >= width * COMPLETE_FRACTION
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/** The slide out: the rest of the way at no less than the finger's speed, inside a calm range. */
export function completeMs(remaining: number, velocity: number, reduced = false): number {
  if (reduced) return 140
  return Math.round(clamp(remaining / Math.max(velocity, 1.1), 170, 320))
}

/** The spring back: longer from further, never slow. */
export function cancelMs(offset: number, reduced = false): number {
  if (reduced) return 140
  return Math.round(clamp(190 + offset * 0.25, 200, 320))
}

/* ── In the document ─────────────────────────────────────────────────────── */

type CapacitorLike = { isNativePlatform?: () => boolean; getPlatform?: () => string }

/** The app, on iOS (or a shell that does not say), with the shell's own swipe off. */
export function edgeSwipeEnvironment(win: Window = window): boolean {
  const doc = win.document
  if (!doc.documentElement.classList.contains("capacitor")) return false
  const cap = (win as unknown as { Capacitor?: CapacitorLike }).Capacitor
  if (cap?.getPlatform?.() === "android") return false
  if ((win as unknown as Record<string, unknown>)[NATIVE_SWIPE_FLAG] === true) return false
  if ((win.navigator?.userAgent || "").includes(NATIVE_SWIPE_UA)) return false
  /* The page moves by the `translate` property (iOS 14.5 and later): an older WebKit gets no swipe rather than one that does not move. */
  try {
    if (!(win as unknown as { CSS?: typeof CSS }).CSS?.supports("translate", "1px 0px")) return false
  } catch {
    return false
  }
  return true
}

function shown(el: Element): boolean {
  if (el.closest("[inert],[aria-hidden='true']")) return false
  return el.getClientRects().length > 0
}

/**
 * Something on top owns the screen: a sheet (up or on its way down), a
 * modal dialog (the search screen, the lightbox, a post), a page layer, the
 * composer, the phone menu. A finger at the edge then belongs to it.
 */
export function overlayUp(doc: Document = document): boolean {
  const html = doc.documentElement
  if (html.hasAttribute("data-app-sheet-up")) return true
  /* Any layer the registry counts (lib/ui/layers.ts): a page layer, the composer, the viewer, an opened post, a search screen. */
  if (typeof document !== "undefined" && doc === document && anyLayerOpen()) return true
  if (html.classList.contains("has-page-layer") || html.classList.contains("has-phone-page-layer")) return true
  if (doc.querySelector("[data-lightbox]")) return true
  if (doc.querySelector('[data-composer="open"],[data-composer="sheet"]')) return true
  if (doc.querySelector('[data-mobile-menu="open"],[data-search-overlay="open"]')) return true
  for (const el of Array.from(doc.querySelectorAll('[role="dialog"][aria-modal="true"],[role="alertdialog"][aria-modal="true"]'))) {
    if (el.hasAttribute("data-app-sheet-rest")) continue
    if (shown(el)) return true
  }
  return false
}

/** A field with the keyboard up: the edge is the field's (and the keyboard's), not the page's. */
export function typing(doc: Document = document): boolean {
  const a = doc.activeElement as HTMLElement | null
  if (!a || a === doc.body) return false
  if (a.isContentEditable) return true
  const tag = a.tagName
  if (tag === "TEXTAREA" || tag === "SELECT") return true
  if (tag !== "INPUT") return false
  const type = ((a as HTMLInputElement).type || "text").toLowerCase()
  return !["button", "submit", "reset", "checkbox", "radio", "range", "color", "file", "image"].includes(type)
}

/**
 * Something under the finger handles a sideways move itself: a row that
 * scrolls sideways (and has somewhere to scroll), a Swiper gallery, a
 * product gallery or a chart that took sideways moves for itself with
 * `touch-action: pan-y` (and is not a vertical scroller), a slider, a
 * colour square, the tab bar's own slide, or anything marked
 * data-edge-swipe="off". Read once, when the finger lands.
 */
export function handledSideways(target: Element | null, win: Window = window, startX?: number): boolean {
  const atEdge = startX !== undefined && startsAtEdge(startX)
  let el: Element | null = target
  const doc = win.document
  while (el && el !== doc.body && el !== doc.documentElement) {
    if (el.getAttribute(OPT_OUT_ATTR) === "off") return true
    if (el.hasAttribute("data-sheet-no-drag") || el.hasAttribute("data-buyer-tab-bar") || el.hasAttribute("data-lightbox")) return true
    if (el.classList.contains("swiper") || el.classList.contains("swiper-wrapper")) return true
    if (el.tagName === "INPUT" && (el as HTMLInputElement).type === "range") return true
    const cs = win.getComputedStyle(el)
    const he = el as HTMLElement
    if ((cs.overflowX === "auto" || cs.overflowX === "scroll") && he.scrollWidth > he.clientWidth + 1) {
      /* A sideways row (tabs, filters) must not steal the left-edge back gesture. */
      if (!atEdge || el.hasAttribute("data-gallery-swipe")) return true
    }
    const ta = cs.touchAction
    if (ta && /\bpan-y\b/.test(ta) && !/\bpan-x\b/.test(ta) && cs.overflowY !== "auto" && cs.overflowY !== "scroll") return true
    if (ta === "none") return true
    el = el.parentElement
  }
  return false
}
