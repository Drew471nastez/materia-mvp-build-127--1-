"use client"

/**
 * ===========================================================================
 *  PICKING A PLAN AND PAYING FOR IT, ON THE COMMUNITY'S OWN PAGE
 * ===========================================================================
 * Round AF. A community with more than one plan someone could take opens
 * PLAN PICKER on Join: a page of its own over the community (its avatar and
 * name in a slim bar, a close, "Select your plan", up to three cards with
 * the price, what it is per, the trial and what members get). A free plan
 * joins on the press; a paid one opens the CHECKOUT.
 *
 * The checkout is the community's, not the store's product checkout: a
 * centred dialog over the dimmed page on a computer, a page of its own with
 * an X on a phone. It pays exactly as /checkout does, through the memberships
 * engine: /api/memberships/checkout makes the subscription in Stripe (a
 * trial's card saved, or the first invoice's payment), Stripe's own fields
 * take the card (and Apple Pay or Google Pay where this browser and the
 * account offer them), /api/memberships/confirm brings the membership up to
 * date, and the webhook is the record. Access comes from the payment's sync,
 * never from this page: it only says what happened and opens the community
 * once the server says the person is in.
 *
 * WHERE IT IS IS IN THE ADDRESS, so Back closes it and a refresh or a link
 * opens it again: ?join=plans, and ?join=pay&plan=<tierId>&interval=month.
 * A bank's 3-D Secure page comes back to that address with the subscription
 * beside it (?sub=), and the checkout finishes from there.
 *
 * In the app's shell, where Stripe.js cannot run, a paid plan goes to the
 * store checkout as before (it has the app's own card fields).
 */
import * as React from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import { Check, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { money as moneyOf, yearlySaving } from "@/lib/memberships/state"
import { formatMoney } from "@/lib/communities/membership-policy"
import { WAIT_MS, requestJson } from "@/lib/net/request"
import type { IntentResult } from "@/app/checkout/parts/stripe-pay"
import { CompactPay, type StartedPayment } from "./compact-pay"
import { CheckoutMark, CheckoutWindow, CloseButton, useBodyLock, useEscape, useExit } from "@/components/checkout/checkout-window"
import { CommunityRefundPolicy, waiverSentence, type CommunityCheckoutTerms } from "@/components/community/membership/checkout-policy"
import type { JoinOption, PublicCommunityView } from "./types"

import { cardPrice, nextCharge, planButton, planIntervals, trialEnds, type PlanInterval } from "./plan-words"

export { cardPrice, nextCharge, planButton, planIntervals, trialEnds, type PlanInterval }

/* ── The overlay frame ─────────────────────────────────────────────────── */
/* The checkout's window and its helpers are shared with the OnePage's instant checkout (components/checkout/checkout-window). */

function CommunityMark({ community, size }: { community: PublicCommunityView; size: number }) {
  return <CheckoutMark imageUrl={community.logoUrl} name={community.name} size={size} />
}

/* ── Select your plan ──────────────────────────────────────────────────── */

export function PlanPicker({
  community,
  plans,
  onClose,
  onPick,
  pending,
  error,
  preview = null,
}: {
  community: PublicCommunityView
  plans: JoinOption[]
  /** Round AG: the owner's preview, a line saying so (and what a pick would do). */
  preview?: string | null
  onClose: () => void
  onPick: (plan: JoinOption) => void
  /** The plan whose press is on its way (a free join). */
  pending: string | null
  error: string | null
}) {
  useBodyLock(true)
  const [leaving, close] = useExit(onClose)
  useEscape(close)
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])
  if (!mounted) return null
  const cols = plans.length >= 3 ? "lg:grid-cols-3" : plans.length === 2 ? "md:grid-cols-2" : ""
  return createPortal(
    <div role="dialog" aria-modal="true" aria-labelledby="plan-picker-title" className={cn("fixed inset-0 z-[120] flex flex-col bg-[#f8f9fa] animate-in fade-in duration-150 ease-out transition-opacity motion-reduce:animate-none", leaving && "pointer-events-none opacity-0 duration-[140ms] ease-in")} data-plan-picker="" data-leaving={leaving ? "" : undefined}>
      <header className="shrink-0 border-b border-[#e5e7eb] bg-white pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-16 max-w-[1080px] items-center gap-3 px-4 sm:px-6">
          <CommunityMark community={community} size={36} />
          <p className="min-w-0 flex-1 truncate text-[16px] font-semibold text-[#1a1a2e]">{community.name}</p>
          <CloseButton onClose={close} />
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className={cn("mx-auto w-full max-w-[1080px] animate-in slide-in-from-bottom-1.5 duration-200 ease-out transition-[translate] motion-reduce:animate-none", leaving && "translate-y-1.5 duration-[140ms]")} data-plan-picker-body="">
        <div className="mx-auto w-full max-w-[1080px] px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-8 sm:px-6 sm:pt-12">
          <h1 id="plan-picker-title" className="text-center text-[26px] font-semibold tracking-[-0.01em] text-[#1a1a2e] sm:text-[30px]">
            Select your plan
          </h1>
          {preview ? (
            <p role="status" aria-live="polite" className="mx-auto mt-4 w-fit max-w-[560px] rounded-full border border-[#e5e7eb] bg-white px-4 py-2 text-center text-[13px] text-[#4b5563] shadow-[0_1px_2px_rgba(16,24,40,0.05)]" data-plans-preview-note="">
              {preview}
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="mx-auto mt-4 max-w-[520px] rounded-xl bg-[#fef2f2] px-4 py-3 text-center text-[14px] text-[#991b1b]">
              {error}
            </p>
          ) : null}
          <div className={cn("mx-auto mt-8 grid max-w-[1000px] grid-cols-1 gap-4 sm:mt-10 sm:gap-5", cols, plans.length < 3 && "max-w-[760px]")}>
            {plans.map((p) => (
              <PlanCard key={p.tierId ?? p.name} plan={p} onPick={() => onPick(p)} busy={pending === p.tierId} disabled={!!pending} />
            ))}
          </div>
        </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function PlanCard({ plan, onPick, busy, disabled }: { plan: JoinOption; onPick: () => void; busy: boolean; disabled: boolean }) {
  const price = cardPrice(plan)
  const yearly = plan.billing === "recurring" && plan.monthlyCents && plan.yearlyCents ? plan.yearlyCents : null
  const saving = yearlySaving(plan.monthlyCents, plan.yearlyCents)
  const trial = plan.trialDays ?? 0
  return (
    /*
      ROUND AH: FEWER ROWS. The name and the trial share the first line, the
      price and the yearly choice the second, the description is two lines at
      most, and the benefits sit under a hairline, tighter. Same facts, half
      the stack, and it reads the same at every width.
    */
    <section className="flex flex-col rounded-2xl border border-[#e5e7eb] bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.05),0_8px_24px_-16px_rgba(16,24,40,0.18)] sm:p-6" data-plan-card={plan.kind} data-plan-id={plan.tierId ?? ""}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="min-w-0 truncate text-[16px] font-semibold text-[#1a1a2e]">{plan.name}</h2>
        {trial > 0 ? (
          <span className="shrink-0 rounded-full bg-[#f1f2f4] px-2.5 py-1 text-[12px] font-medium text-[#1a1a2e]" data-plan-trial="">
            {trial}-day free trial
          </span>
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <p className="text-[30px] font-semibold leading-none tracking-[-0.02em] tabular-nums text-[#1a1a2e]" data-plan-price="">
          {price.amount}
          {price.per ? <span className="ml-0.5 text-[15px] font-medium tracking-normal text-[#6b7280]">{price.per}</span> : null}
        </p>
        {yearly ? (
          <p className="text-[12.5px] text-[#6b7280]">
            or {moneyOf(yearly, plan.currency)}/year{saving > 0 ? <span className="ml-1 font-medium text-[#15803d]">save {saving}%</span> : null}
          </p>
        ) : null}
      </div>
      {plan.description ? <p className="mt-2.5 line-clamp-2 text-[13.5px] leading-relaxed text-[#6b7280]">{plan.description}</p> : null}
      {plan.benefits.length ? (
        <ul className="mt-4 space-y-2 border-t border-[#f1f2f4] pt-4">
          {plan.benefits.map((b, i) => (
            <li key={i} className="flex gap-2.5 text-[14px] leading-snug text-[#374151]">
              <span aria-hidden className="mt-px grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full bg-[#1a1a2e] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22),inset_0_-1px_0_rgba(0,0,0,0.25),0_1px_2px_rgba(16,24,40,0.22)]" data-plan-check="">
                <Check className="h-2.5 w-2.5" strokeWidth={3.5} />
              </span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-auto pt-5">
        <button
          type="button"
          onClick={onPick}
          disabled={disabled}
          aria-busy={busy || undefined}
          className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#1a1a2e] px-5 text-[15px] font-semibold text-white shadow-[0_1px_1.5px_rgba(16,24,40,0.18)] outline-none transition-colors hover:bg-[#2a2a40] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/30 focus-visible:ring-offset-2 disabled:cursor-default disabled:opacity-70"
          data-plan-pick=""
        >
          {busy ? <span aria-hidden className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : null}
          {busy ? "Joining" : planButton(plan)}
        </button>
      </div>
    </section>
  )
}

/* ── The community's checkout ──────────────────────────────────────────── */

interface Facts {
  plan: JoinOption
  buyer: { email: string; name: string }
  trialDays: number
  trialUsed: boolean
  terms: CommunityCheckoutTerms
  /** Round AG: the tax each interval's price carries for this buyer, as the server will charge it; null where there is none. */
  tax?: { month?: TaxQuote | null; year?: TaxQuote | null } | null
}

export interface TaxQuote {
  taxCents: number
  included: boolean
  /** "VAT", "VAT 19%", "Sales tax". */
  label: string
}

async function postJson<T>(url: string, body: unknown): Promise<{ ok: boolean; status: number; data: T & { error?: string; code?: string } }> {
  const r = await requestJson<T & { error?: string; code?: string }>(url, { method: "POST", json: body, timeoutMs: WAIT_MS.pay })
  if (r.status !== 0) return { ok: r.ok, status: r.status, data: r.data }
  return { ok: false, status: 0, data: { error: "The connection dropped before the payment started. Nothing was charged. Try again." } as T & { error?: string } }
}

export function CommunityCheckout({
  community,
  planId,
  interval,
  onInterval,
  onClose,
  onJoined,
  onBack,
}: {
  community: PublicCommunityView
  planId: string
  interval: PlanInterval
  onInterval: (i: PlanInterval) => void
  onClose: () => void
  /** The server says they are in: open the community. */
  onJoined: (trial: boolean) => void
  /** Back to the plans, when there were plans to choose from. */
  onBack?: (() => void) | null
}) {
  const [facts, setFacts] = React.useState<Facts | null>(null)
  const [loadError, setLoadError] = React.useState<{ message: string; url?: string } | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [done, setDone] = React.useState<{ trial: boolean } | null>(null)
  const [open, setOpen] = React.useState(false)
  const started = React.useRef<{ subscriptionId: string; clientSecret: string; membershipId: string } | null>(null)

  React.useEffect(() => {
    let live = true
    setFacts(null)
    setLoadError(null)
    fetch(`/api/community/${community.id}/checkout?plan=${encodeURIComponent(planId)}`, { cache: "no-store" })
      .then(async (r) => ({ ok: r.ok, data: (await r.json().catch(() => ({}))) as Facts & { message?: string; url?: string } }))
      .then(({ ok, data }) => {
        if (!live) return
        if (ok && data.plan) setFacts(data)
        else setLoadError({ message: data.message || "This plan can't be joined right now. Try again in a moment.", url: data.url })
      })
      .catch(() => live && setLoadError({ message: "Check your connection and try again." }))
    return () => {
      live = false
    }
  }, [community.id, planId])

  const plan = facts?.plan ?? null
  const offers = plan ? planIntervals(plan) : []
  const chosen: PlanInterval = offers.includes(interval) ? interval : offers[0] ?? "month"
  const priceCents = plan ? ((chosen === "year" ? plan.yearlyCents : plan.monthlyCents) ?? 0) : 0
  const trialDays = facts?.trialDays ?? 0
  const trial = trialDays > 0
  const currency = plan?.currency || "usd"
  const locale = facts?.terms.locale
  const fmt = (cents: number) => (locale ? formatMoney(cents, currency, locale) : moneyOf(cents, currency))
  const per = chosen === "year" ? "year" : "month"
  const waiver = waiverSentence(facts?.terms)
  const saving = plan ? yearlySaving(plan.monthlyCents, plan.yearlyCents) : 0

  const finish = React.useCallback(
    (wasTrial: boolean) => {
      setDone({ trial: wasTrial })
      window.setTimeout(() => onJoined(wasTrial), 700)
    },
    [onJoined],
  )

  /** After Stripe confirmed: the membership brought up to date by the server, which is what lets them in. */
  const confirm = React.useCallback(
    async (subscriptionId: string, clientSecret: string) => {
      let last = "Your payment went through. Your membership is still being set up and opens in a moment. You will not be charged again."
      for (const wait of [0, 1500, 4000]) {
        if (wait) await new Promise((r) => setTimeout(r, wait))
        const res = await postJson<{ membershipId?: string; status?: string; access?: boolean; actionUrl?: string | null }>("/api/memberships/confirm", { subscriptionId, clientSecret, returnUrl: window.location.href })
        if (res.ok && res.data.status === "requires_action" && res.data.actionUrl) {
          window.location.href = res.data.actionUrl
          return
        }
        if (res.ok && res.data.access && res.data.membershipId) {
          finish(res.data.status === "trialing")
          return
        }
        if (res.status >= 400 && res.status < 500) {
          last = res.data.error || last
          break
        }
      }
      throw new Error(last)
    },
    [finish],
  )

  /* Back from a bank's page (3-D Secure) with the subscription in the address. */
  React.useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    const sub = q.get("sub")
    const secret = q.get("payment_intent_client_secret") || q.get("setup_intent_client_secret")
    const status = q.get("redirect_status")
    if (!sub || !secret) return
    const url = new URL(window.location.href)
    for (const k of ["sub", "payment_intent", "payment_intent_client_secret", "setup_intent", "setup_intent_client_secret", "redirect_status"]) url.searchParams.delete(k)
    window.history.replaceState(window.history.state, "", url.pathname + url.search)
    if (status === "failed") {
      setError("The bank did not approve the payment. Nothing was charged. Try again or use another card.")
      return
    }
    setBusy(true)
    confirm(sub, secret)
      .catch((e: Error) => setError(e.message))
      .finally(() => setBusy(false))
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const createIntent = async (contact?: { email?: string; name?: string; paymentMethodId?: string }, methods?: string[]): Promise<IntentResult> => {
    if (!facts || !plan?.productId) throw new Error("This plan can't be joined right now.")
    const name = (contact?.name || facts.buyer.name || "").trim().split(/\s+/).filter(Boolean)
    const res = await postJson<{ membershipId?: string; subscriptionId?: string; clientSecret?: string; type?: "payment" | "setup" }>("/api/memberships/checkout", {
      productId: plan.productId,
      interval: chosen,
      firstName: name[0] || facts.buyer.email.split("@")[0],
      lastName: name.slice(1).join(" "),
      email: facts.buyer.email,
      /* The terms are on screen under the button and pressing it is the agreement (round AG: no checkbox). */
      agreedToTerms: true,
      paymentMethodId: contact?.paymentMethodId,
      paymentMethods: methods,
      withdrawalWaiver: !!waiver,
      previousMembershipId: started.current?.membershipId || undefined,
    })
    if (!res.ok || !res.data.clientSecret || !res.data.subscriptionId) throw new Error(res.data.error || "The payment could not be started. Nothing was charged.")
    started.current = { subscriptionId: res.data.subscriptionId, clientSecret: res.data.clientSecret, membershipId: res.data.membershipId || "" }
    /* The subscription in the address, so a bank's page that sends the buyer back lands where the payment can finish. */
    const url = new URL(window.location.href)
    url.searchParams.set("sub", res.data.subscriptionId)
    window.history.replaceState(window.history.state, "", url.pathname + url.search)
    return { clientSecret: res.data.clientSecret, paymentIntentId: res.data.subscriptionId, type: res.data.type ?? "payment" }
  }

  /** The subscription made with the payment method the card field or the wallet gave (./compact-pay.tsx). */
  const startWith = async (paymentMethodId: string): Promise<StartedPayment> => {
    const made = await createIntent({ paymentMethodId })
    return { clientSecret: made.clientSecret, type: made.type === "setup" ? "setup" : "payment" }
  }

  /** Stripe has it: the server brings the membership up to date, which is what lets them in. */
  const afterStripe = async () => {
    const st = started.current
    if (!st) return
    await confirm(st.subscriptionId, st.clientSecret)
  }

  const payLabel = trial ? "Start free trial" : `Join ${fmt(priceCents)}/${per}`
  /* Tax, as the server will charge it (lib/tax/membership.ts): none, added on top, or already in the price. */
  const tax = (chosen === "year" ? facts?.tax?.year : facts?.tax?.month) ?? null
  const taxOnTop = !!tax && tax.taxCents > 0 && !tax.included
  const recurringCents = taxOnTop ? priceCents + tax!.taxCents : priceCents
  const dueToday = trial ? 0 : recurringCents
  const renewal = trial
    ? `Nothing today. From ${trialEnds(trialDays)} you pay ${fmt(recurringCents)} a ${per} until you cancel; cancel before then and you pay nothing.`
    : `${fmt(recurringCents)} today, then every ${per} until you cancel. Cancel any time.`

  const summary = plan ? (
    <div className="rounded-xl border border-[#e5e7eb]" data-checkout-summary="">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex min-h-12 w-full items-center gap-2 px-4 text-left text-[14px] text-[#6b7280] outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20" data-summary-toggle="">
        <span className="min-w-0 flex-1 truncate">
          {fmt(priceCents)}/{per} {plan.name}
          {tax && tax.taxCents > 0 ? (tax.included ? ` · ${tax.label} included` : ` + ${tax.label}`) : ""}
        </span>
        <ChevronDown aria-hidden className={cn("h-4 w-4 shrink-0 transition-[rotate] duration-200", open && "rotate-180")} />
        <span className="font-semibold tabular-nums text-[#1a1a2e]" data-due-today="">
          {fmt(dueToday)}
        </span>
      </button>
      <div className={cn("grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
        <dl className="space-y-2 overflow-hidden px-4 text-[13.5px]" aria-hidden={!open}>
          <div className="flex justify-between gap-3 border-t border-[#f1f2f4] pt-3">
            <dt className="text-[#6b7280]">{plan.name}, billed {chosen === "year" ? "yearly" : "monthly"}</dt>
            <dd className="tabular-nums text-[#1a1a2e]">{fmt(priceCents)}</dd>
          </div>
          {tax && tax.taxCents > 0 ? (
            <div className="flex justify-between gap-3" data-summary-tax="">
              <dt className="text-[#6b7280]">{tax.included ? `${tax.label} (included)` : tax.label}</dt>
              <dd className="tabular-nums text-[#1a1a2e]">{fmt(tax.taxCents)}</dd>
            </div>
          ) : null}
          {trial ? (
            <div className="flex justify-between gap-3">
              <dt className="text-[#6b7280]">{trialDays}-day free trial</dt>
              <dd className="tabular-nums text-[#1a1a2e]">{fmt(0)} today</dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-3 pb-3 font-medium">
            <dt className="text-[#1a1a2e]">{trial ? `From ${trialEnds(trialDays)}` : `Then from ${nextCharge(chosen)}`}</dt>
            <dd className="tabular-nums text-[#1a1a2e]">
              {fmt(recurringCents)}/{per}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  ) : null

  const dark = typeof document !== "undefined" && (document.documentElement.getAttribute("data-community-theme") === "dark" || document.documentElement.hasAttribute("data-sl-dark"))

  return (
    <CheckoutWindow
      mark={<CommunityMark community={community} size={60} />}
      title={community.name}
      subtitle={plan ? plan.name : null}
      onBack={onBack}
      onClose={onClose}
      busy={busy}
      labelId="community-checkout-title"
    >
          {loadError ? (
            <div className="space-y-3 py-4 text-center" data-checkout-unavailable="">
              <p className="text-[14.5px] text-[#4b5563]">{loadError.message}</p>
              {loadError.url ? (
                <a href={loadError.url} className="inline-flex h-11 items-center rounded-xl border border-[#e5e7eb] px-4 text-[14px] font-medium text-[#1a1a2e] hover:bg-[#f7f7f8]">
                  Continue
                </a>
              ) : null}
            </div>
          ) : !facts || !plan ? (
            <div aria-hidden className="space-y-3">
              <div className="h-[92px] rounded-xl bg-[#f3f4f6]" />
              <div className="h-12 rounded-xl bg-[#f3f4f6]" />
              <div className="h-12 rounded-xl bg-[#f7f7f8]" />
              <div className="h-[52px] rounded-xl bg-[#eceef1]" />
            </div>
          ) : done ? (
            <div role="status" className="rounded-2xl border border-[#e5e7eb] px-5 py-6 text-center" data-checkout-done="">
              <span className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-[#ecfdf3] text-[#15803d]">
                <Check aria-hidden className="h-5 w-5" />
              </span>
              <p className="mt-3 text-[18px] font-semibold text-[#1a1a2e]">{done.trial ? "Your free trial has started" : "You're in"}</p>
              <p className="mt-1 text-[14px] text-[#6b7280]">Opening {community.name}.</p>
            </div>
          ) : (
            <div className="space-y-5">
              {offers.length > 1 ? (
                <section aria-labelledby="checkout-membership">
                  <h3 id="checkout-membership" className="mb-2 text-[14.5px] font-semibold text-[#1a1a2e]">
                    Membership
                  </h3>
                  <div role="radiogroup" aria-labelledby="checkout-membership" className="grid grid-cols-2 gap-2.5">
                    {offers.map((o) => {
                      const cents = (o === "year" ? plan.yearlyCents : plan.monthlyCents) ?? 0
                      const on = chosen === o
                      return (
                        <button
                          key={o}
                          type="button"
                          role="radio"
                          aria-checked={on}
                          disabled={busy}
                          onClick={() => {
                            onInterval(o)
                            setError(null)
                          }}
                          className={cn("relative rounded-xl border bg-white px-3.5 py-3 text-left outline-none transition-[border-color,box-shadow,background-color] duration-150 focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/30", on ? "border-[#1a1a2e] shadow-[0_0_0_1px_#1a1a2e] [[data-community-theme=dark]_&]:border-[#e4e4e7]! [html[data-sl-dark]_&]:border-[#e4e4e7]! [[data-community-theme=dark]_&]:shadow-[0_0_0_1px_#e4e4e7]! [html[data-sl-dark]_&]:shadow-[0_0_0_1px_#e4e4e7]!" : "border-[#e1e3e7] bg-[#fbfbfc] hover:border-[#c9ccd2]")}
                          data-interval={o}
                        >
                          {o === "year" && saving > 0 ? <span className="absolute -top-2.5 right-2.5 rounded-full bg-[#15803d] px-2 py-0.5 text-[11.5px] font-semibold text-white shadow-[0_1px_2px_rgba(21,128,61,0.35)]">save {saving}%</span> : null}
                          <span className="flex items-center gap-2 text-[14px] font-semibold text-[#1a1a2e]">
                            <span aria-hidden className={cn("grid h-[18px] w-[18px] place-items-center rounded-full border transition-colors duration-150", on ? "border-[#1a1a2e] bg-[#1a1a2e] [[data-community-theme=dark]_&]:border-[#e4e4e7]! [html[data-sl-dark]_&]:border-[#e4e4e7]! [[data-community-theme=dark]_&]:bg-[#e4e4e7]! [html[data-sl-dark]_&]:bg-[#e4e4e7]!" : "border-[#c9ccd2] bg-white")}>
                              {on ? <span className="h-1.5 w-1.5 rounded-full bg-white [[data-community-theme=dark]_&]:bg-[#18181b]! [html[data-sl-dark]_&]:bg-[#18181b]!" /> : null}
                            </span>
                            {o === "year" ? "Annual" : "Monthly"}
                          </span>
                          <span className="mt-1.5 block text-[15.5px] font-semibold tabular-nums text-[#1a1a2e]">{o === "year" ? `${fmt(Math.round(cents / 12))}/month` : `${fmt(cents)}/month`}</span>
                          <span className="block text-[12.5px] text-[#6b7280]">{o === "year" ? `${fmt(cents)} billed yearly` : `${fmt(cents)} billed monthly`}</span>
                        </button>
                      )
                    })}
                  </div>
                </section>
              ) : null}
              {trial ? (
                <p className="text-[13.5px] text-[#4b5563]" data-trial-note="">
                  <span className="font-semibold text-[#1a1a2e]">{trialDays}-day free trial.</span> Nothing today, then {fmt(recurringCents)}/{per} from {trialEnds(trialDays)}.
                </p>
              ) : facts.trialUsed ? (
                <p className="text-[13px] text-[#6b7280]" data-trial-used="">
                  You've had a free trial here before, so this plan starts today.
                </p>
              ) : null}
              <section aria-labelledby="checkout-pay">
                <h3 id="checkout-pay" className="mb-2 text-[14.5px] font-semibold text-[#1a1a2e]">
                  Payment method
                </h3>
                <CompactPay
                  key={`${chosen}:${trial}`}
                  dueTodayCents={dueToday}
                  currency={currency}
                  label={`${community.name}, ${plan.name}`}
                  payLabel={payLabel}
                  dark={dark}
                  email={facts.buyer.email}
                  name={facts.buyer.name}
                  start={startWith}
                  onConfirmed={afterStripe}
                  onError={setError}
                  busy={busy || !!done}
                  setBusy={setBusy}
                >
                  {summary}
                </CompactPay>
              </section>
              {error ? (
                <p role="alert" className="-mt-2 text-[13.5px] leading-snug text-[#b42318]" data-checkout-error="">
                  {error}
                </p>
              ) : null}
              {/*
                ROUND AH: SMALL, AND THE LONG PART FOLDED. One short line is always
                in view (what is paid and when, the Terms, and the withdrawal
                waiver in a few words where it applies, since pressing the button
                is the agreement); the full wording opens under Details.
              */}
              <details className="group/terms text-center text-[11.5px] leading-relaxed text-[#8b919a] [&_summary::-webkit-details-marker]:hidden" data-renewal-terms="">
                <summary className="mx-auto inline cursor-pointer list-none outline-none focus-visible:underline">
                  {trial ? `Nothing today, then ${fmt(recurringCents)}/${per} from ${trialEnds(trialDays)}. ` : `${fmt(recurringCents)} today, then every ${per}. `}
                  By joining you agree to the{" "}
                  <Link href="/terms" target="_blank" className="underline decoration-[#d1d5db] underline-offset-2 hover:text-[#1a1a2e]">
                    Terms
                  </Link>
                  {waiver ? " and waive the 14 day withdrawal right once access starts." : "."}{" "}
                  <span className="whitespace-nowrap font-medium text-[#6b7280] underline decoration-[#d1d5db] underline-offset-2 group-open/terms:hidden" data-terms-more="">Details</span>
                </summary>
                <p className="mt-1.5 text-[11.5px] leading-relaxed text-[#8b919a]" data-terms-full="">
                  {renewal}
                  {waiver ? ` ${waiver}` : ""}
                </p>
              </details>
              <CommunityRefundPolicy terms={facts.terms} />
            </div>
          )}
    </CheckoutWindow>
  )
}
