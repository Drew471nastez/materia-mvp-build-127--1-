"use client"

/**
 * The two plan cards: Free and Pro.
 *
 * One component for every place a plan is offered (the landing page,
 * /pricing, onboarding, the upgrade page and the Billing tab) so the cards
 * cannot drift apart again. Each screen decides what the button does; the
 * card decides how a plan looks.
 *
 * Pro is set apart by restrained means only: a slightly firmer border, a
 * little more depth, the dark primary button and dark checks. No badge, no
 * colour wash, no glow.
 */
import Link from "next/link"
import { Check, Loader2 } from "lucide-react"
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

const BUTTON_BASE =
  "inline-flex w-full h-11 items-center justify-center gap-2 rounded-[10px] px-4 text-[14px] font-semibold " +
  "transition-colors duration-150 no-underline select-none " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#1a1a2e]/40"

const BUTTON_PRIMARY =
  "bg-[#1a1a2e] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_1px_2px_rgba(16,24,40,0.18)] " +
  "hover:bg-[#2a2a40] active:bg-[#111122] disabled:opacity-70 disabled:cursor-not-allowed"

const BUTTON_SECONDARY =
  "bg-white text-[#1a1a2e] border border-[#d4d7dc] shadow-[0_1px_0_rgba(16,24,40,0.04)] " +
  "hover:bg-[#f9fafb] hover:border-[#c4c8cf] active:bg-[#f3f4f6] disabled:opacity-70 disabled:cursor-not-allowed"

const BUTTON_SETTLED = "bg-[#f3f4f6] text-[#4b5563] border border-[#e5e7eb] cursor-default"

function PlanButton({ action, primary }: { action: PlanCardAction; primary: boolean }) {
  const tone = action.settled ? BUTTON_SETTLED : primary ? BUTTON_PRIMARY : BUTTON_SECONDARY
  const className = `${BUTTON_BASE} ${tone}`
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
  const isPro = plan.id !== "free"
  const pad = compact ? "px-5" : "px-6 sm:px-7"

  return (
    <article
      data-plan-card={plan.id}
      className={`flex flex-col rounded-2xl bg-white border ${
        isPro
          ? "border-[#d4d7dc] shadow-[0_1px_2px_rgba(16,24,40,0.05),0_12px_24px_-16px_rgba(16,24,40,0.18)]"
          : "border-[#e5e7eb] shadow-[0_1px_2px_rgba(16,24,40,0.04)]"
      }`}
    >
      <div className={`${pad} ${compact ? "pt-5 pb-5" : "pt-6 pb-6 sm:pt-7"}`}>
        <div className="flex items-center justify-between gap-3 min-h-[24px]">
          <h3 className="text-[15px] font-semibold text-[#1a1a2e]">{plan.name}</h3>
          {label && (
            <span className="rounded-md border border-[#e5e7eb] bg-[#f6f6f7] px-2 py-0.5 text-[12px] font-medium text-[#4b5563]">
              {label}
            </span>
          )}
        </div>

        <p className="mt-3 flex items-baseline gap-1.5">
          <span
            className={`${compact ? "text-[34px]" : "text-[40px]"} font-semibold leading-none tracking-[-0.02em] text-[#1a1a2e] tabular-nums`}
          >
            {plan.price}
          </span>
          <span className="text-[14px] text-[#6b7280]">{plan.period}</span>
        </p>

        <p className="mt-3 text-[14px] leading-[1.5] text-[#6b7280] sm:min-h-[42px]">{plan.summary}</p>

        <div className="mt-5">
          <PlanButton action={action} primary={isPro} />
        </div>
      </div>

      <div className={`flex-1 rounded-b-2xl border-t border-[#eef0f2] bg-[#fafafb] ${pad} ${compact ? "py-4" : "py-5 sm:py-6"}`}>
        <p className="text-[13px] font-medium text-[#1a1a2e]">{plan.featuresHeading}</p>
        <ul className="mt-3 flex flex-col gap-2.5">
          {plan.features.map((feature) => (
            <li key={feature} className="flex items-start gap-2.5 text-[14px] leading-[1.45] text-[#374151]">
              <Check
                className={`mt-[3px] h-3.5 w-3.5 shrink-0 ${isPro ? "text-[#1a1a2e]" : "text-[#6b7280]"}`}
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
  labels,
  compact,
  className = "",
}: {
  actions: Record<OfferedPlanId, PlanCardAction>
  /** A small quiet label beside a plan name, such as "Current plan". */
  labels?: Partial<Record<OfferedPlanId, string>>
  compact?: boolean
  className?: string
}) {
  return (
    <div
      data-plan-cards
      className={`grid grid-cols-1 md:grid-cols-2 items-stretch ${compact ? "gap-3" : "gap-4 md:gap-5"} ${className}`}
    >
      {OFFERED_PLANS.map((plan) => (
        <PlanCard key={plan.id} plan={plan} action={actions[plan.id]} label={labels?.[plan.id]} compact={compact} />
      ))}
    </div>
  )
}
