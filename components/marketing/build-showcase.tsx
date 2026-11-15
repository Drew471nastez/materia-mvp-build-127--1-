"use client"

import type { CSSProperties } from "react"
import { useShowcaseMotion } from "./use-showcase-motion"
import { useShowcaseField } from "./showcase-field"
import { StoryHeading } from "./story-heading"
/*
  TWELVE STORELIB PAGES, AS FOUR WIDE–ONEPAGE–WIDE GROUPS (wave 14 and
  landing round 2, merged). Each group is a store or website, a OnePage and
  a community, so every swipe shows all three things Storelib makes, for
  fictional creators who sell what real Storelib creators sell. The stores
  are drawn in the layout of a real Storelib creator store, the websites as
  sites built on Storelib, the OnePages each in its own theme, and the
  communities are
  Storelib's own member frame and feed (components/community/member)
  rendered with a fictional community's data and photographed at 2x.
  Satori Studio is a real OnePage, storelib.me/satori-studio, as a phone
  shows it. Photographs are Unsplash.

  LANDING ROUND 4 (the owner): Gia Romano's page made again, higher quality
  and truer to the real thing, and Kai Moreno (prints, the Gallery theme)
  new, PublicOnePage itself, rendered with fixture data in a dev-only route
  that is not committed, captured at the sizes below. The Long Draft
  (ThemePage) is round 2's capture.

  EACH CARD IS ITS PICTURE'S OWN SHAPE, 10% taller than round 60's: the wide
  pictures are 1440 x 990 and the OnePages 540 x 1056, so a picture fills its
  card with no bars and nothing cropped. At one height they are 1.4545 and
  0.5114 wide, which is still 256fr 90fr 256fr.

  THE CAPTION (three words at most, the owner) waits for a pointer to rest
  on the picture (a mouse or a pen: hover and a fine pointer), then fades
  in.

  LANDING ROUND 6, THE OWNER: "when I hover, the text there on mobile
  devices and desktop gets overlapped". The caption was laid over the bottom
  of the picture and the section cut the cards' bottom, so the line ran into
  the picture and the section's edge. Now the caption has a line of its own
  under the picture, inside the card's box, and the whole card sits inside
  the section with room under it: nothing can land on anything. With a mouse
  it still waits for the hover; on a touch screen, where there is no hover,
  it is simply there, under its card.

  LANDING ROUND 8, THE OWNER: Plainspace's store has a new cover, bold and
  clean (black, its line in heavy type, the Life OS planner beside it). The
  nail artist, the coffee subscription and the language club are gone (the
  owner did not like them). In their places, Mara
  Lind (a Pilates teacher's bookings, the Sage theme) and Luca Brandt (a
  colourist's Grade Club subscription and the Cine Tones LUT Pack, Graphite,
  as a laptop shows it) are PublicOnePage itself, and Seed & Soil (growing
  food in small spaces) is Storelib's own member frame and feed, each
  rendered with fixture data from a scratch entry that is not committed and
  photographed at the sizes below. Photographs are Unsplash.

  LANDING ROUND 9, THE OWNER: "Do not show OnePages as 4:3. Keep OnePages as
  they are and adapt all the stores and websites there to fit a 4:3 ratio
  because they're not fitting well." On a phone a OnePage card is now the
  page's own shape (540 x 1056, as on a desktop), and every store, website
  and community has a second picture made for the phone's 4:3 card
  (m-<brand>-640/960.webp, 4:3 files, so the card crops nothing): the two
  drawn sites photographed again in a 4:3 window, Plainspace without its
  empty margins, The Long Draft and Second Shift with their own page carried
  on underneath, and the three community frames, which fill their window
  edge to edge, fitted across (6%). "I don't like the 'Get strong, not just
  tired' image: add something else, more smooth, more clean": Hale Strength
  is gone and Studio Marlow, an interior stylist's guides and consults, is in
  its place. "I don't like the Luca Brandt one; that should display in 4:3":
  Luca's OnePage stood on a wide screen is now his website, drawn for both
  shapes. Every picture also has a file for the size it is drawn at (srcset),
  so a phone decodes a third of the pixels it did.
*/
const wide = (brand: string, label: string, alt: string) => ({
  src: `/home/showcase/a-${brand}.webp`,
  /* A desktop card is 43% of the rail: 720 wide for 1x, 1440 for 2x. */
  srcSet: `/home/showcase/a-${brand}-720.webp 720w, /home/showcase/a-${brand}.webp 1440w`,
  sizes: "(min-width: 2020px) 780px, 39vw",
  /* A phone's card is 4:3, 78vw: its own 4:3 picture, 640 wide for 2x and 960 for 3x. */
  phoneSrcSet: `/home/showcase/m-${brand}-640.webp 640w, /home/showcase/m-${brand}-960.webp 960w` as string | undefined,
  alt,
  label,
  format: "wide",
  width: 1440,
  height: 990,
  tone: undefined as string | undefined,
})
/* tone: the OnePage's own background a shade deeper: the card's ground until its picture is in. */
const portrait = (brand: string, label: string, alt: string, tone: string) => ({
  src: `/home/showcase/a-${brand}.webp`,
  /* A OnePage card is about 190px across on a phone and on a desktop: 360 wide for 2x, 540 for 3x. */
  srcSet: `/home/showcase/a-${brand}-360.webp 360w, /home/showcase/a-${brand}.webp 540w`,
  sizes: "(max-width: 767px) 50vw, (min-width: 2020px) 274px, 14vw",
  phoneSrcSet: undefined as string | undefined,
  alt,
  label,
  format: "portrait",
  width: 540,
  height: 1056,
  tone,
})
/* Every caption is three words at most (the owner, waves 13 and 14). */
const GROUPS = [
  [
    wide("plainspace", "Sell Notion templates", "Plainspace's Storelib store under a black cover, Your whole week. One calm page.: Mina Cho's Life OS, Content Calendar Pro and Freelance Client Hub Notion templates"),
    portrait("satori", "Your creative portfolio", "Satori Studio's OnePage: Stefan's portrait and bio with links to his portfolio, WhatsApp and LinkedIn", "#1a1a1d"),
    wide("seedsoil", "Run a community", "Seed & Soil, a community for growing food in small spaces on Storelib: a pinned sowing guide for November, a member's tray of pea shoots and the winter seed swap"),
  ],
  [
    wide("marlow", "Sell design guides", "Studio Marlow, interior stylist Anouk Marlow's website: a yellow armchair in a calm room, her Small Living Room Guide for $24 and a one room consult"),
    portrait("gia", "Sell your cookbook", "Gia Romano's OnePage: her Pasta Sunday ebook for $18, a tagliatelle class on Saturday and photos of her dishes", "#f1e9cc"),
    wide("pinchgrip", "Host meetups", "Pinch Grip Club, a women's climbing community in Sheffield on Storelib: a pinned Stanage meetup, a trip report with photos and the Wednesday bouldering social"),
  ],
  [
    wide("draft", "Teach a course", "The Long Draft's Storelib website: a ten-week novel writing course for £240 and three shorter clinics"),
    portrait("kai", "Sell your prints", "Kai Moreno's OnePage, a landscape photographer: signed A3 prints for $65 and a photo walk in Lisbon", "#e6e4dc"),
    wide("nightshift", "Build a club", "Night Shift Devs, an indie game dev community on Storelib in the dark look: the pinned jam theme, a member's devlog and the jam kickoff stream"),
  ],
  [
    wide("luca", "Sell subscriptions", "Luca Brandt's website, a colourist in Berlin: a graded desert road, Grade Club for $9 a month, the Cine Tones LUT Pack and a guide to grading night exteriors"),
    portrait("mara", "Fill your bookings", "Mara Lind's OnePage, a Pilates teacher in Brooklyn: book a private session, photos of her classes, a home program and a class pack", "#b9c6ad"),
    wide("shift", "Drop new merch", "Second Shift's Storelib website: a streetwear drop of a court set, tees and a cap, from $32, under a yellow announcement bar"),
  ],
]
export const SHOWCASE_EXAMPLES = GROUPS.flat()
export const SHOWCASE_HEADING = "Build your page, sell your products, and manage everything in one place."

/** Each desktop page is a complete wide–OnePage–wide composition. */
export function BuildShowcase() {
  const track = useShowcaseMotion()
  const field = useShowcaseField()
  return (
    <section
      className="build-showcase"
      aria-labelledby="build-showcase-title"
      data-build-showcase=""
      data-own-look=""
      data-showcase-pristine=""
      suppressHydrationWarning
    >
      <style>{CSS}</style>
      <p id="build-showcase-help" className="build-showcase-help">
        Drag or swipe to browse. Use arrow keys to move and Space to pause or
        resume automatic movement.
      </p>
      {/* Landing round 9: under a mouse the dots near it light a little (showcase-field.ts). The still dots are the section's own background. */}
      <div ref={field} className="build-showcase-field" aria-hidden="true">
        <canvas />
      </div>
      <div className="build-showcase-card">
        <div className="build-showcase-top">
          {/* Wave 13: inked by the scroll like every other StoryHeading (the showcase flag only marks its words). */}
          <StoryHeading
            id="build-showcase-title"
            text={SHOWCASE_HEADING}
            accent={["everything"]}
            dark
            showcase
          />
        </div>
        <div
          className="build-showcase-viewport"
          data-story-reveal=""
          data-story-visible="true"
        >
          <div
            ref={track}
            className="build-showcase-track"
            suppressHydrationWarning
            data-showcase-count={GROUPS.length}
            role="region"
            aria-roledescription="carousel"
            aria-label="What you can build with Storelib"
            tabIndex={0}
            aria-describedby="build-showcase-help"
          >
            {GROUPS.map((group, index) => (
              <div
                className="build-showcase-group"
                data-showcase-group=""
                key={index}
              >
                {group.map((example, at) => {
                  /* The first two cards are what a phone shows first: in the page's first load, ahead of the rest. */
                  const first = index === 0 && at < 2
                  return (
                  <figure
                    className="build-showcase-slide"
                    data-format={example.format}
                    data-showcase-slide=""
                    key={example.label}
                    style={example.tone ? ({ "--showcase-tone": example.tone } as CSSProperties) : undefined}
                  >
                    <picture className="build-showcase-pic">
                      {example.phoneSrcSet ? <source media="(max-width: 767px)" srcSet={example.phoneSrcSet} sizes="78vw" width={960} height={720} /> : null}
                      {/* Optimized Storelib page renders and one real OnePage screenshot; no full-size third-party downloads. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={example.src}
                        srcSet={example.srcSet}
                        sizes={example.sizes}
                        alt={example.alt}
                        width={example.width}
                        height={example.height}
                        loading={first ? "eager" : "lazy"}
                        fetchPriority={first ? "high" : "auto"}
                        decoding="async"
                        draggable={false}
                      />
                    </picture>
                    <figcaption>{example.label}</figcaption>
                  </figure>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

/*
  THE CORNERS (wave 13, the owner's image 29). Measured there: the section
  is a near black, its top corners are a radius of about 2.8% of the width
  (40px at 1440, never under 24px on a phone), and a 1px highlight of about
  6% white runs along the top edge and round the curve, fading as the curve
  turns down, with nothing down the sides. That is an inset shadow 1px down:
  it follows the radius by itself and takes no width. The section overlaps
  the hero by its radius, so what shows round each corner is the hero.
*/
const CSS = `
/* Landing round 9: the still dots, one every 28px on the dark ground, 5% white (the same grid showcase-field.ts lights under a mouse). */
.build-showcase::before {content:"";position:absolute;inset:0;z-index:0;pointer-events:none;background-image:radial-gradient(circle at 1px 1px,rgba(255,255,255,.05) 0,rgba(255,255,255,.05) .7px,transparent 1.3px);background-size:28px 28px}
.build-showcase-field {position:absolute;inset:0;z-index:0;overflow:hidden;pointer-events:none}
.build-showcase-field canvas {position:absolute;left:0;top:0;width:380px;height:380px}
@media(hover:none),(pointer:coarse),(prefers-reduced-motion:reduce){.build-showcase-field{display:none}}
.build-showcase {--showcase-radius:clamp(24px,2.78vw,48px);display:flow-root;position:relative;z-index:2;overflow:hidden;overflow:clip;margin:calc(var(--showcase-radius)*-1) 0 40px;color:#fafafa;background:#050506;border-radius:var(--showcase-radius);box-shadow:inset 0 1px 0 rgba(255,255,255,.065),0 -8px 32px rgba(0,0,0,.08)}
/* Landing round 6: the cards end inside the section, their caption line under them and room below it (round 5 ran them past the bottom edge, which cut the captions). Round 7, the owner: "the bottom padding is too short": under the caption line now as much room as between the heading and the cards and a little more for the rounded corners (78px at 1440, 96 from 1780). */
.build-showcase-card {position:relative;z-index:1;width:100%;max-width:var(--showcase-max,2020px);margin:0 auto;padding:clamp(72px,7vw,112px) 0 clamp(52px,5.4vw,96px)}
.build-showcase-top {margin:0 calc(var(--showcase-gutter,clamp(20px,5.15vw,84px)) + var(--landing-card-inset,14px)) clamp(38px,4.8vw,65px)}
.build-showcase h2 {max-width:none;margin:0;font-size:clamp(32px,3.4vw,58px);text-wrap:balance;line-height:1.13}
.build-showcase .story-heading {--story-muted:#66666e}
.build-showcase-help {position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
/* Landing round 9: no fading mask on the rail (a mask over a moving layer is drawn again every frame of a drag); the rail is cut at the gutter. */
.build-showcase-viewport {position:relative;overflow:hidden;margin-inline:var(--showcase-gutter,clamp(20px,5.15vw,84px))}
/*
  THE RAIL. Before the script it is the browser's own horizontal scroller
  with snapping, so it scrolls with no script at all. Once the script is
  there (data-rail-ready, use-showcase-motion.ts) the rail is one transform
  on every screen, moved by the finger and the mouse alike (landing round 8:
  round 5's native snap on phones needed a long swipe before a card let go).
  touch-action: pan-y leaves a vertical swipe to the page and hands a sideways
  one to the script at once (round 9, rail-gesture.ts). overscroll-behavior
  keeps a sideways swipe at either end from turning into the back gesture.
*/
.build-showcase-track {--showcase-gap:16px;position:relative;display:flex;gap:24px;overflow-x:auto;overflow-y:hidden;scrollbar-width:none;cursor:grab;touch-action:pan-x pan-y pinch-zoom;overscroll-behavior-x:contain;scroll-snap-type:x mandatory;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}
.build-showcase-track[data-rail-ready] {overflow:visible;touch-action:pan-y pinch-zoom;overscroll-behavior-x:none;scroll-snap-type:none;will-change:transform;backface-visibility:hidden}
.build-showcase-track:focus-visible {outline:2px solid #bca3ff;outline-offset:4px}
.build-showcase-track::-webkit-scrollbar {display:none}
.build-showcase-track[data-dragging] {cursor:grabbing}
.build-showcase-group {display:grid;grid-template-columns:256fr 90fr 256fr;gap:var(--showcase-gap);align-items:start;flex:0 0 100%;width:100%;padding:10px var(--landing-card-inset,14px) 0;min-width:0;box-sizing:border-box;scroll-snap-align:start;scroll-snap-stop:normal}
.build-showcase-slide {position:relative;min-width:0;width:100%;margin:0}
.build-showcase-pic {display:block;position:relative;width:100%;aspect-ratio:1440/990;margin:0;border-radius:7px;contain:paint;background:var(--showcase-tone,#151517);overflow:hidden}
.build-showcase-slide[data-format="portrait"] .build-showcase-pic {aspect-ratio:540/1056}
.build-showcase-pic img {display:block;width:100%;height:100%;object-fit:cover;pointer-events:none;-webkit-user-drag:none}
/*
  THE CAPTION: a line of its own under the picture (landing round 6), one
  line high whether it shows or not, so showing it moves nothing and covers
  nothing. With a mouse it is away until the mouse rests on the card, then
  fades in as one opacity (round 9: no standing layer for each caption);
  while the rail is dragged it stays away. A touch screen has no hover, so there it is
  always shown.
*/
.build-showcase-slide figcaption {height:44px;padding-top:14px;box-sizing:border-box;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-size:15px;font-weight:500;line-height:20px;letter-spacing:-.005em;color:#d4d4d8;opacity:0;pointer-events:none;transition:opacity 380ms cubic-bezier(.33,0,.2,1)}
@media(hover:hover) and (pointer:fine){.build-showcase-track:not([data-dragging]) .build-showcase-slide:hover figcaption{opacity:1;transition-duration:460ms}}
@media(hover:none),(pointer:coarse){.build-showcase-slide figcaption{opacity:1;transition:none}}
/* Landing round 9: each picture fades in on its own card once it is decoded (data-shown, use-showcase-motion.ts); the card keeps its place and its ground meanwhile. Hidden only once the script is there to show them; one that was already there is shown without a fade. */
.build-showcase-track[data-rail-ready] .build-showcase-pic img {opacity:0;transition:opacity 420ms cubic-bezier(.33,0,.2,1)}
.build-showcase-track[data-rail-ready] .build-showcase-pic img[data-shown] {opacity:1}
.build-showcase-track[data-rail-ready] .build-showcase-pic img[data-shown="now"] {transition:none}
/*
  ON A PHONE, LANDING ROUND 6 (the owner's reference, a store showcase in a
  phone's browser): a store or website is a 4:3 landscape card, 78% of the
  screen wide, its left edge on the heading's gutter, the next one peeking in
  on the right, 10px apart. The rail has hard edges: no fading mask.
  LANDING ROUND 8, THE OWNER: a OnePage is a phone page, so on a phone it is a
  tall card, not a phone screen stood inside a landscape card, its top on
  the 4:3 cards' tops.
  LANDING ROUND 9, THE OWNER: "Keep OnePages as they are", the page's own
  shape as on a desktop (540 x 1056, where round 8 cut it to 9:16), and the
  4:3 cards get pictures made for 4:3 (the phone's <source>), so neither
  shape crops its picture.
*/
@media(max-width:767px){.build-showcase{--showcase-card:min(78vw,440px)}.build-showcase-card{padding:64px 0 clamp(44px,12vw,64px)}.build-showcase-top{margin-inline:var(--showcase-gutter)}.build-showcase h2{font-size:clamp(30px,8vw,36px)}.build-showcase-viewport{margin-inline:0}.build-showcase-track{--showcase-gap:10px;gap:var(--showcase-gap);align-items:flex-start;padding-inline:var(--showcase-gutter);scroll-padding-inline:var(--showcase-gutter)}.build-showcase-group{display:contents}.build-showcase-slide{flex:0 0 var(--showcase-card);width:var(--showcase-card);scroll-snap-align:start;scroll-snap-stop:normal}.build-showcase-pic{aspect-ratio:4/3;border-radius:8px}.build-showcase-pic img{object-position:50% 0}.build-showcase-slide[data-format="portrait"]{flex-basis:calc(var(--showcase-card)*.6328);width:calc(var(--showcase-card)*.6328)}.build-showcase-slide[data-format="portrait"] .build-showcase-pic{aspect-ratio:540/1056}.build-showcase-slide figcaption{height:38px;padding-top:12px;font-size:14px;line-height:18px;color:#a1a1aa}}
@media(prefers-reduced-motion:reduce){.build-showcase-track[data-rail-ready] .build-showcase-pic img{opacity:1;transition:none}.build-showcase-slide figcaption{transition:none}}
`
