/**
 * The pictures on storelib.com's front page hero, in one place.
 *
 * Swapping in real screenshots is a change to this file only: give an entry a
 * `src` and it is drawn through next/image; leave `src` null and the hero
 * draws a neutral placeholder card of the same size, so nothing moves when the
 * pictures arrive.
 *
 * A `src` must be an address next.config.mjs allows (`images.remotePatterns`,
 * Storelib's own /media/** for example) or a path under /public.
 */

export type HeroImage = {
  /** null draws the placeholder card. */
  src: string | null
  /** What the screenshot shows, for a screen reader. "" for pure decoration. */
  alt: string
  /** Where pressing the centred slide goes. Optional. */
  href?: string
}

/** The storefront slider. Screenshots are 16:10 (1600 x 1000 is a good source size). */
export const HERO_SLIDES: HeroImage[] = [
  { src: null, alt: "A watch maker's product page built on Storelib" },
  { src: null, alt: "A pet food store's product page built on Storelib" },
  { src: null, alt: "A meal kit store's front page built on Storelib" },
  { src: null, alt: "A boxing gear store's product page built on Storelib" },
  { src: null, alt: "A comic book shop built on Storelib" },
  { src: null, alt: "A ceramics studio's store built on Storelib" },
]

/** The width and height ratio every slide is drawn at. */
export const HERO_SLIDE_RATIO = 16 / 10

/**
 * The dim collage behind the heading. Decoration only, so `alt` stays empty.
 * Portrait tiles (4:5); thirty two is enough to fill the panel at every width.
 */
export const HERO_BACKDROP: HeroImage[] = Array.from({ length: 32 }, () => ({ src: null, alt: "" }))
