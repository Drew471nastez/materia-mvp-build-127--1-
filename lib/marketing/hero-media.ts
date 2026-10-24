/**
 * The pictures on storelib.com's front page hero, in one place.
 *
 * Every one is a real Storelib screen with made up content (an invented
 * creator, Juniper Studio, and invented products), photographed by
 * scripts/hero-shots.mjs into public/marketing/hero/. Run it again after a
 * screen changes; this file names what it made.
 *
 * Swapping a picture is a change to this file only: give an entry a `src` and
 * it is drawn; leave `src` null and the hero draws a neutral placeholder card
 * of the same size, so nothing moves when a picture arrives.
 */

export type HeroImage = {
  /** null draws the placeholder card. */
  src: string | null
  /** What the screenshot shows, for a screen reader. "" for pure decoration. */
  alt: string
  /** Where pressing the centred slide goes. Optional. */
  href?: string
}

const DIR = "/marketing/hero"

/** The slider. 1200 x 750 WebP, 16:10. */
export const HERO_SLIDES: HeroImage[] = [
  { src: `${DIR}/slide-store.webp`, alt: "A demo store's front page on Storelib's default theme" },
  { src: `${DIR}/slide-product.webp`, alt: "The same demo store's product page, with Add to cart and Buy now" },
  { src: `${DIR}/slide-onepage.webp`, alt: "One link in bio page shown in three Storelib themes" },
  { src: `${DIR}/slide-creator.webp`, alt: "A demo creator page with its cover, profile and products" },
  { src: `${DIR}/slide-editor.webp`, alt: "The Storelib website builder with the demo store open" },
  { src: `${DIR}/slide-dashboard.webp`, alt: "The Storelib dashboard a creator sees after signing in" },
]

/** The width and height ratio every slide is drawn at. */
export const HERO_SLIDE_RATIO = 16 / 10

/** The backdrop's pictures: 360 x 450 WebP, 4:5. */
const TILES = [
  "store", "onepage-sunset", "dashboard", "product", "onepage-default", "creator", "store-grid",
  "onepage-ocean", "editor", "onepage-sage", "store-desk", "onepage-aurora", "onepage-riso",
].map((name) => `${DIR}/tile-${name}.webp`)

/**
 * The dim collage behind the heading. Decoration only, so `alt` stays empty.
 * Thirty two cells fill the panel at every width. Thirteen pictures, stepped
 * by five: no picture sits beside itself or above itself in the grid.
 */
export const HERO_BACKDROP: HeroImage[] = Array.from({ length: 32 }, (_, i) => ({ src: TILES[(i * 5) % TILES.length], alt: "" }))
