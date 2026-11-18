"use client"

import { useLayoutEffect, useState, useSyncExternalStore, type MouseEvent } from "react"
import { PricingSection, type PaidCheckoutPlanId } from "@/components/marketing/pricing-section"
import { FaqSection } from "@/components/marketing/faq-section"
import { FinalCta } from "@/components/marketing/home/final-cta"
import type { PlanCardAction } from "@/components/billing/plan-cards"
import { PRO_CHECKOUT_PLAN_ID, SCALE_CHECKOUT_PLAN_ID, type OfferedPlanId } from "@/lib/billing/plans"
import { readAuthSnapshot, subscribeAuthSnapshot } from "@/lib/auth/auth-snapshot"
import { SheetStack } from "./pricing-sheets"
import { PricingBento } from "./pricing-bento"
import { ComparePlans, COMPARE_HEADING } from "./compare-plans"

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

  LANDING ROUND 14, THE ORDER. Somebody on this page came to choose a plan,
  so the page answers in the order the questions come:
    1. the plans            what each costs and what it gives (the h1)
    2. compare all features the one question the cards leave: "what exactly
                            is different?", answered row by row while the
                            choice is still in mind. It rises over the cards
                            as a sheet, the page's one sheet.
    3. what you get         the tiles of what every store is (./pricing-bento):
                            reassurance once the plan is chosen. A plain
                            section in the page's flow (the owner: not a sheet).
    4. the questions        what is still in the way, just before the close.
    5. the close            the home page's own closing call
                            (components/marketing/home/final-cta), on its dark
                            ground, rounded at the top, running into the footer.
*/

/** Whether to move without animation (the visitor asked for less motion). */
const reduceMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches

/**
 * "COMPARE ALL FEATURES" at the top right of the cards (landing round 14).
 * A real link to #compare (it works without script); with script the page
 * glides there, the table's heading coming to rest just under the site's
 * bar. The compare sheet is the stack's last, never sticky, so where it sits
 * in the page is where it is drawn: one read on the click, nothing on scroll.
 */
function CompareLink() {
  const go = (e: MouseEvent<HTMLAnchorElement>) => {
    const title = document.getElementById("pz-cmp-title")
    if (!title) return
    e.preventDefault()
    const stack = title.closest<HTMLElement>("[data-pz-stack]")
    const head = stack ? parseFloat(getComputedStyle(stack).getPropertyValue("--pz-head")) || 0 : 0
    /* The table rises in along the scroll (compare-plans.tsx, .pz-cmp-in): where it will rest is where it is drawn less that lift. */
    const lift = title.parentElement ? getComputedStyle(title.parentElement).transform : "none"
    const dy = lift && lift !== "none" && typeof DOMMatrixReadOnly === "function" ? new DOMMatrixReadOnly(lift).m42 : 0
    const top = Math.max(0, title.getBoundingClientRect().top - dy + window.scrollY - head - 28)
    window.scrollTo({ top, behavior: reduceMotion() ? "auto" : "smooth" })
    history.replaceState(null, "", "#compare")
  }
  return (
    <a href="#compare" onClick={go} data-pricing-compare-link="" className="group inline-flex items-center gap-1.5 rounded-md text-[14.5px] font-medium text-[#18181b] underline decoration-[#d4d4d8] decoration-1 underline-offset-[5px] transition-colors duration-200 hover:decoration-[#18181b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#18181b]/25">
      {COMPARE_HEADING}
      <svg aria-hidden="true" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="transition-transform duration-300 ease-[cubic-bezier(.2,.8,.2,1)] group-hover:translate-y-[2px] motion-reduce:transition-none">
        <path d="M8 3.5v8.5M4.5 8.5 8 12l3.5-3.5" />
      </svg>
    </a>
  )
}

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
                cardsAside={<CompareLink />}
              />
            ),
          },
          { id: "compare", tone: "light", node: <ComparePlans actions={compareActions} /> },
        ]}
      />

      {/* Landing round 14: in the page's flow, not a sheet (the owner). */}
      <PricingBento />

      <FaqSection editorial />

      {/* Landing round 14, the owner: the home page's closing call in place of "Turn your ideas into income", on its own dark ground, its rounded top over the questions' white (pricing-sheets.tsx, .pz-close). */}
      <div className="pz-close" data-pz-close="">
        <FinalCta />
      </div>
    </div>
  )
}
