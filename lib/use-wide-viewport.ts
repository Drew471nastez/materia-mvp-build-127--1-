"use client"

import { useEffect, useState } from "react"

/**
 * Is this a screen wide enough for two panes?
 *
 * The same 768px Tailwind's `md:` uses, so what this returns and what the CSS
 * decided can never disagree — which matters here more than usual, because the
 * two are used for different halves of the same question. Layout is CSS: both
 * the phone view and the desktop view are in the DOM on the messages screens
 * and the media query picks which one is drawn, so there is no frame where the
 * wrong one is visible and nothing to hydrate around. This hook decides the
 * other half: which of them is allowed to make requests.
 *
 * That split is deliberate. A hidden component is not an inert one — its
 * effects run, its timers fire, its sockets connect — so rendering both views
 * would otherwise mean two inboxes polling, two subscriptions to the same
 * channel and two copies of every refresh, all to draw one list. Gating the
 * NETWORK on this hook while leaving the LAYOUT to CSS gets both properties:
 * nothing flashes, and only the view you can actually see does any work.
 *
 * False on the server and for the first client render, which is correct rather
 * than merely safe: there is no viewport during SSR, and a phone is the answer
 * that costs least if it turns out to be wrong for one frame.
 */
export function useWideViewport(): boolean {
  const [wide, setWide] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)")
    const sync = () => setWide(mq.matches)
    sync()
    mq.addEventListener("change", sync)
    return () => mq.removeEventListener("change", sync)
  }, [])

  return wide
}
