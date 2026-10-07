"use client"

import { useEffect, useLayoutEffect, useRef } from "react"
import { usePathname } from "next/navigation"
import { showsLibraryTabs } from "@/components/library/library-tab-list"
import { LANDING_CLASS, useLandingOnMove } from "@/lib/ui/landing"

/**
 * WHICH ADDRESSES ARE ONE PAGE. The wrapper below is keyed, so a new key
 * builds everything inside it again and plays its entrance from nothing.
 * The library's pill screens are one page whose screens cross fade under a
 * row that holds still (components/library/library-panel.tsx), so they
 * share a key: keyed by the address, every pill press rebuilt the title,
 * the pills and the stage, and faded all of it in from blank, which was
 * the flash and the jump the owner saw. Every other address keeps its own.
 */
export function navFadeKey(pathname: string | null): string {
  return showsLibraryTabs(pathname) ? "library-tabs" : pathname || ""
}

/**
 * ===========================================================================
 *  THE PROFILE CENTRE LANDS THE WAY THE REST OF THE APP LANDS
 * ===========================================================================
 * "The back from the account settings back to the profile account is too
 * direct, so things need to be smoother." "When I click on settings and land
 * on the settings page, make sure it is very smooth and clean and not so
 * direct. It is already preloaded in the background ... but that does not
 * mean it should not be smooth when I see the content of the page."
 *
 * This used to tween opacity from 0.97 to 1 over 280ms on its own curve, an
 * idiom nothing else in the app used and too small to read as anything. It is
 * the app's one landing now: opacity and a 2px rise over 180ms on
 * NAV_ENTER_EASE, the same arrival /app and a community play
 * (lib/ui/landing.ts, app/globals.css `.page-land`).
 *
 * THE KEY IS WHAT REPLAYS IT, which is also what keeps it to one page's worth
 * of movement: the key changes when the ADDRESS changes, so Settings
 * arriving, Settings leaving and the library's own screens each land once,
 * and a pill press inside the library (one key for all of them, see above)
 * lands nothing.
 *
 * `useLandingOnMove` is above the keyed box, so it survives the remount and
 * can tell a client navigation from the document's own first paint. On a
 * reload, a cold start or a link opened fresh there is no class at all, and
 * `.library-content-enter`, the hand over from loading.tsx, which is a
 * layered rule and so loses to `.page-land` when both are there, is what
 * that first paint keeps.
 */
export function AccountNavFade({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  useTopOnArrival(navFadeKey(pathname))
  const onLibrary = showsLibraryTabs(pathname)
  const landingOnMove = useLandingOnMove(navFadeKey(pathname))
  /*
    The library cross fades under its own pills (library-panel.tsx), and they share one key, so this lands nothing between them.
    Arriving at the library from another account page is a new key, and it lands the way every other page does (round 15: "the
    transition to the library is too direct").
  */
  const landing = landingOnMove

  return (
    <div
      key={navFadeKey(pathname)}
      className={`min-w-0${onLibrary ? "" : " library-content-enter"}${landing ? ` ${LANDING_CLASS}` : ""}`}
      data-account-nav-fade={onLibrary ? "library" : "profile"}
    >
      {children}
    </div>
  )
}

/*
  EVERY ACCOUNT PAGE OPENS AT ITS TOP (round 15). Moving between the account's own pages, the layout stays and the router only
  scrolls the part that changed into view, which is below the profile's cover: /account opened half way down the page, at the
  scroll the page before had. A move to another page (not Back or Forward, which keep their place, and not the library's own
  pills, which share one key) puts the window at the top, before the frame is painted and again on the next one, after the
  router's own scroll.
*/
function useTopOnArrival(key: string) {
  const traversal = useRef(false)
  const last = useRef(key)
  useEffect(() => {
    const onPop = () => {
      traversal.current = true
    }
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [])
  useLayoutEffect(() => {
    if (last.current === key) return
    last.current = key
    if (traversal.current) {
      traversal.current = false
      return
    }
    window.scrollTo(0, 0)
    const id = requestAnimationFrame(() => window.scrollTo(0, 0))
    return () => cancelAnimationFrame(id)
  }, [key])
}
