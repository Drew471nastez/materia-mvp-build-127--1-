"use client"

/**
 * ===========================================================================
 *  INTO THE DASHBOARD FROM A BUYER PAGE: THE PAGE LEFT FADES OFF IT (round 31)
 * ===========================================================================
 * The owner: "going to the dashboard from a community, dark or light, still
 * blinks between the pages". From a community, Explore or the account, the
 * Dashboard row (the community's menu, the navigator, the header) is a
 * client move into /app: the router waits for the dashboard's whole first
 * render, then takes the buyer page down and puts the shell up in one
 * commit. The two share nothing (a light page with a white bar, or the dark
 * look, then the #111 bar, the rail and a grey field), so that commit was a
 * cut, and from the dark look round 30's veil made it dark, then flat black,
 * then the dashboard.
 *
 * Now the page being left goes out over the dashboard. In the commit that
 * takes it down (a layout effect's cleanup in the buyer layouts, where its
 * nodes are still in the document and the shell is not yet painted) what the
 * window shows of it is copied (lib/navigation/in-view-copy.ts, a screenful,
 * not the page) and laid over everything, and once the shell is on the
 * screen (components/app/app-layout-wrapper.tsx) it fades off in FADE_MS,
 * opacity alone, on the compositor. In the dark look the copy keeps the dark
 * look's colours (the generated sheet's scope, [data-community-theme="dark"])
 * after <html> has gone light. No veil is put up under it.
 *
 * Only for a move that was asked for (a press on a link to /app, noted on
 * the way down, NOTE_FRESH_MS), never for a page simply going away. Nothing
 * under reduced motion. A still never outlives CAP_MS. A dashboard opened as
 * a document (the app's link guard, a reload) has no page to copy: round 30's
 * veil and the head's canvas are what it opens on.
 */
import { copyInView } from "./in-view-copy"

export const INTO_APP_FADE_MS = 200
export const INTO_APP_EASE = "cubic-bezier(0.33, 1, 0.68, 1)"
/** A press on a Dashboard link counts for this long (a slow dashboard render included). */
export const NOTE_FRESH_MS = 15_000
/** The copy never outlives this, whatever the dashboard does. */
export const CAP_MS = 2500
export const INTO_APP_STILL_ATTR = "data-into-app-still"

const APP = /^\/app(\/|$)/
let noted = 0

/** A press is on its way to /app (a capture listener on the buyer layouts' links). */
export function noteHeadingIntoApp(href: string | null | undefined): void {
  if (!href || typeof window === "undefined") return
  try {
    const url = new URL(href, window.location.href)
    if (url.origin === window.location.origin && APP.test(url.pathname) && !APP.test(window.location.pathname)) noted = performance.now()
  } catch {
    /* not an address */
  }
}

/** Whether a copy of the buyer page is over the dashboard right now (paintAppearance puts no veil under it). */
export function intoAppStillUp(): boolean {
  return typeof document !== "undefined" && !!document.querySelector(`[${INTO_APP_STILL_ATTR}]`)
}

/**
 * In the commit that takes a buyer layout down: when a press was on its way to /app, the window's view of the page is
 * copied and laid over everything. Call from a layout effect's cleanup.
 */
export function holdPageIntoApp(): void {
  if (typeof window === "undefined" || !noted || performance.now() - noted > NOTE_FRESH_MS) return
  noted = 0
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || intoAppStillUp()) return
  const body = document.body
  const html = document.documentElement
  const dark = html.hasAttribute("data-sl-dark")
  const ground = (() => {
    for (const el of [body, html]) {
      const c = getComputedStyle(el).backgroundColor
      if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c
    }
    return dark ? "#111113" : "#ffffff"
  })()
  const box = document.createElement("div")
  box.setAttribute(INTO_APP_STILL_ATTR, "")
  box.setAttribute("aria-hidden", "true")
  box.inert = true
  /* The dark look's own scope, so the copy keeps its colours once <html> is light (app/theme-dark.css). */
  if (dark) box.setAttribute("data-community-theme", "dark")
  box.style.cssText = `position:fixed;inset:0;z-index:2147483000;overflow:hidden;pointer-events:none;background-color:${ground};color:${getComputedStyle(body).color};font-family:${getComputedStyle(body).fontFamily}`
  const h = window.innerHeight
  try {
    for (const child of Array.from(body.children)) {
      if (/^(SCRIPT|STYLE|TEMPLATE|NOSCRIPT|NEXT-ROUTE-ANNOUNCER)$/.test(child.tagName) || child.hasAttribute(INTO_APP_STILL_ATTR)) continue
      box.appendChild(copyInView(child, h))
    }
  } catch {
    return
  }
  body.appendChild(box)
  /* Scrolled as the page was, so a bar stuck to the top is where it was (the box is its scroller now). */
  box.scrollTop = window.scrollY
  window.setTimeout(() => box.remove(), CAP_MS)
}

/** The dashboard's shell is on the screen: the copy of the page left fades off it. */
export function revealIntoApp(): void {
  if (typeof document === "undefined") return
  for (const box of Array.from(document.querySelectorAll<HTMLElement>(`[${INTO_APP_STILL_ATTR}]`))) {
    if (box.dataset.leaving) continue
    box.dataset.leaving = "1"
    const done = () => box.remove()
    try {
      box.animate([{ opacity: 1 }, { opacity: 0 }], { duration: INTO_APP_FADE_MS, easing: INTO_APP_EASE, fill: "forwards" }).finished.then(done, done)
    } catch {
      done()
    }
  }
}
