"use client"

import { Hero } from "@/components/marketing/hero"
import { BentoGrid } from "@/components/marketing/bento-grid"
import { StatsBar } from "@/components/marketing/stats-bar"
import { ManageSection } from "@/components/marketing/manage-section"
import { FeaturesGrid } from "@/components/marketing/features-grid"
import { CarouselSection } from "@/components/marketing/carousel-section"
import { PillTabs } from "@/components/marketing/pill-tabs"
import { ComparisonSection } from "@/components/marketing/comparison-section"
import { PricingSection } from "@/components/marketing/pricing-section"
import { FaqSection } from "@/components/marketing/faq-section"
import { CtaSection } from "@/components/marketing/cta-section"

export default function StorelibLanding() {
  return (
    <div className="bg-white overflow-x-hidden">
      {/* HERO SECTION */}
      <Hero />

      {/* BENTO GRID */}
      <BentoGrid />

      {/* STATS BAR */}
      <StatsBar />

      {/* MANAGE YOUR BUSINESS */}
      <ManageSection />

      {/* FEATURES GRID */}
      <FeaturesGrid />

      {/* CAROUSEL / ONEPAGE TESTIMONIALS */}
      <CarouselSection />

      {/* PILL TABS */}
      <PillTabs />

      {/* COMPARISON */}
      <ComparisonSection />

      {/* PRICING */}
      <PricingSection />

      {/* FAQ */}
      <FaqSection />

      {/* CTA */}
      <CtaSection />
    </div>
  )
}
