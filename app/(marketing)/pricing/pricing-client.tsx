"use client"

import { useState } from "react"
import { PricingSection } from "@/components/marketing/pricing-section"
import { FeaturesBadgesSection } from "@/components/marketing/features-badges-section"
import { ProductMarquee } from "@/components/marketing/product-marquee"
import { SplitFeaturesSection } from "@/components/marketing/split-features-section"
import { ToolStackSection } from "@/components/marketing/tool-stack-section"
import { FaqSection } from "@/components/marketing/faq-section"
import { CtaSection } from "@/components/marketing/cta-section"

export function PricingPageClient({
  source,
  returnTo,
}: {
  source?: string
  returnTo?: string
}) {
  const isUpgradeMode = source === "upgrade"
  const [loadingPlan, setLoadingPlan] = useState<"growth" | "pro" | null>(null)

  const handleUpgradePlanSelect = async (planId: "growth" | "pro") => {
    if (loadingPlan) return
    setLoadingPlan(planId)
    try {
      const origin = window.location.origin
      const destination = returnTo || "/app"
      const res = await fetch("/api/billing/subscription/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId,
          successUrl: `${origin}${destination}?plan_activated=1`,
          cancelUrl: `${origin}/pricing?source=upgrade&returnTo=${encodeURIComponent(destination)}`,
        }),
      })
      const data = await res.json()
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl
        return
      }
      console.error("Checkout error:", data.error)
    } catch (err) {
      console.error("Failed to start checkout:", err)
    }
    setLoadingPlan(null)
  }

  return (
    <div className="bg-white overflow-x-hidden">
      {/* PRICING */}
      <PricingSection
        hideDetailsLink
        headingOverride={isUpgradeMode ? "Find the plan for you" : undefined}
        subtitleOverride={isUpgradeMode ? "Simple, transparent pricing. You can cancel at any time." : undefined}
        upgradeCallbacks={isUpgradeMode ? { onPlanSelect: handleUpgradePlanSelect, loadingPlan } : undefined}
      />

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
