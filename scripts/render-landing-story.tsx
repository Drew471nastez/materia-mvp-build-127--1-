/** Real below-the-hero sections, shared by SSR and hydration in the browser probe. */
import React from "react"
import { hydrateRoot } from "react-dom/client"
import { LandingStory } from "@/components/marketing/landing-story"
import { BuildShowcase } from "@/components/marketing/build-showcase"
import { BentoGrid } from "@/components/marketing/bento-grid"
import { StatsBar } from "@/components/marketing/stats-bar"
import { ManageSection } from "@/components/marketing/manage-section"
import { ProductMarquee } from "@/components/marketing/product-marquee"
import { SplitFeaturesSection } from "@/components/marketing/split-features-section"
import { ToolStackSection } from "@/components/marketing/tool-stack-section"
import { PricingSection } from "@/components/marketing/pricing-section"
import { FeaturesBadgesSection } from "@/components/marketing/features-badges-section"
import { FaqSection } from "@/components/marketing/faq-section"
import { CtaSection } from "@/components/marketing/cta-section"
import { MarketingFooter } from "@/components/marketing/footer"

export function LandingStoryFixture() {
  return (
    <>
      <LandingStory>
        <BuildShowcase />
        <BentoGrid />
        <StatsBar />
        <ManageSection />
        <ProductMarquee />
        <SplitFeaturesSection />
        <ToolStackSection editorial />
        <PricingSection editorial />
        <FeaturesBadgesSection />
        <FaqSection editorial />
        <CtaSection editorial />
      </LandingStory>
      <MarketingFooter />
    </>
  )
}
if (typeof document !== "undefined")
  hydrateRoot(document.getElementById("app")!, <LandingStoryFixture />)
