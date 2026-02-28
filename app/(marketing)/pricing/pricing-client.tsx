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
  const [checkoutError, setCheckoutError] = useState<string | null>(null)

  const handleUpgradePlanSelect = async (planId: "growth" | "pro") => {
    if (loadingPlan) return
    setCheckoutError(null)
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
      setCheckoutError(data.error || "Something went wrong. Please try again.")
    } catch (err) {
      setCheckoutError("Failed to connect. Please check your connection and try again.")
    }
    setLoadingPlan(null)
  }

  return (
    <div className="bg-white overflow-x-hidden">
      {/* Checkout error banner */}
      {checkoutError && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-red-50 border border-red-200 text-red-700 text-sm font-medium px-5 py-3 rounded-xl shadow-lg max-w-[90vw]">
          <span>{checkoutError}</span>
          <button onClick={() => setCheckoutError(null)} className="ml-2 text-red-400 hover:text-red-600 shrink-0">✕</button>
        </div>
      )}

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
