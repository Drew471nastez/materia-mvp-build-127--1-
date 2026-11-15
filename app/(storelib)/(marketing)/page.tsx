import dynamic from "next/dynamic"
import { LandingStory } from "@/components/marketing/landing-story"
import { ScrollRevealBackdrop, ScrollRevealPanel } from "@/components/marketing/scroll-reveal-panel"
import { BuildShowcase } from "@/components/marketing/build-showcase"
import { DotField } from "@/components/marketing/home/dot-field"
import { Hero } from "@/components/marketing/hero"
import { LazySection } from "@/components/marketing/home/lazy-section"
import {
  LazyEverythingInOnePlace,
  LazyIdeasComeToLife,
  LazyBusinessCarousel,
  LazyCreatorsCarousel,
  LazyHowItWorks,
  LazyCheckoutScene,
  LazyAudienceOwnership,
  LazyAnalyticsShowcase,
  LazySellEverywhereMap,
  LazyIntegrationsSection,
  LazyAiToolsSection,
  LazyEarningsCalculator,
  LazyAppAnywhere,
  LAZY_SECTION_HEIGHTS_CSS,
} from "@/components/marketing/home/lazy-sections"
import { storelibHomeJsonLd } from "@/lib/seo/structured-data"
import { jsonLdScript } from "@/lib/seo/json-ld"
import type { Metadata } from "next"

/*
  THE HOME PAGE NAMES ITSELF. The title, description and share card are the
  root layout's (app/layout.tsx), which describe this page; the canonical is
  set here and only here, because a canonical in the root layout would be
  inherited by every page that sets none and point all of them at "/".
*/
export const metadata: Metadata = {
  alternates: { canonical: "https://storelib.com" },
}

/*
  THE PAGE, TOP TO BOTTOM (wave 12). The hero and the showcase under it are
  the first screen and load with the page. Everything else is below the fold:

    sections the server still draws (their words are read by search engines:
    the possibilities, pricing, the questions, the closing call) are
    dynamically imported, so their code is a chunk of its own, and the long
    ones are wrapped in <LazySection>, which lets the browser skip their
    layout and paint until they come near the screen;

    the grounds (landing round 3, the owner): the page's base is dark, and
    the light sections ride on white sheets with rounded corners that lap
    over it and scroll with the page, one stretch on a purple one
    (ScrollRevealPanel, components/marketing/scroll-reveal-panel.tsx; round
    5: plain blocks, no scroll-driven motion and nothing held):

      dark     the hero and the showcase, sitting on
      white    Make the work, ideas, possibilities, one store, creators, how it works
               (a flat ground, round 4: it does not rise as a sheet)
      dark     the checkout scene (it draws its own black)
      white    your audience, your apps, your AI tools
      purple   what is working, the map
      white    what you could earn, pricing, the questions
      dark     the app and the closing call, running on into the black footer

    the motion sections from the other wave-12 tracks are mounted near the
    screen by lazySection() (components/marketing/home/lazy-section): their
    code is not in the first load at all. The slots below mark where each
    one goes; the integration wires them.
*/
const ProductMarquee = dynamic(() => import("@/components/marketing/product-marquee").then((m) => ({ default: m.ProductMarquee })))
const PricingSection = dynamic<{ editorial?: boolean; hideDetailsLink?: boolean }>(() => import("@/components/marketing/pricing-section").then((m) => ({ default: m.PricingSection })))
const FaqSection = dynamic<{ editorial?: boolean }>(() => import("@/components/marketing/faq-section").then((m) => ({ default: m.FaqSection })))
const FinalCta = dynamic(() => import("@/components/marketing/home/final-cta").then((m) => ({ default: m.FinalCta })))

export default function StorelibLanding() {
  return (
    <div className="bg-[#050506]" data-home-ground="dark">
      {/* Who Storelib is, the site and the product, as one graph (lib/seo/structured-data.ts). No SearchAction: Google retired it, and /explore?q= is not crawled. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(storelibHomeJsonLd()) }} />

      {/* Each lazy section's placeholder at its measured height (lazy-sections.tsx). */}
      <style dangerouslySetInnerHTML={{ __html: LAZY_SECTION_HEIGHTS_CSS }} />
      <LandingStory>
        {/* DARK: 1 HERO and 2 BUILD SHOWCASE (its content: track showcase). The page simply continues onto the white ground under it (the owner: Make the work must not come up as a drawer). */}
        <ScrollRevealBackdrop>
          <Hero />
          <BuildShowcase />
        </ScrollRevealBackdrop>

        {/* WHITE GROUND: flat, not a sheet that rises. Its top runs straight on under the showcase, whose bottom corners it rounds. */}
        <ScrollRevealPanel tone="white" arrive="flat">
          {/* 3 EverythingInOnePlace */}
          <LazyEverythingInOnePlace />

          {/* 4 IdeasToLife */}
          <LazyIdeasComeToLife />

          {/* 5 UNLIMITED POSSIBILITIES (frame). Wave 13 perf: each box's height is the section's own, measured at 390 to 1920 wide, so nothing jumps and no gap shows. */}
          <LazySection name="possibilities" minHeight="clamp(380px, 23vw + 254px, 720px)">
            <ProductMarquee />
          </LazySection>

          {/* 6 One store for everything you sell, on white (round 3: no black band) */}
          <LazyBusinessCarousel />

          {/* 7 CreatorsCarousel */}
          <LazyCreatorsCarousel />

          {/* 8 HowItWorks motion graphics + earnings picker */}
          <LazyHowItWorks />
        </ScrollRevealPanel>

        {/* DARK: 9 CheckoutScene. Round 5: nothing is held; the next sheet laps over its foot by its corner and the page scrolls on. */}
        <ScrollRevealBackdrop>
          <LazyCheckoutScene />
        </ScrollRevealBackdrop>

        {/* WHITE SHEET */}
        <ScrollRevealPanel tone="white">
          {/* 10 AudienceOwnership */}
          <LazyAudienceOwnership />

          {/* 11 Integrations */}
          <LazyIntegrationsSection />

          {/* 12 Your AI tools work here too (landing round): Claude Code, Codex or Cursor connected to a site, building it as drafts */}
          <LazyAiToolsSection />
        </ScrollRevealPanel>

        {/* PURPLE SHEET: 13 AnalyticsShowcase and 14 SellEverywhere world map */}
        <ScrollRevealPanel tone="purple">
          {/* Round 4: a fine dot grid with a slowly drifting light over the top of the purple, fading out by the cards. */}
          <DotField tone="purple" fade="bottom" style={{ height: "min(100%, 1100px)" }} />
          <LazyAnalyticsShowcase />
          <LazySellEverywhereMap />
        </ScrollRevealPanel>

        {/* WHITE SHEET: earnings, pricing, the questions */}
        <ScrollRevealPanel tone="white">
          {/* 15 EarningsCalculator */}
          <LazyEarningsCalculator />

          {/* 16 PRICING (kept as it was, without its See full pricing button here). Landing round: plain lines, measured 2043px at 390, 1044 at 768, 997 to 1028 from 1024. */}
          <LazySection name="pricing" minHeight="max(calc(2043px - clamp(0px, (100vw - 767px) * 100000, 100000px)), 1030px)">
            <PricingSection editorial hideDetailsLink />
          </LazySection>

          {/* 17 FAQ */}
          <LazySection name="faq" minHeight="max(calc(795px - clamp(0px, (100vw - 1023px) * 100000, 100000px)), 730px)">
            <FaqSection editorial />
          </LazySection>
        </ScrollRevealPanel>

        {/* DARK CLOSE (round 4: no purple): 18 RunFromAnywhere and 19 FINAL CTA (frame), running on into the black footer with no seam */}
        <ScrollRevealBackdrop>
          <LazyAppAnywhere />
          <FinalCta />
        </ScrollRevealBackdrop>
      </LandingStory>
      {/* 20 FOOTER: components/marketing/footer.tsx, drawn under every marketing page by the layout (ConditionalFooter). */}
    </div>
  )
}
