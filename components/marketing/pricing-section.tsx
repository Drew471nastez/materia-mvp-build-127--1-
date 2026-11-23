"use client"

import { StoryHeading } from "./story-heading"

import Link from "next/link"
import type { ReactNode } from "react"
import { AnimateOnScroll } from "./animate-on-scroll"
import { PlanCards, type PlanCardAction, type PlanFit } from "@/components/billing/plan-cards"
import { PRO_CHECKOUT_PLAN_ID, SCALE_CHECKOUT_PLAN_ID, type OfferedPlanId } from "@/lib/billing/plans"

/** The paid plans a checkout can be started for: Grow (`growth`, $14) and Pro (`pro`, $99). */
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
  cardsAside,
  compactHeading,
  actions: actionsGiven,
  lead,
  fit,
}: {
  /** Round 60: the cards laid out by the row's own width (components/billing/plan-cards FIT); the plans page in the app passes "page". /pricing passes nothing. */
  fit?: PlanFit
  /**
   * Round 58: every button's action, for a page that decides them itself (the
   * plans page in the app: checkout, a plan change, the current plan). The
   * cards, prices and lines stay this section's own.
   */
  actions?: Record<OfferedPlanId, PlanCardAction>
  /** On a phone this plan's card comes first (the app: Grow, for somebody on Free). */
  lead?: OfferedPlanId
  /** At the top right of the cards (/pricing: "Compare all features"). */
  cardsAside?: ReactNode
  /** Compact only (the onboarding): a heading at the left of the row, with Monthly and Yearly at its right. */
  compactHeading?: ReactNode
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

  const actions: Record<OfferedPlanId, PlanCardAction> = actionsGiven ?? {
    free: actionFor("free"),
    [PRO_CHECKOUT_PLAN_ID]: actionFor(PRO_CHECKOUT_PLAN_ID),
    [SCALE_CHECKOUT_PLAN_ID]: actionFor(SCALE_CHECKOUT_PLAN_ID),
  }

  /* Landing round 14, the owner: no small print under the cards on any surface (the line about US dollars and Stripe's fee is gone). */

  // Compact (onboarding) layout: no outer padding, no scroll animations.
  if (compact) {
    return (
      <div>
        <PlanCards compact actions={actions} split={compactHeading} />
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
  /*
    LANDING ROUND 15, THE OWNER: "the pricing sheet has rounded corners with a
    black solid thing". On the home page this section is the first thing on
    the white sheet that rises over the dark showcase (SheetHold). The sheet
    filled its two top corners with solid fillets of the showcase's black,
    drawn over the showcase's pictures as the sheet came up over them, and
    the section's own square white ground poked into the rounded corners.
    Now the section has no ground of its own (the sheet is white) and, while
    the sheet rises over a held block, the fillets are gone (ENTRANCE_CSS):
    the sheet's own rounded white ground leaves its corners open to whatever
    is behind, so they blend with it.

    --plan-bleed is how far the phone's sideways row of cards runs out to the
    screen's edge: the side padding of the column it sits in.
  */
  /*
    Pricing one row round, the owner: "a little bit, not so much" more room
    under /pricing's section, so the compare sheet that rises after it starts
    lower: 112px on a phone (was 96), 160px from sm (was 128). The home page's
    section (editorial) is followed by the questions, not the compare sheet,
    and keeps its padding.
  */
  const enter = headingLevel === 1
  return (
    <section
      data-story-section={editorial ? "pricing" : undefined}
      data-pricing-enter={enter ? "" : undefined}
      className={editorial ? "py-20 sm:py-24 [@media(min-width:1024px)_and_(max-height:900px)]:!py-16" : "bg-white pt-[clamp(48px,7vw,112px)] pb-28 sm:pb-40"}
      style={editorial ? { background: "transparent" } : undefined}
      id="pricing"
    >
      <style href="pricing-section" precedence="default">{PRICING_SECTION_CSS}</style>
      <div className={editorial ? "home-wrap !max-w-[var(--home-max)] !px-[var(--home-edge)] [--plan-bleed:var(--home-edge)] [&_[data-plan-ground]]:!max-w-none" : "max-w-[1240px] mx-auto px-4 sm:px-6 [--plan-bleed:16px] sm:[--plan-bleed:24px]"}>
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
            /* Landing round 14, the owner: round 13's 112px title was too big. Now the home page's section heading size (.story-heading, clamp(36px,5vw,76px)), a step under it at the top, and a calm line under it. */
            <Heading data-pricing-title="" className="text-[clamp(38px,5vw,68px)] font-medium leading-[1.04] tracking-[-0.045em] text-[#18181b] text-balance">
              {headingOverride || "Pricing & Plans"}
            </Heading>)}

            <p data-pricing-sub="" className={editorial ? "mt-3 text-[16px] leading-relaxed text-[#6b7280] text-balance" : "mx-auto mt-4 max-w-[34ch] text-[clamp(16px,1.4vw,20px)] leading-[1.45] tracking-[-0.01em] text-[#52525b] text-balance sm:mt-5"}>
              {subtitleOverride || "Free to start. Upgrade when you grow."}
            </p>
          </div>
        </AnimateOnScroll>

        <AnimateOnScroll variant="fade-up" delay={120}>
          {/*
            PRICING ROUND 5, THE OWNER: the cards drawn like the reference
            picture, on a grey ground, with the "Contact sales" bar under
            them. The lines are the same on every surface
            (./pricing-lines, six since landing round 14), so they are not handed in here.
          */}
          <PlanCards actions={actions} lead={lead} nameLevel={headingLevel === 1 ? 2 : 3} hideInterval={editorial} contactSales aside={cardsAside} fit={fit} />
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

/*
  THE PAGE'S ARRIVAL ON /pricing (landing round 15, the owner): the heading
  and its line rise in as the page loads, then the cards one after another.
  Opacity and translate only, from the server's markup (no script, so no
  flash and no shift), about half a second in all; the cards' fill is
  backwards only, so once a card is in place it holds no offset. Reduced
  motion: everything is simply there.

  And the home page's pricing sheet: no solid fillets in its corners while
  it rises over the held showcase (see the note in PricingSection).
*/
const PRICING_SECTION_CSS = `
@media (prefers-reduced-motion:no-preference){
  [data-pricing-enter] [data-pricing-title],[data-pricing-enter] [data-pricing-sub],[data-pricing-enter] [data-plan-slot],[data-pricing-enter] [data-plan-contact]{animation:pricing-rise .62s cubic-bezier(.22,1,.36,1) backwards}
  [data-pricing-enter] [data-pricing-sub]{animation-delay:70ms}
  [data-pricing-enter] [data-plan-slot]:nth-child(1){animation-delay:180ms}
  [data-pricing-enter] [data-plan-slot]:nth-child(2){animation-delay:240ms}
  [data-pricing-enter] [data-plan-slot]:nth-child(3){animation-delay:300ms}
  [data-pricing-enter] [data-plan-contact]{animation-delay:360ms}
}
@keyframes pricing-rise{from{opacity:0;transform:translate3d(0,16px,0)}}
[data-landing-story] [data-sheet][data-hold-rise]:has(#pricing)::before{display:none}
`
