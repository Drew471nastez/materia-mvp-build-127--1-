"use client"

import { StoryHeading } from "./story-heading"

import Link from "next/link"
import { AnimateOnScroll } from "./animate-on-scroll"
import { PlanCards, type PlanCardAction } from "@/components/billing/plan-cards"
import { PLAN_FOOTNOTE, PRO_CHECKOUT_PLAN_ID, SCALE_CHECKOUT_PLAN_ID, type OfferedPlanId } from "@/lib/billing/plans"

/** The paid plans a checkout can be started for: Grow (`growth`, $29) and Pro (`pro`, $99). */
export type PaidCheckoutPlanId = typeof PRO_CHECKOUT_PLAN_ID | typeof SCALE_CHECKOUT_PLAN_ID

/**
 * Free, Grow and Pro. Grow is the internal plan id `growth` and Pro the
 * internal id `pro` (see lib/billing/plans.ts), so every callback here
 * receives "growth" when Grow is chosen and SCALE_CHECKOUT_PLAN_ID for Pro.
 */
export interface PricingOnboardingCallbacks {
  onPlanSelect: (planId: OfferedPlanId) => void
  /** Whichever plan is being set up, so every button waits while one is. */
  loadingPlan: string | null
  ctaLabels: Record<OfferedPlanId, string>
}

const DEFAULT_CTA: Record<OfferedPlanId, string> = {
  free: "Start free",
  [PRO_CHECKOUT_PLAN_ID]: "Get Grow",
  [SCALE_CHECKOUT_PLAN_ID]: "Get Pro",
}

export function PricingSection({
  hideDetailsLink,
  compact,
  onboardingCallbacks,
  headingOverride,
  subtitleOverride,
  upgradeCallbacks,
  headingLevel = 2,
  editorial = false,
}: {
  /** 1 on /pricing, where this heading is the page's own; 2 where the section sits inside another page. */
  headingLevel?: 1 | 2
  /** Editorial homepage presentation; pricing/onboarding retain their existing layout. */
  editorial?: boolean
  hideDetailsLink?: boolean
  /** Compact mode: removes section padding and scroll animations. Used inside the onboarding modal. */
  compact?: boolean
  onboardingCallbacks?: PricingOnboardingCallbacks
  headingOverride?: string
  subtitleOverride?: string
  /** When provided, the Grow and Pro buttons start Stripe checkout directly instead of linking to /signup */
  upgradeCallbacks?: {
    onPlanSelect: (planId: PaidCheckoutPlanId) => void
    loadingPlan: PaidCheckoutPlanId | null
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
    if (upgradeCallbacks && id === SCALE_CHECKOUT_PLAN_ID) {
      return {
        label: DEFAULT_CTA[id],
        onClick: () => !upgradeCallbacks.loadingPlan && upgradeCallbacks.onPlanSelect(SCALE_CHECKOUT_PLAN_ID),
        disabled: !!upgradeCallbacks.loadingPlan,
        loading: upgradeCallbacks.loadingPlan === id,
      }
    }
    return { label: DEFAULT_CTA[id], href: "/signup" }
  }

  const actions: Record<OfferedPlanId, PlanCardAction> = {
    free: actionFor("free"),
    [PRO_CHECKOUT_PLAN_ID]: actionFor(PRO_CHECKOUT_PLAN_ID),
    [SCALE_CHECKOUT_PLAN_ID]: actionFor(SCALE_CHECKOUT_PLAN_ID),
  }

  /* Landing round 8: on the home page the small print starts at the heading's left edge too, nothing centred. */
  const footnote = (
    <p className={`${editorial ? "pl-[var(--home-head-inset)] text-left" : "text-center"} text-[13px] leading-[1.5] text-[#6b7280] ${compact ? "mt-3" : "mt-6"}`}>{PLAN_FOOTNOTE}</p>
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
  /*
    WAVE 13, THE OWNER: the section wider, three bigger cards across it,
    the heading "Pricing & Plans" and one plain line under it. On the home
    page (editorial) it uses the page's heading type and, landing round 7, the
    page's one width (.home-wrap): cards edge to edge with the showcase under
    the hero, the heading from its left edge, set in by the heading inset;
    /pricing keeps its own h1 and the same words.
  */
  /* Landing round 3: on the home page the section sits on the white sheet with the calculator and the questions, so it is white there, with no rules above and below. */
  /* Landing round 10, the owner (a MacBook Air at 100%, about 1440x800): on a laptop that short the home section pads 64px a side, not 96, so the heading and the three cards fit in one screen. */
  /*
    LANDING ROUND 13, /pricing (the owner): no light grey behind the cards, and
    the heading and its line much bigger, a confident page title with a large
    line under it. White, no rules; the page's sheets rise over it
    (app/(storelib)/(marketing)/pricing/pricing-sheets.tsx).
  */
  return (
    <section data-story-section={editorial ? "pricing" : undefined} className={editorial ? "bg-white py-20 sm:py-24 [@media(min-width:1024px)_and_(max-height:900px)]:!py-16" : "bg-white pt-[clamp(48px,7vw,112px)] pb-16 sm:pb-24"} id="pricing">
      <div className={editorial ? "home-wrap !max-w-[var(--home-max)] !px-[var(--home-edge)] [&_[data-plan-ground]]:!max-w-none" : "max-w-[1240px] mx-auto px-4 sm:px-6"}>
        <AnimateOnScroll variant="blur-in">
          {/*
            Landing round 8, the owner: "make the heading left aligned like all
            the other sections". Stated outright on the home page (text-left,
            no auto margins, the AnimateOnScroll wrapper full width) so no
            inherited centring can move it: the heading and its line start at
            the content edge plus --home-head-inset, as every other section's
            heading does.
            Landing round 9, the owner: "get rid of the Monthly / Yearly pill
            there; monthly or yearly is chosen when I pay". The home page's
            cards show monthly prices and no pill (hideInterval below);
            /pricing keeps its pill.
          */}
          <div data-pricing-head="" className={editorial ? "story-section-heading !mx-0 !mb-10 w-full pl-[var(--home-head-inset)] !text-left" : "text-center max-w-[1100px] mx-auto mb-12 sm:mb-16"}>
            {editorial ? <StoryHeading text={headingOverride || "Pricing & Plans"} accent={["Plans"]} /> : (
            <Heading data-pricing-title="" className="text-[clamp(46px,7.4vw,112px)] font-medium leading-[0.98] tracking-[-0.05em] text-[#18181b] text-balance">
              {headingOverride || "Pricing & Plans"}
            </Heading>)}

            <p data-pricing-sub="" className={editorial ? "mt-3 text-[16px] leading-relaxed text-[#6b7280] text-balance" : "mx-auto mt-5 max-w-[34ch] text-[clamp(18px,1.9vw,28px)] leading-[1.35] tracking-[-0.015em] text-[#52525b] text-balance sm:mt-7"}>
              {subtitleOverride || "Free to start. Upgrade when you grow."}
            </p>
          </div>
        </AnimateOnScroll>

        <AnimateOnScroll variant="fade-up" delay={120}>
          {/*
            PRICING ROUND 5, THE OWNER: the cards drawn like the reference
            picture, on a grey ground, with the "Contact sales" bar under
            them. The lines are the same on every surface
            (./pricing-lines, five at most), so they are not handed in here.
          */}
          <PlanCards actions={actions} nameLevel={headingLevel === 1 ? 2 : 3} hideInterval={editorial} contactSales />
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
