import { HeroTypedHeading } from "@/components/marketing/hero-typed-heading"
import { HeroCta } from "@/components/marketing/hero-cta"
import { HeroCarousel } from "@/components/marketing/hero-carousel"
import { HERO_BACKDROP } from "@/lib/marketing/hero-media"
import { HERO_PHRASES } from "@/lib/marketing/hero-typing"

/**
 * storelib.com's front page hero: a dark rounded panel inset from the page
 * under the header, a dim collage of demo Storelib stores behind it, the
 * typed heading, the button and the marketplace search, and the slider of
 * demo stores crossing the panel's bottom edge.
 *
 * A SERVER COMPONENT. The heading's first phrase, the subheading, the button
 * and the search form are in the HTML, so the largest text paint arrives with
 * the document and the page reads the same without JavaScript. Three small
 * client parts do the moving: the typing (hero-typed-heading), the button's
 * label by who is signed in (hero-cta) and the slider (hero-carousel). Every
 * picture is listed in lib/marketing/hero-media.ts.
 *
 * THE SLIDER LEAVES THE PANEL at every width. The panel ends part way down
 * the slides and the slides run to the page's edges, so the hero closes on
 * the pictures rather than on a strip of empty black, and the page below
 * starts right under them. The panel itself does not clip: the collage has
 * its own rounded clip, so the slider can cross the panel's edge.
 *
 * ONE EDGE WITH THE HEADER (round AD5). The panel's sides are the header's
 * content edges (its logo on the left, its last control on the right) at
 * every width, and the text inside is inset from the panel by the header's
 * padding again; scripts/check-home-hero.mjs measures both at 390, 1280 and
 * 1600.
 *
 * ONE LOOK IN BOTH OF THE SITE'S LOOKS. data-own-look keeps the dark look
 * (app/theme-dark.css) off the panel: it turns a near black fill into its
 * graphite, which made the panel, the badge and the search a flat grey.
 *
 * THE ENTRANCE is CSS only, from the first paint: each part rises 10px, 40ms
 * after the one above it, 560ms for all of it. The badge, the subheading and
 * the controls also fade in; the heading and the slides do not, because they
 * are the first and the largest paint. Transform and opacity only, so nothing
 * is laid out twice and nothing shifts; none of it under reduced motion.
 */

const HERO_CSS = `
[data-home-hero] {
  /* The header's own side padding (platform-header-client: px-4 sm:px-6 lg:px-8 in a 1400px row). */
  --hero-pad: 16px;
  --hc-w: min(78vw, 340px);
  --hc-h: calc(var(--hc-w) / 1.6);
  --hc-overlap: calc(var(--hc-h) * 0.46);
}
@media (min-width: 640px) { [data-home-hero] { --hero-pad: 24px; --hc-w: min(56vw, 560px); --hc-overlap: calc(var(--hc-h) * 0.5); } }
@media (min-width: 1024px) { [data-home-hero] { --hero-pad: 32px; --hc-w: min(50vw, 680px); } }
/*
  ONE EDGE WITH THE HEADER (round AD5). The panel's sides are where the
  header's logo and its last button are: the header's padding, and past
  1400px the same centred 1400px row. Percent here is of the page's width,
  as the header's row is, so a scrollbar moves both alike. The text inside
  the panel is inset from the panel by that same padding again.
*/
[data-home-hero] { padding-inline: max(var(--hero-pad), calc((100% - 1400px) / 2 + var(--hero-pad))); }
[data-hero-copy] { padding-inline: var(--hero-pad); }
/* The slider still runs to the page's edges, whatever the panel's inset: the window's width, centred on the panel (the page clips the rest). */
[data-hero-slider] { width: 100vw; margin-inline: calc(50% - 50vw); }
/* The search: a neutral ring when focused, never the accent colour. */
[data-hero-search]:focus { border-color: rgba(255, 255, 255, 0.34); box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 0 0 4px rgba(255, 255, 255, 0.09), 0 6px 18px -8px rgba(0, 0, 0, 0.7); }
.hero-stage {
  height: calc(var(--hc-w) / var(--hc-ratio));
  touch-action: pan-y;
  cursor: grab;
}
.hero-stage[data-dragging] { cursor: grabbing; }
.hero-slide {
  position: absolute;
  top: 0;
  left: 50%;
  width: var(--hc-w);
  margin-left: calc(var(--hc-w) / -2);
  aspect-ratio: var(--hc-ratio);
  border-radius: 12px;
  overflow: hidden;
  background: #eceef1;
  box-shadow: 0 0 0 1px rgba(15, 15, 25, 0.08), 0 22px 44px -18px rgba(10, 10, 22, 0.5);
  will-change: transform, opacity;
  backface-visibility: hidden;
}
/* A slide away from the centre is dimmer: this layer's opacity, set by the
   slider from the same position as the slide's pose, so a slide brightens as
   it arrives in the centre. Its own layer, so a frame only composites. */
.hero-dim {
  position: absolute;
  inset: 0;
  z-index: 1;
  background: #08080b;
  pointer-events: none;
  will-change: opacity;
}
.hero-shimmer::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(100deg, transparent 35%, rgba(255, 255, 255, 0.5) 50%, transparent 65%);
  transform: translateX(-100%);
  animation: hero-shimmer 2.6s ease-in-out infinite;
}
@keyframes hero-shimmer { to { transform: translateX(100%); } }
.hero-stage[data-paused] .hero-shimmer::after { animation-play-state: paused; }
[data-hero-caret] {
  position: absolute;
  left: 0;
  top: 0;
  width: max(2px, 0.07em);
  height: 1em;
  border-radius: 2px;
  background: #a78bfa;
  pointer-events: none;
  will-change: transform;
}
.hero-typed[data-idle] [data-hero-caret] { animation: hero-caret 1.05s ease-in-out infinite; }
@keyframes hero-caret { 0%, 45% { opacity: 1; } 55%, 100% { opacity: 0; } }
@media (prefers-reduced-motion: no-preference) {
  [data-hero-enter] {
    animation: hero-enter 400ms cubic-bezier(0.2, 0.7, 0.2, 1) both;
    animation-delay: calc(var(--enter, 0) * 40ms);
  }
  /* The heading and the slides rise without fading: they are the page's first
     and largest paints, and a paint at opacity 0 does not count as either. */
  [data-hero-enter="rise"] { animation-name: hero-rise; }
}
@keyframes hero-enter { from { opacity: 0; transform: translate3d(0, 10px, 0); } }
@keyframes hero-rise { from { transform: translate3d(0, 10px, 0); } }
@media (prefers-reduced-motion: reduce) {
  .hero-shimmer::after { animation: none; transform: none; opacity: 0.4; }
}
`

const enter = (i: number, rise = false) => ({ "data-hero-enter": rise ? "rise" : "", style: { ["--enter" as string]: i } })

/* Both controls: one height, the header buttons' corner (rounded-action), a solid surface each. Full width and stacked on a phone, side by side from 640px. */
const CONTROL = "h-[52px] w-full rounded-action text-[16px] sm:h-12 sm:text-[15px]"

export function Hero() {
  return (
    <section data-home-hero="" data-own-look="" className="pt-2.5 sm:pt-3" style={{ paddingBottom: "var(--hc-overlap)" }}>
      <style dangerouslySetInnerHTML={{ __html: HERO_CSS }} />
      <div
        data-hero-panel=""
        className="relative isolate flow-root rounded-[26px] bg-[#0e0e10] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06),0_1px_2px_rgba(10,10,20,0.18),0_28px_64px_-30px_rgba(10,10,24,0.55)] sm:rounded-[36px]"
      >
        <Backdrop />

        <div data-hero-copy="" className="relative z-10 mx-auto flex max-w-[860px] flex-col items-center pt-8 text-center sm:pt-14 lg:pt-16">
          <p data-hero-badge="" {...enter(0)} className="inline-flex h-[32px] items-center gap-2 rounded-full border border-white/[0.12] bg-[#1a1a20] pl-[5px] pr-3.5 text-[12.5px] font-medium leading-none text-white/[0.9] shadow-[inset_0_1px_0_rgba(255,255,255,0.1),inset_0_-1px_0_rgba(0,0,0,0.4),0_1px_2px_rgba(0,0,0,0.6),0_10px_24px_-10px_rgba(0,0,0,0.9)]">
            {/* Four tiles in one frame: the store, the links, the courses and the community, in one place. */}
            <span aria-hidden data-hero-badge-icon="" className="flex size-[22px] items-center justify-center rounded-full bg-[#2c2c33] shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_1px_2px_rgba(0,0,0,0.5)]">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <rect x="1" y="1" width="4.25" height="4.25" rx="1.2" fill="#fff" />
                <rect x="6.75" y="1" width="4.25" height="4.25" rx="1.2" fill="#fff" fillOpacity="0.6" />
                <rect x="1" y="6.75" width="4.25" height="4.25" rx="1.2" fill="#fff" fillOpacity="0.6" />
                <rect x="6.75" y="6.75" width="4.25" height="4.25" rx="1.2" fill="#fff" />
              </svg>
            </span>
            All in one platform
          </p>

          <h1 {...enter(1, true)} aria-label={HERO_PHRASES[0].replace(/\.$/, "")} className="mt-4 text-[length:min(30px,7.2vw)] font-bold leading-[1.1] tracking-[-0.025em] text-white sm:mt-5 sm:text-[48px] lg:text-[60px]">
            <HeroTypedHeading className="mx-auto max-w-[12.5em]" />
          </h1>

          <p {...enter(2)} className="mt-3.5 max-w-[30em] text-[15px] leading-[1.55] text-white/[0.82] sm:mt-5 sm:text-[17px]">
            The e-commerce platform for creators & entrepreneurs. Sell products, manage links & grow an audience.
          </p>

          <div data-hero-actions="" {...enter(3)} className="mt-6 flex w-full max-w-[400px] flex-col items-center sm:mt-8 sm:max-w-none">
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
              <HeroCta className={`${CONTROL} inline-flex items-center justify-center gap-2 bg-[#7c3aed] px-5 font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_1px_2px_rgba(0,0,0,0.4)] transition-colors hover:bg-[#6d28d9] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:w-auto sm:min-w-[176px] sm:px-6`} />
              <form action="/explore" method="get" role="search" className="relative w-full sm:w-[260px]">
                <input
                  type="search"
                  name="q"
                  aria-label="Search marketplace"
                  placeholder="Search marketplace ..."
                  autoComplete="off"
                  enterKeyHint="search"
                  data-hero-search=""
                  className={`${CONTROL} block border border-[#2c2c34] bg-[#1c1c22] pl-4 pr-12 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_1px_2px_rgba(0,0,0,0.45)] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-[#a1a1ad] hover:border-[#3a3a44] [&::-webkit-search-cancel-button]:hidden`}
                />
                <button type="submit" aria-label="Search" className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-[#c4c4cc] hover:text-white">
                  <svg aria-hidden width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="7" />
                    <path d="m20 20-3.5-3.5" />
                  </svg>
                </button>
              </form>
            </div>
            {/* True of the Free plan (lib/billing/plans.ts): signing up and selling on it takes no card. */}
            <p data-hero-note="" className="mt-4 text-[13px] text-white/[0.62] sm:text-[13.5px]">Free to start. No card needed.</p>
          </div>
        </div>

        <div
          data-hero-slider=""
          data-hero-enter="rise"
          className="relative z-10 mt-9 [overflow-x:clip] sm:mt-12 lg:mt-14"
          style={{ ["--enter" as string]: 4, marginBottom: "calc(var(--hc-overlap) * -1)" }}
        >
          <HeroCarousel />
        </div>
      </div>
    </section>
  )
}

/**
 * Demo Storelib stores behind the heading, tilted and dimmed well down (the
 * owner, round AC1: 40% darker again), each tile with a hairline and a soft
 * drop so the collage has some depth. Decoration: hidden from screen
 * readers. Hung from the panel's top, not centred on it: centred, it moved
 * whenever the panel's height did (the web font arriving), and one
 * production load measured a layout shift of 0.58 from this grid. The tiles
 * are small WebP files served as they are (a few KB each, repeated), lazy
 * and low priority, so they never compete with the text.
 */
function Backdrop() {
  return (
    <div aria-hidden data-hero-backdrop="" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-[inherit]">
      <div className="absolute left-1/2 -top-36 grid w-[220%] -translate-x-1/2 rotate-[-10deg] grid-cols-6 gap-3 sm:w-[130%] sm:grid-cols-8 sm:gap-4">
        {HERO_BACKDROP.map((tile, i) => (
          <div key={i} className="relative aspect-[4/5] overflow-hidden rounded-[10px] bg-[#1d1d22] shadow-[0_0_0_1px_rgba(255,255,255,0.05),0_14px_30px_-12px_rgba(0,0,0,0.9)]">
            {tile.src ? (
              // eslint-disable-next-line @next/next/no-img-element -- already sized and compressed for this spot; the optimizer would only add a round trip
              <img src={tile.src} alt="" width={360} height={450} loading="lazy" decoding="async" fetchPriority="low" draggable={false} className="absolute inset-0 size-full object-cover object-top" />
            ) : null}
          </div>
        ))}
      </div>
      {/* Round AD5: a fifth less of the pictures' light again (0.928 where it was 0.91), and the corners closed in further. */}
      <div data-hero-veil="" className="absolute inset-0 bg-[#0e0e10]/[0.928]" />
      {/*
        Round AE4: on a phone the panel is narrow and the AD5 corners covered
        nearly all of it, so the collage was gone. A lighter, wider vignette
        there keeps it faintly in sight; from 640px it is AD5's as it was
        (scripts/check-home-hero.mjs measures both).
      */}
      <div data-hero-vignette="" className="absolute inset-0 bg-[radial-gradient(ellipse_95%_85%_at_50%_42%,transparent_45%,rgba(10,10,12,0.45)_100%)] sm:bg-[radial-gradient(ellipse_75%_70%_at_50%_42%,transparent_40%,rgba(10,10,12,0.72)_100%)]" />
    </div>
  )
}
