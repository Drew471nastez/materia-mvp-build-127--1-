"use client"

import { useEffect, useLayoutEffect, useRef } from "react"
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
 * unpredictability is what reads as glitching, far more than any single frame.
 *
 * So it is driven from here instead: this renders the <main> in the marketing
 * layout, which is above the route and therefore survives the swap, and marks
 * the ROOT ELEMENT for the length of the arrival. Cached or cold, skeleton or
 * finished page, every tab change looks the same.
 *
 * ---------------------------------------------------------------------------
 * Why a class on <html> rather than one on this element
 * ---------------------------------------------------------------------------
 * Because a tab is not only its content. In the app, the strip above it —
 * search and the category rail on the sell form, a bare safe-area spacer on
 * your profile and the inbox — is chrome that belongs to the tab and is a
 * SIBLING of <main>, not a child. Animating only <main> meant the content
 * settled while that strip snapped, which is two different things happening
 * for one tap. The root class lets CSS reach both, so the tab arrives as one
 * piece. See `.tab-arriving` in app/globals.css.
 *
 * ---------------------------------------------------------------------------
 * Why opacity, and why Home is excluded
 * ---------------------------------------------------------------------------
 * `.tab-enter` also carried a 0.6% scale. That is correct on a skeleton and
 * forbidden on <main>: the home feed is `position: fixed`, and a transform on
 * any ancestor makes that ancestor the containing block for its fixed
 * descendants — the whole feed would re-anchor for the length of the
 * animation. A movement nobody can see traded for a jump everybody can.
 * Opacity creates a stacking context but never a containing block.
 *
 * And opacity is inherited by the entire subtree, which is why arriving at HOME
 * does not animate at all. On every other tab the bottom bar is a sibling of
 * <main> and stays solid — but the feed is a full-screen fixed shell that
 * renders ITS OWN copy of the bar, inside <main>. Fading <main> there would
 * fade the tab bar under the finger that just pressed it, and a descendant
 * cannot opt out of an ancestor's opacity. The feed is opaque and covers the
 * screen edge to edge, so it swaps like a native tab controller does — which is
 * the correct behaviour for a full-bleed surface, not a gap in this one.
 *
 * It fires between TABS only. Opening a listing, a conversation or a seller
 * already has its own transition, and stacking a second fade under those is how
 * you get the doubled entrance this file exists to remove.
 */

const ARRIVE_MS = 260

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
  /** undefined until the first commit — see below. */
  const previous = useRef<string | null | undefined>(undefined)
  const clear = useRef<number | undefined>(undefined)

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
    // The feed owns its arrival — and its own tab bar. See the note above.
    if (tab === "home") return

    const root = document.documentElement
    // Removed, reflowed, re-added. A CSS animation does not restart just
    // because the class is already there, so tapping Messages → Profile →
    // Messages quickly would play it once and then never again. Reading
    // offsetWidth between the two forces the style flush that makes the browser
    // treat it as a new animation.
    root.classList.remove("tab-arriving")
    void root.offsetWidth
    root.classList.add("tab-arriving")

    // Taken off again rather than left on. An animation with `both` holds its
    // final frame forever, so a stuck class would leave every element it
    // matches pinned to a computed opacity for the rest of the session — and
    // any later style recalculation on them would be resolving against a rule
    // that has nothing left to say. A timer rather than `animationend`, because
    // an animation that is cancelled mid-flight (by the next tab change) never
    // fires that event.
    window.clearTimeout(clear.current)
    clear.current = window.setTimeout(() => {
      root.classList.remove("tab-arriving")
    }, ARRIVE_MS + 60)
  }, [pathname])

  // Never leave the mark behind on a screen this component no longer owns.
  useEffect(
    () => () => {
      window.clearTimeout(clear.current)
      document.documentElement.classList.remove("tab-arriving")
    },
    [],
  )

  return <main className={className}>{children}</main>
}
