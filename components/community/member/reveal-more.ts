/**
 * ===========================================================================
 *  SHOW MORE: THE NEXT POSTS COME UP INTO VIEW, AND ARRIVE SOFTLY (round 18)
 * ===========================================================================
 * The owner: "for the posts, when I click Show more, it should auto scroll
 * smoothly, and the posts it shows should appear more smoothly."
 *
 * Before, a press on Show more (the feed's "Load more posts", the account's
 * Show more) appended the next page in one frame and left the page where it
 * was: the new posts landed under the finger all at once, the button jumped
 * a screen further down, and the reader had to scroll to find where the new
 * ones began. Now the posts that arrived rise 10px and fade in, one after
 * another (REVEAL_STAGGER_MS apart, the first REVEAL_MAX), and after a press
 * the page glides up so the first new post sits just under the sticky bar,
 * never more than REVEAL_SCROLL_MAX of a screen at once and never upward. A
 * page read by itself near the end (the feed's own read ahead) only fades in:
 * nobody asked for the page to move. Compositor only (opacity, translate, the
 * browser's own smooth scroll); reduced motion gets the posts at once and a
 * plain jump.
 */
export const REVEAL_MS = 280
export const REVEAL_STAGGER_MS = 45
export const REVEAL_RISE_PX = 10
export const REVEAL_MAX = 5
export const REVEAL_EASE = "cubic-bezier(0.22, 1, 0.36, 1)"
/** The most of the screen's height one press scrolls by. */
export const REVEAL_SCROLL_MAX = 0.7
/** The gap kept between the sticky bar and the first new post. */
export const REVEAL_GAP_PX = 12

/** Where the page should go so `top` (a document offset) sits under a bar `inset` tall, moving only down and at most a share of the screen. */
export function revealScrollTarget(top: number, scrollY: number, viewport: number, inset: number): number | null {
  const want = top - inset - REVEAL_GAP_PX
  if (want <= scrollY + 1) return null
  return Math.round(Math.min(want, scrollY + viewport * REVEAL_SCROLL_MAX))
}

/** The sticky chrome's height over the page: the community's bar, else the profile's, else none. */
function stickyInset(): number {
  const css = getComputedStyle(document.documentElement)
  for (const v of ["--community-top", "--profile-chrome"]) {
    const n = parseFloat(css.getPropertyValue(v))
    if (Number.isFinite(n) && n > 0) return n
  }
  return 0
}

/** The items that just arrived: in softly, and, after a press, scrolled up into view. */
export function revealMore(items: HTMLElement[], opts: { scroll: boolean }) {
  if (typeof window === "undefined" || !items.length) return
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  if (!reduce) {
    items.slice(0, REVEAL_MAX).forEach((el, i) => {
      if (typeof el.animate !== "function") return
      el.animate([{ opacity: 0, translate: `0 ${REVEAL_RISE_PX}px` }, { opacity: 1, translate: "0 0" }], { duration: REVEAL_MS, delay: i * REVEAL_STAGGER_MS, easing: REVEAL_EASE, fill: "backwards" })
    })
  }
  if (!opts.scroll) return
  const top = items[0].getBoundingClientRect().top + window.scrollY
  const to = revealScrollTarget(top, window.scrollY, window.innerHeight, stickyInset())
  if (to === null) return
  window.scrollTo({ top: to, behavior: reduce ? "auto" : "smooth" })
}
