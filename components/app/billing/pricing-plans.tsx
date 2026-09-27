"use client"

import { useState } from "react"
import { Check, Loader2 } from "lucide-react"

interface Plan {
  id: string
  name: string
  price_cents: number
  billing_period: string | null
  fee_percent: number
  fee_fixed_cents: number
  features: string[]
}

interface PricingPlansProps {
  plans: Plan[]
  currentPlanId: string
  onUpgrade: (planId: string) => Promise<void>
}

export function PricingPlans({ plans, currentPlanId, onUpgrade }: PricingPlansProps) {
  const [loading, setLoading] = useState<string | null>(null)

  const handleUpgrade = async (planId: string) => {
    if (planId === currentPlanId || loading) return

    setLoading(planId)
    try {
      await onUpgrade(planId)
    } catch (error) {
      console.error("Upgrade error:", error)
    } finally {
      setLoading(null)
    }
  }

  const formatPrice = (cents: number) => {
    return `$${(cents / 100).toFixed(0)}`
  }

  const formatFee = (feePercent: number, feeFixedCents: number) => {
    const percent = (feePercent * 100).toFixed(feePercent >= 0.01 ? 1 : 2)
    return `${percent}% + $${(feeFixedCents / 100).toFixed(2)}`
  }

  return (
    <div className="bg-white rounded-2xl app-card-x py-4 sm:py-6 shadow-sm border border-[#e5e7eb]">
      <h3 className="text-[15px] font-semibold text-[#1a1a2e] mb-4">Choose Your Plan</h3>
      <p className="text-[13px] text-[#6b7280] mb-6">
        Upgrade to reduce platform transaction fees and unlock premium features
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {plans.map((plan) => {
          const isCurrentPlan = plan.id === currentPlanId
          const isFree = plan.id === "free"

          return (
            <div
              key={plan.id}
              className={`relative rounded-xl border-2 p-5 transition-all ${
                isCurrentPlan
                  ? "border-[#8b5cf6] bg-[#faf5ff]"
                  : "border-[#e5e7eb] bg-white hover:border-[#d1d5db]"
              }`}
            >
              {isCurrentPlan && (
                <span className="absolute top-3 right-3 text-[10px] font-bold text-[#8b5cf6] bg-white px-2 py-1 rounded-full border border-[#8b5cf6]">
                  CURRENT
                </span>
              )}

              <div className="mb-4">
                <h4 className="text-[16px] font-bold text-[#1a1a2e] mb-1">{plan.name}</h4>
                <div className="flex items-baseline gap-1">
                  {isFree ? (
                    <span className="text-[28px] font-bold text-[#1a1a2e]">Free</span>
                  ) : (
                    <>
                      <span className="text-[28px] font-bold text-[#1a1a2e]">
                        {formatPrice(plan.price_cents)}
                      </span>
                      <span className="text-[13px] text-[#6b7280]">/month</span>
                    </>
                  )}
                </div>
              </div>

              <div className="mb-5">
                <div className="text-[12px] font-semibold text-[#6b7280] mb-2">
                  Platform Fee
                </div>
                <div className="text-[15px] font-bold text-[#8b5cf6]">
                  {formatFee(plan.fee_percent, plan.fee_fixed_cents)}
                </div>
                <div className="text-[11px] text-[#9ca3af] mt-0.5">per transaction</div>
              </div>

              <ul className="space-y-2.5 mb-5">
                {plan.features.map((feature, index) => (
                  <li key={index} className="flex items-start gap-2 text-[13px] text-[#374151]">
                    <Check className="h-4 w-4 text-[#8b5cf6] shrink-0 mt-0.5" strokeWidth={2.5} />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <button
                onClick={() => handleUpgrade(plan.id)}
                disabled={isCurrentPlan || loading !== null}
                className={`w-full h-10 text-[13px] font-medium rounded-lg transition-all flex items-center justify-center gap-2 ${
                  isCurrentPlan
                    ? "bg-[#e5e7eb] text-[#9ca3af] cursor-not-allowed"
                    : isFree
                      ? "bg-[#f3f4f6] text-[#374151] hover:bg-[#e5e7eb]"
                      : "bg-[#8b5cf6] text-white hover:bg-[#7c3aed]"
                }`}
              >
                {loading === plan.id ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : isCurrentPlan ? (
                  "Current Plan"
                ) : isFree ? (
                  "Downgrade"
                ) : (
                  "Upgrade"
                )}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
