"use client"

/**
 * ===========================================================================
 *  A NAVIGATION BETWEEN /app PAGES, AND WHAT THE SHELL SHOWS WHILE IT RUNS
 * ===========================================================================
 * "When I click a page in the sidebar it should load and appear with the
 * content already there, with a smooth, subtle animation when landing on the
 * page, like Shopify does. Same when going back."
 *
 * So the page you are on stays on screen until the next one is ready (the
 * router holds it: there is no route level loading boundary under /app any
 * more), and what the shell adds depends only on how long that takes. On a
 * computer:
 *
 *      under 300ms   nothing at all
 *      300ms         a thin bar along the top of the header
 *      1000ms        the next page's outline over the content area
 *
 * On a phone, and anywhere in the native apps: "when navigating in the app,
 * there should be a loading skeleton, smooth, simple, clean, only when
 * navigating, so it feels like more feedback." A tap has nothing under the
 * finger to answer it (no hover, no pointer), so a page that is not there
 * within NAV_PHONE_OUTLINE_AFTER_MS gets its outline straight away, on a
 * short fade, in place of the bar:
 *
 *      under 90ms    nothing at all
 *      90ms          the next page's outline, fading in over 120ms
 *
 * Never for the product editor: "the whole page should not have a loading
 * skeleton when I click to edit a product." There the page you were on stays
 * until the editor is ready, at every width (`drawsOutline` below).
 *
 * and, when the new page commits, one short entrance: opacity from 0 and a
 * 5px rise, 180ms, one curve (components/app/app-stage.tsx).
 *
 * This file is the one record of "a navigation is underway, to where, since
 * when" that the bar and the stage both read, so the two cannot disagree
 * about it. It is module state, which is right here: it describes this tab's
 * router and nothing else, and nothing on a server ever reads it.
 */

import { useSyncExternalStore } from "react"

/** Below this a navigation shows nothing: most are over before it. */
export const NAV_BAR_AFTER_MS = 300
/** Past this the next page's outline is drawn over the content. */
export const NAV_SKELETON_AFTER_MS = 1000
/** On a phone, or in the native apps, the outline comes this soon... */
export const NAV_PHONE_OUTLINE_AFTER_MS = 90
/** ...on an opacity fade this long. */
export const NAV_PHONE_OUTLINE_FADE_MS = 120
/** The landing: opacity and a rise, on one curve. */
export const NAV_ENTER_MS = 180
export const NAV_ENTER_RISE_PX = 5
export const NAV_ENTER_EASE = "cubic-bezier(0.2, 0, 0, 1)"
/** A navigation that never reports back (it failed, or went nowhere) is dropped after this. */
const GIVE_UP_MS = 10000

/**
 * Whether an address ever gets an outline while it loads. Not the product
 * editor, new or saved: the page you were on stays until the editor is ready.
 * Not the plans page either: it is drawn over the whole shell
 * (components/app/page-layer.tsx), so an outline under the header would be
 * the wrong shape in the wrong place.
 */
export function drawsOutline(href: string | null): boolean {
  if (!href) return false
  const path = (href.split(/[?#]/)[0] || "").replace(/\/+$/, "")
  if (path !== "/app" && !path.startsWith("/app/")) return false
  if (/^\/app\/products\/[^/]+(\/|$)/.test(path)) return false
  if (path === "/app/settings/billing/upgrade") return false
  return true
}

/**
 * A phone, by width (the nav pill's breakpoint), or the native apps at any
 * width. The class is the one the native shell puts on <html> before the
 * first paint; nothing here reads a user agent.
 */
export function isPhoneShell(): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") return false
  if (document.documentElement.classList.contains("capacitor")) return true
  return !!window.matchMedia?.("(max-width: 767px)").matches
}

/** How long a navigation to `href` runs before its outline is drawn, or null for never. */
export function outlineDelay(href: string | null, phone: boolean = isPhoneShell()): number | null {
  if (!drawsOutline(href)) return null
  return phone ? NAV_PHONE_OUTLINE_AFTER_MS : NAV_SKELETON_AFTER_MS
}

export type AppNavigation = { href: string | null; startedAt: number }

let current: AppNavigation | null = null
let giveUp: ReturnType<typeof setTimeout> | null = null
const listeners = new Set<() => void>()
const emit = () => { for (const f of [...listeners]) f() }

/** A navigation has started, to `href` when the caller knows it. */
export function beginAppNavigation(href: string | null = null) {
  if (typeof window === "undefined") return
  current = { href, startedAt: performance.now() }
  if (giveUp) clearTimeout(giveUp)
  giveUp = setTimeout(endAppNavigation, GIVE_UP_MS)
  emit()
}

/** The new page has committed (or nothing is going to). */
export function endAppNavigation() {
  if (giveUp) { clearTimeout(giveUp); giveUp = null }
  if (!current) return
  current = null
  emit()
}

export function getAppNavigation() {
  return current
}

function subscribe(f: () => void) {
  listeners.add(f)
  return () => { listeners.delete(f) }
}

export function useAppNavigation(): AppNavigation | null {
  return useSyncExternalStore(subscribe, getAppNavigation, () => null)
}

/**
 * FETCH THE WHOLE PAGE AHEAD, NOT JUST ITS FRAME. With no loading boundary
 * under /app an ordinary prefetch of a dynamic page brings back almost
 * nothing, so the click still waits for the server. A full prefetch brings
 * the page itself, and the router keeps it for staleTimes (five minutes,
 * next.config.mjs), so the click that follows lands on the next frame. Used
 * for the sidebar and pill rows, on hover, focus and the pill's mount.
 */
export function prefetchAppPage(router: { prefetch: (href: string, options?: never) => void }, href: string) {
  try {
    router.prefetch(href, { kind: "full" } as never)
  } catch {
    /* a prefetch that fails is a click that waits, nothing worse */
  }
}

/* ── Where the reader was, per address ─────────────────────────────────── */

/**
 * BACK PUTS YOU WHERE YOU WERE. /app scrolls in `.app-content-scroll`, and on
 * most pages in a container of the page's own inside it, so the browser's own
 * scroll restoration never sees either. The stage records both as they move
 * and puts them back on a back or forward navigation. A new visit starts at
 * the top.
 */
const scrolls = new Map<string, { outer: number; inner: number }>()
let traversing = false
let landed = 0

export function rememberScroll(key: string, outer: number, inner: number) {
  scrolls.set(key, { outer, inner })
  /* A long session does not keep every address it ever saw. */
  if (scrolls.size > 60) scrolls.delete(scrolls.keys().next().value as string)
}
export function recalledScroll(key: string) {
  return scrolls.get(key) ?? null
}

/** Called from `popstate`: the next commit is a back or forward, not a new visit. */
export function markTraversal() {
  traversing = true
}
/** Read once per commit: was it a back or forward? */
export function takeTraversal() {
  const t = traversing
  traversing = false
  return t
}

/** One more page landed on in this tab without a reload. */
export function markLanded() {
  landed++
}
/**
 * Whether there is an /app page behind this one to go back to. A page opened
 * from a bookmark, an email or a Stripe return has none, and its Back has to
 * be a link instead of `router.back()`, which would leave the app.
 */
export function hasInAppHistory() {
  return landed > 0
}
