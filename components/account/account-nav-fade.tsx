"use client"

import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from "react"
import { tabSwapInProgress } from "@/lib/nav/tab-swap"
import { usePathname } from "next/navigation"
import { showsLibraryTabs } from "@/components/library/library-tab-list"
import { showsProfileHeader } from "@/lib/profile/owner-pills"
import { accountPinnedScroll, accountScrollPinPaused, opensAtTop, scrollPageToTop } from "@/lib/navigation/tab-scroll"
import { LANDING_CLASS, useLandingOnMove } from "@/lib/ui/landing"

/**
 * WHICH ADDRESSES ARE ONE PAGE. The wrapper below is keyed, so a new key
 * builds everything inside it again and plays its entrance from nothing.
 * The library's pill screens are one page whose screens change under a
 * row that holds still (components/library/library-panel.tsx), so they
 * share a key: keyed by the address, every pill press rebuilt the title,
 * the pills and the stage, and faded all of it in from blank, which was
 * the flash and the jump the owner saw. Every other address keeps its own.
 */
export function navFadeKey(pathname: string | null): string {
  if (showsLibraryTabs(pathname)) return "library-tabs"
  /* The profile's own pills (Activity, Posts, Communities) are one page under one header: a pill press changes the panel, never the cover, the avatar and the pills (components/account/account-hub.tsx). */
  if (showsProfileHeader(pathname)) return "profile"
  return pathname || ""
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
    The library lands each screen under its own pills (library-panel.tsx), and they share one key, so this lands nothing between them.
    Arriving at the library from another account page is a new key, and it lands the way every other page does (round 15: "the
    transition to the library is too direct").
  */
  const landing = landingOnMove
  /*
    ARRIVING UNDER A TAB SWAP (lib/nav/tab-swap.ts), the swap already fades the whole page in. The profile's own fade inside
    it drew the community bar solid and the profile under it fading after, a second fade that read as the page arriving in
    pieces. Read once, on the first render of this layout: on the server and while hydrating there is no swap.
  */
  /*
    ROUND 18: ARRIVING FROM ANOTHER TAB, THE PAGE IS THERE WHOLE ON ITS FIRST FRAME. The owner: "sometimes in the community
    feed, when I tap the nav bar to go to the account, for one second it flashes out, hides the space pills empty, and then
    takes me there", and "get rid of the flash when I land on the account page, in the cover". Filmed at 4x CPU in a real
    Next build (scratchpad n18/realnav), the account page arrived at opacity 0 and rose to 1 over 220ms: its first frame was
    the community's bar (drawn by components/account/account-community-chrome.tsx, outside this box, solid) over an empty
    white page, the pills and the feed gone, and then the profile, cover first grey, faded in under it. Where the app's tab
    swap had given up waiting, that blank frame was the whole handover. A tab is not a page landing: a phone's own tab bar
    shows the next screen whole, at once. So the reveal from nothing is kept for the document's own first paint (the server's
    HTML, a reload, a link opened fresh), and a client arrival from outside the account plays nothing at all.
  */
  const hydrating = useSyncExternalStore(noop, () => false, () => true)
  const arrival = useRef<{ key: string; swapped: boolean; fresh: boolean } | null>(null)
  if (arrival.current === null) arrival.current = { key: navFadeKey(pathname), swapped: tabSwapInProgress(), fresh: hydrating }
  const enter = !onLibrary && arrival.current.fresh && !(arrival.current.swapped && arrival.current.key === navFadeKey(pathname))

  return (
    <div
      key={navFadeKey(pathname)}
      className={`min-w-0${enter ? " library-content-enter" : ""}${landing ? ` ${LANDING_CLASS}` : ""}`}
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
const noop = () => () => {}

/** Survives a refresh remount, which a ref does not: closing edit profile must not count as a new landing. */
let lastAccountKey: string | null = null

function useTopOnArrival(key: string) {
  /*
    LEAVING THE ACCOUNT FORGETS IT. The key above outlived the account's
    layout, so Profile, Home, Profile again found the same key, counted it as
    no move and kept the feed's scroll: the profile opened half way down, or
    at its foot where the feed was longer than it. Gone once the address is
    no longer an account page; a remount that stays on one (a refresh) keeps it.
  */
  useEffect(
    () => () => {
      window.setTimeout(() => {
        const p = window.location.pathname
        if (p !== "/account" && !p.startsWith("/account/")) lastAccountKey = null
      }, 0)
    },
    [],
  )
  useLayoutEffect(() => {
    /* The profile's pills share one key; arriving at it from another tab still opens at the top, as /account does. */
    if (!opensAtTop(key === "profile" ? "/account" : key)) {
      lastAccountKey = key
      return
    }
    if (accountScrollPinPaused()) {
      const y = accountPinnedScroll()
      lastAccountKey = key
      if (y != null && Math.abs(window.scrollY - y) > 2) window.scrollTo(0, y)
      return
    }
    if (lastAccountKey === key) return
    const prev = lastAccountKey
    lastAccountKey = key
    /* First paint of this address: snap, and keep pinning so the router cannot restore a mid-page scroll. Later arrivals ease up. */
    return scrollPageToTop({ smooth: prev !== null, frames: 14 })
  }, [key])
}
