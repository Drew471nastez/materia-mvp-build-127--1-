"use client"

/**
 * ===========================================================================
 *  SOMETHING HAPPENS THE MOMENT YOU PRESS
 * ===========================================================================
 * "I click a product card and there is no sign that I clicked on it."
 *
 * The navigation itself is a client one now, so the next page's skeleton does
 * arrive — but only once the router has something to show. In between there
 * is a gap, and on a slow connection the gap is most of a second of a card
 * sitting there looking untouched. A person's second press during that gap is
 * not impatience; it is the interface failing to answer the first one.
 *
 * `useLinkStatus` is Next's own answer: it reports whether the <Link> this is
 * rendered inside is currently navigating. It only works inside a real Link,
 * which is exactly where this is used, and it reports nothing anywhere else —
 * so on the native shell, where SmartLink navigates with the router instead,
 * this quietly renders nothing rather than lying.
 *
 * WHY A BAR AND NOT A SPINNER. A spinner in the middle of a product's picture
 * covers the thing being pressed and reads as an error state. A line across
 * the top is the pattern every browser already uses for "this is loading",
 * and it does not move the layout by a pixel.
 */
import { useLinkStatus } from "next/link"

export function NavPending() {
  const { pending } = useLinkStatus()
  if (!pending) return null
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-0 z-20 h-[3px] overflow-hidden"
    >
      <span className="nav-pending-bar block h-full w-1/3 rounded-full bg-foreground/70" />
    </span>
  )
}
