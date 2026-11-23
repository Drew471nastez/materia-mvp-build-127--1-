"use client"

/**
 * The three plan cards: Free, Grow and Pro.
 *
 * One component for every place a plan is offered (the landing page,
 * /pricing, onboarding, the upgrade page, the Billing tab and the OnePage
 * settings) so the cards cannot drift apart again. Each screen decides what
 * the button does; the card decides how a plan looks.
 *
 * PRICING ROUND 5, DRAWN TO THE OWNER'S REFERENCE PICTURE. Three white cards
 * (on a light grey ground until landing round 12). Each card holds a soft grey panel at its top with
 * a small white pill (the plan's icon and name), the price large with
 * "/month" beside it, one line of at most seven words, and a full width
 * rounded button: outlined on Free and Pro, filled in Storelib purple on
 * Grow, the middle card, which stands a little higher with a soft shadow.
 * Under the panel, the plan's lines (six since landing round 14), each with a small line
 * icon. Under the three cards, a wide white bar with "Contact sales" where
 * the page asks for it. The price is one step heavier than the reference.
 *
 * The plan names people read are Free, Grow ($14, id `growth`) and Pro ($99,
 * id `pro`); the ids, the Stripe prices and the checkout never changed
 * (lib/billing/plans.ts).
 *
 * LANDING ROUND 12, THE OWNER: no light grey ground behind the cards, so the
 * white cards sit on the page itself. Grow's icon is a line going up, not a
 * plant. Free and Pro get the home page's dark button with its arrow (the
 * earnings section's "Start earning", .cme-cta). Grow's card is still the
 * raised one.
 *
 * LANDING ROUND 13, THE OWNER: "Get Grow" is a solid Storelib purple button,
 * no white pill and no round arrow. Free and Pro keep the dark button.
 *
 * LANDING ROUND 14, THE OWNER: Grow's purple button gets the round arrow at
 * its right, as the creators section's "Start selling for free" has it, the
 * other way round: a white disc with a purple arrow. Six lines on every card
 * (the sixth from the plan tables, ./pricing-lines). The plan's pill takes a
 * hair of depth, as Polaris draws a quiet control: a white top edge inside,
 * a faint shade along its foot.
 *
 * EVERY WORD IS TRUE. The lines come from components/marketing/pricing-lines,
 * written from the tables that enforce them, and tests/pricing-cards-r5.test.ts
 * holds the count, the names and the order.
 */
import * as React from "react"
import Link from "next/link"
import {
  ArrowRight,
  BadgeCheck,
  ChartColumn,
  Check,
  CreditCard,
  Files,
  EyeOff,
  FolderOpen,
  Globe,
  Landmark,
  Layers,
  LayoutTemplate,
  Loader2,
  Mail,
  Package,
  PenLine,
  Rocket,
  Store,
  TrendingUp,
  type LucideIcon,
} from "lucide-react"
import { SWAP_EASE, SWAP_MS, TextSwap } from "@/components/ui/text-swap"
import { publicPlanLines, type PlanLineIcon, type PlanLineRates } from "@/components/marketing/pricing-lines"
import { CardRatesTip } from "@/components/billing/card-rates-tip"
import { OFFERED_PLANS, PRO_CHECKOUT_PLAN_ID, YEARLY_BILLING_LIVE, YEARLY_SAVING_PERCENT, pricedFor, type BillingInterval, type OfferedPlan, type OfferedPlanId } from "@/lib/billing/plans"
import { tt } from "@/lib/i18n/text"

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

/** The plan in the middle, drawn raised with the solid purple button: Grow (id `growth`). */
export const FEATURED_PLAN_ID: OfferedPlanId = PRO_CHECKOUT_PLAN_ID

/** Storelib purple, the colour of the home page's primary button (components/marketing/hero), and of Grow's button. */
export const PLAN_PURPLE = "#7c3aed"

/** The icon in each plan's pill. */
const PLAN_ICON: Record<OfferedPlanId, LucideIcon> = {
  free: Store,
  /* Landing round 12, the owner: not a plant. A line going up, which is what the plan is for. */
  growth: TrendingUp,
  pro: Rocket,
}

/** The small line icon beside each line. */
const LINE_ICON: Record<PlanLineIcon, LucideIcon> = {
  products: Package,
  page: LayoutTemplate,
  bank: Landmark,
  mail: Mail,
  rate: CreditCard,
  everything: Layers,
  domain: Globe,
  brand: EyeOff,
  badge: BadgeCheck,
  sites: LayoutTemplate,
  files: FolderOpen,
  edits: PenLine,
  analytics: ChartColumn,
  pages: Files,
}

/** Worked out once from the plan tables. */
const PLAN_LINES = publicPlanLines()

/**
 * "1.5% + $0.25" never broken inside: a narrow card (Pro's line at 390px,
 * every rate line at 768px) wraps before the rate, never between its parts,
 * so no "$0.25" is left alone on a row (scripts/check-pricing-rate-line.mjs).
 */
const keepRateWhole = (text: string) =>
  /* Pricing one row round: where a line still wraps (Free's "Creator page + 2 websites" at 768), a count stays with its noun, never "websites" alone on a row. */
  text.replace(/(\d%) \+ /g, "$1\u00a0+\u00a0").replace(/(\d) (websites?)\b/g, "$1\u00a0$2")

/** The rate line's words, then its last run (the rate, kept whole) and the info circle together, so they wrap as one. */
function RateText({ text, rates }: { text: string; rates: PlanLineRates }) {
  const cut = text.lastIndexOf(" ")
  return (
    <>
      {cut > 0 ? text.slice(0, cut + 1) : null}
      <span className="whitespace-nowrap">
        {cut > 0 ? text.slice(cut + 1) : text}
        <CardRatesTip rates={rates} />
      </span>
    </>
  )
}

/**
 * MONTHLY AND YEARLY ARE BOTH ALREADY THERE. Every line that differs between
 * the two (Grow's price, the period, the button) is drawn by TextSwap
 * (components/ui/text-swap): both versions laid out in one cell, so the card
 * never changes size and nothing is mounted when the pill moves. A line that
 * is the same either way (everything on Free) is plain text and never moves.
 * The pill's thumb slides on the same time and curve, so they move as one.
 */
const SWITCH_MS = SWAP_MS
const SWITCH_EASE = SWAP_EASE

/** The arrow on the home page's dark buttons (earnings-calculator.tsx, .cme-cta). */
function DarkArrow() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 transition duration-[250ms] ease-[cubic-bezier(.2,.8,.2,1)] group-hover:translate-x-[3px] motion-reduce:transition-none">
      <path d="M4 10h12M11 5l5 5-5 5" />
    </svg>
  )
}

/**
 * Grow's arrow (landing round 14): the creators section's round arrow
 * (creators-carousel.tsx, .cc-cta-ic), the other way round: a white disc on
 * the purple with a purple arrow, set in at the button's right end so the
 * label stays centred like the other two. It nudges right on hover.
 *
 * Landing round 19, the owner: on hover and focus only this disc takes an
 * outline, a white ring just outside it (.plan-grow in PLAN_BUTTON_CSS); the
 * button stays solid purple.
 */
function DiscArrow({ compact }: { compact?: boolean }) {
  return (
    <span
      aria-hidden="true"
      data-plan-arrow="disc"
      className={`plan-disc absolute right-[5px] top-1/2 grid h-[34px] w-[34px] -translate-y-1/2 place-items-center rounded-full bg-white text-[#7c3aed] shadow-[0_1px_2px_rgba(46,16,101,0.18)]`}
    >
      <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="transition duration-300 ease-[cubic-bezier(.2,.8,.2,1)] group-hover:translate-x-[2px] motion-reduce:transition-none">
        <path d="M3.5 8h8.5M8.5 4.5 12 8l-3.5 3.5" />
      </svg>
    </span>
  )
}

function PlanButton({ action, featured, compact }: { action: PlanCardAction; featured: boolean; compact?: boolean }) {
  const live = !action.settled && !action.loading
  const disc = live && featured
  const className =
    `group relative inline-flex w-full h-11 items-center justify-center gap-2 rounded-full ${disc ? (compact ? "px-11" : "px-12") : "px-5"} ` +
    "text-[14px] no-underline select-none transition-[background-color,border-color,color,box-shadow] duration-200 " +
    "focus-visible:outline-none focus-visible:ring-4 " +
    /*
      ROUND 58, THE OWNER: the current plan's button "must not turn white or
      outlined". A settled button (the plan somebody is on, a change already
      scheduled) keeps its plan's filled shape and colour, quieter, with no
      arrow and no light crossing it, and takes no press. The current plan
      says so with a check.
    */
    (action.settled
      ? `${featured ? "bg-[#7c3aed]" : "bg-[#0f0e13]"} font-semibold text-white opacity-70 cursor-default`
      : featured
        ? "bg-[#7c3aed] font-semibold text-white shadow-[0_1px_2px_rgba(76,29,149,0.20),0_8px_20px_-12px_rgba(76,29,149,0.55)] focus-visible:ring-[#7c3aed]/30 disabled:cursor-not-allowed disabled:opacity-70"
        : "bg-[#0f0e13] font-semibold text-white hover:bg-[#2a2833] active:bg-[#2a2833] focus-visible:ring-[#18181b]/20 disabled:cursor-not-allowed disabled:opacity-70")
  const content = action.loading ? (
    <>
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      {tt("Processing")}
    </>
  ) : (
    <>
      {action.settled && action.current ? <Check className="h-4 w-4 shrink-0" strokeWidth={2.25} aria-hidden="true" /> : null}
      <span className="min-w-0 truncate">{action.label}</span>
      {/* Landing round 14: Grow's purple button carries the white disc with its purple arrow; Free's and Pro's dark ones keep their plain arrow. */}
      {disc ? <DiscArrow compact={compact} /> : live ? <DarkArrow /> : null}
    </>
  )
  const kind = action.settled ? "settled" : featured ? "purple" : "dark"
  /*
    Landing round 15, the owner: a faint light crosses a live dark button on hover (PLAN_BUTTON_CSS).
    Landing round 19, the owner: Get Grow stays purple and carries the light too; only its white disc takes a ring (.plan-grow).
  */
  const shine = disc ? " plan-shine plan-grow" : live ? " plan-shine" : ""

  if (action.href && !action.disabled && !action.settled) {
    return (
      <Link href={action.href} className={className + shine} data-plan-action data-plan-button={kind}>
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
      className={className + shine}
      data-plan-action
      data-plan-button={kind}
      data-plan-current={action.current ? "" : undefined}
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
  nameLevel = 3,
  onFilm = false,
}: {
  /** On the onboarding's dark film: every card level, with a little more depth under it. */
  onFilm?: boolean
  plan: OfferedPlan
  action: PlanCardAction
  label?: string
  compact?: boolean
  interval: BillingInterval
  nameLevel?: 2 | 3
}) {
  const Name = nameLevel === 2 ? "h2" : "h3"
  const featured = plan.id === FEATURED_PLAN_ID
  const Icon = PLAN_ICON[plan.id]
  const monthly = pricedFor(plan, "monthly")
  const yearly = pricedFor(plan, "yearly")
  /* Yearly is shown, not sold, until its Stripe price exists (lib/billing/plans). */
  const heldAction = (i: BillingInterval): PlanCardAction => {
    const held = i === "yearly" && plan.priceCents > 0 && !YEARLY_BILLING_LIVE && !action.settled
    return held ? { label: tt("Yearly opens soon"), settled: true } : action
  }
  const monthlyAction = heldAction("monthly")
  const yearlyAction = heldAction("yearly")
  const yearlyPeriod = yearly.price !== monthly.price ? tt("/month, billed yearly") : tt("/month")
  /*
    IN THE ONBOARDING THE WHOLE CARD PICKS THE PLAN. The button stays the one
    control for a keyboard and a screen reader, so the card adds no second
    tab stop.
  */
  const shown = interval === "yearly" ? yearlyAction : monthlyAction
  const pick = compact && shown.onClick && !shown.href && !shown.disabled && !shown.settled && !shown.loading ? shown.onClick : undefined

  return (
    <article
      data-plan-card={plan.id}
      data-plan-featured={featured ? "" : undefined}
      onClick={pick ? (e) => { if (!(e.target as Element).closest("[data-plan-action], [data-plan-info]")) pick() } : undefined}
      className={`flex w-full flex-col rounded-[22px] bg-white p-[5px] ring-[1.1px] ring-[#e7e7e9] ${
        onFilm
          ? featured
            ? "relative z-[1] shadow-[0_32px_60px_-24px_rgba(0,0,0,0.7),0_12px_24px_-12px_rgba(0,0,0,0.45)]"
            : "shadow-[0_24px_48px_-24px_rgba(0,0,0,0.6),0_8px_16px_-10px_rgba(0,0,0,0.35)]"
          : featured
            ? "relative z-[1] shadow-[0_22px_44px_-22px_rgba(24,24,27,0.30),0_4px_12px_-6px_rgba(24,24,27,0.10)] md:-translate-y-2"
            : "shadow-[0_1px_2px_rgba(24,24,27,0.04)]"
      } ${pick ? "cursor-pointer" : ""}`}
    >
      {/* Landing round 12, the owner: no light grey on the cards either. The top panel is white, set off from the lines by a hairline. */}
      <div data-plan-panel="" className={`flex flex-col rounded-t-[18px] border-b border-[#ececef] bg-white ${compact ? "px-4 pb-4 pt-4" : "px-5 pb-5 pt-5 sm:px-6 sm:pb-6"}`}>
        <div className="flex items-center justify-between gap-3">
          {/* Landing round 14, the owner: the faintest Polaris-like depth, no gradient. A white highlight along the inside top, a hair of shade along the inside foot, one pixel of shadow under it, on the same hairline ring. */}
          <span data-plan-pill="" className="inline-flex h-8 items-center gap-1.5 rounded-full bg-white pl-2.5 pr-3 ring-1 ring-[#e4e4e7] shadow-[inset_0_1px_0_#fff,inset_0_-1px_0_rgba(24,24,27,0.05),0_1px_1px_rgba(24,24,27,0.05)]">
            <Icon className="h-[15px] w-[15px] text-[#18181b]" strokeWidth={1.75} aria-hidden="true" />
            <Name className="text-[13.5px] font-medium leading-none text-[#18181b]">{plan.name}</Name>
          </span>
          {label ? <span data-plan-label="" className="text-[12px] font-medium text-[#6b7280]">{label}</span> : null}
        </div>
        <p data-plan-price="" className={`${compact ? "mt-4" : "mt-5"} flex items-baseline gap-1.5 text-[#09090b]`}>
          {/* Never broken: the changing digit is its own box, which a narrow card (three across at 768px) wrapped onto a row of its own ("$1" over "4"). */}
          <span className={`${compact ? "text-[36px]" : "text-[42px] sm:text-[44px]"} whitespace-nowrap font-semibold leading-none tracking-[-0.035em] tabular-nums`}>
            <TextSwap value={interval} items={{ monthly: monthly.price, yearly: yearly.price }} />
          </span>
          <span className="text-[14.5px] font-normal leading-none text-[#6b7280]">
            <TextSwap value={interval} items={{ monthly: tt("/month"), yearly: yearlyPeriod }} />
          </span>
        </p>
        <p data-plan-summary="" className={`${compact ? "mt-3 text-[14px]" : "mt-4 text-[15px]"} max-w-[250px] min-h-[44px] text-balance leading-[22px] text-[#52525b]`}>
          {plan.summary}
        </p>
        <div className={compact ? "mt-4" : "mt-5"}>
          {/*
            ONE BUTTON WHEN BOTH INTERVALS DO THE SAME THING, two in one cell
            when they differ (a yearly price is shown before it is sold). Each
            keeps its own element for good, so the switch crossfades between
            two that already exist instead of swapping a link for a button.
          */}
          {monthlyAction === yearlyAction ? (
            <PlanButton action={monthlyAction} featured={featured} compact={compact} />
          ) : (
            <TextSwap
              fill
              lift="0.25em"
              value={interval}
              items={{
                monthly: <PlanButton action={monthlyAction} featured={featured} compact={compact} />,
                yearly: <PlanButton action={yearlyAction} featured={featured} compact={compact} />,
              }}
            />
          )}
        </div>
      </div>

      <ul data-plan-lines="" className={`flex flex-col ${compact ? "gap-3 px-4 pb-5 pt-5" : "gap-[15px] px-5 pb-6 pt-6 sm:px-6"}`}>
        {PLAN_LINES[plan.id].map((line) => {
          const LineIcon = LINE_ICON[line.icon]
          return (
            <li key={line.text} data-plan-line={line.icon} className={`flex items-start gap-3 ${compact ? "text-[13.5px]" : "text-[14.5px]"} leading-[20px] text-[#27272a]`}>
              <LineIcon className="mt-[2px] h-4 w-4 shrink-0 text-[#3f3f46]" strokeWidth={1.5} aria-hidden="true" />
              {/*
                Pricing tooltip round, the owner: the rate line is one row, from the plan's lowest rate, with a small
                info circle right after it that opens the rates by kind (./card-rates-tip). The rate and the circle
                are one unbreakable run, so the circle is never left alone on a row
                (scripts/check-pricing-rate-line.mjs at 390, 768 and 1280).
              */}
              <span className="[text-wrap:pretty]">
                {line.rates ? <RateText text={keepRateWhole(tt(line.text))} rates={line.rates} /> : keepRateWhole(tt(line.text))}
              </span>
            </li>
          )
        })}
      </ul>
    </article>
  )
}

/**
 * THE WIDE BAR UNDER THE CARDS, as in the reference picture (its typos
 * fixed): one line and a dark "Contact sales" button that opens the Help
 * Center's contact form on Plan and billing.
 */
function ContactSalesBar({ compact }: { compact?: boolean }) {
  return (
    <div
      data-plan-contact=""
      className={`mt-4 flex flex-col items-start gap-4 rounded-[20px] bg-white ring-1 ring-[#e7e7e9] sm:flex-row sm:items-center sm:justify-between ${compact ? "px-5 py-4" : "px-6 py-5 sm:px-7 sm:py-6 lg:mt-6"}`}
    >
      <p className={`${compact ? "text-[16px]" : "text-[18px] sm:text-[21px]"} font-medium leading-[1.3] tracking-[-0.01em] text-[#09090b]`}>
        {tt("Want a unique solution to meet your needs?")}
      </p>
      <Link
        href="/help/contact?about=billing"
        className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-[#18181b] px-5 text-[14px] font-semibold text-white no-underline shadow-[0_6px_14px_-6px_rgba(24,24,27,0.5)] transition-colors duration-200 hover:bg-[#27272a] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#18181b]/20"
      >
        {tt("Contact sales")}
        <ArrowRight className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
      </Link>
    </div>
  )
}

export function PlanCards({
  actions,
  labels,
  compact,
  lead,
  heading,
  className = "",
  interval: controlled,
  onInterval,
  nameLevel,
  hideInterval = false,
  contactSales = false,
  aside,
  split,
}: {
  /**
   * A heading for the row the cards sit under (the onboarding's plan step):
   * it takes the left and Monthly / Yearly the right from 768px, both on the
   * cards' own edges; on a phone the switch goes under the words.
   */
  split?: React.ReactNode
  /** Something at the top right of the cards, level with the Monthly and Yearly pill (/pricing's "Compare all features" link). */
  aside?: React.ReactNode
  /**
   * No Monthly and Yearly pill, and so monthly prices only. The home page's
   * section (landing round 9, the owner: "monthly or yearly is chosen when I
   * pay"); every other surface keeps the pill.
   */
  hideInterval?: boolean
  /** The "Contact sales" bar under the cards (the home page, /pricing and the upgrade page). */
  contactSales?: boolean
  /** The plan names' heading level: 2 where the cards sit right under the page's h1 (/pricing), 3 under a section's h2 (the default). */
  nameLevel?: 2 | 3
  actions: Record<OfferedPlanId, PlanCardAction>
  /** Monthly or yearly; held here unless the page wants to hold it. */
  interval?: BillingInterval
  onInterval?: (next: BillingInterval) => void
  /** A small word beside a card's pill, such as "Current plan". */
  labels?: Partial<Record<OfferedPlanId, string>>
  compact?: boolean
  /** On a phone, where the cards stack, this plan comes first: Grow for somebody already on Free. Side by side they keep their order. */
  lead?: OfferedPlanId
  /** A section heading (the Billing tab): the heading on its own row, then the pill centred above the cards. */
  heading?: React.ReactNode
  className?: string
}) {
  const [own, setOwn] = React.useState<BillingInterval>("monthly")
  const interval = hideInterval ? "monthly" : controlled ?? own
  const pick = (next: BillingInterval) => {
    setOwn(next)
    onInterval?.(next)
  }
  return (
    <>
      <style href="plan-cards" precedence="default">{PLAN_BUTTON_CSS}</style>
      {heading != null ? <div data-plan-heading-row="" className="mb-4">{heading}</div> : null}
      {hideInterval || aside != null || split != null ? null : (
        <div data-plan-interval-row="" className="flex justify-center mb-5 sm:mb-6">
          <IntervalSwitch value={interval} onChange={pick} />
        </div>
      )}
      {/* What the three cards (and the contact bar) sit in. Landing round 12, the owner: no light grey ground behind them any more (it was #efeff0, padded); the row keeps its width, so the cards take the room the ground had. */}
      <div data-plan-ground="" className={`mx-auto w-full ${compact ? (split != null ? "max-w-[1056px]" : "max-w-[980px]") : "max-w-[1180px]"} ${className}`}>
        {/*
          WITH SOMETHING AT THE TOP RIGHT (landing round 14, /pricing's
          "Compare all features"): the row sits inside the cards' own width,
          the pill still centred and the aside at the right edge of the cards.
          On a phone the aside takes its own line under the pill, at the right.
        */}
        {split != null ? (
          <div data-plan-interval-row="" data-plan-split="" className="mb-6 flex flex-col items-start gap-4 sm:mb-8 md:flex-row md:items-center md:justify-between md:gap-8">
            <div className="min-w-0">{split}</div>
            {hideInterval ? null : (
              <div data-plan-split-switch="" className="shrink-0">
                <IntervalToggle value={interval} onChange={pick} />
              </div>
            )}
          </div>
        ) : null}
        {aside != null ? (
          <div data-plan-interval-row="" className="mb-4 flex flex-col items-center gap-3 sm:mb-6 sm:grid sm:grid-cols-[1fr_auto_1fr] sm:gap-4">
            <span aria-hidden="true" className="hidden sm:block" />
            {hideInterval ? <span aria-hidden="true" /> : <IntervalSwitch value={interval} onChange={pick} />}
            <div data-plan-aside="" className="self-end sm:self-auto sm:justify-self-end">{aside}</div>
          </div>
        ) : null}
        {/*
          LANDING ROUND 15, THE OWNER: on a phone the cards are a row that
          scrolls sideways, a card and a fifth of the next in view, each
          snapping to the start. The row bleeds to the screen's edge by
          --plan-bleed (the surface's own side padding, 0 unless the page sets
          it) and pads its top and foot so the rings and the raised card's
          shadow are not clipped. From 768px it is the three columns again.
        */}
        <div data-plan-cards className={`flex w-full items-stretch max-md:-mx-[var(--plan-bleed,0px)] max-md:w-auto max-md:snap-x max-md:snap-mandatory max-md:overflow-x-auto max-md:overscroll-x-contain max-md:scroll-px-[var(--plan-bleed,0px)] max-md:px-[var(--plan-bleed,0px)] max-md:-mt-2 max-md:pt-2 max-md:pb-7 max-md:-mb-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:grid md:grid-cols-3 ${compact ? "gap-2.5 sm:gap-3" : "gap-3 lg:gap-5"} md:pt-2`}>
          {OFFERED_PLANS.map((plan) => (
            <div key={plan.id} data-plan-slot={plan.id} className={`flex max-md:w-[82%] max-md:shrink-0 max-md:snap-start ${lead === plan.id ? "order-first md:order-none" : ""}`}>
              <PlanCard plan={plan} action={actions[plan.id]} label={labels?.[plan.id]} compact={compact} interval={interval} nameLevel={nameLevel} onFilm={split != null} />
            </div>
          ))}
        </div>
        {contactSales ? <ContactSalesBar compact={compact} /> : null}
      </div>
    </>
  )
}

/*
  THE BUTTONS' HOVER (landing round 15, the owner). A band of faint light
  crosses a live button once as the pointer arrives: a pseudo element under
  the label (z-index -1 in the button's own stacking context), moved by a
  translate only. The owner, a second time: the light was too strong and too
  quick. It is half as bright now (a peak of 8% white, not 16%), wider and
  softer at its edges, and takes 1.6s on an even ease in and out, so it
  drifts across rather than flashes. When the pointer leaves it fades out
  first and only then goes back, hidden, so it never jumps or sweeps
  backwards. Only where there is a pointer that hovers, and never under
  reduced motion.

  GET GROW (landing round 19, the owner: "only the white circle should
  have the outline, not the whole Get Grow button"). The button stays solid
  purple with a white label on hover and focus, and carries the same faint
  light as Start free and Get Pro. Only the white disc changes: a 1.5px
  white ring, 2px clear of its edge, fades and grows in round it (opacity
  0 at scale .86 to 1 at scale 1, 300ms on an ease out). The ring is the
  disc's ::after, drawn by a still 1.5px shadow (Chrome rounds a 1.5px
  border down to 1px), and only its opacity and scale move, on the
  compositor; no shadow is animated. At 34px plus the gap and the line it is 41px
  across, concentric with the button's 44px round end, so it never touches
  the edge. Keyboard focus shows the ring and the button's usual focus ring
  outside it. Hover only where a pointer hovers, so a tap on a phone never
  leaves it stuck; under reduced motion it only fades, no growth.
*/
const PLAN_BUTTON_CSS = `
.plan-shine{overflow:hidden;isolation:isolate}
.plan-shine::before{content:"";position:absolute;z-index:-1;top:0;bottom:0;left:0;width:60%;pointer-events:none;background:linear-gradient(105deg,rgba(255,255,255,0) 0%,rgba(255,255,255,.035) 30%,rgba(255,255,255,.08) 50%,rgba(255,255,255,.035) 70%,rgba(255,255,255,0) 100%);translate:-105% 0;opacity:0;transition:opacity .3s ease,translate 0s linear .3s}
@media (hover:hover) and (prefers-reduced-motion:no-preference){
  .plan-shine:hover::before{translate:175% 0;opacity:1;transition:translate 1.6s cubic-bezier(.45,.05,.35,1),opacity .4s ease}
}
.plan-grow .plan-disc::after{content:"";position:absolute;inset:-2px;border-radius:9999px;box-shadow:0 0 0 1.5px rgba(255,255,255,.9);pointer-events:none;opacity:0;scale:.86;transition:opacity .3s cubic-bezier(.22,1,.36,1),scale .3s cubic-bezier(.22,1,.36,1)}
.plan-grow:focus-visible .plan-disc::after{opacity:1;scale:1}
@media (hover:hover){
  .plan-grow:hover .plan-disc::after{opacity:1;scale:1}
}
@media (prefers-reduced-motion:reduce){.plan-grow .plan-disc::after{scale:none;transition:opacity .15s linear}}
`

/**
 * MONTHLY OR YEARLY, as one pill with a thumb that slides between the two.
 * Restyled to the cards (pricing round 5): a white track with a hairline,
 * like the cards, and a soft grey thumb, like the cards' top panel. Yearly
 * carries what it saves.
 *
 * The two options share one grid of two equal columns, so the thumb is
 * exactly one column wide by construction and moving it is a shift by its
 * own width (100%): nothing to measure, nothing laid out again.
 */
/*
  PAY MONTHLY / PAY YEARLY ON THE FILM (the onboarding's plans). A small
  switch and the words for what is on, not a wide two part pill: the thumb
  slides on translate, the track turns Storelib's violet for yearly. One
  44px press for the whole row.
*/
function IntervalToggle({ value, onChange }: { value: BillingInterval; onChange: (next: BillingInterval) => void }) {
  const yearly = value === "yearly"
  return (
    <button
      type="button"
      role="switch"
      aria-checked={yearly}
      aria-label={tt("Pay yearly")}
      data-billing-interval={value}
      data-interval-toggle=""
      onClick={() => onChange(yearly ? "monthly" : "yearly")}
      className="group inline-flex h-11 items-center gap-3 rounded-full pr-1 text-left outline-none [-webkit-tap-highlight-color:transparent] focus-visible:ring-2 focus-visible:ring-white/50"
    >
      <span
        aria-hidden="true"
        className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full p-[3px] ring-1 transition-[background-color,box-shadow] duration-200 motion-reduce:transition-none ${
          yearly ? "bg-[#7c3aed] ring-[#8b5cf6]/60 shadow-[0_4px_14px_-4px_rgba(124,58,237,0.7)]" : "bg-white/[0.08] ring-white/15 group-hover:bg-white/[0.12]"
        }`}
      >
        <span
          className={`block h-[22px] w-[22px] rounded-full shadow-[0_1px_3px_rgba(0,0,0,0.35)] transition-[translate,background-color] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${yearly ? "translate-x-5 bg-white" : "translate-x-0 bg-white/70"}`}
        />
      </span>
      <span className="text-[15px] font-medium text-white">
        <TextSwap value={value} items={{ monthly: tt("Pay monthly"), yearly: tt("Pay yearly") }} />
      </span>
      <span className="rounded-full bg-[#7c3aed]/20 px-2 py-0.5 text-[12px] font-semibold text-[#c4b5fd]">
        {tt("Save")} {YEARLY_SAVING_PERCENT}%
      </span>
    </button>
  )
}

function IntervalSwitch({ value, onChange }: { value: BillingInterval; onChange: (next: BillingInterval) => void }) {
  const yearly = value === "yearly"
  return (
    <div
      role="radiogroup"
      aria-label={tt("Billing")}
      data-billing-interval={value}
      className="relative inline-grid shrink-0 grid-cols-2 rounded-full bg-white p-1 ring-1 ring-[#e4e4e7] shadow-[0_1px_2px_rgba(24,24,27,0.04)]"
    >
      <span
        aria-hidden="true"
        data-interval-thumb=""
        className="pointer-events-none absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-full bg-[#efeff0] motion-reduce:!transition-none"
        style={{
          transform: `translate3d(${yearly ? "100%" : "0"}, 0, 0)`,
          transition: `transform ${SWITCH_MS}ms ${SWITCH_EASE}`,
        }}
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
            style={{ transition: `color ${SWITCH_MS}ms ${SWITCH_EASE}` }}
            className={`relative z-[1] inline-flex h-9 cursor-pointer motion-reduce:!transition-none select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-4 text-[13.5px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-[#18181b]/25 sm:px-5 [-webkit-tap-highlight-color:transparent] ${
              on ? "text-[#09090b]" : "text-[#6b7280] hover:text-[#18181b]"
            }`}
          >
            {option === "monthly" ? tt("Monthly") : tt("Yearly")}
            {option === "yearly" ? (
              <span className="rounded-full bg-[#7c3aed]/10 px-1.5 py-px text-[11px] font-semibold leading-4 text-[#6d28d9]">
                {tt("Save")} {YEARLY_SAVING_PERCENT}%
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
