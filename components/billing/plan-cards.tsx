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
 * the owner's own picture (near black for Free, deep indigo for Pro, the
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
import * as React from "react"
import Image from "next/image"
import Link from "next/link"
import { ArrowRight, Check, Loader2, X } from "lucide-react"
import { OFFERED_PLANS, YEARLY_BILLING_LIVE, YEARLY_SAVING_PERCENT, pricedFor, type BillingInterval, type OfferedPlan, type OfferedPlanId } from "@/lib/billing/plans"

export interface PlanCardAction {
  label: string
  /** A link when there is somewhere to go, a button when there is work to do. */
  href?: string
  onClick?: () => void
  disabled?: boolean
  loading?: boolean
  /** Drawn quietly: the plan somebody is already on, or a change already scheduled. */
  settled?: boolean
  /** The plan somebody is on now. */
  current?: boolean
}

const PICTURE_BASE = "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images"

/**
 * Each plan's colour, as whole class names so Tailwind sees them. `ground`
 * is the picture's own tone, painted under it, so the white text reads the
 * same while the picture is still on its way. `blur` is a 24px copy of the
 * picture inlined in the markup, shown blurred until the real one arrives,
 * so the header never pops from flat colour to picture.
 */
const LOOK: Record<OfferedPlanId, { picture: string; blur: `data:image/${string}`; ground: string; dim: string; fade: string; dot: string; button: string; ring: string }> = {
  free: {
    picture: `${PICTURE_BASE}/ChatGPT%20Image%20Sep%2025,%202026,%2010_29_35%20AM.png`,
    blur: "data:image/webp;base64,UklGRkgAAABXRUJQVlA4IDwAAAAwAwCdASoYAA4APrVInkm3JCKhMAgC4BaJaQAAelPp0aAAAP7w3blrXGLU+JE1tbFf8V/YdHwlAu9pAAA=",
    ground: "bg-[#161617]",
    dim: "brightness-[0.7] contrast-[0.94]",
    fade: "from-[#0b0b0c]/85",
    dot: "bg-[#111113]",
    button: "bg-[#111113] hover:bg-[#26262b] active:bg-[#000000]",
    ring: "focus-visible:ring-[#111113]/35",
  },
  growth: {
    picture: `${PICTURE_BASE}/ChatGPT%20Image%20Sep%2025,%202026,%2001_00_00%20PM.png`,
    blur: "data:image/webp;base64,UklGRnAAAABXRUJQVlA4IGQAAABQAwCdASoYAA4APrVMoUq3JCMhsAgC4BaJYgAAesFl7Y4P1AD+5WYnJTUuz//yU/+8r/XdyP1rncUch4oVkh+Ip7UA+Bb1kTZGrQXedRNyS4sSL7u3PKU5zEv/HrIHYtVHAAAA",
    ground: "bg-[#24178a]",
    dim: "brightness-[0.52] contrast-[0.9] saturate-[0.92]",
    fade: "from-[#170e66]/85",
    dot: "bg-[#5a43ee]",
    button: "bg-[#5a43ee] hover:bg-[#4d37dd] active:bg-[#412dc4]",
    ring: "focus-visible:ring-[#5a43ee]/45",
  },
}

/**
 * How wide the card, and so its picture, is drawn: half of a 720px row from
 * 768px up, the screen less its gutters under that.
 */
export const PLAN_PICTURE_SIZES = "(min-width: 768px) 360px, calc(100vw - 32px)"

function PlanButton({ action, plan, compact }: { action: PlanCardAction; plan: OfferedPlanId; compact?: boolean }) {
  const look = LOOK[plan]
  const className =
    `inline-flex w-full ${compact ? "h-11" : "h-12"} items-center justify-center gap-2 rounded-xl px-5 ` +
    "text-[13px] font-bold uppercase tracking-[0.06em] no-underline select-none transition-colors duration-150 " +
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
      {action.settled ? null : <ArrowRight className="h-4 w-4 shrink-0" strokeWidth={2.25} aria-hidden="true" />}
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
  interval,
}: {
  plan: OfferedPlan
  action: PlanCardAction
  label?: string
  compact?: boolean
  interval: BillingInterval
}) {
  const look = LOOK[plan.id]
  const priced = pricedFor(plan, interval)
  /* Yearly Pro is shown, not sold, until its Stripe price exists (lib/billing/plans). */
  const held = interval === "yearly" && plan.priceCents > 0 && !YEARLY_BILLING_LIVE && !action.settled
  const shownAction: PlanCardAction = held ? { label: "Yearly opens soon", settled: true } : action
  /* The price eases in when the interval changes, never on the first paint. */
  const [changed, setChanged] = React.useState(false)
  const firstInterval = React.useRef(interval)
  React.useEffect(() => {
    if (interval !== firstInterval.current) setChanged(true)
  }, [interval])
  const pad = compact ? "px-5" : "px-6"

  return (
    <article
      data-plan-card={plan.id}
      className="flex w-full flex-col overflow-hidden rounded-[22px] bg-white shadow-[0_36px_72px_-30px_rgba(16,24,40,0.34),0_10px_24px_-12px_rgba(16,24,40,0.12),0_1px_3px_rgba(16,24,40,0.06)] ring-1 ring-[#0f172a]/[0.07]"
    >
      <div
        data-plan-header=""
        className={`relative isolate flex flex-col text-white ${look.ground} ${pad} ${
          compact ? "min-h-[196px] pb-5 pt-5" : "min-h-[224px] pb-5 pt-5 sm:min-h-[236px] sm:pb-6 sm:pt-6"
        }`}
        onContextMenu={(e) => e.preventDefault()}
      >
        <Image
          src={look.picture}
          alt=""
          fill
          sizes={PLAN_PICTURE_SIZES}
          loading="eager"
          placeholder={look.blur}
          draggable={false}
          className={`-z-10 object-cover object-right select-none pointer-events-none ${look.dim}`}
          data-plan-picture=""
        />
        {/* The bottom of the picture melts away: blurred and darkened toward the text, so the
            description sits on a quiet ground instead of the picture's detail. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-[62%] backdrop-blur-[10px] [mask-image:linear-gradient(to_top,black_30%,transparent)] [-webkit-mask-image:linear-gradient(to_top,black_30%,transparent)]"
        />
        <span aria-hidden="true" className={`pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-[70%] bg-gradient-to-t ${look.fade} to-transparent`} />
        <span className="self-start rounded-full bg-white/15 px-2.5 py-0.5 text-[11.5px] font-semibold leading-[18px] text-white ring-1 ring-inset ring-white/25">
          {label ?? plan.pill}
        </span>
        <h3 className={`${compact ? "mt-3" : "mt-4"} ${compact ? "text-[16px]" : "text-[18px]"} font-bold leading-tight`}>{plan.name}</h3>
        <p
          className={`mt-1.5 ${compact ? "text-[38px]" : "text-[44px] sm:text-[48px]"} font-extrabold leading-none tracking-[-0.035em] tabular-nums`}
        >
          <span key={priced.price} className={changed ? "inline-block animate-in fade-in-0 slide-in-from-bottom-1 duration-200 motion-reduce:animate-none" : "inline-block"}>
            {priced.price}
          </span>
        </p>
        <p className="mt-1.5 text-[13px] font-medium leading-[18px] text-white/85">{priced.priceNote}</p>
        <p className={`mt-auto ${compact ? "pt-3" : "pt-4"} ${compact ? "text-[13px]" : "text-[14px]"} leading-[20px] text-white/90`}>{plan.summary}</p>
      </div>

      <div className={`flex flex-1 flex-col ${pad} ${compact ? "pb-5 pt-5" : "pb-6 pt-5"}`}>
        <ul className={`flex flex-col ${compact ? "gap-2" : "gap-2.5"}`}>
          {plan.features.map((feature) => (
            <li key={feature} className={`flex items-start gap-3 ${compact ? "text-[13px]" : "text-[14px]"} leading-[20px] text-[#1a1a2e]`}>
              <span className={`flex h-[18px] w-[18px] shrink-0 mt-px items-center justify-center rounded-full ${look.dot}`} aria-hidden="true">
                <Check className="h-[11px] w-[11px] text-white" strokeWidth={3.25} />
              </span>
              {feature}
            </li>
          ))}
          {plan.excluded.map((feature) => (
            <li key={feature} className={`flex items-start gap-3 ${compact ? "text-[13px]" : "text-[14px]"} leading-[20px] text-[#6b7280]`}>
              <span className="flex h-[18px] w-[18px] shrink-0 mt-px items-center justify-center rounded-full bg-[#e5e7eb]" aria-hidden="true">
                <X className="h-[11px] w-[11px] text-[#6b7280]" strokeWidth={3.25} />
              </span>
              <span>
                <span className="sr-only">Not included: </span>
                {feature}
              </span>
            </li>
          ))}
        </ul>

        <div className={`mt-auto ${compact ? "pt-5" : "pt-6"}`}>
          <PlanButton action={shownAction} plan={plan.id} compact={compact} />
          <p className="mt-2.5 text-center text-[12px] leading-[16px] text-[#6b7280]">{priced.note}</p>
        </div>
      </div>
    </article>
  )
}

export function PlanCards({
  actions,
  labels,
  compact,
  lead,
  className = "",
  interval: controlled,
  onInterval,
}: {
  actions: Record<OfferedPlanId, PlanCardAction>
  /** Monthly or yearly; held here unless the page wants to hold it. */
  interval?: BillingInterval
  onInterval?: (next: BillingInterval) => void
  /** In place of the small label at the top of a card, such as "Current plan". */
  labels?: Partial<Record<OfferedPlanId, string>>
  compact?: boolean
  /** On a phone, where the cards stack, this plan comes first: Pro for somebody already on Free. Side by side they keep their order. */
  lead?: OfferedPlanId
  className?: string
}) {
  const [own, setOwn] = React.useState<BillingInterval>("monthly")
  const interval = controlled ?? own
  const pick = (next: BillingInterval) => {
    setOwn(next)
    onInterval?.(next)
  }
  return (
    <>
    <IntervalSwitch value={interval} onChange={pick} compact={compact} />
    <div
      data-plan-cards
      className={`mx-auto grid w-full max-w-[720px] grid-cols-1 md:grid-cols-2 items-stretch ${compact ? "gap-3" : "gap-5"} ${className}`}
    >
      {OFFERED_PLANS.map((plan) => (
        <div key={plan.id} data-plan-slot={plan.id} className={`flex ${lead === plan.id ? "order-first md:order-none" : ""}`}>
          <PlanCard plan={plan} action={actions[plan.id]} label={labels?.[plan.id]} compact={compact} interval={interval} />
        </div>
      ))}
    </div>
    </>
  )
}

/**
 * MONTHLY OR YEARLY, as one pill with a white thumb that slides between the
 * two, the way Shopify's plans page asks. Yearly carries what it saves. Only
 * the thumb moves; the words stay where they are.
 */
function IntervalSwitch({ value, onChange, compact }: { value: BillingInterval; onChange: (next: BillingInterval) => void; compact?: boolean }) {
  const yearly = value === "yearly"
  return (
    <div className={`flex justify-center ${compact ? "mb-3" : "mb-5 sm:mb-6"}`}>
      <div
        role="radiogroup"
        aria-label="Billing"
        data-billing-interval={value}
        className="relative inline-grid grid-cols-2 rounded-full bg-[#eceef1] p-1 shadow-[inset_0_1px_2px_rgba(16,24,40,0.10),inset_0_0_0_1px_rgba(16,24,40,0.04)]"
      >
        <span
          aria-hidden="true"
          className="absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-full bg-white shadow-[0_1px_2px_rgba(16,24,40,0.12),0_4px_10px_-4px_rgba(16,24,40,0.18),inset_0_-1px_0_rgba(16,24,40,0.04)] transition-[translate] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none"
          style={{ translate: yearly ? "100% 0" : "0 0" }}
        />
        {(["monthly", "yearly"] as const).map((option) => {
          const on = value === option
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={on}
              data-interval-option={option}
              onClick={() => onChange(option)}
              className={`relative z-[1] inline-flex h-9 cursor-pointer select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-4 text-[13px] font-semibold outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-[#111113]/25 [-webkit-tap-highlight-color:transparent] sm:px-5 ${on ? "text-[#111113]" : "text-[#4b5260] hover:text-[#1a1a2e]"}`}
            >
              {option === "monthly" ? "Monthly" : "Yearly"}
              {option === "yearly" ? (
                <span className="rounded-full bg-[#111113] px-1.5 py-px text-[10.5px] font-semibold leading-4 text-white">Save {YEARLY_SAVING_PERCENT}%</span>
              ) : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}
