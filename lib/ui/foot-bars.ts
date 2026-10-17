"use client"

/**
 * ===========================================================================
 *  THE SETUP PILL NEVER SITS ON A PAGE'S BOTTOM BAR (round 27)
 * ===========================================================================
 * The owner: the Setup pill at the bottom right of /app "overlaps the Cancel
 * and Save buttons" in the bars at the foot of pages (New community's Back
 * and Next). It was hidden by address on a few pages (Settings, Emails, the
 * editors) and every new bar was a new overlap.
 *
 * ONE RULE NOW. Every bar of actions along the foot of an /app page carries
 * `data-app-foot`: "up" while it is on screen, "down" while it waits out of
 * sight (a save bar with nothing to save). While a bar that is up is drawn
 * (it has a box: a bar hidden at this width by its own `hidden lg:block` has
 * none), the setup pills step aside: they fade out and take no presses, and
 * come back when the bar goes. The bar is the page's job, the pill is a
 * reminder, so the bar keeps the corner.
 *
 * Watched, not polled: a MutationObserver for bars arriving, leaving or
 * changing their word, and a ResizeObserver on each bar for the moment its
 * box comes and goes (a width that hides it, a section the community shell
 * holds hidden). Both are read once per frame at most.
 */
import * as React from "react"

/** The attribute every bottom action bar in /app carries: "up" on screen, "down" waiting. */
export const FOOT_ATTR = "data-app-foot"

/** A bar is up and drawn somewhere under `root`. */
export function footBarUp(root: ParentNode = document): boolean {
  for (const el of root.querySelectorAll(`[${FOOT_ATTR}="up"]`)) if (el.getClientRects().length > 0) return true
  return false
}

/** True while a bottom action bar is on screen. */
export function useFootBarUp(): boolean {
  const [up, setUp] = React.useState(false)
  React.useEffect(() => {
    let frame = 0
    const watched = new Set<Element>()
    const sizes = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => soon())
    const read = () => {
      frame = 0
      for (const el of document.querySelectorAll(`[${FOOT_ATTR}]`)) {
        if (watched.has(el)) continue
        watched.add(el)
        sizes?.observe(el)
      }
      for (const el of watched) {
        if (el.isConnected) continue
        watched.delete(el)
        sizes?.unobserve(el)
      }
      setUp(footBarUp())
    }
    const soon = () => {
      if (!frame) frame = requestAnimationFrame(read)
    }
    const changes = new MutationObserver(soon)
    changes.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: [FOOT_ATTR] })
    read()
    return () => {
      cancelAnimationFrame(frame)
      changes.disconnect()
      sizes?.disconnect()
    }
  }, [])
  return up
}

/** The pills' way of stepping aside: a fade, no presses, gone for a screen reader once faded. */
export const STEP_ASIDE = "pointer-events-none invisible opacity-0"
/** What the pills fade with, both ways. */
export const STEP_ASIDE_MOTION = "transition-[opacity,visibility,background-color] duration-150 ease-out motion-reduce:transition-none"
