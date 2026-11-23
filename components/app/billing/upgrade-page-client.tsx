"use client"

import type React from "react"
import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, Loader2, X } from "lucide-react"
import { hasInAppHistory } from "@/lib/ui/app-navigation"
import { startNavigationLoading } from "@/components/app/navigation-loading-bar"
import { moveLayer } from "@/components/app/page-layer"
import { backThen } from "@/lib/navigation/go-back"
import { isNativeApp } from "@/lib/native-bridge"
import { StorelibLogo } from "@/components/brand/storelib-logo"
import type { PlanCardAction } from "@/components/billing/plan-cards"
/*
  ROUND 58, THE OWNER: the cards, the buttons, the compare table and the
  questions "must match the public pricing page", from the same components
  and the same data, "so the two can never disagree on prices or features".
  So this page draws /pricing's own sections: PricingSection (the heading,
  the cards from lib/billing/plans OFFERED_PLANS and pricing-lines, the
  Monthly and Yearly pill, Contact sales), ComparePlans with its Compare all
  features link (planComparison), and FaqSection. Only the buttons' actions
  are this page's: checkout, a plan change, the current plan.
*/
import { PricingSection } from "@/components/marketing/pricing-section"
import { ComparePlans, CompareLink } from "@/app/(storelib)/(marketing)/pricing/compare-plans"
import { FaqSection } from "@/components/marketing/faq-section"
import { formatPlanPrice, offeredPlan, PRO_PRICE_CENTS, type OfferedPlanId } from "@/lib/billing/plans"
import { tt } from "@/lib/i18n/text"

/** Where Back goes: the Billing tab this page was opened from. */
const BILLING_HREF = "/app/settings?tab=billing"

interface UpgradePageClientProps {
  plans: any[]
  currentPlanId: string
  hasActiveSubscription: boolean
  pendingPlanId?: string | null
  cancelAtPeriodEnd?: boolean
}

export function UpgradePageClient({
  plans,
  currentPlanId,
  hasActiveSubscription,
  pendingPlanId,
  cancelAtPeriodEnd = false,
}: UpgradePageClientProps) {
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Listen for in-app browser tab closing (native Capacitor)
  // When user finishes Stripe checkout and the tab closes,
  // navigate to billing page to show success/updated plan
  useEffect(() => {
    if (!isNativeApp()) return
    let cleanup: (() => void) | undefined
    import("@capacitor/browser")
      .then(({ Browser }) => {
        const listener = Browser.addListener("browserFinished", () => {
          // Tab closed — user either completed payment or cancelled
          // Navigate to billing to show latest status
          setLoading(null)
          router.push("/app/settings/billing?success=1")
        })
        cleanup = () => { listener.then(h => h.remove()) }
      })
      .catch(() => {})
    return () => { cleanup?.() }
  }, [router])


  const handleUpgrade = async (planId: string) => {
    if (planId === currentPlanId || loading) return
    setLoading(planId)
    setError(null)

    try {
      if (planId === "free") {
        const response = await fetch("/api/billing/subscription/cancel", { method: "POST" })
        if (!response.ok) {
          const err = await response.json()
          throw new Error(err.error || tt("Failed to cancel subscription"))
        }
        router.push("/app/settings/billing?success=1")
        return
      }

      if (hasActiveSubscription) {
        // Change plan
        const response = await fetch("/api/billing/subscription/change", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ newPlanId: planId }),
        })
        if (!response.ok) {
          const err = await response.json()
          throw new Error(err.error || tt("Failed to change plan"))
        }
        router.push("/app/settings/billing?success=1")
      } else {
        // Create new subscription - redirect to Stripe Checkout
        const origin = window.location.origin
        const response = await fetch("/api/billing/subscription/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            planId,
            successUrl: `${origin}/app/settings/billing?success=1`,
            cancelUrl: `${origin}/app/settings/billing/upgrade`,
          }),
        })
        const data = await response.json()
        if (!response.ok) {
          throw new Error(data.error || tt("Failed to create checkout session"))
        }
        const { checkoutUrl } = data
        if (checkoutUrl) {
          if (isNativeApp()) {
            // Native: open Stripe checkout in an in-app browser tab
            // iOS → SFSafariViewController, Android → Chrome Custom Tab
            // These appear as an overlay tab within the app, not the full browser
            try {
              const { Browser } = await import("@capacitor/browser")
              await Browser.open({
                url: checkoutUrl,
                toolbarColor: "#ffffff",
                presentationStyle: "popover",
              })
            } catch {
              // Fallback: redirect in same webview
              window.location.href = checkoutUrl
            }
            return // Don't clear loading — browser tab is open
          }
          // Web: redirect in same tab — Stripe redirects back after payment
          window.location.href = checkoutUrl
          return
        }
      }
    } catch (err: any) {
      setError(err.message || tt("An error occurred"))
    } finally {
      setLoading(null)
    }
  }

  /**
   * Three plans are offered: Free, Pro (internal id "growth") and Scale
   * (internal id "pro", the $99 plan, on sale again). The current plan is
   * found in the full list to decide which way a change goes.
   */
  const currentPlan = plans.find((p: any) => p.id === currentPlanId)
  const currentPriceCents = currentPlan?.price_cents ?? (currentPlanId === "free" ? 0 : null)

  const actionFor = (id: OfferedPlanId): PlanCardAction => {
    const offered = offeredPlan(id)
    const priceCents = plans.find((p: any) => p.id === id)?.price_cents ?? offered.priceCents
    const isCurrentPlan = id === currentPlanId
    const isPendingPlan = id === pendingPlanId
    const isFree = id === "free"
    const isDowngrade = currentPriceCents !== null && priceCents < currentPriceCents
    const isUpgrade = currentPriceCents !== null && priceCents > currentPriceCents

    let label: string
    if (isCurrentPlan) label = "Current plan"
    else if (isPendingPlan) label = isFree ? "Downgrade scheduled" : "Switch scheduled"
    else if (cancelAtPeriodEnd && isFree) label = "Cancellation scheduled"
    else if (isDowngrade) label = `Downgrade to ${offered.name}`
    else if (hasActiveSubscription) label = `Upgrade to ${offered.name}`
    else label = `Get ${offered.name}`

    const settled = isCurrentPlan || (cancelAtPeriodEnd && isFree) || (isPendingPlan && !isUpgrade)
    return {
      label,
      onClick: () => handleUpgrade(id),
      settled,
      current: isCurrentPlan,
      disabled: loading !== null,
      loading: loading === id,
    }
  }

  /*
    The compare table's buttons do what the cards' do, in words that fit its
    narrow columns on a phone: /pricing's own "Get Grow" and "Get Pro", and
    "Current plan" or "Scheduled" where the card's button is settled.
  */
  const compareActionFor = (id: OfferedPlanId): PlanCardAction => {
    const card = actionFor(id)
    const name = offeredPlan(id).name
    const label = card.current ? tt("Current plan") : card.settled ? tt("Scheduled") : /^Downgrade/.test(card.label) ? tt("Move to {name}", { name }) : tt("Get {name}", { name })
    return { ...card, label }
  }

  return (
    <div
      data-upgrade-page=""
      /* One number for the bar's height, read by the bar and by the compare table's plan row that sticks under it (--pz-head). */
      className="min-h-full bg-white [--upgrade-bar:56px] [--pz-head:var(--upgrade-bar)] sm:[--upgrade-bar:64px]"
    >
      <style href="upgrade-r58" precedence="default">{UPGRADE_CSS}</style>
      <UpgradeBar />

      <div
        data-upgrade-body=""
        className="pb-[env(safe-area-inset-bottom,0px)] transition-opacity duration-200"
      >
        {error && (
          <div role="alert" className="mx-4 mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-[13px] text-red-900 sm:mx-auto sm:max-w-xl">
            {error}
          </div>
        )}

        {/* /pricing's plans section, with this page's actions and /pricing?source=upgrade's own heading and line. */}
        <PricingSection
          headingLevel={1}
          hideDetailsLink
          headingOverride={tt("Choose a plan")}
          subtitleOverride={tt("Grow is {price} a month. Cancel at any time from Billing.", { price: formatPlanPrice(PRO_PRICE_CENTS) })}
          actions={{ free: actionFor("free"), growth: actionFor("growth"), pro: actionFor("pro") }}
          lead={currentPlanId === "free" ? "growth" : undefined}
          cardsAside={<CompareLink />}
        />
        <ComparePlans actions={{ free: compareActionFor("free"), growth: compareActionFor("growth"), pro: compareActionFor("pro") }} />
        <FaqSection editorial />
      </div>
    </div>
  )
}

/*
  THE BAR, ITS OWN COMPONENT (round 58). A press on X or Billing changes only
  the bar (the spinner in X); the page under it goes quiet through CSS
  (UPGRADE_CSS, :has([data-leaving])), so the press never draws the cards,
  the compare table and the questions again. At a quarter of a phone's speed
  that drawing was a long task between the press and the drop.
*/
function UpgradeBar() {
  const router = useRouter()
  /* Back was pressed: said at once on the button and the page, whatever the page behind takes to arrive. */
  const [leaving, setLeaving] = useState(false)

  /* Billing is where Back goes when there is no page behind this one: fetched ahead, so the link lands at once. */
  useEffect(() => {
    router.prefetch("/app/settings?tab=billing")
  }, [router])

  /* Still here after a Back (restored from the browser's cache, or a navigation that never left): the page comes back to life. */
  useEffect(() => {
    if (!leaving) return
    const reset = () => setLeaving(false)
    const timer = window.setTimeout(reset, 8000)
    window.addEventListener("pageshow", reset)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener("pageshow", reset)
    }
  }, [leaving])

  /**
   * BACK IS BACK.
   *
   * It used to fade this page out and then push Billing 180ms later, which
   * put a new entry on the history: Back from Billing then came here again,
   * and the phone's back gesture and this button went to different places.
   *
   * Now, when the page before this one is an /app page, Back is the
   * browser's back: the same entry, where you were on it, with no wait in
   * front of it, and the page it returns to lands on the shell's usual
   * entrance. Opened any other way (a bookmark, a Stripe cancel link, an
   * email) there is nothing in the app to go back to, and the link does
   * what it says instead, to the Billing tab.
   */
  /*
    AND IT ANSWERS AT ONCE. The press turns the arrow into a small spinner and
    lets the page go quiet on the same frame, and the app's loading bar is
    told, so however long the Billing tab takes there is never a moment where
    the tap seems not to have landed.
  */
  const goBack = (e: React.MouseEvent) => {
    if (leaving) {
      e.preventDefault()
      return
    }
    setLeaving(true)
    startNavigationLoading(BILLING_HREF)
    if (!hasInAppHistory()) return
    e.preventDefault()
    /* On a phone the page drops away over the one it goes back to, the way every page layer leaves (components/app/page-layer.tsx). */
    /* And a back that does nothing (an entry the app counted and the browser
       replaced) is followed by the Billing tab itself within BACK_WATCH_MS,
       rather than leaving this page up under a spinner (lib/navigation/go-back). */
    moveLayer("leave", () => backThen(() => router.replace(BILLING_HREF)), false)
  }

  /*
    THE BAR (round 58, the owner: "an X button, and a back link to
    Billing"). Billing at the left, the mark in the middle, X at the
    right; both go to the same place (goBack). It sticks to the top of
    the layer's scroller, so the X is always within reach, and its sides
    clear a phone's rounded corners and notch in landscape. The status
    bar's strip above it is the layer's (components/app/page-layer.tsx).
  */
  return (
      <div data-upgrade-bar="" className="sticky top-0 z-20 border-b border-[#ececef] bg-white">
        <div
          className="relative flex h-[var(--upgrade-bar)] items-center justify-between"
          style={{ paddingLeft: "max(16px, env(safe-area-inset-left, 0px))", paddingRight: "max(16px, env(safe-area-inset-right, 0px))" }}
        >
          <Link
            href={BILLING_HREF}
            onClick={goBack}
            data-upgrade-back=""
            data-leaving={leaving ? "" : undefined}
            aria-busy={leaving || undefined}
            className="-ml-2 inline-flex h-11 items-center gap-1.5 rounded-lg px-2 text-[14px] font-medium text-[#1a1a2e] transition-[background-color,scale] duration-150 hover:bg-[#f3f4f6] active:scale-[0.97] active:bg-[#eceef1] data-[leaving]:bg-[#f3f4f6] [-webkit-tap-highlight-color:transparent]"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            {tt("Billing")}
          </Link>
          {/* The mark, 28 by 28 and never squeezed (both sides set from one size). */}
          <StorelibLogo size={28} priority data-upgrade-logo="" className="pointer-events-none absolute left-1/2 -translate-x-1/2" />
          <Link
            href={BILLING_HREF}
            onClick={goBack}
            aria-label={tt("Close")}
            data-upgrade-close=""
            data-leaving={leaving ? "" : undefined}
            aria-busy={leaving || undefined}
            className="-mr-1.5 inline-grid h-11 w-11 shrink-0 place-items-center rounded-full text-[#1a1a2e] transition-[background-color,scale] duration-150 hover:bg-[#f3f4f6] active:scale-[0.94] active:bg-[#eceef1] data-[leaving]:bg-[#f3f4f6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20 [-webkit-tap-highlight-color:transparent]"
          >
            {/* Pressed: a small spinner in its place at once, however long Billing takes. */}
            {leaving ? <Loader2 className="h-[18px] w-[18px] animate-spin text-[#4b5563]" aria-hidden /> : <X className="h-5 w-5" strokeWidth={2} aria-hidden />}
          </Link>
        </div>
      </div>
  )
}

/*
  On a phone the layer itself rises (layout.tsx), so the heading and cards do
  not rise inside it as well: one movement, not two. From 768px the layer is
  simply there and they come in as they do on /pricing.
*/
const UPGRADE_CSS = `
[data-upgrade-page]:has([data-upgrade-bar] [data-leaving]) [data-upgrade-body]{opacity:.6;pointer-events:none}
@media (max-width:767px){
  [data-upgrade-page] [data-pricing-enter] [data-pricing-title],[data-upgrade-page] [data-pricing-enter] [data-pricing-sub],[data-upgrade-page] [data-pricing-enter] [data-plan-slot],[data-upgrade-page] [data-pricing-enter] [data-plan-contact]{animation:none}
}
`
