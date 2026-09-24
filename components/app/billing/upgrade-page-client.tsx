"use client"

import type React from "react"
import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, Check, Loader2 } from "lucide-react"
import { hasInAppHistory } from "@/lib/ui/app-navigation"
import { isNativeApp } from "@/lib/native-bridge"
import { STORELIB_LOGO } from "@/lib/brand/logo"

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
  const goBack = (e: React.MouseEvent) => {
    if (!hasInAppHistory()) return
    e.preventDefault()
    router.back()
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

  const descriptions: Record<string, string> = {
    free: "Start selling with no monthly cost.",
    growth: "A smaller fee on every sale, and your own domain.",
    pro: "The smallest fee, and support that answers first.",
  }

  const featureLists: Record<string, string[]> = {
    free: ["6% + $0.25 per transaction", "Unlimited digital products", "Basic OnePage features", "500 emails / month"],
    growth: ["3% + $0.25 per transaction", "Unlimited digital products", "Premium OnePage features", "Custom domain", "Verified badge", "2,000 emails / month"],
    pro: ["1.5% + $0.25 per transaction", "Unlimited digital products", "Premium OnePage features", "Custom domain", "Verified badge", "5,000 emails / month", "Priority support"],
  }

  const currentPlan = plans.find((p: any) => p.id === currentPlanId)

  return (
    <div data-upgrade-page="" className="min-h-full">
      {/*
        ONE BAR, ONE WAY BACK. It used to carry a Back on the left and an X
        on the right that did the same thing. The bar sticks to the top of
        this page's own scroller. The status bar's strip above it is the
        layer's (components/app/page-layer.tsx), so it is not padded here too.
      */}
      <div className="sticky top-0 z-10 border-b border-[#e5e7eb]/60 bg-white/95 backdrop-blur-sm">
        <div className="relative flex h-14 items-center px-4 sm:h-16 sm:px-6">
          <Link
            href="/app/settings?tab=billing"
            onClick={goBack}
            data-upgrade-back=""
            className="-ml-2 inline-flex h-11 items-center gap-1.5 rounded-lg px-2 text-[14px] font-medium text-[#1a1a2e] transition-colors hover:bg-[#f3f4f6]"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="sm:hidden">Back</span>
            <span className="hidden sm:inline">Back to billing</span>
          </Link>
          <img
            src={STORELIB_LOGO_URL}
            alt="Storelib"
            width={28}
            height={28}
            className="pointer-events-none absolute left-1/2 h-6 -translate-x-1/2 rounded-[7px] sm:h-7"
          />
        </div>
      </div>

      <div className="mx-auto max-w-[1080px] px-4 pb-16 pt-8 sm:px-6 sm:pt-12 lg:px-8">
        <div className="mb-8 sm:mb-10 sm:text-center">
          <h1 className="text-[24px] font-bold text-[#1a1a2e] sm:text-[28px]">Choose a plan</h1>
          <p className="mt-1.5 text-[14px] text-[#6b7280]">Every plan sells without limits. A higher plan takes a smaller fee from each sale.</p>
        </div>

        {error && (
          <div role="alert" className="mx-auto mb-6 max-w-xl rounded-xl border border-red-200 bg-red-50 p-4 text-[13px] text-red-900">
            {error}
          </div>
        )}

        {/*
          One column on a phone, three from md, and never wider than three
          cards need: at 1920 the row is the same 1080px as at 1440, centred,
          rather than three cards stretched to read like a table.
        */}
        <div data-plan-grid="" className="grid grid-cols-1 gap-4 md:grid-cols-3 md:items-stretch">
          {plans.map((plan: any) => {
            const isCurrentPlan = plan.id === currentPlanId
            const isPendingPlan = plan.id === pendingPlanId
            const isFree = plan.id === "free"
            const isGrowth = plan.id === "growth"
            const isDowngrade = currentPlan ? plan.price_cents < currentPlan.price_cents : false
            const isUpgrade = currentPlan ? plan.price_cents > currentPlan.price_cents : false
            const monthlyPrice = plan.price_cents / 100
            const settled = isCurrentPlan || (cancelAtPeriodEnd && isFree) || isPendingPlan
            const isDisabled = isCurrentPlan || (cancelAtPeriodEnd && isFree) || (isPendingPlan && !isUpgrade) || loading !== null

            let buttonLabel: string
            if (loading === plan.id) buttonLabel = "Processing"
            else if (isCurrentPlan) buttonLabel = "Current plan"
            else if (isPendingPlan) buttonLabel = "Downgrade scheduled"
            else if (cancelAtPeriodEnd && isFree) buttonLabel = "Cancel scheduled"
            else if (cancelAtPeriodEnd) buttonLabel = "Upgrade again"
            else if (isDowngrade) buttonLabel = `Downgrade to ${plan.name}`
            else if (hasActiveSubscription) buttonLabel = `Upgrade to ${plan.name}`
            else buttonLabel = `Get ${plan.name}`

            return (
              <div
                key={plan.id}
                data-plan={plan.id}
                className={`relative flex flex-col rounded-2xl bg-white p-6 lg:p-7 ${
                  isGrowth
                    ? "border border-[#8b5cf6] shadow-[0_0_0_1px_#8b5cf6,0_8px_24px_-12px_rgba(139,92,246,0.35)]"
                    : "border border-[#e5e7eb]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[16px] font-semibold text-[#1a1a2e]">{plan.name}</p>
                  {isCurrentPlan && <span className="text-[12px] font-medium text-[#6b7280]">Your plan</span>}
                </div>

                <div className="mt-3 flex items-baseline gap-1">
                  <span className="text-[36px] font-bold leading-none tracking-tight text-[#1a1a2e]">
                    {isFree ? "$0" : `$${monthlyPrice % 1 === 0 ? monthlyPrice.toFixed(0) : monthlyPrice.toFixed(2)}`}
                  </span>
                  <span className="text-[14px] text-[#6b7280]">{isFree ? "forever" : "/ month"}</span>
                </div>
                <p className="mt-2 text-[14px] md:min-h-[40px] leading-snug text-[#6b7280]">{descriptions[plan.id] || ""}</p>

                <button
                  type="button"
                  onClick={() => handleUpgrade(plan.id)}
                  disabled={isDisabled}
                  className={`mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl text-[14px] font-semibold transition-colors disabled:cursor-not-allowed ${
                    settled
                      ? "bg-[#f3f4f6] text-[#9ca3af]"
                      : isGrowth
                        ? "bg-[#8b5cf6] text-white hover:bg-[#7c3aed]"
                        : "border border-[#e5e7eb] bg-white text-[#1a1a2e] hover:border-[#d1d5db] hover:bg-[#f9fafb]"
                  }`}
                >
                  {loading === plan.id && <Loader2 className="h-4 w-4 animate-spin" />}
                  {buttonLabel}
                </button>

                <ul className="mt-6 flex flex-1 flex-col gap-2.5 border-t border-[#f0f1f3] pt-5">
                  {(featureLists[plan.id] || []).map((feature: string) => (
                    <li key={feature} className="flex items-start gap-2.5 text-[14px] text-[#4b5563]">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#8b5cf6]" strokeWidth={2.5} />
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>

        <p className="mt-8 text-[13px] text-[#9ca3af] sm:text-center">You can change or cancel your plan at any time.</p>
      </div>
    </div>
  )
}
