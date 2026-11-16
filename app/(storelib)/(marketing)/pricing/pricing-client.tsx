"use client"

import { useLayoutEffect, useState, useSyncExternalStore } from "react"
import { PricingSection, type PaidCheckoutPlanId } from "@/components/marketing/pricing-section"
import { FaqSection } from "@/components/marketing/faq-section"
import { CtaSection } from "@/components/marketing/cta-section"
import type { PlanCardAction } from "@/components/billing/plan-cards"
import { PRO_CHECKOUT_PLAN_ID, SCALE_CHECKOUT_PLAN_ID, type OfferedPlanId } from "@/lib/billing/plans"
import { readAuthSnapshot, subscribeAuthSnapshot } from "@/lib/auth/auth-snapshot"
import { SheetStack } from "./pricing-sheets"
import { PricingBento } from "./pricing-bento"
import { ComparePlans } from "./compare-plans"

/** Pro checkout sends the internal plan id "growth" (the $29 Stripe price), Scale sends SCALE_CHECKOUT_PLAN_ID (the existing $99 price). */
type CheckoutPlanId = PaidCheckoutPlanId

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

/*
  LANDING ROUND 13, THE OWNER: no "Compare Storelib" line of links and no row
  of four badges under the cards. The cards, then three sheets that rise over
  them one after another as the page scrolls (./pricing-sheets): what comes
  with a store (./pricing-bento), every feature plan by plan
  (./compare-plans), and the questions. The closing call to action follows.
*/
export function PricingPageClient() {
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

  /* The compare table's buttons do what the cards' buttons do: sign up, or straight to checkout for somebody signed in. */
  const compareAction = (id: OfferedPlanId, label: string): PlanCardAction => {
    if (id !== "free" && upgradeCallbacks) {
      const paid = id as CheckoutPlanId
      return {
        label,
        onClick: () => !upgradeCallbacks.loadingPlan && upgradeCallbacks.onPlanSelect(paid),
        disabled: !!upgradeCallbacks.loadingPlan,
        loading: upgradeCallbacks.loadingPlan === paid,
      }
    }
    return { label, href: "/signup" }
  }
  const compareActions: Record<OfferedPlanId, PlanCardAction> = {
    free: compareAction("free", "Start free"),
    [PRO_CHECKOUT_PLAN_ID]: compareAction(PRO_CHECKOUT_PLAN_ID, "Get Grow"),
    [SCALE_CHECKOUT_PLAN_ID]: compareAction(SCALE_CHECKOUT_PLAN_ID, "Get Pro"),
  }

  /*
    No overflow on this wrapper: an overflow other than visible or clip would
    make it the sheets' scroll container and stop them sticking. <html>
    already clips anything too wide.
  */
  return (
    <div className="bg-white">
      {/* Checkout error banner */}
      {checkoutError && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-red-50 border border-red-200 text-red-700 text-sm font-medium px-5 py-3 rounded-xl shadow-lg max-w-[90vw]">
          <span>{checkoutError}</span>
          <button type="button" aria-label="Dismiss" onClick={() => setCheckoutError(null)} className="ml-2 text-red-400 hover:text-red-600 shrink-0">✕</button>
        </div>
      )}

      <SheetStack
        sheets={[
          {
            id: "plans",
            tone: "light",
            node: (
              /* The plans' heading is this page's h1: /pricing had none (a browser agent and a screen reader look for one). */
              <PricingSection
                headingLevel={1}
                hideDetailsLink
                headingOverride={isUpgradeMode ? "Choose a plan" : undefined}
                subtitleOverride={isUpgradeMode ? "Grow is $29 a month. Cancel at any time from Billing." : undefined}
                upgradeCallbacks={upgradeCallbacks}
              />
            ),
          },
          { id: "included", tone: "dark", node: <PricingBento /> },
          { id: "compare", tone: "light", node: <ComparePlans actions={compareActions} /> },
          { id: "faq", tone: "light", node: <FaqSection editorial /> },
        ]}
      />

      {/* CTA - Turn your ideas into income */}
      <CtaSection />
    </div>
  )
}
