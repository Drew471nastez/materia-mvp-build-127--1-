"use client"

/**
 * The two plan cards: Free and Pro.
 *
 * One component for every place a plan is offered (the landing page,
 * /pricing, onboarding, the upgrade page and the Billing tab) so the cards
 * cannot drift apart again. Each screen decides what the button does; the
 * card decides how a plan looks.
 *
 * DRAWN TO THE OWNER'S REFERENCE. A tall header in the plan's colour, which is
 * the owner's own picture (deep blue for Free, near black for Pro, the
 * Storelib mark standing at the right), holding a small label, the plan's
 * name, the price large, a line under it and one line of description, all in
 * white. Under it the plan's lines, each with a round check in the plan's
 * colour (a grey cross for what Free does not have), a full width button in
 * the same colour, and one line of small print.
 *
 * EVERY WORD IS TRUE. The lines come from lib/billing/plans.ts, which writes
 * them from the tables that enforce them; the label and the small print are
 * plain facts about the plan (no invented discount, no "most chosen"), and
 * tests/pricing-plans.test.ts holds both.
 *
 * THE PICTURES THROUGH next/image, sized to the card: a phone is sent a
 * version about as wide as its screen, not the 1672px original.
 * scripts/check-pricing-cards.mjs measures that, the equal heights, the
 * contrast of the white text on the picture, and the 44px buttons.
 */
import Image from "next/image"
import Link from "next/link"
import { ArrowRight, Check, Loader2, X } from "lucide-react"
import { OFFERED_PLANS, type OfferedPlan, type OfferedPlanId } from "@/lib/billing/plans"

export interface PlanCardAction {
  label: string
  /** A link when there is somewhere to go, a button when there is work to do. */
  href?: string
  onClick?: () => void
  disabled?: boolean
  loading?: boolean
  /** Drawn quietly: the plan somebody is already on, or a change already scheduled. */
  settled?: boolean
}

const PICTURE_BASE = "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images"

/**
 * Each plan's colour, as whole class names so Tailwind sees them. `ground`
 * is the picture's own tone, painted under it, so the white text reads the
 * same while the picture is still on its way.
 */
const LOOK: Record<OfferedPlanId, { picture: string; ground: string; dot: string; button: string; ring: string }> = {
  free: {
    picture: `${PICTURE_BASE}/ChatGPT%20Image%20Sep%2025,%202026,%2010_28_53%20AM.png`,
    ground: "bg-[#0b43c2]",
    dot: "bg-[#3f5ef5]",
    button: "bg-[#3f5ef5] hover:bg-[#3452e6] active:bg-[#2c47cf]",
    ring: "focus-visible:ring-[#3f5ef5]/45",
  },
  growth: {
    picture: `${PICTURE_BASE}/ChatGPT%20Image%20Sep%2025,%202026,%2010_29_35%20AM.png`,
    ground: "bg-[#1b1b1c]",
    dot: "bg-[#111113]",
    button: "bg-[#111113] hover:bg-[#26262b] active:bg-[#000000]",
    ring: "focus-visible:ring-[#111113]/35",
  },
}

/**
 * How wide the card, and so its picture, is drawn: half of an 820px row from
 * 768px up (a little more in the Billing tab), the screen less its gutters
 * under that.
 */
export const PLAN_PICTURE_SIZES = "(min-width: 768px) 440px, calc(100vw - 32px)"

function PlanButton({ action, plan, compact }: { action: PlanCardAction; plan: OfferedPlanId; compact?: boolean }) {
  const look = LOOK[plan]
  const className =
    `inline-flex w-full ${compact ? "h-12" : "h-14"} items-center justify-center gap-2 rounded-2xl px-5 ` +
    "text-[14px] font-bold uppercase tracking-[0.06em] no-underline select-none transition-colors duration-150 " +
    `focus-visible:outline-none focus-visible:ring-4 ${look.ring} ` +
    (action.settled
      ? "bg-[#f3f4f6] text-[#4b5563] cursor-default"
      : `${look.button} text-white disabled:cursor-not-allowed disabled:opacity-70`)
  const content = action.loading ? (
    <>
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      Processing
    </>
  ) : (
    <>
      <span className="min-w-0 truncate">{action.label}</span>
      {action.settled ? null : <ArrowRight className="h-[18px] w-[18px] shrink-0" strokeWidth={2.25} aria-hidden="true" />}
    </>
  )

  if (action.href && !action.disabled && !action.settled) {
    return (
      <Link href={action.href} className={className} data-plan-action>
        {content}
      </Link>
    )
  }
  return (
    <button
      type="button"
      onClick={action.onClick}
      disabled={action.disabled || action.settled || action.loading}
      aria-busy={action.loading || undefined}
      className={className}
      data-plan-action
    >
      {content}
    </button>
  )
}

function PlanCard({
  plan,
  action,
  label,
  compact,
}: {
  plan: OfferedPlan
  action: PlanCardAction
  label?: string
  compact?: boolean
}) {
  const look = LOOK[plan.id]
  const pad = compact ? "px-5" : "px-6 sm:px-7"

  return (
    <article
      data-plan-card={plan.id}
      className="flex flex-col overflow-hidden rounded-[28px] bg-white shadow-[0_32px_64px_-28px_rgba(16,24,40,0.28),0_2px_8px_rgba(16,24,40,0.05)] ring-1 ring-[#0f172a]/[0.06]"
    >
      <div
        data-plan-header=""
        className={`relative isolate flex flex-col text-white ${look.ground} ${pad} ${
          compact ? "min-h-[220px] pb-5 pt-5" : "min-h-[268px] pb-6 pt-6 sm:min-h-[292px] sm:pb-7 sm:pt-7"
        }`}
      >
        <Image
          src={look.picture}
          alt=""
          fill
          sizes={PLAN_PICTURE_SIZES}
          className="-z-10 object-cover object-right"
          data-plan-picture=""
        />
        <span className="self-start rounded-full bg-white/15 px-3 py-1 text-[12px] font-semibold leading-[18px] text-white ring-1 ring-inset ring-white/25">
          {label ?? plan.pill}
        </span>
        <h3 className={`${compact ? "mt-3" : "mt-5"} text-[20px] font-bold leading-tight`}>{plan.name}</h3>
        <p
          className={`mt-1.5 ${compact ? "text-[44px]" : "text-[56px] sm:text-[64px]"} font-extrabold leading-none tracking-[-0.035em] tabular-nums`}
        >
          {plan.price}
        </p>
        <p className="mt-2 text-[14px] font-medium leading-[20px] text-white/85">{plan.priceNote}</p>
        <p className={`mt-auto ${compact ? "pt-3" : "pt-5"} text-[15px] leading-[22px] text-white/90`}>{plan.summary}</p>
      </div>

      <div className={`flex flex-1 flex-col ${pad} ${compact ? "pb-5 pt-5" : "pb-6 pt-6 sm:pb-7 sm:pt-7"}`}>
        <ul className={`flex flex-col ${compact ? "gap-2.5" : "gap-3.5"}`}>
          {plan.features.map((feature) => (
            <li key={feature} className={`flex items-start gap-3 ${compact ? "text-[14px]" : "text-[15px]"} leading-[22px] text-[#1a1a2e]`}>
              <span className={`mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${look.dot}`} aria-hidden="true">
                <Check className="h-3 w-3 text-white" strokeWidth={3.25} />
              </span>
              {feature}
            </li>
          ))}
          {plan.excluded.map((feature) => (
            <li key={feature} className={`flex items-start gap-3 ${compact ? "text-[14px]" : "text-[15px]"} leading-[22px] text-[#6b7280]`}>
              <span className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#e5e7eb]" aria-hidden="true">
                <X className="h-3 w-3 text-[#6b7280]" strokeWidth={3.25} />
              </span>
              <span>
                <span className="sr-only">Not included: </span>
                {feature}
              </span>
            </li>
          ))}
        </ul>

        <div className={`mt-auto ${compact ? "pt-5" : "pt-8"}`}>
          <PlanButton action={action} plan={plan.id} compact={compact} />
          <p className="mt-3 text-center text-[13px] leading-[18px] text-[#6b7280]">{plan.note}</p>
        </div>
      </div>
    </article>
  )
}

export function PlanCards({
  actions,
  labels,
  compact,
  className = "",
}: {
  actions: Record<OfferedPlanId, PlanCardAction>
  /** In place of the small label at the top of a card, such as "Current plan". */
  labels?: Partial<Record<OfferedPlanId, string>>
  compact?: boolean
  className?: string
}) {
  return (
    <div
      data-plan-cards
      className={`grid grid-cols-1 md:grid-cols-2 items-stretch ${compact ? "gap-3" : "gap-5 md:gap-6"} ${className}`}
    >
      {OFFERED_PLANS.map((plan) => (
        <PlanCard key={plan.id} plan={plan} action={actions[plan.id]} label={labels?.[plan.id]} compact={compact} />
      ))}
    </div>
  )
}
