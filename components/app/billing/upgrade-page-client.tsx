"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { X, ArrowLeft, Check, Loader2, Star } from "lucide-react"

const STORELIB_LOGO_URL =
  "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/5135%20(1).svg"

interface UpgradePageClientProps {
  plans: any[]
  currentPlanId: string
  hasActiveSubscription: boolean
}

export function UpgradePageClient({
  plans,
  currentPlanId,
  hasActiveSubscription,
}: UpgradePageClientProps) {
  const router = useRouter()
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "annual">("monthly")
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const goBack = () => {
    router.push("/app/settings/billing")
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
        const response = await fetch("/api/billing/subscription/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ planId }),
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
    free: "Perfect for getting started. Explore the basics at no cost.",
    growth: "Ideal for growing creators who want lower fees and more tools.",
    pro: "For professionals who demand the lowest fees and premium features.",
  }

  const featureLists: Record<string, (plan: any) => string[]> = {
    free: (plan) => [
      `${(plan.fee_percent * 100).toFixed(1)}% + $0.25 per transaction`,
      "Basic analytics dashboard",
      "Standard email support",
      "Up to 10 products",
      "Community access",
    ],
    growth: (plan) => [
      `${(plan.fee_percent * 100).toFixed(1)}% + $0.25 per transaction`,
      "Advanced analytics & reports",
      "Priority email support",
      "Custom domain support",
      "Unlimited products",
      "Email marketing tools",
      "Discount codes",
    ],
    pro: (plan) => [
      `${(plan.fee_percent * 100).toFixed(2)}% + $0.25 per transaction`,
      "Premium analytics & insights",
      "Dedicated account manager",
      "White-label options",
      "Full API access",
      "Unlimited products",
      "Custom integrations",
      "Priority processing",
      "Advanced automation",
    ],
  }

  return (
    <div className="fixed inset-0 z-[60] bg-white overflow-y-auto">
      {/* Top bar */}
      <div className="sticky top-0 z-10 bg-white border-b border-[#e5e7eb]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between h-14 sm:h-16">
          <button
            onClick={goBack}
            className="flex items-center gap-1.5 text-[13px] sm:text-[14px] font-medium text-[#7c3aed] hover:text-[#6d28d9] transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Back to billing</span>
            <span className="sm:hidden">Back</span>
          </button>

          <img
            src={STORELIB_LOGO_URL}
            alt="Storelib"
            className="h-6 sm:h-7 absolute left-1/2 -translate-x-1/2"
          />

          <button
            onClick={goBack}
            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-[#f3f4f6] transition-colors"
          >
            <X className="h-5 w-5 text-[#6b7280]" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
        {/* Title */}
        <div className="text-center mb-4">
          <h1 className="text-[28px] sm:text-[36px] font-bold text-[#1a1a2e]">Choose Your Plan</h1>
          <p className="text-[15px] text-[#6b7280] mt-2">Scale your business with the right plan for you</p>
        </div>

        {/* Error */}
        {error && (
          <div className="max-w-xl mx-auto mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-[13px] text-red-900">
            {error}
          </div>
        )}

        {/* Monthly / Annual toggle */}
        <div className="flex justify-center mb-10">
          <div className="inline-flex items-center bg-[#f3f4f6] rounded-full p-1">
            <button
              onClick={() => setBillingPeriod("monthly")}
              className={`px-6 py-2.5 text-[14px] font-medium rounded-full transition-all duration-200 ${
                billingPeriod === "monthly" ? "bg-white text-[#1a1a2e] shadow-sm" : "text-[#6b7280] hover:text-[#374151]"
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingPeriod("annual")}
              className={`px-6 py-2.5 text-[14px] font-medium rounded-full transition-all duration-200 flex items-center gap-2 ${
                billingPeriod === "annual" ? "bg-white text-[#1a1a2e] shadow-sm" : "text-[#6b7280] hover:text-[#374151]"
              }`}
            >
              Annual
              <span className="text-[11px] font-bold text-[#7c3aed] bg-[#ede9fe] px-2 py-0.5 rounded-full">Save 35%</span>
            </button>
          </div>
        </div>

        {/* Plan Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
          {plans.map((plan: any) => {
            const isCurrentPlan = plan.id === currentPlanId
            const isFree = plan.id === "free"
            const isPro = plan.id === "pro"
            const currentPlan = plans.find((p: any) => p.id === currentPlanId)
            const isDowngrade = currentPlan ? plan.price_cents < currentPlan.price_cents : false
            const monthlyPrice = plan.price_cents / 100
            const annualPrice = Math.round(monthlyPrice * 0.65 * 100) / 100
            const displayPrice = billingPeriod === "annual" && !isFree ? annualPrice : monthlyPrice

            return (
              <div
                key={plan.id}
                className={`relative rounded-2xl p-6 sm:p-7 flex flex-col transition-all duration-200 ${
                  isPro
                    ? "bg-[#1a1a2e] text-white shadow-xl border-2 border-[#7c3aed]/30 scale-[1.02]"
                    : "bg-white border-2 border-[#e5e7eb] hover:border-[#d1d5db] shadow-sm hover:shadow-md"
                }`}
              >
                {isPro && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                    <span className="inline-flex items-center gap-1 px-3.5 py-1 bg-[#7c3aed] rounded-full text-[11px] font-bold text-white shadow-lg">
                      <Star className="h-3 w-3 fill-white" />
                      Popular
                    </span>
                  </div>
                )}

                <div className="mb-5">
                  <h3 className={`text-[20px] font-bold mb-1.5 ${isPro ? "text-white" : "text-[#1a1a2e]"}`}>
                    {plan.name}
                  </h3>
                  <p className={`text-[13px] leading-relaxed ${isPro ? "text-white/70" : "text-[#6b7280]"}`}>
                    {descriptions[plan.id] || ""}
                  </p>
                </div>

                <div className="mb-6">
                  {isFree ? (
                    <>
                      <div className={`text-[40px] font-bold leading-none ${isPro ? "text-white" : "text-[#1a1a2e]"}`}>$0</div>
                      <p className={`text-[13px] mt-1.5 ${isPro ? "text-white/60" : "text-[#9ca3af]"}`}>Free forever</p>
                    </>
                  ) : (
                    <>
                      <div className="flex items-baseline gap-1">
                        <span className={`text-[40px] font-bold leading-none ${isPro ? "text-white" : "text-[#1a1a2e]"}`}>
                          ${displayPrice % 1 === 0 ? displayPrice.toFixed(0) : displayPrice.toFixed(2)}
                        </span>
                        <span className={`text-[15px] ${isPro ? "text-white/60" : "text-[#9ca3af]"}`}>/mo</span>
                      </div>
                      {billingPeriod === "annual" && (
                        <p className={`text-[13px] mt-1.5 ${isPro ? "text-white/60" : "text-[#9ca3af]"}`}>
                          Billed annually (${(displayPrice * 12).toFixed(0)}/year)
                        </p>
                      )}
                    </>
                  )}
                </div>

                <button
                  onClick={() => handleUpgrade(plan.id)}
                  disabled={isCurrentPlan || loading !== null}
                  className={`w-full h-12 text-[14px] font-semibold rounded-xl transition-all duration-200 flex items-center justify-center gap-2 mb-6 ${
                    isCurrentPlan
                      ? isPro
                        ? "bg-white/20 text-white/80 cursor-default"
                        : "bg-[#f3f4f6] text-[#9ca3af] cursor-default"
                      : isPro
                        ? "bg-[#7c3aed] hover:bg-[#6d28d9] text-white shadow-lg shadow-[#7c3aed]/25 hover:shadow-[#7c3aed]/40"
                        : "bg-[#7c3aed] hover:bg-[#6d28d9] text-white"
                  }`}
                >
                  {loading === plan.id ? (
                    <><Loader2 className="h-4 w-4 animate-spin" />Processing...</>
                  ) : isCurrentPlan ? (
                    "Current Plan"
                  ) : isDowngrade ? (
                    `Downgrade to ${plan.name}`
                  ) : hasActiveSubscription ? (
                    `Upgrade to ${plan.name}`
                  ) : (
                    `Get started with ${plan.name}`
                  )}
                </button>

                <ul className="space-y-3 flex-1">
                  {(featureLists[plan.id]?.(plan) || plan.features || []).map((feature: string, idx: number) => (
                    <li key={idx} className={`flex items-start gap-2.5 text-[13px] ${isPro ? "text-white/80" : "text-[#374151]"}`}>
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                        isPro ? "bg-[#7c3aed]/30" : "bg-[#ede9fe]"
                      }`}>
                        <Check className={`h-3 w-3 ${isPro ? "text-[#a78bfa]" : "text-[#7c3aed]"}`} strokeWidth={3} />
                      </div>
                      <span>{feature}</span>
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
