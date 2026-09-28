"use client"

import type React from "react"
import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, Loader2 } from "lucide-react"
import { hasInAppHistory } from "@/lib/ui/app-navigation"
import { startNavigationLoading } from "@/components/app/navigation-loading-bar"
import { moveLayer } from "@/components/app/page-layer"
import { backThen } from "@/lib/navigation/go-back"
import { isNativeApp } from "@/lib/native-bridge"
import { StorelibLogo } from "@/components/brand/storelib-logo"
import { PlanCards, type PlanCardAction } from "@/components/billing/plan-cards"
import { ComparePlans } from "@/components/billing/compare-plans"
import { PlanFaq } from "@/components/billing/plan-faq"
import { PLAN_FOOTNOTE, formatPlanPrice, offeredPlan, planHighlights, type OfferedPlanId } from "@/lib/billing/plans"

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

  const handleUpgrade = async (planId: string) => {
    if (planId === currentPlanId || loading) return
    setLoading(planId)
    setError(null)

    try {
      if (planId === "free") {
        const response = await fetch("/api/billing/subscription/cancel", { method: "POST" })
        if (!response.ok) {
          const err = await response.json()
          throw new Error(err.error || "Failed to cancel subscription")
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
          throw new Error(err.error || "Failed to change plan")
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
          throw new Error(data.error || "Failed to create checkout session")
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
      setError(err.message || "An error occurred")
    } finally {
      setLoading(null)
    }
  }

  /**
   * Two plans are offered: Free and Pro (internal id "growth"). The $99 "pro"
   * plan is not for sale, but somebody already on it still lands here, so it
   * is found in the full list to decide which way a change goes.
   */
  const currentPlan = plans.find((p: any) => p.id === currentPlanId)
  const currentPriceCents = currentPlan?.price_cents ?? (currentPlanId === "free" ? 0 : null)
  const isLegacyPro = currentPlanId === "pro"

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
    else if (isLegacyPro && !isFree) label = `Switch to ${offered.name} at ${offered.price}`
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

  return (
    <div data-upgrade-page="" className="min-h-full bg-[#f8f9fa]">
      {/*
        ONE BAR, ONE WAY BACK. It used to carry a Back on the left and an X
        on the right that did the same thing. The bar sticks to the top of
        this page's own scroller. The status bar's strip above it is the
        layer's (components/app/page-layer.tsx), so it is not padded here too.
      */}
      {/*
        Solid white, not a translucent blur: the page's own colour, the colour
        of the strip under the status bar and of what shows above this bar
        when the page is pulled down (components/app/page-layer.tsx paints
        that). A see-through bar let the cards show through it as they
        scrolled under.
      */}
      {/* A little depth under it ("more depth, just a little"): a hairline and a soft shade. */}
      <div data-upgrade-bar="" className="sticky top-0 z-20 border-b border-[#e5e7eb]/70 bg-white shadow-[0_1px_2px_rgba(17,24,39,0.04),0_6px_16px_-10px_rgba(17,24,39,0.18)]">
        <div className="relative flex h-14 items-center app-gutter sm:h-16 sm:px-6">
          <Link
            href={BILLING_HREF}
            onClick={goBack}
            data-upgrade-back=""
            data-leaving={leaving ? "" : undefined}
            aria-busy={leaving || undefined}
            className="-ml-2 inline-flex h-11 items-center gap-1.5 rounded-lg px-2 text-[14px] font-medium text-[#1a1a2e] transition-[background-color,scale] duration-150 hover:bg-[#f3f4f6] active:scale-[0.97] active:bg-[#eceef1] data-[leaving]:bg-[#f3f4f6] [-webkit-tap-highlight-color:transparent]"
          >
            {leaving ? <Loader2 className="h-4 w-4 animate-spin text-[#4b5563]" aria-hidden /> : <ArrowLeft className="h-4 w-4" />}
            <span className="sm:hidden">Back</span>
            <span className="hidden sm:inline">Back to billing</span>
          </Link>
          {/*
            THE MARK WAS SQUASHED. It had a height class (24px on a phone) and
            no width class, so the width came from the width attribute, 28:
            a square mark drawn 28 by 24. Both sides are set now, from one
            size, and it may not shrink or stretch to fit anything.
          */}
          <StorelibLogo
            size={28}
            priority
            data-upgrade-logo=""
            className="pointer-events-none absolute left-1/2 -translate-x-1/2"
          />
        </div>
      </div>

      <div
        data-upgrade-body=""
        className={`mx-auto max-w-[1080px] app-gutter pb-16 pt-9 transition-opacity duration-200 sm:pt-14 ${leaving ? "pointer-events-none opacity-60" : ""}`}
      >
        {/*
          THE TITLE CARRIES THE PAGE. It was the size of a settings heading
          over two cards far larger than it; now it is the largest thing
          here, the size of the sections under the cards and a step past
          them, centred on a phone as on a computer, with a line under it
          that can be read without leaning in.
        */}
        <div className="mx-auto mb-9 max-w-[620px] text-center sm:mb-12">
          <h1 className="text-[32px] font-bold leading-[1.08] tracking-[-0.025em] text-[#1a1a2e] sm:text-[44px]">Choose a plan</h1>
          <p className="mt-3 text-balance text-[16px] leading-[1.5] text-[#6b7280] sm:mt-4 sm:text-[17px]">
            Start free. Upgrade when you&apos;re ready, and change or cancel anytime.
          </p>
        </div>

        {error && (
          <div role="alert" className="mx-auto mb-6 max-w-xl rounded-xl border border-red-200 bg-red-50 p-4 text-[13px] text-red-900">
            {error}
          </div>
        )}

        {isLegacyPro && currentPlan && (
          <p className="max-w-[820px] mx-auto mb-5 rounded-xl border border-[#e5e7eb] bg-white px-4 py-3 text-[14px] leading-[1.5] text-[#374151]">
            You are on an earlier Pro plan at {formatPlanPrice(currentPlan.price_cents)} a month, with a fee of {planHighlights("pro")[0]}. It stays as it is unless you change it.
          </p>
        )}

        <PlanCards
          actions={{ free: actionFor("free"), growth: actionFor("growth") }}
          lead={currentPlanId === "free" ? "growth" : undefined}
        />

        <p className="mt-6 text-center text-[13px] leading-[1.5] text-[#6b7280]">{PLAN_FOOTNOTE}</p>

        {/* The plans side by side, row by row, and the questions people ask before choosing. */}
        <div className="mt-16 space-y-16 sm:mt-24 sm:space-y-24">
          <ComparePlans />
          <PlanFaq />
        </div>
      </div>
    </div>
  )
}
