"use client"

/**
 * ===========================================================================
 *  HOME'S THREE CARDS: GETTING STARTED, THE GUIDE, AND YOUR PLAN
 * ===========================================================================
 * Under the Pro plan banner, in place of the Store setup list.
 *
 * GETTING STARTED is six steps and nothing under them: what a new store
 * actually has to do before it sells, each one worked out from the account
 * (app/app/page.tsx and dashboard-client), never ticked by hand. What is
 * left comes first and what is done drops to the bottom, crossed out, so the
 * step at the top is always the next one, and it alone carries the arrow.
 * At its foot, the three ways a buyer pays, on tiles that lift when the
 * card is hovered.
 *
 * THE GUIDE is the way in for somebody who does not know where to start, so
 * pressing it points at Getting started: the card gives a small press, and
 * Getting started bumps (scrolled into view first when it is off screen) with
 * its next step lit for a moment.
 *
 * YOUR PLAN is the plan the account is on, by the name Billing uses, and the
 * lines are that plan's own, from lib/billing/plans.ts, the same table the
 * pricing cards read. On Free the button is Upgrade to Pro.
 *
 * The hover depth, the tiles and the bump are CSS in app/globals.css (HOME
 * CARDS), and they are CSS rather than hover: classes on purpose: on a touch
 * screen globals.css removes the shadow of anything with a hover:shadow
 * class once it is tapped, and every transform inside a .group. These cards
 * keep their shadow on a phone and move only under a real mouse.
 */
import Link from "next/link"
import { ArrowRight, Check, Play } from "lucide-react"
import type { ReactNode } from "react"
import { StorelibMark } from "@/components/storelib-mark"
import { OFFERED_PLANS, planDisplayName, planHighlights } from "@/lib/billing/plans"
import { PayPalMark, StripeMark, VisaMark } from "./payment-marks"

export const GETTING_STARTED_ID = "getting-started"

export type StartStep = {
  id: string
  label: string
  done: boolean
  /** Where the step is done. */
  href?: string
  /** Leaves the /app router tree (the website builder), so it is a full page load. */
  hardNavigation?: boolean
  /** Instead of a link: the first sale step opens the share sheet. */
  onSelect?: () => void
}

let bumpTimer = 0

/**
 * Points at Getting started: scrolled into view when it is not on screen,
 * then a bump. The attribute is taken off and put back so a second press
 * plays it again.
 */
export function bumpGettingStarted() {
  const card = document.getElementById(GETTING_STARTED_ID)
  if (!card) return
  const box = card.getBoundingClientRect()
  const offScreen = box.top < 56 || box.bottom > window.innerHeight
  const play = () => {
    card.removeAttribute("data-bump")
    void card.offsetWidth
    card.setAttribute("data-bump", "")
  }
  window.clearTimeout(bumpTimer)
  if (offScreen) {
    card.scrollIntoView({ behavior: "smooth", block: "center" })
    bumpTimer = window.setTimeout(play, 420)
  } else play()
}

const CARD = "home-card relative flex flex-col overflow-hidden rounded-[20px] border border-[#e6e7eb] bg-white"

/* ─── Getting started ──────────────────────────────────────────────────── */

export function GettingStartedCard({ steps }: { steps: StartStep[] }) {
  const done = steps.filter((s) => s.done).length
  const ordered = [...steps.filter((s) => !s.done), ...steps.filter((s) => s.done)]
  const next = ordered.find((s) => !s.done)

  return (
    <section id={GETTING_STARTED_ID} aria-labelledby="getting-started-title" className={`${CARD} min-h-[392px]`}>
      <div className="px-5 pt-5">
        <div className="flex items-center justify-between">
          <h2 id="getting-started-title" className="text-[14px] font-semibold text-[#1a1a2e]">
            Getting started
          </h2>
          <span className="text-[12px] font-medium tabular-nums text-[#9ca3af]">
            {done} of {steps.length}
          </span>
        </div>
        <div
          className="mt-3 h-[5px] overflow-hidden rounded-full bg-[#eef0f3]"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={steps.length}
          aria-valuenow={done}
          aria-label="Setup progress"
        >
          <div
            className="h-full rounded-full bg-[#1a1a2e] transition-[width] duration-700 ease-out"
            style={{ width: `${(done / steps.length) * 100}%` }}
          />
        </div>
      </div>

      <ul className="relative z-10 mt-2.5 px-2.5">
        {ordered.map((step) => (
          <li key={step.id}>
            <StepRow step={step} isNext={step === next} />
          </li>
        ))}
      </ul>

      <PaymentTiles />
    </section>
  )
}

function StepRow({ step, isNext }: { step: StartStep; isNext: boolean }) {
  const row = `flex h-9 w-full items-center gap-2.5 rounded-[10px] px-2.5 text-left outline-none transition-colors duration-150 hover:bg-[#f5f6f7] focus-visible:bg-[#f5f6f7] [-webkit-tap-highlight-color:transparent]`
  const body: ReactNode = (
    <>
      {step.done ? (
        <span className="flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-full bg-[#b9bec7]">
          <Check className="h-[11px] w-[11px] text-white" strokeWidth={3} aria-hidden="true" />
        </span>
      ) : (
        <span className="h-[17px] w-[17px] shrink-0 rounded-full border-[1.5px] border-[#c9cdd4] bg-white" />
      )}
      <span
        className={
          step.done
            ? "min-w-0 flex-1 truncate text-[13px] text-[#9ca3af] line-through decoration-[#b9bec7]"
            : `min-w-0 flex-1 truncate text-[13px] ${isNext ? "font-medium text-[#1a1a2e]" : "text-[#4b5563]"}`
        }
      >
        {step.label}
        {step.done && <span className="sr-only"> (done)</span>}
      </span>
      {isNext && (
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] border border-[#e3e5e9] bg-white text-[#6b7280] shadow-[0_1px_1px_rgba(16,24,40,0.05)]">
          <ArrowRight className="h-3 w-3" strokeWidth={2.25} aria-hidden="true" />
        </span>
      )}
    </>
  )
  const nextProps = isNext ? { "data-next-step": "" } : {}

  if (step.onSelect) {
    return (
      <button type="button" onClick={step.onSelect} className={row} {...nextProps}>
        {body}
      </button>
    )
  }
  if (step.hardNavigation) {
    return (
      <a href={step.href} className={row} {...nextProps}>
        {body}
      </a>
    )
  }
  return (
    <Link href={step.href ?? "/app"} className={row} {...nextProps}>
      {body}
    </Link>
  )
}

/** PayPal, Visa and Stripe on their tiles, tipped, part of the Stripe tile past the card's edge. */
function PaymentTiles() {
  return (
    <div aria-hidden="true" className="pointer-events-none relative mt-auto h-[118px] shrink-0">
      <div
        data-pay-tile="visa"
        className="absolute bottom-[-26px] left-[40%] flex h-[74px] w-[112px] items-center justify-center rounded-[16px] bg-[#0f0f12] text-white"
      >
        <VisaMark className="w-[58px]" />
      </div>
      <div
        data-pay-tile="paypal"
        className="absolute bottom-[20px] left-[9%] flex h-[78px] w-[78px] items-center justify-center rounded-[20px] bg-white"
      >
        <PayPalMark className="h-[40px] w-auto" />
      </div>
      <div
        data-pay-tile="stripe"
        className="absolute bottom-[4px] right-[-18px] flex h-[72px] w-[104px] items-center justify-center rounded-[16px] bg-[#635bff] text-white"
      >
        <StripeMark className="w-[58px]" />
      </div>
    </div>
  )
}

/* ─── The guide ────────────────────────────────────────────────────────── */

export function SetupGuideCard() {
  return (
    <button
      type="button"
      onClick={bumpGettingStarted}
      className={`${CARD} home-guide min-h-[300px] cursor-pointer text-left outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6] focus-visible:ring-offset-2 [-webkit-tap-highlight-color:transparent]`}
    >
      <span className="px-6 pt-6 text-[13px] font-medium text-[#6b7280]">Store setup guide</span>
      <span className="mt-1.5 max-w-[15ch] px-6 text-[26px] font-semibold leading-[1.12] tracking-[-0.02em] text-[#111114] sm:text-[28px]">
        How to get started with your store
      </span>

      <span
        aria-hidden="true"
        className="home-guide-thumb absolute bottom-[-18px] right-[-18px] flex aspect-[16/10.5] w-[78%] max-w-[320px] flex-col justify-between overflow-hidden rounded-[18px] p-4"
      >
        <span className="relative flex items-center gap-1.5">
          <StorelibMark className="h-[18px] w-[18px] shrink-0" />
          <span className="text-[12px] font-medium text-white/80">Storelib</span>
        </span>
        <span className="relative flex items-end justify-between gap-3 pb-3 pr-3">
          <span className="text-[22px] font-semibold leading-[1.08] tracking-[-0.015em] text-white">
            Welcome to
            <br />
            Storelib
          </span>
          <span className="home-guide-play flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/25 bg-white/15">
            <Play className="ml-0.5 h-4 w-4 fill-white text-white" aria-hidden="true" />
          </span>
        </span>
      </span>
    </button>
  )
}

/* ─── Your plan ────────────────────────────────────────────────────────── */

/** What the plan includes, from the same table the pricing cards read. */
function linesFor(planId: string): string[] {
  const offered = OFFERED_PLANS.find((p) => p.id === planId)
  if (offered) return offered.features
  if (planId === "pro") return planHighlights("pro")
  return OFFERED_PLANS[0].features
}

export function PlanCard({ planId }: { planId: string }) {
  const free = !planId || planId === "free"
  const id = free ? "free" : planId
  const lines = linesFor(id)

  return (
    <section aria-labelledby="your-plan-title" className={`${CARD} min-h-[392px]`}>
      <div className="home-plan-sky flex h-[46px] shrink-0 items-center px-5">
        <h2 id="your-plan-title" className="relative text-[13.5px] font-semibold text-white">
          Your Plan
        </h2>
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-5 pb-5 pt-4">
        <p className="text-[30px] font-semibold leading-none tracking-[-0.02em] text-[#111114]">{planDisplayName(id)}</p>
        <p className="mt-2 text-[12.5px] text-[#9ca3af]">Included in your plan</p>

        <div className="relative mt-3.5 min-h-[96px] flex-1 overflow-hidden">
          <ul className="space-y-[9px]">
            {lines.map((line) => (
              <li key={line} className="flex items-start gap-2.5 text-[13.5px] leading-[20px] text-[#1f2230]">
                <Check className="mt-[3px] h-[14px] w-[14px] shrink-0 text-[#22a06b]" strokeWidth={2.5} aria-hidden="true" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
          {/* The last lines go soft, as if the list ran on past the card. */}
          <div aria-hidden="true" className="home-plan-fade pointer-events-none absolute inset-x-0 bottom-0 h-[64px]" />
        </div>

        <Link
          href={free ? "/app/settings/billing/upgrade" : "/app/settings/billing"}
          className="mt-4 inline-flex h-11 w-full shrink-0 items-center justify-center rounded-[12px] bg-[#16161a] text-[14px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_1px_2px_rgba(0,0,0,0.18)] outline-none transition-colors duration-150 hover:bg-[#2a2a31] active:bg-[#0b0b0d] focus-visible:ring-2 focus-visible:ring-[#8b5cf6] focus-visible:ring-offset-2 [-webkit-tap-highlight-color:transparent]"
        >
          {free ? "Upgrade to Pro" : "Manage plan"}
        </Link>
      </div>
    </section>
  )
}

/* ─── The row ──────────────────────────────────────────────────────────── */

/**
 * Three across from 1280 up, where the column beside the 240px sidebar is
 * wide enough for three. Below that, Getting started and Your Plan side by
 * side with the guide across the width under them; on a phone, one under
 * another in the order they read.
 */
export function HomeCards({ steps, planId }: { steps: StartStep[]; planId: string }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 xl:gap-5">
      <GettingStartedCard steps={steps} />
      <div className="grid sm:order-last sm:col-span-2 xl:order-none xl:col-span-1">
        <SetupGuideCard />
      </div>
      <PlanCard planId={planId} />
    </div>
  )
}
