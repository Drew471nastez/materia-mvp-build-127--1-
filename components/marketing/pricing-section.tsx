"use client"

import Link from "next/link"
import { AnimateOnScroll } from "./bento-grid"
import { PlanCards, type PlanCardAction } from "@/components/billing/plan-cards"
import { PLAN_FOOTNOTE, PRO_CHECKOUT_PLAN_ID, type OfferedPlanId } from "@/lib/billing/plans"

/**
 * Free and Pro. Pro is the internal plan id `growth` (see lib/billing/plans.ts),
 * so every callback here receives "growth" when Pro is chosen.
 */
export interface PricingOnboardingCallbacks {
  onPlanSelect: (planId: OfferedPlanId) => void
  /** Whichever plan is being set up, so every button waits while one is. */
  loadingPlan: string | null
  ctaLabels: Record<OfferedPlanId, string>
}

const DEFAULT_CTA: Record<OfferedPlanId, string> = {
  free: "Start free",
  growth: "Get Pro",
}

export function PricingSection({
  hideDetailsLink,
  compact,
  onboardingCallbacks,
  headingOverride,
  subtitleOverride,
  upgradeCallbacks,
  headingLevel = 2,
}: {
  /** 1 on /pricing, where this heading is the page's own; 2 where the section sits inside another page. */
  headingLevel?: 1 | 2
  hideDetailsLink?: boolean
  /** Compact mode: removes section padding and scroll animations. Used inside the onboarding modal. */
  compact?: boolean
  onboardingCallbacks?: PricingOnboardingCallbacks
  headingOverride?: string
  subtitleOverride?: string
  /** When provided, the Pro button starts Stripe checkout directly instead of linking to /signup */
  upgradeCallbacks?: {
    onPlanSelect: (planId: typeof PRO_CHECKOUT_PLAN_ID) => void
    loadingPlan: typeof PRO_CHECKOUT_PLAN_ID | null
  }
} = {}) {
  const actionFor = (id: OfferedPlanId): PlanCardAction => {
    if (onboardingCallbacks) {
      const busy = !!onboardingCallbacks.loadingPlan
      return {
        label: onboardingCallbacks.ctaLabels[id] || DEFAULT_CTA[id],
        onClick: () => !busy && onboardingCallbacks.onPlanSelect(id),
        disabled: busy,
        loading: onboardingCallbacks.loadingPlan === id,
      }
    }
    if (upgradeCallbacks && id === PRO_CHECKOUT_PLAN_ID) {
      return {
        label: DEFAULT_CTA[id],
        onClick: () => !upgradeCallbacks.loadingPlan && upgradeCallbacks.onPlanSelect(PRO_CHECKOUT_PLAN_ID),
        disabled: !!upgradeCallbacks.loadingPlan,
        loading: upgradeCallbacks.loadingPlan === id,
      }
    }
    return { label: DEFAULT_CTA[id], href: "/signup" }
  }

  const actions: Record<OfferedPlanId, PlanCardAction> = {
    free: actionFor("free"),
    growth: actionFor("growth"),
  }

  const footnote = (
    <p className={`text-center text-[13px] leading-[1.5] text-[#6b7280] ${compact ? "mt-3" : "mt-6"}`}>{PLAN_FOOTNOTE}</p>
  )

  // Compact (onboarding) layout: no outer padding, no scroll animations.
  if (compact) {
    return (
      <div>
        <PlanCards compact actions={actions} />
        {footnote}
      </div>
    )
  }

  const Heading = headingLevel === 1 ? "h1" : "h2"
  return (
    <section className="py-20 sm:py-24 bg-[#f8f9fa] border-y border-[#eef0f2]" id="pricing">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6">
        <AnimateOnScroll variant="blur-in">
          <div className="text-center max-w-[600px] mx-auto mb-10 sm:mb-12">
            <Heading className="text-[clamp(28px,4vw,40px)] font-semibold leading-[1.15] tracking-tight text-[#1a1a2e]">
              {headingOverride || "Start free. Upgrade when you sell more."}
            </Heading>
            <p className="mt-3 text-[16px] leading-relaxed text-[#6b7280] text-balance">
              {subtitleOverride || "Two plans. Pro is $29 a month and lowers the fee on every sale from 5% to 3%."}
            </p>
          </div>
        </AnimateOnScroll>

        <AnimateOnScroll variant="fade-up" delay={120}>
          <PlanCards actions={actions} nameLevel={headingLevel === 1 ? 2 : 3} pictureLoading={headingLevel === 1 ? "eager" : "lazy"} />
          {footnote}
        </AnimateOnScroll>

        {!hideDetailsLink && (
          <div className="text-center mt-8">
            <Link
              href="/pricing"
              className="inline-flex items-center h-11 px-5 rounded-[10px] text-[14px] font-semibold text-[#1a1a2e] bg-white border border-[#d4d7dc] shadow-[0_1px_0_rgba(16,24,40,0.04)] hover:bg-[#f9fafb] transition-colors"
            >
              See full pricing
            </Link>
          </div>
        )}
      </div>
    </section>
  )
}
