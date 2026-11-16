import dynamic from "next/dynamic"
import { LandingStory } from "@/components/marketing/landing-story"
import { ScrollRevealBackdrop, ScrollRevealPanel } from "@/components/marketing/scroll-reveal-panel"
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
  LazyBuildShowcase,
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
  THE PAGE, TOP TO BOTTOM (wave 12). The hero is the first screen and loads
  with the page (landing round 13: the showcase that sat under it moved down,
  before pricing). Everything else is below the fold:

    sections the server still draws (their words are read by search engines:
    the possibilities, pricing, the questions, the closing call) are
    dynamically imported, so their code is a chunk of its own, and the long
    ones are wrapped in <LazySection>, which lets the browser skip their
    layout and paint until they come near the screen;

    the grounds (landing round 3, the owner): the page's base is dark, and
    the light sections ride on white sheets with rounded corners that lap
    over it and scroll with the page, one stretch on a purple one
    (ScrollRevealPanel, components/marketing/scroll-reveal-panel.tsx; round
    8: at every join the lower block carries the rounded corners and the
    upper one is square; nothing is held):

      dark     the hero, sitting on
      white    Make the work, ideas, what you can sell (landing round 8), creators, how it works
      dark     the checkout scene (it draws its own black)
      white    your audience, your apps, your AI tools, the app (landing round 9)
      purple   what is working (round 8: it rises over the white as a sheet)
      white    the map (landing round 9), the possibilities, what you could earn
      dark     the showcase (landing round 13): pages built on Storelib
      white    pricing, the questions
      dark     the closing call, running on into the black footer

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
      {/* Landing round 12, the owner: the wheel glide was "too smooth and delayed". The page scrolls natively, in real time (tests/home-smooth-wheel-r5.test.ts). */}
      <LandingStory>
        {/* DARK: 1 HERO. The page simply continues onto the white ground under it (the owner: Make the work must not come up as a drawer). Landing round 13, the owner: the showcase is no longer right under the hero; it is further down, before pricing. */}
        <ScrollRevealBackdrop>
          <Hero />
        </ScrollRevealBackdrop>

        {/* WHITE SHEET. Landing round 8: its rounded top lies over the dark block's square foot (the lower block carries the corners). */}
        <ScrollRevealPanel tone="white">
          {/* 3 EverythingInOnePlace */}
          <LazyEverythingInOnePlace />

          {/* 4 IdeasToLife */}
          <LazyIdeasComeToLife />

          {/* 4b What you can sell (landing round 8: back after round 7 took it off, redesigned) */}
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

          {/* 12b RunFromAnywhere. Landing round 9, the owner: it "should be positioned somewhere else", on white: after the apps and the AI tools (what works with a store, then the store in a pocket), and it leads into the numbers. */}
          <LazyAppAnywhere />
        </ScrollRevealPanel>

        {/* PURPLE SHEET: 13 AnalyticsShowcase alone (landing round 9: the map left it for the white sheet under it). Landing round 8: it rises over the white above as the page scrolls (transform only, nothing held). */}
        <ScrollRevealPanel tone="purple" arrive="rise">
          {/* Round 4: a fine dot grid with a slowly drifting light over the top of the purple, fading out by the cards. */}
          <DotField tone="purple" fade="bottom" gap={22} style={{ height: "min(100%, 1600px)" }} />
          <LazyAnalyticsShowcase />
        </ScrollRevealPanel>

        {/* WHITE SHEET: the map, what you can sell, earnings */}
        <ScrollRevealPanel tone="white">
          {/* 14 SellEverywhere world map. Landing round 9, the owner: it sits on white, right after the purple. */}
          <LazySellEverywhereMap />

          {/* 5 UNLIMITED POSSIBILITIES (frame). Landing round 8: moved here from between the ideas and the creators (the owner: it sat inside "Storelib is for creators"); what you can sell, then what it could earn. Wave 13 perf: each box's height is the section's own, measured at 390 to 1920 wide, so nothing jumps and no gap shows. Wave 18: smaller on a phone (the heading and the photos), measured 324 to 359px from 360 to 767 wide, so below 768 the box is 6.7vw + 310px; from 768 it is as it was. */}
          <LazySection name="possibilities" minHeight="min(calc(6.7vw + 310px + clamp(0px, (100vw - 767px) * 100000, 100000px)), clamp(380px, 23vw + 254px, 720px))">
            <ProductMarquee />
          </LazySection>

          {/* 15 EarningsCalculator */}
          <LazyEarningsCalculator />
        </ScrollRevealPanel>

        {/* DARK: 2 BUILD SHOWCASE. Landing round 13, the owner: moved from under the hero. After what you could earn and before the price, the pages people build and sell from on Storelib, on a dark ground of its own between two white sheets (its rounded top over the earnings, the pricing sheet's rounded top over its foot). Mounted as it comes near (lazy-sections.tsx). */}
        <ScrollRevealBackdrop>
          <LazyBuildShowcase />
        </ScrollRevealBackdrop>

        {/* WHITE SHEET: pricing, the questions */}
        <ScrollRevealPanel tone="white">

          {/* 16 PRICING (kept as it was, without its See full pricing button here). Landing round: plain lines, measured 2043px at 390, 1044 at 768, 997 to 1028 from 1024. */}
          <LazySection name="pricing" minHeight="max(calc(2043px - clamp(0px, (100vw - 767px) * 100000, 100000px)), 1030px)">
            <PricingSection editorial hideDetailsLink />
          </LazySection>

          {/* 17 FAQ: the last section (landing round 9, the owner) */}
          <LazySection name="faq" minHeight="max(calc(795px - clamp(0px, (100vw - 1023px) * 100000, 100000px)), 730px)">
            <FaqSection editorial />
          </LazySection>
        </ScrollRevealPanel>

        {/* DARK CLOSE (round 4: no purple): 18 FINAL CTA (frame) alone above the footer (landing round 9, the owner: the questions, then Start selling), running on into the black footer with no seam */}
        <ScrollRevealBackdrop>
          <FinalCta />
        </ScrollRevealBackdrop>
      </LandingStory>
      {/* 20 FOOTER: components/marketing/footer.tsx, drawn under every marketing page by the layout (ConditionalFooter). */}
    </div>
  )
}
