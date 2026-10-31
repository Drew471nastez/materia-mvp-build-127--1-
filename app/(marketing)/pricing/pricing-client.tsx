"use client"

import { useLayoutEffect, useState, useSyncExternalStore, type ReactNode } from "react"
import { PricingSection } from "@/components/marketing/pricing-section"
import { FeaturesBadgesSection } from "@/components/marketing/features-badges-section"
import { ProductMarquee } from "@/components/marketing/product-marquee"
import { SplitFeaturesSection } from "@/components/marketing/split-features-section"
import { ToolStackSection } from "@/components/marketing/tool-stack-section"
import { FaqSection } from "@/components/marketing/faq-section"
import { CtaSection } from "@/components/marketing/cta-section"
import { PRO_CHECKOUT_PLAN_ID } from "@/lib/billing/plans"
import { readAuthSnapshot, subscribeAuthSnapshot } from "@/lib/auth/auth-snapshot"

/** Pro checkout sends the internal plan id "growth": the $29 Stripe price. */
type CheckoutPlanId = typeof PRO_CHECKOUT_PLAN_ID

/** Signed in, as the header last knew it (the footer and the tab bar read the same record). */
const readSignedIn = () => !!readAuthSnapshot()?.signedIn

/** ?source=upgrade&returnTo=…, read from the address because the page is static. */
function readUpgradeQuery(): { source?: string; returnTo?: string } {
  const q = new URLSearchParams(window.location.search)
  const raw = q.get("returnTo")
  let returnTo: string | undefined
  if (raw) {
    /* Decoded once more, as the server did with the value Next had already decoded. */
    try { returnTo = decodeURIComponent(raw) } catch { returnTo = raw }
  }
  return { source: q.get("source") ?? undefined, returnTo }
}

/** `compare` is the "Compare Storelib" line, rendered on the server (components/alternatives/compare-strip) so its list stays out of this bundle. */
export function PricingPageClient({ compare }: { compare?: ReactNode } = {}) {
  /*
    WHO IS SIGNED IN, AFTER HYDRATION. The server render is the signed out
    page; the header checks the session on mount and keeps this record in
    step, so a signed in visitor's Pro button turns into checkout as soon as
    it knows. Its label is the same either way, so nothing moves.
  */
  const isLoggedIn = useSyncExternalStore(subscribeAuthSnapshot, readSignedIn, () => false)
  /*
    THE UPGRADE MODE, read before the browser paints again. Its heading sits
    inside a scroll-in that is still at opacity 0 at that moment, so the
    renamed heading is the first one anybody sees.
  */
  const [{ source, returnTo }, setQuery] = useState<{ source?: string; returnTo?: string }>({})
  useLayoutEffect(() => setQuery(readUpgradeQuery()), [])
  const isUpgradeMode = source === "upgrade"
  const [loadingPlan, setLoadingPlan] = useState<CheckoutPlanId | null>(null)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)

  // Shared checkout handler — destination varies by mode
  const handleCheckout = async (planId: CheckoutPlanId, destination: string, cancelDestination: string) => {
    if (loadingPlan) return
    setCheckoutError(null)
    setLoadingPlan(planId)
    try {
      const origin = window.location.origin
      const res = await fetch("/api/billing/subscription/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId,
          successUrl: `${origin}${destination}`,
          cancelUrl: `${origin}${cancelDestination}`,
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

  // Append plan_activated=1 to a destination that may already have query params
  const withPlanActivated = (dest: string) =>
    dest.includes("?") ? `${dest}&plan_activated=1` : `${dest}?plan_activated=1`

  // Upgrade mode (coming from /app/onepage editor): return to the original page after checkout
  const handleUpgradePlanSelect = (planId: CheckoutPlanId) => {
    const destination = returnTo || "/app"
    handleCheckout(
      planId,
      withPlanActivated(destination),
      `/pricing?source=upgrade&returnTo=${encodeURIComponent(destination)}`,
    )
  }

  // Logged-in user on normal pricing page: go to /app after checkout
  const handleLoggedInPlanSelect = (planId: CheckoutPlanId) => {
    handleCheckout(planId, "/app?plan_activated=1", "/pricing")
  }

  // Determine which upgrade callbacks to pass to PricingSection
  const upgradeCallbacks = isUpgradeMode
    ? { onPlanSelect: handleUpgradePlanSelect, loadingPlan }
    : isLoggedIn
      ? { onPlanSelect: handleLoggedInPlanSelect, loadingPlan }
      : undefined

  return (
    <div className="bg-white overflow-x-hidden">
      {/* Checkout error banner */}
      {checkoutError && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-red-50 border border-red-200 text-red-700 text-sm font-medium px-5 py-3 rounded-xl shadow-lg max-w-[90vw]">
          <span>{checkoutError}</span>
          <button type="button" aria-label="Dismiss" onClick={() => setCheckoutError(null)} className="ml-2 text-red-400 hover:text-red-600 shrink-0">✕</button>
        </div>
      )}

      {/* PRICING */}
      {/* The plans' heading is this page's h1: /pricing had none (a browser agent and a screen reader look for one). */}
      <PricingSection
        headingLevel={1}
        hideDetailsLink
        headingOverride={isUpgradeMode ? "Choose a plan" : undefined}
        subtitleOverride={isUpgradeMode ? "Pro is $29 a month. Cancel at any time from Billing." : undefined}
        upgradeCallbacks={upgradeCallbacks}
      />

      {/* COMPARE STORELIB: a line of links to each comparison (lib/alternatives). */}
      {compare}

      {/* FEATURE BADGES - Launch in minutes, Cancel anytime, No coding, Get paid directly */}
      <FeaturesBadgesSection />

      {/* UNLIMITED POSSIBILITIES - Product categories marquee */}
      <ProductMarquee />

      {/* SPLIT FEATURES - Build Your One Page, Build Your Online Store */}
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
