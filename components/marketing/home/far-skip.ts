"use client"

/*
  FAR AWAY, NOT DRAWN (the owner: the landing "must not glitch or cost too
  much performance" on a phone).

  Since landing round 12 a built section is never skipped, so every section
  of the home page, all eighteen screens of it, stayed in the page's paint
  for good: about 300 compositor layers at any scroll position (measured at
  390 wide), and on Chrome every frame of a scroll re-layerized and committed
  all of them. Measured with scripts/check-marketing-mobile-perf.mjs at 4x
  CPU, a touch scroll from the top to the foot spent 5.1s in tasks over 50ms,
  and one frame in twenty took 50ms or more.

  Round 12 took the skipping away for two reasons, both kept clear of here:
    - the switch between skipped and drawn was made a few screens ahead and
      undone as soon as the section left, so a fling flipped sections back
      and forth and each flip laid the whole section out again;
    - on an iPhone a section switched to drawn during a fling was painted a
      few frames late and came on screen blank.
  Now a section is skipped only once it is more than FOUR screens away, and
  drawn again once it is within THREE: a section is never switched near the
  screen, the screen between the two lines keeps whatever it had (no flip
  back and forth at one line), and a section reaches the screen three
  screens after it was drawn, rastered and still. The sections at the top of
  the page are never skipped (TOP_KEPT_SCREENS). Its box keeps the height
  it was drawn at (contain-intrinsic-size: auto, with the measured height
  as the guess), so nothing on the page moves when it is skipped.

  content-visibility: auto, never hidden: a skipped section stays in the
  accessibility tree, in find in page, and a link to it (#faq) draws it.
*/

/** A drawn section is skipped once it is wholly further than this from the screen. */
export const FAR_SKIP_AT = "400% 0px 400% 0px"
/** A skipped section is drawn again once any of it is within this of the screen. */
export const FAR_DRAW_AT = "300% 0px 300% 0px"

/**
  A section that starts within this many screens of the page's top is never
  skipped. A jump of the page (not a scroll: the iPhone's tap on the status
  bar, a script) lands on a skipped section a frame before the observer can
  draw it, and the one place a page is jumped to from far away is its top.
  Measured: the first section under the hero, skipped at the foot of the page
  and jumped back to, was drawn a frame late (a layout shift of 0.16).
*/
export const TOP_KEPT_SCREENS = 2

let farWatch: IntersectionObserver | null = null
let nearWatch: IntersectionObserver | null = null

const supported = () =>
  typeof IntersectionObserver === "function" &&
  typeof CSS !== "undefined" &&
  typeof CSS.supports === "function" &&
  CSS.supports("content-visibility", "auto")

function draw(el: HTMLElement) {
  if (el.style.contentVisibility) el.style.contentVisibility = ""
}

/** Skip the section's rendering while it is far from the screen; returns the cleanup. */
export function skipWhenFar(el: HTMLElement): () => void {
  if (!supported()) return () => {}
  farWatch ??= new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const h = e.boundingClientRect.height
        /* An empty box (a section hidden at this width) has nothing to skip. */
        if (e.isIntersecting || h <= 0) continue
        /* Nor one that starts within the page's first screens (see TOP_KEPT_SCREENS). */
        if (e.boundingClientRect.top + window.scrollY < TOP_KEPT_SCREENS * window.innerHeight) continue
        const box = e.target as HTMLElement
        box.style.containIntrinsicSize = `auto ${h}px`
        box.style.contentVisibility = "auto"
      }
    },
    { rootMargin: FAR_SKIP_AT },
  )
  nearWatch ??= new IntersectionObserver(
    (entries) => {
      for (const e of entries) if (e.isIntersecting) draw(e.target as HTMLElement)
    },
    { rootMargin: FAR_DRAW_AT },
  )
  farWatch.observe(el)
  nearWatch.observe(el)
  return () => {
    farWatch?.unobserve(el)
    nearWatch?.unobserve(el)
    draw(el)
  }
}
