"use client"

import { isNativeApp } from "@/lib/native-bridge"

/**
 * ===========================================================================
 *  A TAB IN THE APP CHANGES PAGE IN ONE PIECE (round 20)
 * ===========================================================================
 * The owner: "the navigation between the community and the profile is
 * criminal: it glitches, it flashes, it takes too long. In the iOS and
 * Android app the tab bar's pages should feel like subpages, instant and
 * smooth." The community and the profile are separate layouts, so a tab
 * between them took one page down and put the other up: a frame of the new
 * page half built, its loading shape, the header changing on its own.
 *
 * In the app, a tab that crosses between them now goes through a view
 * transition: the browser holds a picture of the page being left until the
 * router has put the next one in the page (its address committed), never
 * longer than HOLD_MS, and then the new page fades in over the
 * picture in 180ms (app/globals.css, data-tab-swap). The tab bar is out of
 * the picture (its own name there), so it stays exactly where it is. A
 * browser, reduced motion or an engine without view transitions pushes as
 * before.
 *
 * Why not keep both pages alive: the router owns each layout's tree, and the
 * one way Next keeps a page alive behind another (cacheComponents) changes
 * how every page reads its data. This gives the same look, a page that is
 * simply there, without that.
 */
const HOLD_MS = 350

type ViewTransitionDoc = Document & { startViewTransition?: (update: () => Promise<void> | void) => { finished: Promise<void> } }

/** Runs `push` inside a view transition in the app; returns false when it cannot (the caller pushes as usual). */
export function swapTabPage(push: () => void, toPath: string): boolean {
  if (typeof window === "undefined" || !isNativeApp()) return false
  const doc = document as ViewTransitionDoc
  if (typeof doc.startViewTransition !== "function") return false
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return false
  const html = document.documentElement
  if (html.hasAttribute("data-layer-motion") || html.hasAttribute("data-tab-swap")) return false
  const target = toPath.split(/[?#]/)[0].replace(/\/+$/, "") || "/"
  html.setAttribute("data-tab-swap", "")
  try {
    const vt = doc.startViewTransition(
      () =>
        new Promise<void>((resolve) => {
          let over = false
          const end = () => {
            if (over) return
            over = true
            resolve()
          }
          const timer = window.setTimeout(end, HOLD_MS)
          push()
          /*
            Watched on a timer, not on frames: while a view transition holds its picture the browser draws no frames, so a
            requestAnimationFrame loop would only run once the hold was over. The router writes the address after it has
            put the new page in the document, so the address changing is the page being there.
          */
          const watch = () => {
            if (over) return
            const here = window.location.pathname.replace(/\/+$/, "") || "/"
            if (here === target) {
              window.clearTimeout(timer)
              end()
              return
            }
            window.setTimeout(watch, 16)
          }
          window.setTimeout(watch, 16)
        }),
    )
    vt.finished.finally(() => html.removeAttribute("data-tab-swap"))
    return true
  } catch {
    html.removeAttribute("data-tab-swap")
    return false
  }
}
