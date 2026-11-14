"use client"

import { useShowcaseMotion } from "./use-showcase-motion"
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

  LANDING ROUND 4 (the owner): Gia Romano's and Bea's pages made again,
  higher quality and truer to the real thing, and Kai Moreno (prints, the
  Gallery theme) and Northline Coffee (a subscription, the Terrazzo theme,
  as a laptop shows it) are new. All four are PublicOnePage itself, rendered
  with fixture data in a dev-only route that is not committed, captured at
  the sizes below. The yoga website, the surf coach, the sample pack store
  and the sourdough community are gone; The Long Draft (ThemePage) and
  Charla Circle (the member frame), round 2's captures, take two places.

  EACH CARD IS ITS PICTURE'S OWN SHAPE, 10% taller than round 60's: the wide
  pictures are 1440 x 990 and the OnePages 540 x 1056, so a picture fills its
  card with no bars and nothing cropped. At one height they are 1.4545 and
  0.5114 wide, which is still 256fr 90fr 256fr.

  THE CAPTION (three words at most, the owner) waits for a pointer to rest
  on the picture (a mouse or a pen: hover and a fine pointer), then fades
  in; on a touch screen the pictures stand on their own and the caption is
  read by assistive technology only.
*/
const wide = (brand: string, label: string, alt: string) => ({
  src: `/home/showcase/a-${brand}.webp`,
  alt,
  label,
  format: "wide",
  width: 1440,
  height: 990,
})
const portrait = (brand: string, label: string, alt: string) => ({
  src: `/home/showcase/a-${brand}.webp`,
  alt,
  label,
  format: "portrait",
  width: 540,
  height: 1056,
})
/* Every caption is three words at most (the owner, waves 13 and 14). */
const GROUPS = [
  [
    wide("plainspace", "Sell Notion templates", "Plainspace's Storelib store: Mina Cho's Life OS, Content Calendar Pro and Freelance Client Hub Notion templates with dashboard previews"),
    portrait("satori", "Your creative portfolio", "Satori Studio's OnePage: Stefan's portrait and bio with links to his portfolio, WhatsApp and LinkedIn"),
    wide("charla", "Run a community", "Charla Circle, a conversation club on Storelib: a pinned post for Thursday's call, a member's small win and the next online meetup"),
  ],
  [
    wide("hale", "Sell training programs", "Hale Strength, coach Marcus Hale's website with a lifter at the squat rack, a workout log and four strength programs"),
    portrait("gia", "Sell your cookbook", "Gia Romano's OnePage: her Pasta Sunday ebook for $18, a tagliatelle class on Saturday and photos of her dishes"),
    wide("pinchgrip", "Host meetups", "Pinch Grip Club, a women's climbing community in Sheffield on Storelib: a pinned Stanage meetup, a trip report with photos and the Wednesday bouldering social"),
  ],
  [
    wide("draft", "Teach a course", "The Long Draft's Storelib website: a ten-week novel writing course for £240 and three shorter clinics"),
    portrait("kai", "Sell your prints", "Kai Moreno's OnePage, a landscape photographer: signed A3 prints for $65 and a photo walk in Lisbon"),
    wide("nightshift", "Build a club", "Night Shift Devs, an indie game dev community on Storelib in the dark look: the pinned jam theme, a member's devlog and the jam kickoff stream"),
  ],
  [
    wide("northline", "Sell subscriptions", "Northline Coffee's OnePage on a wide screen: a coffee subscription for $18 a month and two bags of beans"),
    portrait("bea", "Fill your bookings", "Nails by Bea, a nail artist's OnePage: Book an appointment, her work and two press-on sets"),
    wide("shift", "Drop new merch", "Second Shift's Storelib website: a streetwear drop of a court set, tees and a cap, from $32, under a yellow announcement bar"),
  ],
]
export const SHOWCASE_EXAMPLES = GROUPS.flat()
export const SHOWCASE_HEADING = "Build your page, sell your products, and manage everything in one place."

/** Each desktop page is a complete wide–OnePage–wide composition. */
export function BuildShowcase() {
  const track = useShowcaseMotion()
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
                {group.map((example) => (
                  <figure
                    className="build-showcase-slide"
                    data-format={example.format}
                    data-showcase-slide=""
                    key={example.label}
                  >
                    {/* Optimized Storelib page renders and one real OnePage screenshot; no full-size third-party downloads. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={example.src}
                      alt={example.alt}
                      width={example.width}
                      height={example.height}
                      loading="lazy"
                      decoding="async"
                      draggable={false}
                    />
                    <figcaption>{example.label}</figcaption>
                  </figure>
                ))}
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
.build-showcase {--showcase-radius:clamp(24px,2.78vw,48px);display:flow-root;position:relative;z-index:2;overflow:hidden;overflow:clip;margin:calc(var(--showcase-radius)*-1) 0 40px;color:#fafafa;background:#050506;border-radius:var(--showcase-radius);box-shadow:inset 0 1px 0 rgba(255,255,255,.065),0 -8px 32px rgba(0,0,0,.08)}
.build-showcase-card {width:100%;max-width:var(--showcase-max,2020px);margin:0 auto;padding:clamp(72px,7vw,112px) 0 0}
.build-showcase-top {margin:0 calc(var(--showcase-gutter,clamp(20px,5.15vw,84px)) + var(--landing-card-inset,14px)) clamp(38px,4.8vw,65px)}
.build-showcase h2 {max-width:none;margin:0;font-size:clamp(32px,3.4vw,58px);text-wrap:balance;line-height:1.13}
.build-showcase .story-heading {--story-muted:#66666e}
.build-showcase-help {position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
.build-showcase-viewport {position:relative;overflow:hidden;margin-inline:var(--showcase-gutter,clamp(20px,5.15vw,84px));margin-bottom:calc(min(100vw,2020px) * -.028);mask-image:linear-gradient(90deg,transparent,#000 14px,#000 calc(100% - 14px),transparent);-webkit-mask-image:linear-gradient(90deg,transparent,#000 14px,#000 calc(100% - 14px),transparent)}
.build-showcase-viewport::after {content:"";position:absolute;inset:0 auto 0 0;width:var(--showcase-gutter,clamp(20px,5.15vw,84px));background:#050506;pointer-events:none;opacity:0;transition:opacity 200ms ease}
@media(max-width:767px){.build-showcase[data-showcase-pristine] .build-showcase-viewport::after{opacity:1}}
/*
  THE RAIL. It is the browser's own horizontal scroller with snapping: before
  the script, and for good on a touch screen or under 768px
  (data-showcase-native, use-showcase-motion.ts, landing round 5), where the
  browser's gesture recogniser and momentum move it and the script only
  plays autoplay. With a mouse from 768px lib/ui/rail-motion takes it
  (data-rail-ready): nothing scrolls natively and each group is moved by a
  transform. overscroll-behavior keeps a sideways swipe at either end from
  turning into the browser's back gesture.
*/
.build-showcase-track {--showcase-gap:16px;position:relative;display:flex;gap:24px;overflow-x:auto;overflow-y:hidden;scrollbar-width:none;cursor:grab;touch-action:pan-x pan-y pinch-zoom;overscroll-behavior-x:contain;scroll-snap-type:x mandatory;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}
.build-showcase-track[data-rail-ready] {overflow:visible;touch-action:pan-y pinch-zoom;overscroll-behavior-x:none;scroll-snap-type:none}
.build-showcase-track:focus-visible {outline:2px solid #bca3ff;outline-offset:4px}
.build-showcase-track::-webkit-scrollbar {display:none}
.build-showcase-track[data-dragging] {cursor:grabbing}
/* The moving boxes keep their own GPU layers for as long as the rail runs (round 61), and the Web Animations that move them (wave 13) run on those same layers: nothing is promoted or dropped at a step. The native rail needs none: the browser scrolls it as one layer. */
.build-showcase-track[data-rail-ready] .build-showcase-group {will-change:transform;backface-visibility:hidden}
.build-showcase-group {display:grid;grid-template-columns:256fr 90fr 256fr;gap:var(--showcase-gap);align-items:center;flex:0 0 100%;width:100%;padding:10px var(--landing-card-inset,14px) 0;min-width:0;box-sizing:border-box;scroll-snap-align:start}
.build-showcase-slide {position:relative;min-width:0;width:100%;height:auto;aspect-ratio:1440/990;margin:0;border-radius:7px;contain:paint;isolation:isolate;background:#151517;overflow:hidden}
.build-showcase-slide[data-format="portrait"] {aspect-ratio:540/1056}
.build-showcase-slide img {display:block;width:100%;height:100%;object-fit:cover;pointer-events:none;-webkit-user-drag:none}
/*
  THE CAPTION: away until a mouse rests on the picture, then the soft dark
  fade and the line come in together as one opacity, on a layer of their own
  (will-change), so showing it repaints nothing; while the rail is dragged
  it stays away. Wave 13 perf: the layers only where a mouse can show the
  caption; a touch screen never does, and a dozen idle layers cost every
  frame of its scroll.
*/
.build-showcase-slide figcaption {position:absolute;inset:auto 0 0;min-height:104px;display:flex;align-items:flex-end;padding:44px 18px 16px;font-size:15px;font-weight:500;line-height:1.3;letter-spacing:-.005em;color:#fff;background:linear-gradient(rgba(0,0,0,0),rgba(0,0,0,.42) 42%,rgba(0,0,0,.78));opacity:0;pointer-events:none;transition:opacity 380ms cubic-bezier(.33,0,.2,1)}
@media(hover:hover) and (pointer:fine){.build-showcase-slide figcaption{will-change:opacity}}
@media(hover:hover) and (pointer:fine){.build-showcase-track:not([data-dragging]) .build-showcase-slide:hover figcaption{opacity:1;transition-duration:460ms}}
/* Round 61: the pictures appear where they are, a fade and nothing else. Hidden only once the script is there to show them. */
.build-showcase-track[data-rail-ready],.build-showcase-track[data-showcase-native] {opacity:0;transition:opacity 650ms cubic-bezier(.25,.1,.25,1)}
.build-showcase-viewport[data-showcase-entered] .build-showcase-track {opacity:1}
/*
  ON A PHONE (wave 13, the owner's image 28): the heading on the gutter, the
  cards in one row from the same left edge, the first one large and the next
  peeking in from the right, 8px apart, each card its picture's shape.

  LANDING ROUND 5 (the owner: the cards "a little bit more big, and positioned
  more to the bottom so they get cut a little bit inside the container, but
  not so much"): on a phone they are 60% of the width tall (51.5% before; a
  wide screen already fills its width, its edges kept on the header's), and
  the section ends inside the cards: no padding under them, and the rail runs
  past the section's bottom edge by about an eighth of a card, which the
  section clips (overflow: clip, its own rounded corners).
*/
@media(max-width:767px){.build-showcase{--showcase-height:clamp(200px,60vw,440px)}.build-showcase-card{padding:64px 0 0}.build-showcase-top{margin-inline:var(--showcase-gutter)}.build-showcase h2{font-size:clamp(30px,8vw,36px)}.build-showcase-viewport{margin-inline:0;margin-bottom:calc(var(--showcase-height) * -.12);mask-image:linear-gradient(90deg,transparent,#000 10px,#000 calc(100% - 10px),transparent);-webkit-mask-image:linear-gradient(90deg,transparent,#000 10px,#000 calc(100% - 10px),transparent)}.build-showcase-track{--showcase-gap:8px;height:var(--showcase-height);gap:var(--showcase-gap);padding-inline:var(--showcase-gutter);scroll-padding-inline:var(--showcase-gutter)}.build-showcase-group{display:contents}.build-showcase-slide,.build-showcase-slide[data-format="portrait"]{height:var(--showcase-height);flex:0 0 auto;min-width:0;width:calc(var(--showcase-height)*1.4545);aspect-ratio:auto;border-radius:5px;scroll-snap-align:start}.build-showcase-slide[data-format="portrait"]{width:calc(var(--showcase-height)*.5114)}}
@media(prefers-reduced-motion:reduce){.build-showcase-track[data-rail-ready]{opacity:1;transition:none}.build-showcase-slide figcaption{transition:none}}
`
