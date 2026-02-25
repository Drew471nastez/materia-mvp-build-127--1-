"use client"

import dynamic from "next/dynamic"
import { Hero } from "@/components/marketing/hero"
import { BentoGrid } from "@/components/marketing/bento-grid"
import { StatsBar } from "@/components/marketing/stats-bar"

// Below-the-fold sections — dynamically imported to reduce initial JS bundle.
// Hero + BentoGrid + StatsBar load eagerly (above the fold).
const ManageSection = dynamic(() => import("@/components/marketing/manage-section").then(m => ({ default: m.ManageSection })))
const FeaturesGrid = dynamic(() => import("@/components/marketing/features-grid").then(m => ({ default: m.FeaturesGrid })))
const CarouselSection = dynamic(() => import("@/components/marketing/carousel-section").then(m => ({ default: m.CarouselSection })))
const ComparisonSection = dynamic(() => import("@/components/marketing/comparison-section").then(m => ({ default: m.ComparisonSection })))
const PricingSection = dynamic(() => import("@/components/marketing/pricing-section").then(m => ({ default: m.PricingSection })))
const FaqSection = dynamic(() => import("@/components/marketing/faq-section").then(m => ({ default: m.FaqSection })))
const CtaSection = dynamic(() => import("@/components/marketing/cta-section").then(m => ({ default: m.CtaSection })))

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
