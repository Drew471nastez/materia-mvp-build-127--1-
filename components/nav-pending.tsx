"use client"

/**
 * ===========================================================================
 *  SOMETHING HAPPENS THE MOMENT YOU PRESS
 * ===========================================================================
 * "I click a product card and there is no sign that I clicked on it."
 *
 * The navigation is a client one, and the product route has no loading
 * boundary any more — on purpose. A boundary is not a delay you can tune: the
 * router swaps the page for it the instant a navigation starts, so every tap
 * threw away the grid somebody was reading and replaced it with a grey copy
 * of a page. Without it the router KEEPS the page you are on until the next
 * one is ready, which is right, and leaves exactly one problem: a press with
 * no answer.
 *
 * This is that answer. The gap is most of a second on a slow connection, and
 * a person's second press during it is not impatience; it is the interface
 * failing to answer the first one.
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
