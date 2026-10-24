import Image from "next/image"
import { HeroTypedHeading } from "@/components/marketing/hero-typed-heading"
import { HeroCta } from "@/components/marketing/hero-cta"
import { HeroCarousel } from "@/components/marketing/hero-carousel"
import { HERO_BACKDROP } from "@/lib/marketing/hero-media"

/**
 * storelib.com's front page hero: a dark panel inset from the page, a dim
 * collage of storefronts behind it, the typed heading, one button and the
 * marketplace search, and the storefront slider along the bottom.
 *
 * A SERVER COMPONENT. The heading's first phrase, the subheading, the button
 * and the search form are in the HTML, so the largest paint is text that
 * arrives with the document and the page reads the same without JavaScript.
 * Three small client parts do the moving: the typing (hero-typed-heading),
 * the button's label by who is signed in (hero-cta) and the slider
 * (hero-carousel). Every picture is listed in lib/marketing/hero-media.ts.
 */

const HERO_CSS = `
.hero-stage {
  --hc-w: min(78vw, 340px);
  height: calc(var(--hc-w) / var(--hc-ratio));
  touch-action: pan-y;
  cursor: grab;
}
.hero-stage[data-dragging] { cursor: grabbing; }
@media (min-width: 640px) { .hero-stage { --hc-w: min(56vw, 560px); } }
@media (min-width: 1024px) { .hero-stage { --hc-w: min(50vw, 680px); } }
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
  box-shadow: 0 18px 40px -16px rgba(0, 0, 0, 0.6);
  will-change: transform, opacity;
  backface-visibility: hidden;
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
[data-hero-line] > span[data-off] { color: transparent; }
[data-hero-line] > span[data-caret],
[data-hero-line][data-caret-start] > span:first-child { position: relative; }
[data-hero-line] > span[data-caret]::after,
[data-hero-line][data-caret-start] > span:first-child::before {
  content: "";
  position: absolute;
  top: 0.14em;
  bottom: 0.1em;
  width: 0.07em;
  min-width: 2px;
  border-radius: 2px;
  background: #a78bfa;
}
[data-hero-line] > span[data-caret]::after { right: -0.11em; }
[data-hero-line][data-caret-start] > span:first-child::before { left: -0.11em; }
.hero-typed[data-idle] [data-hero-line] > span::after,
.hero-typed[data-idle] [data-hero-line] > span::before { animation: hero-caret 1.1s steps(1, end) infinite; }
@keyframes hero-caret { 50% { opacity: 0; } }
@media (prefers-reduced-motion: reduce) {
  [data-hero-line] > span::after, [data-hero-line] > span::before { display: none; }
  .hero-shimmer::after { animation: none; transform: none; opacity: 0.4; }
}
`

export function Hero() {
  return (
    <section data-home-hero="" className="px-2 pt-2 sm:px-3 sm:pt-3">
      <style dangerouslySetInnerHTML={{ __html: HERO_CSS }} />
      <div className="relative isolate overflow-hidden rounded-[24px] bg-[#0e0e10] sm:rounded-[32px]">
        <Backdrop />

        <div className="relative z-10 mx-auto flex max-w-[860px] flex-col items-center px-5 pt-12 text-center sm:pt-16 lg:pt-20">
          <p className="rounded-full bg-white px-3 py-1 text-[12px] font-medium leading-[18px] text-[#1a1a2e]">
            Websites, stores and communities
          </p>

          <h1 aria-label="Build a business around what you create" className="mt-5 text-[34px] font-bold leading-[1.08] tracking-[-0.025em] text-white sm:mt-6 sm:text-[48px] lg:text-[60px]">
            <HeroTypedHeading className="mx-auto max-w-[12.5em]" />
          </h1>

          <p className="mt-4 max-w-[30em] text-[15px] leading-[1.55] text-white/[0.82] sm:mt-5 sm:text-[17px]">
            The #1 e-commerce platform for creators & entrepreneurs. Sell products, manage links & grow an audience.
          </p>

          <div data-hero-actions="" className="mt-7 flex w-full max-w-[340px] flex-col gap-3 sm:mt-8 sm:max-w-none sm:w-auto sm:flex-row">
            <HeroCta className="inline-flex h-12 items-center justify-center gap-2 rounded-action bg-[#7c3aed] px-6 text-[15px] font-semibold text-white transition-colors hover:bg-[#6d28d9] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white" />
            <form action="/explore" method="get" role="search" className="relative sm:w-[260px]">
              <input
                type="search"
                name="q"
                aria-label="Search marketplace"
                placeholder="Search marketplace ..."
                autoComplete="off"
                enterKeyHint="search"
                className="h-12 w-full rounded-action border border-white/[0.12] bg-white/[0.08] pl-4 pr-12 text-[15px] text-white outline-none transition-colors placeholder:text-white/[0.72] hover:bg-white/[0.11] focus:border-white/30 focus:bg-white/[0.12] [&::-webkit-search-cancel-button]:hidden"
              />
              <button type="submit" aria-label="Search" className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-white/80 hover:text-white">
                <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-3.5-3.5" />
                </svg>
              </button>
            </form>
          </div>
        </div>

        <div className="relative z-10 mt-12 pb-8 sm:mt-14 sm:pb-12 lg:mt-16">
          <HeroCarousel />
        </div>
      </div>
    </section>
  )
}

/** The storefront collage behind the heading, tilted and dimmed. Decoration: hidden from screen readers. */
function Backdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="absolute left-1/2 top-[38%] grid w-[200%] -translate-x-1/2 -translate-y-1/2 rotate-[-10deg] grid-cols-6 gap-2.5 sm:w-[130%] sm:grid-cols-8 sm:gap-3.5">
        {HERO_BACKDROP.map((tile, i) => (
          <div key={i} className="relative aspect-[4/5] overflow-hidden rounded-[10px] bg-[#1d1d22]">
            {tile.src ? (
              <Image src={tile.src} alt="" fill sizes="(max-width: 639px) 34vw, 17vw" loading="lazy" fetchPriority="low" className="object-cover" />
            ) : null}
          </div>
        ))}
      </div>
      <div className="absolute inset-0 bg-[#0e0e10]/[0.72]" />
    </div>
  )
}
