"use client"

/**
 * The three plan cards: Free, Pro and Scale.
 *
 * One component for every place a plan is offered (the landing page,
 * /pricing, onboarding, the upgrade page and the Billing tab) so the cards
 * cannot drift apart again. Each screen decides what the button does; the
 * card decides how a plan looks, and PLAN_ART below is the only place the
 * pictures, their dimming and their grain are written down.
 *
 * DRAWN TO THE OWNER'S REFERENCE. A tall header in the plan's colour, which is
 * the owner's own picture (near black for Free, deep indigo for Pro, the
 * Storelib mark standing at the right), holding a small label, the plan's
 * name, the price large, a line under it and one line of description, all in
 * white. Under it the plan's lines, each with a thin check in the plan's
 * colour (wave 13: "simpler and lighter, thin, not bold, not filled
 * circles"; a thin grey cross for what Free does not have), a full width
 * button in the same colour, and one line of small print.
 *
 * EVERY WORD IS TRUE. The lines come from lib/billing/plans.ts, which writes
 * them from the tables that enforce them; the label and the small print are
 * plain facts about the plan (no invented discount, no "most chosen"), and
 * tests/pricing-plans.test.ts holds both.
 *
 * THE PICTURES THROUGH next/image, sized to the card: a phone is sent a
 * version about as wide as its screen, not the 1672px original.
 * scripts/check-pricing-cards.mjs measures that, the equal heights, the
 * contrast of the white text on the picture, and the 44px buttons;
 * scripts/check-billing-tab.mjs measures the Monthly and Yearly switch frame
 * by frame, and the pictures' brightness and grain.
 */
import * as React from "react"
import Image from "next/image"
import Link from "next/link"
import { ArrowRight, Check, Loader2, X } from "lucide-react"
import { SWAP_EASE, SWAP_MS, TextSwap } from "@/components/ui/text-swap"
import { OFFERED_PLANS, YEARLY_BILLING_LIVE, YEARLY_SAVING_PERCENT, pricedFor, type BillingInterval, type OfferedPlan, type OfferedPlanId } from "@/lib/billing/plans"
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

const PICTURE_BASE = "https://storelib.com/media/platform%20images"

/**
 * FILM GRAIN OVER THE PICTURES. A tile of fractal noise turned into light
 * and dark specks, each with its own transparency, laid over the picture in
 * the ordinary way. It used to be grey noise in `mix-blend-mode: overlay`,
 * which does almost nothing over a dark picture (overlay scales with what is
 * under it, and both pictures are dark), so on a phone it all but vanished;
 * and a blended layer is one a phone has to composite against the picture
 * whenever anything above it animates. Plain specks read at any density and
 * cost nothing to draw. Drawn once, as an SVG tile in the stylesheet: no
 * image to fetch, no canvas, nothing that moves. It sits under the text.
 */
/*
  FINE, NOT COARSE. The tile was drawn at 160 units and shown at 160 CSS
  pixels, so on a phone at 3x every speck was scaled up to three device
  pixels and read as a coarse, blotchy texture. Now the noise is drawn at
  three times the resolution (GRAIN_DENSITY) and shown in the same 160px,
  so a speck is about one device pixel on a phone: a denser, finer grain
  that reads as texture rather than dirt, and a little lighter (the `grain`
  opacities below).
*/
const GRAIN_TILE = 160
const GRAIN_DENSITY = 3
const GRAIN_SVG =
  `<svg xmlns='http://www.w3.org/2000/svg' width='${GRAIN_TILE * GRAIN_DENSITY}' height='${GRAIN_TILE * GRAIN_DENSITY}'>` +
  "<filter id='g' x='0' y='0' width='100%' height='100%' color-interpolation-filters='sRGB'>" +
  "<feTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='2' stitchTiles='stitch' result='n'/>" +
  /*
    Light specks where the noise is high, dark where it is low. The dark ones
    are weighted heavier: on pictures this dark a light speck shows far more
    than a dark one, and even specks would lift the whole header, undoing the
    dimming below (scripts/check-billing-tab.mjs reads the header's average).
  */
  "<feColorMatrix in='n' result='light' values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 1.3 0 0 0 -0.66'/>" +
  "<feColorMatrix in='n' result='dark' values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -2 0 0 0 1'/>" +
  "<feMerge><feMergeNode in='dark'/><feMergeNode in='light'/></feMerge>" +
  "</filter><rect width='100%' height='100%' filter='url(#g)'/></svg>"
export const PLAN_GRAIN = `url("data:image/svg+xml,${encodeURIComponent(GRAIN_SVG)}")`

/**
 * EACH PLAN'S ART, in one place, for every card on every surface.
 *
 * `filter` dims the picture itself (not the text, not the grain). Pro's is a
 * step darker than it was (brightness 0.52 to 0.42) with its saturation put
 * back to 1, so the indigo stays indigo instead of going grey as it darkens.
 * Free's is exactly what it was with `brightness(0.95)` added at the end:
 * the last function in a filter scales every channel of what came before, so
 * the picture is 5% darker than before and nothing else moves. An overlay
 * would have done the same to the picture but also to the grain above it.
 *
 * `ground` is the picture's own tone, painted under it, so the white text
 * reads the same while the picture is still on its way; it is dimmed with
 * the picture. `blur` is a 24px copy of the picture inlined in the markup,
 * shown blurred until the real one arrives, so the header never pops from
 * flat colour to picture. `grain` is the grain layer's opacity.
 *
 * LANDING ROUND 8, THE OWNER: "increase the contrast of the images, and the
 * grain: make it more clean and smooth". The pictures were dimmed to between
 * 36% and 70% and their contrast taken below 1, which left them murky; now
 * they are lifted (Free 0.9, Pro 0.62, Scale 0.55) with their contrast above
 * 1 (1.12 to 1.16), and the darkening at the foot is lighter (70 to 75%),
 * which is still what keeps the white words readable. The grain is a quarter
 * of what it was (0.2 to 0.05): the picture reads clean and smooth, with
 * only a trace of texture left so the flat areas do not band. The picture is
 * sent at quality 90 (next.config lists it), so its gradients stay crisp.
 *
 * LANDING ROUND 9, THE OWNER: "make the covers of the pricing cards more
 * darkened, and the grain and contrast increased just a little bit". One step
 * each, on every surface that draws the cards: brightness down about a sixth
 * (Free 0.9 to 0.76, Pro 0.62 to 0.52, Scale 0.55 to 0.5), contrast up
 * (1.12 to 1.16 became 1.2 to 1.24), the grain from 0.05 to 0.08.
 */
export const PLAN_ART: Record<OfferedPlanId, { picture: string; blur: `data:image/${string}`; filter: string; ground: string; fade: string; grain: number; dot: string; button: string; ring: string }> = {
  free: {
    picture: `${PICTURE_BASE}/ChatGPT%20Image%20Sep%2025,%202026,%2010_29_35%20AM.png`,
    blur: "data:image/webp;base64,UklGRkgAAABXRUJQVlA4IDwAAAAwAwCdASoYAA4APrVInkm3JCKhMAgC4BaJaQAAelPp0aAAAP7w3blrXGLU+JE1tbFf8V/YdHwlAu9pAAA=",
    filter: "brightness(0.76) contrast(1.2)",
    ground: "bg-[#111112]",
    fade: "from-[#0b0b0c]/75",
    grain: 0.08,
    dot: "text-[#111113]",
    button: "bg-[#111113] hover:bg-[#26262b] active:bg-[#000000]",
    ring: "focus-visible:ring-[#111113]/35",
  },
  growth: {
    picture: `${PICTURE_BASE}/ChatGPT%20Image%20Sep%2025,%202026,%2001_00_00%20PM.png`,
    blur: "data:image/webp;base64,UklGRnAAAABXRUJQVlA4IGQAAABQAwCdASoYAA4APrVMoUq3JCMhsAgC4BaJYgAAesFl7Y4P1AD+5WYnJTUuz//yU/+8r/XdyP1rncUch4oVkh+Ip7UA+Bb1kTZGrQXedRNyS4sSL7u3PKU5zEv/HrIHYtVHAAAA",
    filter: "brightness(0.52) contrast(1.24) saturate(1.05)",
    ground: "bg-[#231587]",
    fade: "from-[#130b55]/70",
    grain: 0.08,
    dot: "text-[#5a43ee]",
    button: "bg-[#5a43ee] hover:bg-[#4d37dd] active:bg-[#412dc4]",
    ring: "focus-visible:ring-[#5a43ee]/45",
  },
  /*
    Scale (id `pro`): Pro's picture turned from indigo to a warm bronze on
    graphite. It was violet (read as pink beside Pro), then a deep teal;
    landing round 9, the owner: "I don't like that you made Scale green.
    Don't make Scale green." Bronze is the far side of the wheel from Pro's
    indigo and nowhere near green or pink, so the three read as three plans:
    black, violet, bronze. No third file to fetch.
  */
  pro: {
    picture: `${PICTURE_BASE}/ChatGPT%20Image%20Sep%2025,%202026,%2001_00_00%20PM.png`,
    blur: "data:image/webp;base64,UklGRnAAAABXRUJQVlA4IGQAAABQAwCdASoYAA4APrVMoUq3JCMhsAgC4BaJYgAAesFl7Y4P1AD+5WYnJTUuz//yU/+8r/XdyP1rncUch4oVkh+Ip7UA+Bb1kTZGrQXedRNyS4sSL7u3PKU5zEv/HrIHYtVHAAAA",
    filter: "hue-rotate(148deg) saturate(0.6) brightness(0.5) contrast(1.24)",
    ground: "bg-[#3a2a17]",
    fade: "from-[#1c130a]/70",
    grain: 0.08,
    dot: "text-[#8a5a24]",
    button: "bg-[#8a5a24] hover:bg-[#784d1e] active:bg-[#664118]",
    ring: "focus-visible:ring-[#8a5a24]/45",
  },
}

/**
 * How wide the card, and so its picture, is drawn: a third of a row of up to
 * 1180px from 768px up, the screen less its gutters under that.
 */
export const PLAN_PICTURE_SIZES = "(min-width: 1180px) 390px, (min-width: 768px) 33vw, calc(100vw - 32px)"

/**
 * MONTHLY AND YEARLY ARE BOTH ALREADY THERE. Every line that differs between
 * the two (Pro's price, the words under it, the small print, the button) is
 * drawn by TextSwap (components/ui/text-swap): both versions laid out in one
 * cell, so the card never changes size and nothing is mounted when the pill
 * moves, and a smooth crossfade with a short roll between them. A line that
 * is the same either way (everything on Free) is plain text and never moves.
 * The pill's thumb slides on the same time and curve, so they move as one.
 */
const SWITCH_MS = SWAP_MS
const SWITCH_EASE = SWAP_EASE

function PlanButton({ action, plan, compact }: { action: PlanCardAction; plan: OfferedPlanId; compact?: boolean }) {
  const look = PLAN_ART[plan]
  const className =
    `inline-flex w-full ${compact ? "h-11" : "h-12"} items-center justify-center gap-2 rounded-xl px-5 ` +
    "text-[13px] font-bold uppercase tracking-[0.06em] no-underline select-none transition-colors duration-200 " +
    `focus-visible:outline-none focus-visible:ring-4 ${look.ring} ` +
    (action.settled
      ? "bg-[#f3f4f6] text-[#4b5563] cursor-default"
      : `${look.button} text-white disabled:cursor-not-allowed disabled:opacity-70`)
  const content = action.loading ? (
    <>
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      {tt("Processing")}
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

/**
 * THE PUBLIC CARDS' LINES AND TICKS (landing round). The home page and
 * /pricing hand their own plain lines (components/marketing/pricing-lines)
 * and a quiet ink tick in place of the plan coloured check: one short,
 * rounded stroke in the text's own grey, no circle, no colour. Every other
 * surface draws the plan's lines and checks as before.
 */
export type PlanCardLines = { features: string[]; excluded: string[] }
export type PlanCardTick = "plan" | "ink"

function InkTick() {
  return (
    <svg viewBox="0 0 16 16" className="mt-[2px] h-4 w-4 shrink-0 text-[#3f3f46]" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" data-plan-tick="ink">
      <path d="M3.5 8.4 6.6 11.4 12.5 4.8" />
    </svg>
  )
}

function PlanCard({
  plan,
  action,
  label,
  compact,
  interval,
  sizes,
  nameLevel = 3,
  pictureLoading = "eager",
  lines,
  tick = "plan",
}: {
  pictureLoading?: "eager" | "lazy"
  lines?: PlanCardLines
  tick?: PlanCardTick
  plan: OfferedPlan
  action: PlanCardAction
  label?: string
  compact?: boolean
  interval: BillingInterval
  sizes: string
  nameLevel?: 2 | 3
}) {
  const Name = nameLevel === 2 ? "h2" : "h3"
  const look = PLAN_ART[plan.id]
  const monthly = pricedFor(plan, "monthly")
  const yearly = pricedFor(plan, "yearly")
  /* Yearly Pro is shown, not sold, until its Stripe price exists (lib/billing/plans). */
  const heldAction = (i: BillingInterval): PlanCardAction => {
    const held = i === "yearly" && plan.priceCents > 0 && !YEARLY_BILLING_LIVE && !action.settled
    return held ? { label: tt("Yearly opens soon"), settled: true } : action
  }
  const monthlyAction = heldAction("monthly")
  const yearlyAction = heldAction("yearly")
  const pad = compact ? "px-5" : "px-6"
  /*
    IN THE ONBOARDING THE WHOLE CARD PICKS THE PLAN. A click on the picture
    or the lines did nothing; only the button at the foot did, and that was
    the part most often out of view. The button stays the one control for a
    keyboard and a screen reader, so the card adds no second tab stop.
  */
  const shown = interval === "yearly" ? yearlyAction : monthlyAction
  /* The public cards (tick "ink") are a pixel less round, as the owner asked of the landing page's cards. */
  const pick = compact && shown.onClick && !shown.href && !shown.disabled && !shown.settled && !shown.loading ? shown.onClick : undefined

  return (
    <article
      data-plan-card={plan.id}
      onClick={pick ? (e) => { if (!(e.target as Element).closest("[data-plan-action]")) pick() } : undefined}
      className={`flex w-full flex-col overflow-hidden ${tick === "ink" ? "rounded-[21px]" : "rounded-[22px]"} bg-white shadow-[0_36px_72px_-30px_rgba(16,24,40,0.34),0_10px_24px_-12px_rgba(16,24,40,0.12),0_1px_3px_rgba(16,24,40,0.06)] ring-1 ring-[#0f172a]/[0.07] ${pick ? "cursor-pointer transition-[box-shadow] duration-200 hover:ring-[#0f172a]/[0.16]" : ""}`}
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
          sizes={sizes}
          loading={pictureLoading}
          placeholder={look.blur}
          quality={90}
          draggable={false}
          className="-z-10 object-cover object-right select-none pointer-events-none"
          style={{ filter: look.filter }}
          data-plan-picture=""
        />
        {/*
          The bottom of the picture darkens toward the text, so the description
          sits on a quiet ground. It used to be blurred as well, a backdrop
          blur faded out by a mask: Safari draws that blur but not the mask,
          so on an iPhone the blur ended in a hard edge across the picture,
          a cut through the Storelib mark. The darkening alone does the job.
        */}
        <span aria-hidden="true" className={`pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-[72%] bg-gradient-to-t ${look.fade} to-transparent`} />
        <span
          aria-hidden="true"
          data-plan-grain=""
          className="pointer-events-none absolute inset-0 -z-10"
          style={{ backgroundImage: PLAN_GRAIN, backgroundSize: `${GRAIN_TILE}px ${GRAIN_TILE}px`, opacity: look.grain }}
        />
        <span className="self-start rounded-full bg-white/15 px-2.5 py-0.5 text-[11.5px] font-semibold leading-[18px] text-white ring-1 ring-inset ring-white/25">
          {label ?? plan.pill}
        </span>
        <Name className={`${compact ? "mt-3" : "mt-4"} ${compact ? "text-[16px]" : "text-[18px]"} font-bold leading-tight`}>{plan.name}</Name>
        <p
          data-plan-price=""
          className={`mt-1.5 ${compact ? "text-[38px]" : "text-[44px] sm:text-[48px]"} font-extrabold leading-none tracking-[-0.035em] tabular-nums`}
        >
          <TextSwap value={interval} items={{ monthly: monthly.price, yearly: yearly.price }} />
        </p>
        <p className="mt-1.5 text-[13px] font-medium leading-[18px] text-white/85">
          <TextSwap value={interval} items={{ monthly: monthly.priceNote, yearly: yearly.priceNote }} />
        </p>
        {/* Two lines' room for every summary, so a one-line one ("Keep more of every sale.") ends its card's head level with the others. */}
        <p className={`mt-auto ${compact ? "pt-3" : "pt-4"} ${compact ? "min-h-[52px] text-[13px]" : "min-h-[56px] text-[14px]"} leading-[20px] text-white/90`}>{plan.summary}</p>
      </div>

      <div className={`flex flex-1 flex-col ${pad} ${compact ? "pb-5 pt-5" : "pb-6 pt-5"}`}>
        <ul className={`flex flex-col ${compact ? "gap-2" : "gap-2.5"}`}>
          {(lines?.features ?? plan.features).map((feature) => (
            <li key={feature} className={`flex items-start gap-3 ${compact ? "text-[13px]" : "text-[14px]"} leading-[20px] text-[#1a1a2e]`}>
              {tick === "ink" ? (
                <InkTick />
              ) : (
                <Check className={`mt-[2px] h-4 w-4 shrink-0 ${look.dot}`} strokeWidth={1.75} aria-hidden="true" />
              )}
              {tt(feature)}
            </li>
          ))}
          {(lines?.excluded ?? plan.excluded).map((feature) => (
            <li key={feature} className={`flex items-start gap-3 ${compact ? "text-[13px]" : "text-[14px]"} leading-[20px] text-[#6b7280]`}>
              <X className="mt-[2px] h-4 w-4 shrink-0 text-[#9ca3af]" strokeWidth={1.75} aria-hidden="true" />
              <span>
                <span className="sr-only">{tt("Not included:")} </span>
                {feature}
              </span>
            </li>
          ))}
        </ul>

        <div className={`mt-auto ${compact ? "pt-5" : "pt-6"}`}>
          {/*
            ONE BUTTON WHEN BOTH INTERVALS DO THE SAME THING, two in one cell
            when they differ (Pro's yearly price is shown before it is sold).
            Each keeps its own element for good, a link or a button, so the
            switch crossfades between two that already exist instead of
            swapping a link for a button in place, which remounted it and made
            it blink.
          */}
          {monthlyAction === yearlyAction ? (
            <PlanButton action={monthlyAction} plan={plan.id} compact={compact} />
          ) : (
            <TextSwap
              fill
              lift="0.25em"
              value={interval}
              items={{
                monthly: <PlanButton action={monthlyAction} plan={plan.id} compact={compact} />,
                yearly: <PlanButton action={yearlyAction} plan={plan.id} compact={compact} />,
              }}
            />
          )}
          <p className="mt-2.5 text-center text-[12px] leading-[16px] text-[#6b7280]">
            <TextSwap align="center" value={interval} items={{ monthly: monthly.note, yearly: yearly.note }} />
          </p>
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
  heading,
  className = "",
  interval: controlled,
  onInterval,
  nameLevel,
  pictureLoading,
  lines,
  tick,
  hideInterval = false,
}: {
  /**
   * No Monthly and Yearly pill, and so monthly prices only. The home page's
   * section (landing round 9, the owner: "monthly or yearly is chosen when I
   * pay"); every other surface keeps the pill.
   */
  hideInterval?: boolean
  /** The public cards' own plain lines per plan (home page and /pricing); every other surface leaves it out. */
  lines?: Partial<Record<OfferedPlanId, PlanCardLines>>
  /** "ink" for the public cards' quiet tick; the plan coloured check otherwise. */
  tick?: PlanCardTick
  /**
   * "lazy" where the cards are far down a page (the home page's pricing
   * section). Eager there put a preload for each picture into the home page's
   * head, competing with the hero (round 48). Eager everywhere else.
   */
  pictureLoading?: "eager" | "lazy"
  /** The plan names' heading level: 2 where the cards sit right under the page's h1 (/pricing), 3 under a section's h2 (the default). */
  nameLevel?: 2 | 3
  actions: Record<OfferedPlanId, PlanCardAction>
  /** Monthly or yearly; held here unless the page wants to hold it. */
  interval?: BillingInterval
  onInterval?: (next: BillingInterval) => void
  /** In place of the small label at the top of a card, such as "Current plan". */
  labels?: Partial<Record<OfferedPlanId, string>>
  compact?: boolean
  /** On a phone, where the cards stack, this plan comes first: Pro for somebody already on Free. Side by side they keep their order. */
  lead?: OfferedPlanId
  /**
   * A section heading. Given one, the cards sit in a section of a page (the
   * Billing tab): the heading on its own row, then the pill centred above
   * two cards in a 720px row, as on the plans page. Without one they are the
   * page's subject, and the same pill and row with no heading.
   */
  heading?: React.ReactNode
  className?: string
}) {
  const [own, setOwn] = React.useState<BillingInterval>("monthly")
  const interval = hideInterval ? "monthly" : controlled ?? own
  const pick = (next: BillingInterval) => {
    setOwn(next)
    onInterval?.(next)
  }
  const inSection = heading != null
  return (
    <>
      {hideInterval ? null : inSection ? (
        /*
          IN A SECTION THE HEADING HAS ITS OWN ROW, AND THE PILL IS CENTRED
          OVER THE CARDS. It used to sit small at the heading's right and wrap
          under it flush left on a phone, which read as a stray control; and
          the two cards stretched to the section's full width, so the plan's
          words sat small in a wide card. Now the section reads like the
          plans page: the pill centred, the pair in the same 720px row.
        */
        <>
          <div data-plan-heading-row="" className="mb-4">{heading}</div>
          <div data-plan-interval-row="" className="flex justify-center mb-5 sm:mb-6">
            <IntervalSwitch value={interval} onChange={pick} />
          </div>
        </>
      ) : (
        /*
          IN THE ONBOARDING (compact) THE PILL HAS ROOM UNDER IT and the cards
          are a hair narrower: 12px under the pill read as the pill sitting on
          the cards, and two 354px cards filled the step from edge to edge. Now
          20px (24 on a computer) and 668px for the pair, with 6px more air
          each side on a phone. Billing and the pricing page keep theirs.
        */
        <div data-plan-interval-row="" className="flex justify-center mb-5 sm:mb-6">
          <IntervalSwitch value={interval} onChange={pick} />
        </div>
      )}
      <div
        data-plan-cards
        className={`${compact ? "mx-auto max-w-[920px] max-md:px-1.5" : "mx-auto max-w-[1180px]"} grid w-full grid-cols-1 md:grid-cols-3 items-stretch ${compact ? "gap-3" : "gap-4 lg:gap-6"} ${className}`}
      >
        {OFFERED_PLANS.map((plan) => (
          <div key={plan.id} data-plan-slot={plan.id} className={`flex ${lead === plan.id ? "order-first md:order-none" : ""}`}>
            <PlanCard
              plan={plan}
              action={actions[plan.id]}
              label={labels?.[plan.id]}
              compact={compact}
              interval={interval}
              sizes={PLAN_PICTURE_SIZES}
              nameLevel={nameLevel}
              pictureLoading={pictureLoading}
              lines={lines?.[plan.id]}
              tick={tick}
            />
          </div>
        ))}
      </div>
    </>
  )
}

/**
 * MONTHLY OR YEARLY, as one pill with a white thumb that slides between the
 * two, the way Shopify's plans page asks. Yearly carries what it saves.
 *
 * The two options share one grid of two equal columns, so the thumb is
 * exactly one column wide by construction and moving it is a shift by
 * its own width (100%): nothing to measure, nothing laid out again, and the
 * words never move. The thumb slides on the same time and curve the prices
 * use, and the words ease from grey to ink over that same time, so the
 * colour arrives with the thumb instead of before it.
 *
 * `small` is the pill for a section heading's row: 32px tall with 13px words,
 * each option still a 44px press (its ::after reaches past the pill above
 * and below).
 */
function IntervalSwitch({ value, onChange, size = "regular" }: { value: BillingInterval; onChange: (next: BillingInterval) => void; size?: "regular" | "small" }) {
  const yearly = value === "yearly"
  const small = size === "small"
  return (
    <div
      role="radiogroup"
      aria-label={tt("Billing")}
      data-billing-interval={value}
      className={`relative inline-grid shrink-0 grid-cols-2 rounded-full bg-[#eceef1] shadow-[inset_0_1px_2px_rgba(16,24,40,0.10),inset_0_0_0_1px_rgba(16,24,40,0.04)] ${small ? "p-[3px]" : "p-1"}`}
    >
      <span
        aria-hidden="true"
        data-interval-thumb=""
        className={`pointer-events-none absolute rounded-full bg-white shadow-[0_1px_2px_rgba(16,24,40,0.12),0_4px_10px_-4px_rgba(16,24,40,0.18),inset_0_-1px_0_rgba(16,24,40,0.04)] motion-reduce:!transition-none ${
          small ? "inset-y-[3px] left-[3px] w-[calc(50%-3px)]" : "inset-y-1 left-1 w-[calc(50%-4px)]"
        }`}
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
            className={`relative z-[1] inline-flex cursor-pointer motion-reduce:!transition-none select-none items-center justify-center whitespace-nowrap rounded-full text-[13px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-[#111113]/25 [-webkit-tap-highlight-color:transparent] ${
              small
                ? "h-[26px] gap-1.5 px-3 after:absolute after:inset-x-0 after:-inset-y-[9px] after:content-['']"
                : "h-9 gap-1.5 px-4 sm:px-5"
            } ${on ? "text-[#111113]" : "text-[#4b5260] hover:text-[#1a1a2e]"}`}
          >
            {option === "monthly" ? tt("Monthly") : tt("Yearly")}
            {option === "yearly" ? (
              <span className={`rounded-full bg-[#111113] font-semibold text-white ${small ? "px-1.5 text-[10.5px] leading-[16px]" : "px-1.5 py-px text-[10.5px] leading-4"}`}>
                {tt("Save")} {YEARLY_SAVING_PERCENT}%
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
