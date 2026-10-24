/**
 * The pictures on storelib.com's front page hero, in one place.
 *
 * Every one is a real Storelib screen with made up content (round AD5): two
 * demo stores shown on a computer and a phone (Pale Hours, streetwear basics,
 * and Ferne, skincare), Halcyon's preset shop, the Wheel & Kiln course, a
 * creator page (Theo Lindqvist, the photographer behind Halcyon), a community
 * seen from inside (Kiln Club), three different people's link in bio pages,
 * the website builder with Pale Hours open and a store's dashboard. Each is
 * on Storelib's own theme and components, photographed by
 * scripts/hero-shots.mjs into public/marketing/hero/. The brands, people,
 * products, posts and the dashboard's figures are invented, and no picture
 * is a photograph: scripts/hero-demo-art.mjs draws them. Run it again after
 * a screen changes; this file names what it made.
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
  { src: `${DIR}/slide-street.webp`, alt: "A demo streetwear store on Storelib, on a computer and a phone" },
  { src: `${DIR}/slide-dashboard.webp`, alt: "The Storelib dashboard with a demo store's week of visitors, revenue and orders" },
  { src: `${DIR}/slide-skin.webp`, alt: "A demo skincare store on Storelib, on a computer and a phone" },
  { src: `${DIR}/slide-community.webp`, alt: "Inside a demo community on Storelib: its spaces and members' posts" },
  { src: `${DIR}/slide-onepage.webp`, alt: "Three demo link in bio pages on Storelib, each in its own theme" },
  { src: `${DIR}/slide-creator.webp`, alt: "A demo photographer's creator page on Storelib, with presets, a course and prints" },
  { src: `${DIR}/slide-presets.webp`, alt: "A demo photographer's preset shop on Storelib, in a dark theme, with a before and after" },
  { src: `${DIR}/slide-editor.webp`, alt: "The Storelib website builder with the demo streetwear store open" },
  { src: `${DIR}/slide-course.webp`, alt: "A demo pottery course's landing page on Storelib, with its lessons" },
]

/** The width and height ratio every slide is drawn at. */
export const HERO_SLIDE_RATIO = 16 / 10

/** The backdrop's pictures: 360 x 450 WebP, 4:5. */
const TILES = [
  "street", "onepage-noor", "skin", "dashboard", "community", "onepage-theo", "presets",
  "course", "editor", "onepage-ana", "street-grid", "skin-desk", "creator",
].map((name) => `${DIR}/tile-${name}.webp`)

/**
 * The dim collage behind the heading. Decoration only, so `alt` stays empty.
 * Thirty two cells fill the panel at every width. Thirteen pictures, stepped
 * by five: no picture sits beside itself or above itself in the grid.
 */
export const HERO_BACKDROP: HeroImage[] = Array.from({ length: 32 }, (_, i) => ({ src: TILES[(i * 5) % TILES.length], alt: "" }))
