"use client"

import { useEffect, useLayoutEffect, useRef } from "react"
import { usePathname } from "next/navigation"
import { markNavigated } from "@/lib/session-nav"
import { endTabLeave, isTabLeaving } from "@/lib/tab-leave"

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
 * Opacity is inherited by the entire subtree, and that used to exclude HOME
 * from this entirely: the feed rendered its own copy of the tab bar INSIDE
 * <main>, so fading <main> there would have dimmed the bar under the finger
 * that had just pressed it, and a descendant cannot opt out of an ancestor's
 * opacity. There is one bar now, mounted by the layout as a sibling of <main>
 * on every route (see global-mobile-nav.tsx), so the exception is gone and all
 * five tabs arrive the same way — which was the point of moving the animation
 * up here in the first place.
 *
 * It fires between TABS only. Opening a listing, a conversation or a seller
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

    // THE FIRST THING, ahead of every guard below.
    //
    // The bar marks the document on pointerdown and this is the only thing that
    // takes the mark off. A commit means the leave is over, whatever it landed
    // on — and "whatever" includes every case the guards below decline to
    // animate. Leaving it to them meant that tapping Profile from a listing (a
    // `from === null` return, two screens down) armed the dip and then returned
    // without releasing it, so the whole app sat at 86% until the give-up timer
    // in lib/tab-leave.ts noticed a second and a half later.
    //
    // Releasing here is also what makes the arrival free: the screen is already
    // partway down and already moving, so the transition simply carries on in
    // the other direction. Nothing is set, nothing snaps, and an arrival that
    // interrupts a previous one reverses from wherever it had got to.
    const wasLeaving = isTabLeaving()
    endTabLeave()

    // Nothing was replaced on the very first commit of the session: this is a
    // page load, not a tab change, and animating it would put a fade over an
    // app that has only just appeared.
    if (from === undefined) return

    // Past this line the app has definitely moved. Recorded for anything that
    // needs to tell a cold start from a navigation — the home feed's entry
    // curtain does, and got it wrong. See lib/session-nav.ts.
    markNavigated()
    // Not a tab, or the same tab (a filter, a query string, a shallow push).
    if (!tab || tab === from) return
    // BOTH ends must be tabs. Coming back to a tab from somewhere that is not
    // one — the feed from a listing, the inbox from a conversation, a profile
    // from a seller page — is a return, and every one of those already plays
    // its own: `.feed-return` on the home feed, the push/return pair on a
    // thread. Firing this on top of them is precisely the doubled animation
    // that moving the entrance up here was meant to end.
    if (from === null) return

    // The bar already started this one and the release above is the whole of
    // the arrival: the screen is mid-dip and now heading back up. Touching it
    // again here would be the snap this rewrite exists to remove.
    if (wasLeaving) return

    // Nothing started it — a redirect, a back gesture, a router.push from
    // somewhere that is not the tab bar. There is no dip in progress to
    // continue, so one is created and immediately released.
    //
    // Add, FLUSH, remove, in one synchronous block, and the flush is the entire
    // trick. `.tab-arriving` carries a zero duration, so the first recalculation
    // puts the screen at the dip with no transition at all; taking the class off
    // after it starts the real one from there. Both happen inside this layout
    // effect, which runs after React has committed the new route and before the
    // browser paints it — so the first frame anybody sees is already the first
    // frame of the arrival, and the finished page at full opacity is never
    // shown for the frame before it drops back down.
    //
    // Reading offsetWidth is what forces that recalculation. Without it the
    // browser coalesces add-then-remove into no change whatsoever and there is
    // no transition, which is the same reason the previous animation-based
    // version needed the same line.
    const root = document.documentElement
    root.classList.add("tab-arriving")
    void root.offsetWidth
    root.classList.remove("tab-arriving")
  }, [pathname])

  // Never leave the mark behind on a screen this component no longer owns.
  useEffect(
    () => () => {
      endTabLeave()
      document.documentElement.classList.remove("tab-arriving")
    },
    [],
  )

  return <main className={className}>{children}</main>
}
