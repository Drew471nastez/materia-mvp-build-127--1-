"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { X, ArrowLeft, Check, Loader2, ArrowRight } from "lucide-react"

const STORELIB_LOGO_URL =
  "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/5135%20(1).svg"

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

  const goBack = () => {
    if (closing) return
    setClosing(true)
    // Show spinner briefly, then navigate
    setTimeout(() => {
      router.push("/app/settings/billing")
    }, 400)
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
        if (!response.ok) {
          const err = await response.json()
          throw new Error(err.error || "Failed to create checkout session")
        }
        const { checkoutUrl } = await response.json()
        if (checkoutUrl) {
          window.location.href = checkoutUrl
        }
      }
    } catch (err: any) {
      setError(err.message || "An error occurred")
    } finally {
      setLoading(null)
    }
  }

  const descriptions: Record<string, string> = {
    free: "Perfect for getting started.",
    growth: "For creators ready to scale and pay lower fees.",
    pro: "For serious creators who want the lowest fees and priority support.",
  }

  const featureLists: Record<string, string[]> = {
    free: ["6% + $0.25 per transaction", "Unlimited digital products", "Basic OnePage features", "500 emails / month"],
    growth: ["3% + $0.25 per transaction", "Unlimited digital products", "Premium OnePage features", "Custom domain", "Verified badge", "2,000 emails / month"],
    pro: ["1.5% + $0.25 per transaction", "Unlimited digital products", "Premium OnePage features", "Custom domain", "Verified badge", "5,000 emails / month", "Priority support"],
  }

  return (
    <div className="relative bg-white min-h-full">
      {/* Smooth close overlay — absolute so it stays within the scroll container */}
      {closing && (
        <div className="absolute inset-0 z-[10] bg-white/90 backdrop-blur-sm flex items-center justify-center animate-in fade-in">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-6 w-6 text-[#7c3aed] animate-spin" />
            <p className="text-[13px] text-[#6b7280] font-medium">Going back...</p>
          </div>
        </div>
      )}
      {/* Top bar — sticky within the app layout's overflow-y-auto scroll container */}
      <div className="sticky top-0 z-10 bg-white border-b border-[#e5e7eb]">
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
            className="h-6 sm:h-7 absolute left-1/2 -translate-x-1/2 pointer-events-none"
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
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
        {/* Title */}
        <div className="text-center mb-10">
          <h1 className="text-[28px] sm:text-[36px] font-bold text-[#1a1a2e]">Choose Your Plan</h1>
          <p className="text-[15px] text-[#6b7280] mt-2">Scale your business with the right plan for you</p>
        </div>

        {/* Error */}
        {error && (
          <div className="max-w-xl mx-auto mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-[13px] text-red-900">
            {error}
          </div>
        )}

        {/* Plan Cards — same visual style as /pricing page */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-[18px] md:gap-4 max-w-[960px] mx-auto md:items-stretch">
          {plans.map((plan: any) => {
            const isCurrentPlan = plan.id === currentPlanId
            const isPendingPlan = plan.id === pendingPlanId
            const isFree = plan.id === "free"
            const isGrowth = plan.id === "growth"
            const currentPlan = plans.find((p: any) => p.id === currentPlanId)
            const isDowngrade = currentPlan ? plan.price_cents < currentPlan.price_cents : false
            const isUpgrade = currentPlan ? plan.price_cents > currentPlan.price_cents : false
            const monthlyPrice = plan.price_cents / 100
            const isDisabled = isCurrentPlan || (cancelAtPeriodEnd && isFree) || (isPendingPlan && !isUpgrade) || loading !== null

            const badge = isGrowth ? "Most Popular" : plan.id === "pro" ? "Recommended" : null

            let buttonLabel: string
            if (loading === plan.id) buttonLabel = "Processing..."
            else if (isCurrentPlan) buttonLabel = "Current Plan"
            else if (isPendingPlan) buttonLabel = "Downgrade Scheduled"
            else if (cancelAtPeriodEnd && isFree) buttonLabel = "Cancel Scheduled"
            else if (cancelAtPeriodEnd) buttonLabel = "Upgrade Again"
            else if (isDowngrade) buttonLabel = `Downgrade to ${plan.name}`
            else if (hasActiveSubscription) buttonLabel = `Upgrade to ${plan.name}`
            else buttonLabel = `Get started with ${plan.name}`

            return (
              <div
                key={plan.id}
                className={`bg-white rounded-3xl relative flex flex-col transition-all duration-300 hover:-translate-y-1 hover:shadow-md ${
                  isGrowth
                    ? "p-9 md:py-12 border-[1.5px] border-violet-600 shadow-[0_0_0_1px_#7c3aed] shadow-md"
                    : "p-9 border-[1.5px] border-neutral-200"
                }`}
              >
                {badge && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-violet-600 text-white text-xs font-semibold px-3.5 py-1 rounded-full whitespace-nowrap">
                    {badge}
                  </span>
                )}

                <div className="font-semibold text-lg mb-1.5">{plan.name}</div>

                <div className="flex items-baseline gap-1 mb-1">
                  <span className="text-[42px] font-bold tracking-tight leading-none">
                    {isFree ? "$0" : `$${monthlyPrice % 1 === 0 ? monthlyPrice.toFixed(0) : monthlyPrice.toFixed(2)}`}
                  </span>
                  {!isFree && <span className="text-sm text-neutral-400">/mo</span>}
                </div>
                {isFree && <p className="text-[13px] text-neutral-400 mb-1">Free forever</p>}

                <p className="text-[13px] text-neutral-400 mb-5 leading-relaxed">{descriptions[plan.id] || ""}</p>

                <button
                  onClick={() => handleUpgrade(plan.id)}
                  disabled={isDisabled}
                  className={`relative w-full inline-flex items-center justify-center gap-2 text-[15px] font-semibold py-3.5 px-8 rounded-lg transition-all duration-300 overflow-hidden mb-7 ${
                    isCurrentPlan || (cancelAtPeriodEnd && isFree) || isPendingPlan
                      ? "bg-[#f3f4f6] text-[#9ca3af] cursor-default"
                      : isGrowth
                        ? "bg-violet-600 text-white hover:bg-violet-700 hover:-translate-y-0.5"
                        : "bg-white text-neutral-900 border-[1.5px] border-neutral-200 hover:border-neutral-400 hover:-translate-y-0.5"
                  } disabled:cursor-not-allowed`}
                >
                  {isGrowth && !isCurrentPlan && !isPendingPlan && !(cancelAtPeriodEnd && isFree) && (
                    <span className="btn-shine-effect" aria-hidden="true" />
                  )}
                  <span className="relative z-10 flex items-center gap-2">
                    {loading === plan.id ? (
                      <><Loader2 className="h-4 w-4 animate-spin" />Processing...</>
                    ) : (
                      <>{buttonLabel}{!isCurrentPlan && !isPendingPlan && !(cancelAtPeriodEnd && isFree) && <ArrowRight className="h-4 w-4" />}</>
                    )}
                  </span>
                </button>

                <ul className="flex flex-col gap-2.5 flex-1">
                  {(featureLists[plan.id] || []).map((feature: string, idx: number) => (
                    <li key={idx} className="flex items-start gap-2.5 text-sm text-neutral-500">
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${isGrowth ? "bg-violet-600" : "bg-violet-50"}`}>
                        <Check className={`h-3 w-3 ${isGrowth ? "text-white" : "text-violet-600"}`} strokeWidth={3} />
                      </div>
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>

        <div className="text-center mt-10">
          <p className="text-[13px] text-[#9ca3af]">
            All plans include core features. Upgrade or downgrade anytime.
          </p>
        </div>
      </div>
    </div>
  )
}
