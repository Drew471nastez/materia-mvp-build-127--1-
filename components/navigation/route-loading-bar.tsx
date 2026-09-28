"use client"

import { usePathname, useSearchParams } from "next/navigation"
import { Suspense, useEffect, useRef, useState } from "react"

/**
 * ===========================================================================
 *  THE LOADING LINE, AND THE THREE THINGS THAT GOT THE LAST ONE DELETED
 * ===========================================================================
 * There was a violet bar here before. It was removed on the owner's
 * instruction, with three specific complaints, and every one of them is a
 * design fault rather than a matter of taste:
 *
 *   "IT APPEARS WHEN IT DOESN'T MATTER."  It started on every click. Going
 *   back measures 78ms on production — the bar was on screen and gone again
 *   before anyone could read it, which is noise, not feedback.
 *
 *   "IT BLOCKS."  It was a full-width element at the top of the stacking
 *   order, so it sat over the header's own controls.
 *
 *   "IT BUGS."  Photographed stuck at full width across a page that had
 *   finished loading. Its completion was driven by its own animation rather
 *   than by the navigation actually landing, so any navigation that did not
 *   end the way it expected stranded it there forever.
 *
 * So this one is built so that none of the three CAN happen:
 *
 *   IT CANNOT APPEAR WHEN IT DOESN'T MATTER, because nothing is rendered
 *   until a navigation has already been in flight for SHOW_AFTER_MS. Back is
 *   78ms and forward from cache is faster still; neither ever draws anything.
 *   Only a navigation slow enough to need explaining gets a line.
 *
 *   IT CANNOT BLOCK, because it is `pointer-events: none` and two pixels tall.
 *   There is nothing to tap and nothing to tap through.
 *
 *   IT CANNOT STICK, because it is not in charge of its own ending. The
 *   pathname changing is what clears it — that is the navigation landing,
 *   reported by the router rather than guessed — and a hard cap at
 *   GIVE_UP_MS clears it regardless, so even a navigation that never
 *   completes leaves nothing behind.
 *
 * It is white rather than violet. Every route it covers has a dark bar across
 * the top — the platform header on the marketplace, the creator bar on a
 * product page — so a white hairline travelling across it reads the way a
 * browser's own loading line does, which is what was asked for, and it is
 * invisible the moment it is done.
 */

/** Under this, a navigation is fast enough that saying anything is worse. */
const SHOW_AFTER_MS = 220
/** Nothing is allowed to be pending for longer than this, ever. */
const GIVE_UP_MS = 10_000

function RouteLoadingBarInner() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [pendingSince, setPendingSince] = useState<number | null>(null)
  const [visible, setVisible] = useState(false)

  /*
    A CLICK THAT IS GOING TO NAVIGATE, and not any of the several that are
    not. A modified click is the browser's to handle, a new tab does not
    change this document, an external host is a document load with the
    browser's own indicator, and a link to where you already are navigates
    nowhere — each of those starting a bar is the "appears when it doesn't
    matter" complaint in a different costume.
  */
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0) return
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const anchor = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null
      if (!anchor) return
      if (anchor.target && anchor.target !== "_self") return
      if (anchor.hasAttribute("download")) return
      let url: URL
      try {
        url = new URL(anchor.href, window.location.href)
      } catch {
        return
      }
      if (url.origin !== window.location.origin) return
      if (url.pathname === window.location.pathname && url.search === window.location.search) return
      setPendingSince(Date.now())
    }
    /* Capture, so a handler that stops propagation on its way to calling the
       router does not also stop this from knowing a navigation started. */
    document.addEventListener("click", onClick, true)
    return () => document.removeEventListener("click", onClick, true)
  }, [])

  /*
    ═══════════════════════════════════════════════════════════════════════
     AND THE BROWSER'S OWN BACK IS A NAVIGATION TOO
    ═══════════════════════════════════════════════════════════════════════
    "Sometimes trying to go back from a checkout or whatever takes too much
    and blocks." This bar only ever started on a CLICK, so an edge swipe on
    an iPhone, the hardware key on Android and the browser's own arrow
    started nothing at all: whatever the router then did, however long the
    page behind took to come back, the screen said nothing. Filmed with the
    page behind 2.5 seconds away, nothing on screen changed for 2,545ms.

    A popstate is the browser telling us the address has already changed and
    the page for it has not arrived, which is exactly the condition this bar
    is for. `location` is the entry landed on; `pathname` and `searchParams`
    are still the page showing, because the router has not committed yet. If
    they are the same address the entry is one of ours over the page that is
    already up (the search screen's own, a #tab, an editor's guard) and
    nothing is being fetched, so nothing starts.
  */
  /* Read from a ref rather than from the effect's dependencies: useSearchParams hands out a new
     object on some renders, and this must subscribe once rather than on every one of them. */
  const committed = useRef("")
  /* The query through URLSearchParams on both sides, so `?a=b c` and `?a=b%20c` are the one address
     they are: a mismatch here would leave a bar up for a back that fetched nothing. */
  committed.current = `${pathname}?${searchParams?.toString() ?? ""}`
  useEffect(() => {
    const onPop = () => {
      const landed = `${window.location.pathname}?${new URLSearchParams(window.location.search).toString()}`
      if (landed === committed.current) return
      setPendingSince(Date.now())
    }
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [])

  /*
    THE NAVIGATION LANDED. This is the whole reason the previous one could
    stick and this one cannot: the end is reported by the router, not decided
    by the bar. Back and forward clear it here too, because they change the
    pathname exactly the same way.
  */
  useEffect(() => {
    setPendingSince(null)
  }, [pathname, searchParams])

  useEffect(() => {
    if (pendingSince == null) {
      setVisible(false)
      return
    }
    const show = window.setTimeout(() => setVisible(true), SHOW_AFTER_MS)
    const giveUp = window.setTimeout(() => setPendingSince(null), GIVE_UP_MS)
    return () => {
      window.clearTimeout(show)
      window.clearTimeout(giveUp)
    }
  }, [pendingSince])

  if (!visible) return null

  return (
    <div
      aria-hidden
      className="route-loading-bar"
      /* Announced to a screen reader by the page that arrives, not by a
         decorative line. aria-hidden keeps it out of the way entirely. */
    />
  )
}

export function RouteLoadingBar() {
  /*
    useSearchParams needs a Suspense boundary to build. The fallback is null
    rather than a placeholder: this element has no layout — it is fixed and
    two pixels tall — so there is nothing to hold open, and a placeholder
    would be a bar drawn for a reason that has nothing to do with loading.
  */
  return (
    <Suspense fallback={null}>
      <RouteLoadingBarInner />
    </Suspense>
  )
}
