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
import { Check, ChevronDown, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { optimizedImageUrl } from "@/lib/images/optimized-url"
import { money as moneyOf, yearlySaving } from "@/lib/memberships/state"
import { formatMoney } from "@/lib/communities/membership-policy"
import { WAIT_MS, requestJson } from "@/lib/net/request"
import { StripePay, type IntentResult } from "@/app/checkout/parts/stripe-pay"
import { CheckRow, ErrorBanner, PoweredByStripe } from "@/app/checkout/parts/ui"
import { CommunityRefundPolicy, waiverSentence, type CommunityCheckoutTerms } from "@/components/community/membership/checkout-policy"
import type { JoinOption, PublicCommunityView } from "./types"

import { cardPrice, nextCharge, planButton, planIntervals, trialEnds, type PlanInterval } from "./plan-words"

export { cardPrice, nextCharge, planButton, planIntervals, trialEnds, type PlanInterval }

/* ── The overlay frame ─────────────────────────────────────────────────── */

function useBodyLock(on: boolean) {
  React.useEffect(() => {
    if (!on) return
    const html = document.documentElement
    const before = html.style.overflow
    html.style.overflow = "hidden"
    return () => {
      html.style.overflow = before
    }
  }, [on])
}

function useEscape(onClose: () => void) {
  const ref = React.useRef(onClose)
  ref.current = onClose
  React.useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") ref.current()
    }
    window.addEventListener("keydown", key)
    return () => window.removeEventListener("keydown", key)
  }, [])
}

function CommunityMark({ community, size }: { community: PublicCommunityView; size: number }) {
  return community.logoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={optimizedImageUrl(community.logoUrl, size * 2) ?? community.logoUrl} alt="" width={size} height={size} className="shrink-0 rounded-[10px] object-cover shadow-[0_0_0_1px_rgba(17,17,19,0.06)]" style={{ width: size, height: size }} />
  ) : (
    <span aria-hidden className="grid shrink-0 place-items-center rounded-[10px] bg-[#1a1a2e] text-[15px] font-semibold text-white" style={{ width: size, height: size }}>
      {community.name.slice(0, 1).toUpperCase()}
    </span>
  )
}

function CloseButton({ onClose, label = "Close" }: { onClose: () => void; label?: string }) {
  return (
    <button type="button" onClick={onClose} aria-label={label} className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-[#4b5563] outline-none transition-colors hover:bg-[#f3f4f6] hover:text-[#1a1a2e] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/30" data-join-close="">
      <X aria-hidden className="h-5 w-5" />
    </button>
  )
}

/* ── Select your plan ──────────────────────────────────────────────────── */

export function PlanPicker({
  community,
  plans,
  onClose,
  onPick,
  pending,
  error,
}: {
  community: PublicCommunityView
  plans: JoinOption[]
  onClose: () => void
  onPick: (plan: JoinOption) => void
  /** The plan whose press is on its way (a free join). */
  pending: string | null
  error: string | null
}) {
  useBodyLock(true)
  useEscape(onClose)
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])
  if (!mounted) return null
  const cols = plans.length >= 3 ? "lg:grid-cols-3" : plans.length === 2 ? "md:grid-cols-2" : ""
  return createPortal(
    <div role="dialog" aria-modal="true" aria-labelledby="plan-picker-title" className="fixed inset-0 z-[120] flex flex-col bg-[#f8f9fa] animate-in fade-in duration-200" data-plan-picker="">
      <header className="shrink-0 border-b border-[#e5e7eb] bg-white pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-16 max-w-[1080px] items-center gap-3 px-4 sm:px-6">
          <CommunityMark community={community} size={36} />
          <p className="min-w-0 flex-1 truncate text-[16px] font-semibold text-[#1a1a2e]">{community.name}</p>
          <CloseButton onClose={onClose} />
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto w-full max-w-[1080px] px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-8 sm:px-6 sm:pt-12">
          <h1 id="plan-picker-title" className="text-center text-[26px] font-semibold tracking-[-0.01em] text-[#1a1a2e] sm:text-[30px]">
            Select your plan
          </h1>
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
    <section className="flex flex-col rounded-2xl border border-[#e5e7eb] bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,0.05),0_8px_24px_-16px_rgba(16,24,40,0.18)] sm:p-7" data-plan-card={plan.kind} data-plan-id={plan.tierId ?? ""}>
      <div className="text-center">
        <p className="text-[34px] font-semibold leading-none tracking-[-0.02em] tabular-nums text-[#1a1a2e]" data-plan-price="">
          {price.amount}
          {price.per ? <span className="ml-0.5 text-[16px] font-medium tracking-normal text-[#6b7280]">{price.per}</span> : null}
        </p>
        {yearly ? (
          <p className="mt-2 text-[13px] text-[#6b7280]">
            or {moneyOf(yearly, plan.currency)}/year{saving > 0 ? <span className="ml-1 font-medium text-[#15803d]">save {saving}%</span> : null}
          </p>
        ) : null}
        <h2 className="mt-4 text-[18px] font-semibold text-[#1a1a2e]">{plan.name}</h2>
        {trial > 0 ? <p className="mt-1 text-[13.5px] font-medium text-[#1a1a2e]">{trial}-day free trial</p> : null}
        {plan.description ? <p className="mt-2 text-[14px] leading-relaxed text-[#6b7280]">{plan.description}</p> : null}
      </div>
      {plan.benefits.length ? (
        <ul className="mt-6 space-y-3">
          {plan.benefits.map((b, i) => (
            <li key={i} className="flex gap-3 text-[14.5px] leading-snug text-[#374151]">
              <span aria-hidden className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#1a1a2e] text-white">
                <Check className="h-3 w-3" strokeWidth={3} />
              </span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-auto pt-7">
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
  useBodyLock(true)
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])
  const [facts, setFacts] = React.useState<Facts | null>(null)
  const [loadError, setLoadError] = React.useState<{ message: string; url?: string } | null>(null)
  const [agreed, setAgreed] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [done, setDone] = React.useState<{ trial: boolean } | null>(null)
  const [open, setOpen] = React.useState(false)
  const started = React.useRef<{ subscriptionId: string; clientSecret: string; membershipId: string } | null>(null)
  const closeIfIdle = React.useCallback(() => {
    if (!busy) onClose()
  }, [busy, onClose])
  useEscape(closeIfIdle)

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

  const check = (): string | null => {
    if (done) return "You're already in."
    if (!agreed) {
      document.getElementById("community-checkout-terms")?.scrollIntoView({ block: "center", behavior: "smooth" })
      return "Tick the box to agree to the terms."
    }
    return null
  }

  const createIntent = async (contact?: { email?: string; name?: string }, methods?: string[]): Promise<IntentResult> => {
    if (!facts || !plan?.productId) throw new Error("This plan can't be joined right now.")
    const name = (contact?.name || facts.buyer.name || "").trim().split(/\s+/).filter(Boolean)
    const res = await postJson<{ membershipId?: string; subscriptionId?: string; clientSecret?: string; type?: "payment" | "setup" }>("/api/memberships/checkout", {
      productId: plan.productId,
      interval: chosen,
      firstName: name[0] || facts.buyer.email.split("@")[0],
      lastName: name.slice(1).join(" "),
      email: facts.buyer.email,
      agreedToTerms: agreed,
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

  const onPaid = async (_id: string, status: string) => {
    const s = started.current
    if (!s) return
    if (status === "processing") return setError("Your bank is still processing the payment. You're let in as soon as it clears, and we'll email you.")
    if (status !== "succeeded") return setError("The payment was not completed. Nothing was charged. Try again.")
    try {
      await confirm(s.subscriptionId, s.clientSecret)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Your membership could not be confirmed. Refresh in a moment.")
    }
  }

  const payLabel = trial ? "Start free trial" : `Join ${fmt(priceCents)}/${per}`
  const renewal = trial
    ? `${fmt(0)} today. From ${trialEnds(trialDays)} you pay ${fmt(priceCents)} a ${per} until you cancel. Cancel before then and you pay nothing.`
    : `${fmt(priceCents)} today, then every ${per} until you cancel. Cancel any time from the community's Membership page.`

  const summary = plan ? (
    <div className="rounded-xl border border-[#e5e7eb]" data-checkout-summary="">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex min-h-12 w-full items-center gap-2 px-4 text-left text-[14px] text-[#4b5563]">
        <span className="min-w-0 flex-1 truncate">
          {fmt(priceCents)}/{per} {plan.name}
          {trial ? ` · ${trialDays}-day trial` : ""}
        </span>
        <span className="font-semibold tabular-nums text-[#1a1a2e]" data-due-today="">
          {fmt(trial ? 0 : priceCents)}
        </span>
        <ChevronDown aria-hidden className={cn("h-4 w-4 shrink-0 transition-[rotate] duration-200", open && "rotate-180")} />
      </button>
      {open ? (
        <dl className="space-y-2 border-t border-[#e5e7eb] px-4 py-3 text-[13.5px]">
          <div className="flex justify-between gap-3">
            <dt className="text-[#6b7280]">{plan.name}, billed {chosen === "year" ? "yearly" : "monthly"}</dt>
            <dd className="tabular-nums text-[#1a1a2e]">{fmt(priceCents)}</dd>
          </div>
          {trial ? (
            <div className="flex justify-between gap-3">
              <dt className="text-[#6b7280]">Free trial</dt>
              <dd className="text-[#1a1a2e]">{trialDays} days</dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-3 border-t border-[#f1f2f4] pt-2 font-semibold">
            <dt className="text-[#1a1a2e]">Due today</dt>
            <dd className="tabular-nums text-[#1a1a2e]">{fmt(trial ? 0 : priceCents)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-[#6b7280]">{trial ? `From ${trialEnds(trialDays)}` : `Next charge, ${nextCharge(chosen)}`}</dt>
            <dd className="tabular-nums text-[#1a1a2e]">
              {fmt(priceCents)}/{per}
            </dd>
          </div>
        </dl>
      ) : null}
    </div>
  ) : null

  const beforePay = (
    <div className="space-y-3">
      <p className="rounded-xl bg-[#f7f7f9] px-3.5 py-3 text-[13px] leading-relaxed text-[#4b5563]" data-renewal-terms="">
        {renewal}
      </p>
      <div id="community-checkout-terms">
        <CheckRow id="community-checkout-agree" checked={agreed} onChange={(v) => { setAgreed(v); if (v) setError(null) }} invalid={!agreed && !!error?.includes("terms")}>
          I agree to the{" "}
          <Link href="/terms" target="_blank" className="font-medium text-[#1a1a2e] underline decoration-[#c9ccd2] underline-offset-2 hover:decoration-[#1a1a2e]">
            Terms
          </Link>{" "}
          and to be charged {trial ? "after the trial " : ""}until I cancel{waiver ? `. ${waiver}` : ""}
        </CheckRow>
      </div>
      <CommunityRefundPolicy terms={facts?.terms ?? null} />
      {error ? <ErrorBanner>{error}</ErrorBanner> : null}
    </div>
  )

  if (!mounted) return null
  return createPortal(
    <div className="fixed inset-0 z-[130] flex items-stretch justify-center sm:items-center sm:p-6 [[data-community-theme=dark]_&]:[--pay-dock-clear:rgba(24,24,27,0)] [[data-community-theme=dark]_&]:[--pay-dock-ground:#18181b]" data-community-checkout="">
      <div aria-hidden className="absolute inset-0 hidden bg-[#0b0b12]/55 animate-in fade-in duration-200 sm:block" onClick={closeIfIdle} />
      <div role="dialog" aria-modal="true" aria-labelledby="community-checkout-title" className="relative flex h-full w-full flex-col overflow-hidden bg-white animate-in fade-in slide-in-from-bottom-2 duration-200 sm:h-auto sm:max-h-[min(92vh,880px)] sm:max-w-[540px] sm:rounded-[20px] sm:shadow-[0_24px_64px_-12px_rgba(16,24,40,0.35)]">
        <div className="flex shrink-0 items-center justify-between px-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:px-3 sm:pt-3">
          {onBack ? (
            <button type="button" onClick={onBack} className="inline-flex h-11 items-center rounded-full px-3 text-[14px] font-medium text-[#4b5563] hover:bg-[#f3f4f6]" data-checkout-back="">
              All plans
            </button>
          ) : (
            <span />
          )}
          <CloseButton onClose={closeIfIdle} />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-8 sm:pb-7">
          <div className="flex flex-col items-center text-center">
            <CommunityMark community={community} size={64} />
            <h2 id="community-checkout-title" className="mt-3 text-[22px] font-semibold tracking-[-0.01em] text-[#1a1a2e]">
              {community.name}
            </h2>
            {plan ? <p className="mt-0.5 text-[14px] text-[#6b7280]">{plan.name}</p> : null}
          </div>

          {loadError ? (
            <div className="mt-8 space-y-3 text-center" data-checkout-unavailable="">
              <p className="text-[14.5px] text-[#4b5563]">{loadError.message}</p>
              {loadError.url ? (
                <a href={loadError.url} className="inline-flex h-11 items-center rounded-xl border border-[#e5e7eb] px-4 text-[14px] font-medium text-[#1a1a2e] hover:bg-[#f7f7f8]">
                  Continue
                </a>
              ) : null}
            </div>
          ) : !facts || !plan ? (
            <div aria-hidden className="mt-8 space-y-3">
              <div className="h-[86px] rounded-xl bg-[#f3f4f6]" />
              <div className="h-[260px] rounded-xl bg-[#f7f7f8]" />
            </div>
          ) : done ? (
            <div role="status" className="mt-8 rounded-2xl border border-[#e5e7eb] px-5 py-6 text-center" data-checkout-done="">
              <span className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-[#ecfdf3] text-[#15803d]">
                <Check aria-hidden className="h-5 w-5" />
              </span>
              <p className="mt-3 text-[18px] font-semibold text-[#1a1a2e]">{done.trial ? "Your free trial has started" : "You're in"}</p>
              <p className="mt-1 text-[14px] text-[#6b7280]">Opening {community.name}.</p>
            </div>
          ) : (
            <div className="mt-7 space-y-6">
              {offers.length > 1 ? (
                <section aria-labelledby="checkout-membership">
                  <h3 id="checkout-membership" className="mb-2.5 text-[15px] font-semibold text-[#1a1a2e]">
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
                          className={cn("relative rounded-xl border bg-white px-3.5 py-3 text-left outline-none transition-[border-color,box-shadow] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/30", on ? "border-[#1a1a2e] shadow-[0_0_0_1px_#1a1a2e]" : "border-[#e1e3e7] hover:border-[#c9ccd2]")}
                          data-interval={o}
                        >
                          {o === "year" && saving > 0 ? <span className="absolute -top-2.5 right-2.5 rounded-full bg-[#15803d] px-2 py-0.5 text-[11.5px] font-semibold text-white">save {saving}%</span> : null}
                          <span className="block text-[14px] font-semibold text-[#1a1a2e]">{o === "year" ? "Annual" : "Monthly"}</span>
                          <span className="mt-1 block text-[15px] font-semibold tabular-nums text-[#1a1a2e]">{o === "year" ? `${fmt(Math.round(cents / 12))}/month` : `${fmt(cents)}/month`}</span>
                          <span className="block text-[12.5px] text-[#6b7280]">{o === "year" ? `${fmt(cents)} billed yearly` : `${fmt(cents)} billed monthly`}</span>
                        </button>
                      )
                    })}
                  </div>
                </section>
              ) : null}
              {trial ? (
                <p className="rounded-xl border border-[#e5e7eb] bg-[#f8f9fa] px-3.5 py-3 text-[13.5px] text-[#374151]" data-trial-note="">
                  <span className="font-semibold text-[#1a1a2e]">{trialDays}-day free trial.</span> Nothing today, then {fmt(priceCents)}/{per} from {trialEnds(trialDays)}.
                </p>
              ) : facts.trialUsed ? (
                <p className="rounded-xl bg-[#f7f7f9] px-3.5 py-3 text-[13px] text-[#4b5563]" data-trial-used="">
                  You've had a free trial in this community before, so this plan starts today.
                </p>
              ) : null}
              {summary}
              <StripePay
                key={`${chosen}:${trial}`}
                mode="subscription"
                amountCents={priceCents}
                creatorName={community.creator?.name ?? community.name}
                email={facts.buyer.email}
                onEmail={() => undefined}
                emailLocked
                check={() => check()}
                createIntent={createIntent}
                payerName={() => facts.buyer.name}
                onPaid={onPaid}
                onError={setError}
                busy={busy || !!done}
                setBusy={setBusy}
                payLabel={payLabel}
                contactExtra={null}
                beforePay={beforePay}
              />
            </div>
          )}
          <PoweredByStripe />
        </div>
      </div>
    </div>,
    document.body,
  )
}
