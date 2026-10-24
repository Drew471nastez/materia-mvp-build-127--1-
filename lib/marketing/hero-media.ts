/**
 * The pictures on storelib.com's front page hero, in one place.
 *
 * Every one is a real Storelib screen with made up content: five demo stores
 * (Maison Verlaine, Marrow & Oat, Fennel & Fig, Halcyon, Wheel & Kiln) and a
 * link in bio (Studio Arlo), each on Storelib's theme with its own colours and
 * fonts, photographed by scripts/hero-shots.mjs into public/marketing/hero/.
 * The brands, products and the dashboard's figures are invented. Run it again
 * after a screen changes; this file names what it made.
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

/** The slider, in order: the first is centred when the page opens. 1200 x 750 WebP, 16:10. */
export const HERO_SLIDES: HeroImage[] = [
  { src: `${DIR}/slide-watch.webp`, alt: "A demo watch maker's product page on Storelib, with its strap options and Buy now" },
  { src: `${DIR}/slide-pet.webp`, alt: "A demo dog food store's front page on Storelib" },
  { src: `${DIR}/slide-meal.webp`, alt: "A demo meal kit store's front page on Storelib" },
  { src: `${DIR}/slide-presets.webp`, alt: "A demo photographer's preset shop on Storelib, in a dark theme" },
  { src: `${DIR}/slide-course.webp`, alt: "A demo pottery course's landing page on Storelib, with its lessons" },
  { src: `${DIR}/slide-onepage.webp`, alt: "A demo link in bio page shown in three Storelib themes" },
  { src: `${DIR}/slide-editor.webp`, alt: "The Storelib website builder with the demo meal kit store open" },
  { src: `${DIR}/slide-dashboard.webp`, alt: "The Storelib dashboard with a demo store's week of visitors, revenue and orders" },
]

/** The width and height ratio every slide is drawn at. */
export const HERO_SLIDE_RATIO = 16 / 10

/** The backdrop's pictures: 360 x 450 WebP, 4:5. */
const TILES = [
  "watch", "onepage-sunset", "pet", "dashboard", "meal", "onepage-default", "presets",
  "course", "editor", "onepage-ocean", "pet-grid", "watch-desk", "onepage-sage",
].map((name) => `${DIR}/tile-${name}.webp`)

/**
 * The dim collage behind the heading. Decoration only, so `alt` stays empty.
 * Thirty two cells fill the panel at every width. Thirteen pictures, stepped
 * by five: no picture sits beside itself or above itself in the grid.
 */
export const HERO_BACKDROP: HeroImage[] = Array.from({ length: 32 }, (_, i) => ({ src: TILES[(i * 5) % TILES.length], alt: "" }))
