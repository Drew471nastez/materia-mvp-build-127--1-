"use client"

/**
 * The two plan cards: Free and Pro.
 *
 * One component for every place a plan is offered (the landing page,
 * /pricing, onboarding, the upgrade page and the Billing tab) so the cards
 * cannot drift apart again. Each screen decides what the button does; the
 * card decides how a plan looks.
 *
 * ---------------------------------------------------------------------------
 *  WHAT THE CARDS SAY, AND WHY IT IS SAID THIS WAY
 * ---------------------------------------------------------------------------
 * "Too simple, too basic, they have nothing." What they lacked was not
 * decoration, it was the one thing that makes the choice: what a plan does
 * to a sale. So each card now works one sale through, from the same fee
 * table that charges it (lib/billing/plans.ts, EXAMPLE_SALE_CENTS): the fee,
 * and what the seller keeps of $50. Pro says how much more that is than
 * Free. Nothing on a card is a claim the code does not make good on.
 *
 * Pro sits on the near-black Storelib uses for its primary actions, with the
 * light button on it, so the plan that costs money is the one that reads as
 * the decision. Free stays on white. One flat colour each, no pattern, no
 * glow, no badge floated over a corner; the plan somebody is on says so in
 * line, beside its name.
 */
import Link from "next/link"
import { Check, Loader2 } from "lucide-react"
import { EXAMPLE_SALE_CENTS, OFFERED_PLANS, formatPlanPrice, type OfferedPlan, type OfferedPlanId } from "@/lib/billing/plans"

export interface PlanCardAction {
  label: string
  /** A link when there is somewhere to go, a button when there is work to do. */
  href?: string
  onClick?: () => void
  disabled?: boolean
  loading?: boolean
  /** Drawn quietly: the plan somebody is already on, or a change already scheduled. */
  settled?: boolean
  /** This is the plan the person is on. Marked beside the plan's name. */
  current?: boolean
}

type Tone = "light" | "dark"

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`

const BUTTON_BASE =
  "inline-flex w-full items-center justify-center gap-2 rounded-[10px] px-4 text-[14px] font-semibold " +
  "transition-[translate] duration-100 no-underline select-none active:translate-y-px motion-reduce:active:translate-y-0 " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed"

/** Pro's button, light on the dark card: a raised key. */
const BUTTON_ON_DARK =
  "bg-white text-[#1a1a2e] focus-visible:ring-white/60 focus-visible:ring-offset-[#1a1a2e] " +
  "shadow-[inset_0_-1px_0_rgba(26,26,46,0.12),0_1px_2px_rgba(0,0,0,0.35),0_10px_20px_-10px_rgba(0,0,0,0.7)] " +
  "hover:bg-[#f3f4f6] active:bg-[#e9eaee] disabled:opacity-80"

/** Free's button, on white. */
const BUTTON_ON_LIGHT =
  "bg-white text-[#1a1a2e] border border-[#d4d7dc] focus-visible:ring-[#1a1a2e]/40 " +
  "shadow-[0_1px_2px_rgba(16,24,40,0.06)] hover:bg-[#f9fafb] hover:border-[#c4c8cf] active:bg-[#f3f4f6] disabled:opacity-70"

const SETTLED: Record<Tone, string> = {
  light: "bg-[#f3f4f6] text-[#4b5563] border border-[#e5e7eb] cursor-default active:translate-y-0",
  dark: "bg-white/[0.08] text-white/80 border border-white/[0.14] cursor-default active:translate-y-0",
}

function PlanButton({ action, tone, compact }: { action: PlanCardAction; tone: Tone; compact?: boolean }) {
  const look = action.settled ? SETTLED[tone] : tone === "dark" ? BUTTON_ON_DARK : BUTTON_ON_LIGHT
  const className = `${BUTTON_BASE} ${compact ? "h-11" : "h-12"} ${look}`
  const content = action.loading ? (
    <>
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      Processing
    </>
  ) : (
    action.label
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

/**
 * One sale, worked through: the fee on this plan and what is left of $50.
 * On Pro, how much more that is than Free. Same height on both cards, so the
 * two cards' buttons and lists stay on one line side by side.
 */
function SaleExample({ plan, tone, compact }: { plan: OfferedPlan; tone: Tone; compact?: boolean }) {
  const free = OFFERED_PLANS[0]
  const more = plan.keepsCents - free.keepsCents
  const dark = tone === "dark"
  const label = dark ? "text-white/65" : "text-[#6b7280]"
  const value = dark ? "text-white" : "text-[#1a1a2e]"
  return (
    <dl
      data-plan-example={plan.id}
      className={`grid grid-cols-2 rounded-xl border ${compact ? "mt-4" : "mt-5"} ${
        dark ? "border-white/[0.1] bg-white/[0.05]" : "border-[#eef0f2] bg-[#f8f9fa]"
      }`}
    >
      <div className={`px-3.5 py-3 border-r ${dark ? "border-white/[0.1]" : "border-[#eef0f2]"}`}>
        <dt className={`text-[12px] leading-[1.3] ${label}`}>Fee per sale</dt>
        <dd className={`mt-1 text-[14px] font-medium leading-[1.3] tabular-nums ${value}`}>{plan.fee.replace(" per sale", "")}</dd>
      </div>
      <div className="px-3.5 py-3">
        <dt className={`text-[12px] leading-[1.3] ${label}`}>You keep of {formatPlanPrice(EXAMPLE_SALE_CENTS)}</dt>
        <dd className={`mt-1 flex flex-wrap items-baseline gap-x-1.5 text-[14px] font-semibold leading-[1.3] tabular-nums ${value}`}>
          {money(plan.keepsCents)}
          {more > 0 && (
            <span className="text-[12px] font-medium text-[#c4b5fd]" title={`${money(more)} more than on Free`}>
              +{money(more)}
              <span className="sr-only"> more than on Free</span>
            </span>
          )}
        </dd>
      </div>
    </dl>
  )
}

function PlanCard({ plan, action, compact, lead }: { plan: OfferedPlan; action: PlanCardAction; compact?: boolean; lead?: boolean }) {
  const tone: Tone = plan.id === "free" ? "light" : "dark"
  const dark = tone === "dark"
  const pad = compact ? "px-5" : "px-6 sm:px-7"
  const features = plan.features.filter((line) => line !== plan.fee)

  return (
    <article
      data-plan-card={plan.id}
      data-plan-tone={tone}
      aria-current={action.current || undefined}
      className={`flex flex-col overflow-hidden rounded-2xl border ${lead ? "order-first md:order-none" : ""} ${
        dark
          ? "border-[#1a1a2e] bg-[#1a1a2e] text-white shadow-[0_1px_2px_rgba(16,24,40,0.12),0_18px_36px_-20px_rgba(26,26,46,0.6)]"
          : "border-[#e5e7eb] bg-white text-[#1a1a2e] shadow-[0_1px_2px_rgba(16,24,40,0.04)]"
      }`}
    >
      <div className={`${pad} ${compact ? "pt-5 pb-5" : "pt-6 pb-6 sm:pt-7"}`}>
        <div className="flex min-h-[24px] items-center justify-between gap-3">
          <h3 className={`text-[15px] font-semibold ${dark ? "text-white" : "text-[#1a1a2e]"}`}>{plan.name}</h3>
          {action.current && (
            <span
              data-plan-current=""
              className={`inline-flex items-center gap-1.5 text-[12px] font-medium ${dark ? "text-white/80" : "text-[#4b5563]"}`}
            >
              <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${dark ? "bg-[#c4b5fd]" : "bg-[#8b5cf6]"}`} />
              Your plan
            </span>
          )}
        </div>
        <p className={`mt-1 text-[13px] leading-[1.5] ${dark ? "text-white/65" : "text-[#6b7280]"} md:min-h-[39px]`}>
          {plan.audience}
        </p>

        <p className={`${compact ? "mt-3" : "mt-5"} flex items-baseline gap-1.5`}>
          <span
            className={`${compact ? "text-[34px]" : "text-[44px]"} font-semibold leading-none tracking-[-0.03em] tabular-nums ${
              dark ? "text-white" : "text-[#1a1a2e]"
            }`}
          >
            {plan.price}
          </span>
          <span className={`text-[14px] ${dark ? "text-white/65" : "text-[#6b7280]"}`}>{plan.period}</span>
        </p>

        <SaleExample plan={plan} tone={tone} compact={compact} />

        <div className={compact ? "mt-4" : "mt-5"}>
          <PlanButton action={action} tone={tone} compact={compact} />
        </div>
      </div>

      <div
        className={`flex-1 border-t ${pad} ${compact ? "py-4" : "py-5 sm:py-6"} ${
          dark ? "border-white/[0.08] bg-white/[0.03]" : "border-[#eef0f2] bg-[#fafafb]"
        }`}
      >
        <p className={`text-[13px] font-medium ${dark ? "text-white" : "text-[#1a1a2e]"}`}>{plan.featuresHeading}</p>
        <ul className="mt-3 flex flex-col gap-2.5">
          {features.map((feature) => (
            <li key={feature} className={`flex items-start gap-2.5 text-[14px] leading-[1.45] ${dark ? "text-white/85" : "text-[#374151]"}`}>
              <Check
                className={`mt-[3px] h-3.5 w-3.5 shrink-0 ${dark ? "text-[#c4b5fd]" : "text-[#6b7280]"}`}
                strokeWidth={2.5}
                aria-hidden="true"
              />
              {feature}
            </li>
          ))}
        </ul>
      </div>
    </article>
  )
}

export function PlanCards({
  actions,
  compact,
  lead,
  className = "",
}: {
  actions: Record<OfferedPlanId, PlanCardAction>
  compact?: boolean
  /**
   * The plan to put first when the cards are stacked on a phone. Side by
   * side they keep their order, Free then Pro. The upgrade page leads with
   * Pro for somebody on Free: it is what they opened the page for, and the
   * plan they already have should not push it below the fold.
   */
  lead?: OfferedPlanId
  className?: string
}) {
  return (
    <div
      data-plan-cards
      className={`grid grid-cols-1 md:grid-cols-2 items-stretch ${compact ? "gap-3" : "gap-4 md:gap-5"} ${className}`}
    >
      {OFFERED_PLANS.map((plan) => (
        <PlanCard key={plan.id} plan={plan} action={actions[plan.id]} compact={compact} lead={lead === plan.id} />
      ))}
    </div>
  )
}
