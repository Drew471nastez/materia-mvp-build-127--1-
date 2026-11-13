import dynamic from "next/dynamic"
import { LandingStory, StoryBand } from "@/components/marketing/landing-story"
import { BuildShowcase } from "@/components/marketing/build-showcase"
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
  LazyEarningsCalculator,
  LazyAppAnywhere,
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

    the rhythm (wave 14): white sections, then a band of colour, then white
    again: black for the kinds of business (and the checkout scene, which
    draws its own), deep purple for analytics with the map, and for the app
    (StoryBand, components/marketing/landing-story.tsx);

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
    <div className="bg-white">
      {/* Who Storelib is, the site and the product, as one graph (lib/seo/structured-data.ts). No SearchAction: Google retired it, and /explore?q= is not crawled. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(storelibHomeJsonLd()) }} />

      {/* 1 HERO */}
      <Hero />
      <LandingStory>
        {/* 2 BUILD SHOWCASE (its content: track showcase) */}
        <BuildShowcase />

        {/* 3 EverythingInOnePlace */}
        <LazyEverythingInOnePlace />

        {/* 4 IdeasToLife */}
        <LazyIdeasComeToLife />

        {/* 5 UNLIMITED POSSIBILITIES (frame). Wave 13 perf: each box's height is the section's own, measured at 390 to 1920 wide, so nothing jumps and no gap shows. */}
        <LazySection name="possibilities" minHeight="clamp(442px, 21vw + 290px, 600px)">
          <ProductMarquee />
        </LazySection>

        {/* 6 EveryKindOfBusiness carousel, on a black band */}
        <StoryBand tone="black">
          <LazyBusinessCarousel />
        </StoryBand>

        {/* 7 CreatorsCarousel */}
        <LazyCreatorsCarousel />

        {/* 8 HowItWorks motion graphics + earnings picker */}
        <LazyHowItWorks />

        {/* 9 CheckoutScene */}
        <LazyCheckoutScene />

        {/* 10 AudienceOwnership */}
        <LazyAudienceOwnership />

        {/* 11 AnalyticsShowcase and 12 SellEverywhere world map, one purple panel */}
        <StoryBand tone="purple">
          <LazyAnalyticsShowcase />
          <LazySellEverywhereMap />
        </StoryBand>

        {/* 13 Integrations */}
        <LazyIntegrationsSection />

        {/* 14 EarningsCalculator */}
        <LazyEarningsCalculator />

        {/* 15 RunFromAnywhere, a purple panel */}
        <StoryBand tone="purple">
          <LazyAppAnywhere />
        </StoryBand>

        {/* 16 PRICING (kept as it was, without its See full pricing button here) */}
        <LazySection name="pricing" minHeight="max(calc(2090px - clamp(0px, (100vw - 767px) * 100000, 100000px)), 1045px)">
          <PricingSection editorial hideDetailsLink />
        </LazySection>

        {/* 17 FAQ */}
        <LazySection name="faq" minHeight="max(calc(795px - clamp(0px, (100vw - 1023px) * 100000, 100000px)), 730px)">
          <FaqSection editorial />
        </LazySection>

        {/* 18 FINAL CTA (frame) */}
        <FinalCta />
      </LandingStory>
      {/* 19 FOOTER: components/marketing/footer.tsx, drawn under every marketing page by the layout (ConditionalFooter). */}
    </div>
  )
}
