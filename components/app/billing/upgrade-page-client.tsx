"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { X, ArrowLeft } from "lucide-react"
import { isNativeApp } from "@/lib/native-bridge"
import { STORELIB_LOGO } from "@/lib/brand/logo"
import { PlanCards, type PlanCardAction } from "@/components/billing/plan-cards"
import { PLAN_FOOTNOTE, formatPlanPrice, offeredPlan, planHighlights, type OfferedPlanId } from "@/lib/billing/plans"

const STORELIB_LOGO_URL = STORELIB_LOGO

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
  const [closing, setClosing] = useState(false)

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

  const goBack = () => {
    if (closing) return
    /**
     * LEAVES, RATHER THAN SHOWING A SPINNER WHILE IT LEAVES.
     *
     * This used to set a flag that drew a full-screen spinner and then
     * navigated 400ms later. Nothing was loading during those 400ms — the
     * spinner was there to fill a pause invented to make the spinner
     * visible, and it is the reason closing this felt worse than opening it.
     *
     * Now the panel animates out and the navigation happens as it finishes,
     * so the 180ms is the movement rather than a wait in front of it.
     */
    setClosing(true)
    setTimeout(() => {
      router.push("/app/settings?tab=billing")
    }, 180)
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
      disabled: loading !== null,
      loading: loading === id,
    }
  }

  return (
    <div
      className={`relative bg-[#f8f9fa] min-h-full ${closing ? "upgrade-leaving" : "upgrade-arriving"}`}
    >
      {/* The close overlay that used to live here is gone: see `goBack`. */}
      {/* Top bar — sticky within the app layout's overflow-y-auto scroll container */}
      <div className="sticky top-0 z-30 bg-white border-b border-[#e5e7eb]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between h-14 sm:h-16">
          <button
            onClick={goBack}
            className="flex items-center gap-1.5 text-[13px] sm:text-[14px] font-medium text-[#7c3aed] hover:text-[#6d28d9] transition-colors cursor-pointer relative z-10"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Back to billing</span>
            <span className="sm:hidden">Back</span>
          </button>

          <img
            src={STORELIB_LOGO_URL}
            alt="Storelib"
            className="h-6 sm:h-7 absolute left-1/2 -translate-x-1/2 pointer-events-none rounded-[7px]"
          />

          <button
            onClick={goBack}
            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-[#f3f4f6] transition-colors cursor-pointer relative z-10"
          >
            <X className="h-5 w-5 text-[#6b7280]" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-14">
        {/* Title */}
        <div className="text-center mb-8 sm:mb-10">
          <h1 className="text-[24px] sm:text-[28px] font-bold text-[#1a1a2e]">Choose a plan</h1>
          <p className="text-[14px] text-[#6b7280] mt-2">Pro is $29 a month. Change or cancel it from Billing at any time.</p>
        </div>

        {/* Error */}
        {error && (
          <div role="alert" className="max-w-xl mx-auto mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-[13px] text-red-900">
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
          className="max-w-[820px] mx-auto"
        />

        <p className="mt-6 text-center text-[13px] leading-[1.5] text-[#6b7280]">{PLAN_FOOTNOTE}</p>
      </div>
    </div>
  )
}
