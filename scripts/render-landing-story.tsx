/** Real below-the-hero sections, shared by SSR and hydration in the browser probe. */
import React from "react"
import { hydrateRoot } from "react-dom/client"
import { LandingStory } from "@/components/marketing/landing-story"
import { BuildShowcase } from "@/components/marketing/build-showcase"
import { ProductMarquee } from "@/components/marketing/product-marquee"
import { PricingSection } from "@/components/marketing/pricing-section"
import { FaqSection } from "@/components/marketing/faq-section"
import { FinalCta } from "@/components/marketing/home/final-cta"
import { MarketingFooter } from "@/components/marketing/footer"

/* Changed on purpose (wave 12): the home page's own sections, in its order; the other tracks' sections are added by the integration. */
export function LandingStoryFixture() {
  return (
    <>
      <LandingStory>
        <BuildShowcase />
        <ProductMarquee />
        <PricingSection editorial hideDetailsLink />
        <FaqSection editorial />
        <FinalCta />
      </LandingStory>
      <MarketingFooter />
    </>
  )
}
if (typeof document !== "undefined")
  hydrateRoot(document.getElementById("app")!, <LandingStoryFixture />)
