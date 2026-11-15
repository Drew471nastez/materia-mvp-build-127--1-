"use client"

import { StoryHeading } from "./story-heading"

import Link from "next/link"
import { AnimateOnScroll } from "./animate-on-scroll"
import { PlanCards, type PlanCardAction } from "@/components/billing/plan-cards"
import { publicPlanLines } from "./pricing-lines"
import { PLAN_FOOTNOTE, PRO_CHECKOUT_PLAN_ID, SCALE_CHECKOUT_PLAN_ID, type OfferedPlanId } from "@/lib/billing/plans"

/** The paid plans a checkout can be started for: Pro (`growth`) and Scale (`pro`). */
export type PaidCheckoutPlanId = typeof PRO_CHECKOUT_PLAN_ID | typeof SCALE_CHECKOUT_PLAN_ID

/**
 * Free, Pro and Scale. Pro is the internal plan id `growth` and Scale the
 * internal id `pro` (see lib/billing/plans.ts), so every callback here
 * receives "growth" when Pro is chosen and SCALE_CHECKOUT_PLAN_ID for Scale.
 */
export interface PricingOnboardingCallbacks {
  onPlanSelect: (planId: OfferedPlanId) => void
  /** Whichever plan is being set up, so every button waits while one is. */
  loadingPlan: string | null
  ctaLabels: Record<OfferedPlanId, string>
}

/** The public cards' lines, worked out once from the plan tables. */
const PUBLIC_LINES = publicPlanLines()

const DEFAULT_CTA: Record<OfferedPlanId, string> = {
  free: "Start free",
  [PRO_CHECKOUT_PLAN_ID]: "Get Pro",
  [SCALE_CHECKOUT_PLAN_ID]: "Get Scale",
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
  /** When provided, the Pro and Scale buttons start Stripe checkout directly instead of linking to /signup */
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
  return (
    <section data-story-section={editorial ? "pricing" : undefined} className={editorial ? "bg-white py-20 sm:py-24 [@media(min-width:1024px)_and_(max-height:900px)]:!py-16" : "py-20 sm:py-24 bg-[#f8f9fa] border-y border-[#eef0f2]"} id="pricing">
      <div className={editorial ? "home-wrap !max-w-[var(--home-max)] !px-[var(--home-edge)] [&_[data-plan-cards]]:!max-w-none" : "max-w-[1240px] mx-auto px-4 sm:px-6"}>
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
          <div data-pricing-head="" className={editorial ? "story-section-heading !mx-0 !mb-10 w-full pl-[var(--home-head-inset)] !text-left" : "text-center max-w-[640px] mx-auto mb-10 sm:mb-12"}>
            {editorial ? <StoryHeading text={headingOverride || "Pricing & Plans"} accent={["Plans"]} /> : (
            <Heading className="text-[clamp(28px,4vw,40px)] font-semibold leading-[1.15] tracking-tight text-[#1a1a2e]">
              {headingOverride || "Pricing & Plans"}
            </Heading>)}

            <p className="mt-3 text-[16px] leading-relaxed text-[#6b7280] text-balance">
              {subtitleOverride || "Free to start. Upgrade when you grow."}
            </p>
          </div>
        </AnimateOnScroll>

        <AnimateOnScroll variant="fade-up" delay={120}>
          {/*
            LANDING ROUND, THE OWNER: plain lines a seller understands, not
            limits ("what is 1 GB of file storage?"), and a quiet tick in
            place of the purple check. Written from the plan tables in
            ./pricing-lines, so nothing on a card is more than the plan gives.
            The onboarding (compact, above) keeps the app's own lines.
          */}
          <PlanCards actions={actions} nameLevel={headingLevel === 1 ? 2 : 3} pictureLoading={headingLevel === 1 ? "eager" : "lazy"} lines={PUBLIC_LINES} tick="ink" hideInterval={editorial} />
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
