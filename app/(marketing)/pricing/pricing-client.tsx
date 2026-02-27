"use client"

import { PricingSection } from "@/components/marketing/pricing-section"
import { FeaturesBadgesSection } from "@/components/marketing/features-badges-section"
import { ProductMarquee } from "@/components/marketing/product-marquee"
import { SplitFeaturesSection } from "@/components/marketing/split-features-section"
import { ToolStackSection } from "@/components/marketing/tool-stack-section"
import { FaqSection } from "@/components/marketing/faq-section"
import { CtaSection } from "@/components/marketing/cta-section"

export function PricingPageClient() {
  return (
    <div className="bg-white overflow-x-hidden">
      {/* PRICING */}
      <PricingSection hideDetailsLink />

      {/* FEATURE BADGES - Launch in minutes, Cancel anytime, No coding, Get paid directly */}
      <FeaturesBadgesSection />

      {/* UNLIMITED POSSIBILITIES - Product categories marquee */}
      <ProductMarquee />

      {/* SPLIT FEATURES - Build Your One Page, Build Your Online Store, Know what makes you money */}
      <SplitFeaturesSection />

      {/* REPLACE YOUR ENTIRE TOOL STACK */}
      <ToolStackSection />

      {/* FAQ */}
      <FaqSection />

      {/* CTA - Turn your ideas into income */}
      <CtaSection />
    </div>
  )
}
