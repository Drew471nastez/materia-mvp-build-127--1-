import dynamic from "next/dynamic"
import { LandingStory } from "@/components/marketing/landing-story"
import { BuildShowcase } from "@/components/marketing/build-showcase"
import { Hero } from "@/components/marketing/hero"
import { LazySection } from "@/components/marketing/home/lazy-section"
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

        {/* W12 SLOT 3: EverythingInOnePlace, four cards (platform) */}

        {/* W12 SLOT 4: IdeasToLife, pill tabs with builder previews (showcase) */}

        {/* 5 UNLIMITED POSSIBILITIES (frame) */}
        <LazySection name="possibilities" minHeight="560px">
          <ProductMarquee />
        </LazySection>

        {/* W12 SLOT 6: EveryKindOfBusiness carousel (showcase) */}

        {/* W12 SLOT 7: CreatorsCarousel (creators) */}

        {/* W12 SLOT 8: HowItWorks motion graphics + earnings picker (commerce) */}

        {/* W12 SLOT 9: CheckoutScene, the checkout scroll scene (commerce; sticky inside: wrap in lazySection(), never <LazySection> without `sticky`) */}

        {/* W12 SLOT 10: AudienceOwnership, "Your audience belongs to you" (platform) */}

        {/* W12 SLOT 11: AnalyticsShowcase (platform) */}

        {/* W12 SLOT 12: SellEverywhere world map (commerce) */}

        {/* W12 SLOT 13: Integrations (platform) */}

        {/* W12 SLOT 14: EarningsCalculator (commerce) */}

        {/* W12 SLOT 15: RunFromAnywhere, app badges (platform) */}

        {/* 16 PRICING (kept as it was, without its See full pricing button here) */}
        <LazySection name="pricing" minHeight="1300px">
          <PricingSection editorial hideDetailsLink />
        </LazySection>

        {/* 17 FAQ */}
        <LazySection name="faq" minHeight="1000px">
          <FaqSection editorial />
        </LazySection>

        {/* 18 FINAL CTA (frame) */}
        <FinalCta />
      </LandingStory>
      {/* 19 FOOTER: components/marketing/footer.tsx, drawn under every marketing page by the layout (ConditionalFooter). */}
    </div>
  )
}
