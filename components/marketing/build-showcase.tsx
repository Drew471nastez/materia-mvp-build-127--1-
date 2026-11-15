"use client"

import type { CSSProperties } from "react"
import { useShowcaseMotion } from "./use-showcase-motion"
import { useShowcaseField } from "./showcase-field"
import { StoryHeading } from "./story-heading"
/*
  TWELVE STORELIB PAGES, AS FOUR WIDE–ONEPAGE–WIDE GROUPS (wave 14 and
  landing round 2, merged). Each group is a store or website, a OnePage and
  a community or a third page, for fictional creators who sell what real
  Storelib creators sell. The OnePages are PublicOnePage itself, rendered
  with fixture data in a scratch entry that is not committed and photographed
  as a phone shows them; Satori Studio is a real OnePage,
  storelib.me/satori-studio. Photographs are Unsplash.

  EACH CARD IS ITS PICTURE'S OWN SHAPE: the wide pictures are 1440 x 990 and
  the OnePages 540 x 1056, so a picture fills its card with no bars and
  nothing cropped. At one height they are 1.4545 and 0.5114 wide, which is
  256fr 90fr 256fr. On a phone (landing round 9) every store, website and
  community has a second picture made for the phone's 4:3 card
  (m-<brand>-640/960.webp), and every picture has a file for the size it is
  drawn at (srcset).

  LANDING ROUND 11, THE OWNER, card by card:
  - The interior stylist's site is gone; in its place Ines Duarte, a travel
    creator in Lisbon (guides, presets, photo walks), a drawn site.
  - The Strength Room, the community drawn in the ideas section
    (showcase-mocks/builder-mocks.tsx CommunityMock), photographed at both
    shapes, in place of the climbing club.
  - loudlib, the owner's own sample pack store (loudlib.net), rebuilt from
    the live page in the capture harness (the site turns away a script), in
    place of the writing course.
  - Tideline, the owner's own picture of a surf label's merch store, in place
    of the streetwear drop.
  - The photographer's OnePage is gone; Off the Clock, a podcast's page on the
    Pop theme, in its place.
  - The Storelib app in a hand (public/home/app, the "Run your business from
    anywhere" photograph) in place of the gardening community.
  - Gia Romano's OnePage on a real theme, Sunset (design-tab THEME_TEMPLATES):
    the hero layout, her photo across the top, terracotta and cream.

  THE CAPTION (three words at most, the owner). Round 11, the owner: "the
  text should not be under the card; it should be a bottom fade appearing
  smoothly over the bottom of the card". It is a scrim over the bottom of
  the picture with the words on it: with a mouse it fades in (one opacity,
  the words rising a few px) when the pointer rests on the card; on a touch
  screen, where there is no hover, it is always there.
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
    wide("app", "The Storelib app", "The Storelib app on an iPhone held over a knee in jeans: Good afternoon, Andrew, the week's visitors, revenue and orders, and one order waiting to ship"),
  ],
  [
    wide("ines", "Sell travel guides", "Ines Duarte's website, a travel creator in Lisbon: a yellow tram on a sunny street, her Lisbon City Guide for $19, Portugal Presets, a coast road plan and a Saturday photo walk in Alfama"),
    portrait("gia", "Sell your cookbook", "Gia Romano's OnePage on the Sunset theme, her photo across the top: her Pasta Sunday ebook for $18, a tagliatelle class on Saturday and photos of her dishes", "#8f3b28"),
    wide("strength", "Run a community", "The Strength Room, Rina Castillo's paid strength coaching community on Storelib: its barbell emblem, the community card, the next live form check and the pinned post with the new program"),
  ],
  [
    wide("loud", "Sell sample packs", "loudlib's Storelib store, a sample pack shop in the dark look under a purple sale bar: Serum Presets Vol 1, the Tech House Master Bundle and a drum kit, each as a boxed pack"),
    portrait("otc", "Sell bonus episodes", "Off the Clock's OnePage on the Pop theme, Marcus Bell's podcast: bonus episodes for $5 a month, tickets to a live show in Leeds and season one uncut", "#1d3fd8"),
    wide("nightshift", "Build a club", "Night Shift Devs, an indie game dev community on Storelib in the dark look: the pinned jam theme, a member's devlog and the jam kickoff stream"),
  ],
  [
    wide("luca", "Sell subscriptions", "Luca Brandt's website, a colourist in Berlin: a graded desert road, Grade Club for $9 a month, the Cine Tones LUT Pack and a guide to grading night exteriors"),
    portrait("mara", "Fill your bookings", "Mara Lind's OnePage, a Pilates teacher in Brooklyn: book a private session, photos of her classes, a home program and a class pack", "#b9c6ad"),
    wide("tideline", "Drop new merch", "Tideline's Storelib store, a surf label: its wave logo in black, a Coastal Hoodie for $48, a Surf Tee for $28 and a Breakwater Cap for $22 on light grey"),
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
                    <figcaption>
                      <span>{example.label}</span>
                    </figcaption>
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
  THE CAPTION, LANDING ROUND 11 (the owner: "the text should not be under the
  card; it should be a bottom fade appearing smoothly over the bottom of the
  card with the text"). A scrim over the bottom of the picture, the words on
  it. It takes no room of its own, so showing it moves nothing. With a mouse
  it waits for the pointer to rest on the card, then fades in as one opacity
  while the words rise 8px (a transform): nothing is laid out again; while
  the rail is dragged it stays away. A touch screen has no hover, so there
  the scrim and its words are simply always there.
*/
.build-showcase-slide figcaption {position:absolute;left:0;right:0;bottom:0;z-index:1;display:flex;align-items:flex-end;height:min(46%,136px);padding:0 18px 16px;box-sizing:border-box;border-radius:0 0 7px 7px;background:linear-gradient(to top,rgba(5,5,6,.84) 0%,rgba(5,5,6,.56) 40%,rgba(5,5,6,0) 100%);color:#fafafa;font-size:15px;font-weight:600;line-height:20px;letter-spacing:-.01em;opacity:0;pointer-events:none;transition:opacity 420ms cubic-bezier(.33,0,.2,1)}
.build-showcase-slide figcaption span {display:block;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;transform:translate3d(0,8px,0);transition:transform 560ms cubic-bezier(.22,1,.36,1)}
.build-showcase-slide[data-format="portrait"] figcaption {padding:0 12px 14px;font-size:14px;line-height:18px}
@media(hover:hover) and (pointer:fine){.build-showcase-track:not([data-dragging]) .build-showcase-slide:hover figcaption{opacity:1;transition-duration:480ms}.build-showcase-track:not([data-dragging]) .build-showcase-slide:hover figcaption span{transform:none}}
@media(hover:none),(pointer:coarse){.build-showcase-slide figcaption{opacity:1;transition:none}.build-showcase-slide figcaption span{transform:none;transition:none}}
/*
  THE PICTURES ARRIVE (landing round 9, round 11: "the images appear too
  abruptly and glitchy"). Each picture is shown only once it is decoded
  (data-shown, use-showcase-motion.ts), then eases in: its opacity, and a
  2.5% zoom settling back to 1 (a transform inside the card's clip, so no
  edge of the ground shows). The card keeps its place and its ground
  meanwhile. Hidden only once the script is there to show them; one that was
  already there is shown at once.
*/
.build-showcase-track[data-rail-ready] .build-showcase-pic img {opacity:0;transform:scale(1.025);transition:opacity 620ms cubic-bezier(.33,0,.2,1),transform 1100ms cubic-bezier(.22,1,.36,1)}
.build-showcase-track[data-rail-ready] .build-showcase-pic img[data-shown] {opacity:1;transform:none}
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
  LANDING ROUND 11, THE OWNER: "On mobile, the OnePages in this section
  should have the same height as the 4:3 images." A OnePage card keeps its
  own shape but is as tall as a 4:3 card: 0.75 of the card's width high, so
  0.75 * 540 / 1056 = 0.3835 of it wide.
*/
@media(max-width:767px){.build-showcase{--showcase-card:min(78vw,440px)}.build-showcase-card{padding:64px 0 clamp(44px,12vw,64px)}.build-showcase-top{margin-inline:var(--showcase-gutter)}.build-showcase h2{font-size:clamp(30px,8vw,36px)}.build-showcase-viewport{margin-inline:0}.build-showcase-track{--showcase-gap:10px;gap:var(--showcase-gap);align-items:flex-start;padding-inline:var(--showcase-gutter);scroll-padding-inline:var(--showcase-gutter)}.build-showcase-group{display:contents}.build-showcase-slide{flex:0 0 var(--showcase-card);width:var(--showcase-card);scroll-snap-align:start;scroll-snap-stop:normal}.build-showcase-pic{aspect-ratio:4/3;border-radius:8px}.build-showcase-pic img{object-position:50% 0}.build-showcase-slide[data-format="portrait"]{flex-basis:calc(var(--showcase-card)*.3835);width:calc(var(--showcase-card)*.3835)}.build-showcase-slide[data-format="portrait"] .build-showcase-pic{aspect-ratio:540/1056}.build-showcase-slide figcaption{border-radius:0 0 8px 8px;padding:0 14px 12px;font-size:14px;line-height:18px}.build-showcase-slide[data-format="portrait"] figcaption{height:52%;padding:0 9px 10px;font-size:12px;line-height:15px;letter-spacing:0}.build-showcase-slide[data-format="portrait"] figcaption span{white-space:normal;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}}
@media(prefers-reduced-motion:reduce){.build-showcase-track[data-rail-ready] .build-showcase-pic img{opacity:1;transform:none;transition:none}.build-showcase-slide figcaption,.build-showcase-slide figcaption span{transform:none;transition:none}}
`
