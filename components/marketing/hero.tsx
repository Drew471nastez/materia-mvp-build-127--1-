import { HeroTypedHeading } from "@/components/marketing/hero-typed-heading"
import { HeroCta } from "@/components/marketing/hero-cta"
import { HeroCarousel } from "@/components/marketing/hero-carousel"
import { HERO_BACKDROP } from "@/lib/marketing/hero-media"
import { HERO_PHRASES } from "@/lib/marketing/hero-typing"

/**
 * storelib.com's front page hero: a dark panel inset from the page, a dim
 * collage of Storelib pages behind it, the typed heading, one button and the
 * marketplace search, and the slider of Storelib screens along the bottom.
 *
 * A SERVER COMPONENT. The heading's first phrase, the subheading, the button
 * and the search form are in the HTML, so the largest text paint arrives with
 * the document and the page reads the same without JavaScript. Three small
 * client parts do the moving: the typing (hero-typed-heading), the button's
 * label by who is signed in (hero-cta) and the slider (hero-carousel). Every
 * picture is listed in lib/marketing/hero-media.ts.
 *
 * ON A PHONE THE SLIDER LEAVES THE PANEL. The panel ends half way down the
 * slides and the slides run to the screen's edges, so the hero closes on the
 * pictures rather than on a strip of empty black, and the page below starts
 * right under them. From 640px the slider sits inside the panel, cut by it.
 * The panel itself does not clip: the collage has its own rounded clip, so
 * the slider can cross the panel's edge.
 *
 * THE ENTRANCE is CSS only, from the first paint: each part rises 10px, 40ms
 * after the one above it, 560ms for all of it. The badge, the subheading and
 * the controls also fade in; the heading and the slides do not, because they
 * are the first and the largest paint. Transform and opacity only, so nothing
 * is laid out twice and nothing shifts; none of it under reduced motion.
 */

const HERO_CSS = `
[data-home-hero] {
  --hc-w: min(78vw, 340px);
  --hc-h: calc(var(--hc-w) / 1.6);
  --hc-overlap: calc(var(--hc-h) * 0.46);
}
@media (min-width: 640px) { [data-home-hero] { --hc-w: min(56vw, 560px); --hc-overlap: 0px; } }
@media (min-width: 1024px) { [data-home-hero] { --hc-w: min(50vw, 680px); } }
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
  box-shadow: 0 0 0 1px rgba(15, 15, 25, 0.08), 0 16px 34px -14px rgba(15, 15, 30, 0.45);
  will-change: transform, opacity;
  backface-visibility: hidden;
}
@media (min-width: 640px) {
  .hero-slide { box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.06), 0 18px 40px -16px rgba(0, 0, 0, 0.6); }
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

export function Hero() {
  return (
    <section data-home-hero="" className="px-2 pt-2 sm:px-3 sm:pt-3" style={{ paddingBottom: "var(--hc-overlap)" }}>
      <style dangerouslySetInnerHTML={{ __html: HERO_CSS }} />
      <div data-hero-panel="" className="relative isolate flow-root rounded-[24px] bg-[#0e0e10] sm:rounded-[32px]">
        <Backdrop />

        <div className="relative z-10 mx-auto flex max-w-[860px] flex-col items-center px-5 pt-8 text-center sm:pt-12 lg:pt-14">
          <p data-hero-badge="" {...enter(0)} className="inline-flex h-[26px] items-center gap-2 rounded-[9px] border border-white/[0.09] bg-[#1a1a1f] px-2.5 text-[12px] font-medium leading-none text-white/[0.86] shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_1px_2px_rgba(0,0,0,0.5),0_6px_16px_-8px_rgba(0,0,0,0.7)]">
            <span aria-hidden className="size-[6px] rounded-full bg-[#8b5cf6] shadow-[0_0_0_3px_rgba(139,92,246,0.18)]" />
            Built for creators
          </p>

          <h1 {...enter(1, true)} aria-label={HERO_PHRASES[0].replace(/\.$/, "")} className="mt-4 text-[32px] font-bold leading-[1.1] tracking-[-0.025em] text-white sm:mt-5 sm:text-[48px] lg:text-[60px]">
            <HeroTypedHeading className="mx-auto max-w-[12.5em]" />
          </h1>

          <p {...enter(2)} className="mt-3.5 max-w-[30em] text-[15px] leading-[1.55] text-white/[0.82] sm:mt-5 sm:text-[17px]">
            The #1 e-commerce platform for creators & entrepreneurs. Sell products, manage links & grow an audience.
          </p>

          <div data-hero-actions="" {...enter(3)} className="mt-6 flex flex-wrap items-center justify-center gap-2.5 sm:mt-8 sm:gap-3">
            <HeroCta className="inline-flex h-11 min-w-[176px] items-center justify-center gap-2 rounded-action bg-[#7c3aed] px-5 text-[15px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_1px_2px_rgba(0,0,0,0.4)] transition-colors hover:bg-[#6d28d9] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:h-12 sm:px-6" />
            <form action="/explore" method="get" role="search" className="relative w-[272px] sm:w-[260px]">
              <input
                type="search"
                name="q"
                aria-label="Search marketplace"
                placeholder="Search marketplace ..."
                autoComplete="off"
                enterKeyHint="search"
                className="h-11 w-full rounded-action border border-[#2e2e36] bg-[#19191e] pl-4 pr-12 text-[15px] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_1px_2px_rgba(0,0,0,0.45)] outline-none transition-colors placeholder:text-[#a1a1ad] hover:border-[#3a3a44] focus:border-[#8b5cf6] sm:h-12 [&::-webkit-search-cancel-button]:hidden"
              />
              <button type="submit" aria-label="Search" className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-[#c4c4cc] hover:text-white">
                <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-3.5-3.5" />
                </svg>
              </button>
            </form>
          </div>
        </div>

        <div
          data-hero-slider=""
          data-hero-enter="rise"
          className="relative z-10 mt-9 max-sm:-mx-2 max-sm:[overflow-x:clip] sm:mt-12 sm:overflow-hidden sm:rounded-b-[32px] sm:pb-12 sm:pt-2 lg:mt-14"
          style={{ ["--enter" as string]: 4, marginBottom: "calc(var(--hc-overlap) * -1)" }}
        >
          <HeroCarousel />
        </div>
      </div>
    </section>
  )
}

/**
 * Storelib's own pages behind the heading, tilted and dimmed, each tile with
 * a hairline and a soft drop so the collage has some depth. Decoration:
 * hidden from screen readers. Hung from the panel's top, not centred on it:
 * centred, it moved whenever the panel's height did (the web font arriving),
 * and one production load measured a layout shift of 0.58 from this grid.
 * The tiles are small WebP files served as they are (a few KB each, the same
 * ten repeated), lazy and low priority, so they never compete with the text.
 */
function Backdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-[inherit]">
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
      <div className="absolute inset-0 bg-[#0e0e10]/[0.85]" />
    </div>
  )
}
