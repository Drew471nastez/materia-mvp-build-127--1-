"use client"

import { useLayoutEffect, useRef } from "react"
import { usePathname } from "next/navigation"

/**
 * One arrival, played the same way every time you change tab.
 *
 * The entrance used to live on the skeletons — `.tab-enter` on
 * profile/loading.tsx and the two beside it — and that is why switching tabs
 * felt inconsistent rather than slow. A skeleton is only shown when Next has
 * nothing cached. Tap Profile once and it renders, animates, and goes into the
 * client router cache for three minutes (see `staleTimes.dynamic` in
 * next.config.mjs); tap it again inside that window and there is no skeleton at
 * all, so nothing animates and the screen hard-cuts. Same finger, same tab, two
 * different behaviours depending on something the user cannot see. That
 * unpredictability is what reads as glitching, far more than any single frame
 * does.
 *
 * Moving it here fixes that by construction. This wraps <main> in the marketing
 * layout, which is above the route and therefore survives the swap, so the
 * animation is attached to THE NAVIGATION rather than to whichever of the two
 * things happened to render. Cached or cold, skeleton or finished page, every
 * tab change looks the same.
 *
 * OPACITY ONLY, and that is a hard constraint rather than a taste. The home
 * feed is `fixed inset-0` (components/explore/mobile-feed.tsx), and a
 * `transform` — or even `will-change: transform` — on any ancestor makes that
 * ancestor the containing block for its fixed descendants. A 0.6% scale on
 * <main> would therefore re-anchor the entire feed for the length of the
 * animation, which is a real jump in exchange for a movement nobody can see.
 * Opacity creates a stacking context but never a containing block, so it is the
 * one composited property that is safe on every tab including this one.
 *
 * It fires on TAB changes only. Opening a listing, a conversation or a seller
 * already has its own transition, and stacking a second fade under those is how
 * you get the doubled entrance this file exists to remove.
 */

/**
 * Which of the five tabs a path belongs to, or null for everything else.
 *
 * `/messages` is the inbox and a tab; `/messages/<id>` is a conversation and a
 * screen — it pushes over the inbox with its own animation and drops the tab
 * bar entirely, so it must not be treated as arriving in a tab. Settings counts
 * as Profile because the tab bar lights Profile for it, and a transition that
 * disagreed with the bar about which tab you were on would be worse than none.
 */
function tabOf(pathname: string): string | null {
  if (pathname === "/") return "home"
  if (pathname.startsWith("/products/new")) return "sell"
  if (pathname === "/messages") return "inbox"
  if (pathname.startsWith("/profile") || pathname.startsWith("/settings")) return "profile"
  return null
}

export function TabTransition({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  const pathname = usePathname()
  const ref = useRef<HTMLElement>(null)
  /** undefined until the first commit — see below. */
  const previous = useRef<string | null | undefined>(undefined)

  // A layout effect, not an effect. This runs after React has committed the new
  // route but BEFORE the browser paints it, so the first painted frame of the
  // arriving tab is already the animation's first frame. In a passive effect
  // the same code lands one frame late, and that frame — the finished page at
  // full opacity, immediately before it drops back to fade in — is a flash.
  useLayoutEffect(() => {
    const tab = tabOf(pathname)
    const from = previous.current
    previous.current = tab

    // Nothing was replaced on the very first commit of the session: this is a
    // page load, not a tab change, and animating it would put a fade over an
    // app that has only just appeared.
    if (from === undefined) return
    // Not a tab, or the same tab (a filter, a query string, a shallow push).
    if (!tab || tab === from) return
    // BOTH ends must be tabs. Coming back to a tab from somewhere that is not
    // one — the feed from a listing, the inbox from a conversation, a profile
    // from a seller page — is a return, and every one of those already plays
    // its own: `.feed-return` on the home feed, the push/return pair on a
    // thread. Firing this on top of them is precisely the doubled animation
    // that moving the entrance up here was meant to end.
    if (from === null) return

    const el = ref.current
    if (!el) return
    // Removed, reflowed, re-added. A CSS animation does not restart just
    // because the class is already there, so tapping Messages → Profile →
    // Messages quickly would play it once and then never again. Reading
    // offsetWidth between the two forces the style flush that makes the browser
    // treat it as a new animation.
    el.classList.remove("tab-arrive")
    void el.offsetWidth
    el.classList.add("tab-arrive")
  }, [pathname])

  return (
    <main ref={ref} className={className}>
      {children}
    </main>
  )
}
