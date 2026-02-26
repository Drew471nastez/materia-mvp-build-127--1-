"use client"

import dynamic from "next/dynamic"
import { Hero } from "@/components/marketing/hero"
import { BentoGrid } from "@/components/marketing/bento-grid"
import { StatsBar } from "@/components/marketing/stats-bar"

// Below-the-fold sections — dynamically imported to reduce initial JS bundle.
// Hero + BentoGrid + StatsBar load eagerly (above the fold).
const ManageSection = dynamic(() => import("@/components/marketing/manage-section").then(m => ({ default: m.ManageSection })))
const SplitFeaturesSection = dynamic(() => import("@/components/marketing/split-features-section").then(m => ({ default: m.SplitFeaturesSection })))
const CarouselSection = dynamic(() => import("@/components/marketing/carousel-section").then(m => ({ default: m.CarouselSection })))
const ToolStackSection = dynamic(() => import("@/components/marketing/tool-stack-section").then(m => ({ default: m.ToolStackSection })))
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

      {/* SPLIT FEATURE ROWS */}
      <SplitFeaturesSection />

      {/* CAROUSEL / ONEPAGE TESTIMONIALS */}
      <CarouselSection />

      {/* TOOL STACK COMPARISON */}
      <ToolStackSection />

      {/* PRICING */}
      <PricingSection />

      {/* FAQ */}
      <FaqSection />

      {/* CTA */}
      <CtaSection />
    </div>
  )
}
