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
 * longer than HOLD_MS, and then the new page takes its place at once
 * (app/globals.css, data-tab-swap; round 18 made it a cut, because the 180ms
 * dissolve it was showed both pages at once). The tab bar is out of
 * the picture (its own name there), so it stays exactly where it is. A
 * browser, reduced motion or an engine without view transitions pushes as
 * before.
 *
 * Why not keep both pages alive: the router owns each layout's tree, and the
 * one way Next keeps a page alive behind another (cacheComponents) changes
 * how every page reads its data. This gives the same look, a page that is
 * simply there, without that.
 */
const HOLD_MS = 600

/*
  THE NEXT PAGE IS THERE WHEN ITS FRAME IS, not when its address is (round 22, the owner: "the transition from the community
  to /account is glitchy, the layout shifts"). The address is written as soon as the router commits, which on the profile was
  before its community bar had replaced the held space for it, so the picture was let go on a page still settling. A page
  is ready once its address is committed and its own frame is drawn: the community's shell, or the profile with its header
  decided (no bar still pending). Past HOLD_MS it goes anyway.
*/
function arrived(target: string): boolean {
  const here = window.location.pathname.replace(/\/+$/, "") || "/"
  if (here !== target) return false
  const html = document.documentElement
  if (target === "/account" || target.startsWith("/account/")) {
    /* Round 18: and its cover drawn, not still on its way (components/profile/profile-cover-image.tsx), so the picture let go is the whole page, never a grey band the cover fades in on afterwards. */
    return !!document.querySelector('[data-page="account"]') && !html.hasAttribute("data-account-community-pending") && !document.querySelector('[data-profile-cover-image="loading"]')
  }
  if (target.startsWith("/community/")) return !!document.querySelector("[data-community-shell], [data-community-public]")
  return true
}

/** Whether a tab swap is holding the screen right now: a page arriving under it plays no entrance of its own (it would be a second fade). */
export function tabSwapInProgress(): boolean {
  return typeof document !== "undefined" && document.documentElement.hasAttribute("data-tab-swap")
}

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
            if (arrived(target)) {
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
