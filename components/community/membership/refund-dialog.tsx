"use client"

/**
 * ===========================================================================
 *  THE OWNER'S PAYMENTS, AND REFUNDING ONE (round 13, ask 41)
 * ===========================================================================
 * In /app, for the community's owner (money stays with the owner:
 * manage_pricing). CommunityPayments lists the community's payments
 * (membership invoices and one time purchases), optionally one member's,
 * from GET /api/app/community/<id>/payments; each paid one has Refund.
 * RefundDialog asks how much (all of what is left, or part of it), an
 * optional reason, and for a membership whether to end it now too; then
 * POST /api/app/community/<id>/refunds refunds it through Stripe the way
 * Orders does (the creator's share comes back from their connected account)
 * and the member is emailed once. The row updates in place.
 */
import { useCallback, useEffect, useState } from "react"
import { Check, Loader2 } from "lucide-react"
import { BTN_GHOST, BTN_PRIMARY, BTN_SECONDARY, FIELD } from "@/components/community/member/ui"
import { REFUND_REASON_MAX, centsFromAmount, formatDay, formatMoney } from "@/lib/communities/membership-policy"
import { REFUND_CHANGED } from "@/lib/orders/refund-state"
import { MembershipSheet } from "./sheet"
import { tt } from "@/lib/i18n/text"

/** A payment as GET /api/app/community/<id>/payments answers it (lib/communities/server/membership-lifecycle CommunityPayment). */
export interface CommunityPaymentView {
  orderId: string
  productTitle: string
  kind: "membership" | "purchase"
  amountCents: number
  refundedCents: number
  refundableCents: number
  currency: string
  status: string
  createdAt: string
  buyerId: string | null
  buyerName: string
  buyerEmail: string | null
  subscriptionRunning: boolean
}

export interface RefundResult {
  refundId: string
  status: string | null
  amountCents: number
  full: boolean
  pending: boolean
  emailed: boolean
  endedMembership: boolean
}

async function call<T>(url: string, body?: unknown): Promise<{ ok: true; data: T } | { ok: false; error: string; answer?: Record<string, unknown> }> {
  try {
    const res = await fetch(url, {
      method: body === undefined ? "GET" : "POST",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
      cache: "no-store",
    })
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok) {
      const raw = typeof json.error === "string" ? json.error : ""
      return { ok: false, error: raw && !/^[a-z_]+$/.test(raw) ? raw : tt("That did not go through. Try again."), answer: json }
    }
    return { ok: true, data: json as T }
  } catch {
    return { ok: false, error: tt("No connection. Check it and try again.") }
  }
}

/**
 * The owner's "Payments" block (mounted on /app's Members): the heading and
 * the list, drawn only once there is a payment, so a free community shows
 * nothing and nothing flashes while it loads.
 */
export function PaymentsSection({ communityId, locale = "en-US" }: { communityId: string; locale?: string }) {
  const [payments, setPayments] = useState<CommunityPaymentView[] | null>(null)
  useEffect(() => {
    let live = true
    void call<{ payments: CommunityPaymentView[] }>(`/api/app/community/${communityId}/payments`).then((r) => {
      if (live && r.ok) setPayments(r.data.payments)
    })
    return () => {
      live = false
    }
  }, [communityId])
  if (!payments || payments.length === 0) return null
  return (
    <section aria-labelledby="community-payments-title" className="space-y-2.5" data-community-payments="">
      <h2 id="community-payments-title" className="px-1 text-[15px] font-semibold text-[#1a1a2e]">
        {tt("Payments")}
      </h2>
      <CommunityPayments communityId={communityId} locale={locale} initial={payments} />
    </section>
  )
}

export function CommunityPayments({ communityId, userId = null, locale = "en-US", initial = null }: { communityId: string; userId?: string | null; locale?: string; initial?: CommunityPaymentView[] | null }) {
  const [payments, setPayments] = useState<CommunityPaymentView[] | null>(initial)
  const [error, setError] = useState<string | null>(null)
  const [refunding, setRefunding] = useState<CommunityPaymentView | null>(null)
  const [done, setDone] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    const q = userId ? `?userId=${encodeURIComponent(userId)}` : ""
    const r = await call<{ payments: CommunityPaymentView[] }>(`/api/app/community/${communityId}/payments${q}`)
    if (r.ok) setPayments(r.data.payments)
    else setError(r.error)
  }, [communityId, userId])

  useEffect(() => {
    if (initial) return
    void load()
  }, [initial, load])

  if (error && !payments) return <p className="text-[14px] text-[#b42318]">{error}</p>
  if (!payments) return <div aria-hidden className="h-[120px] animate-pulse rounded-2xl bg-[#f3f4f6] motion-reduce:animate-none" data-payments="loading" />
  if (payments.length === 0) return <p className="py-6 text-center text-[14px] text-[#6b7280]" data-payments="empty">{tt("No payments yet.")}</p>

  return (
    <div data-payments="">
      <ul className="divide-y divide-[#eef0f2] overflow-hidden rounded-2xl border border-[#e5e7eb]/70 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        {payments.map((p) => {
          const refunded = p.refundedCents > 0
          const state = p.status === "disputed" ? tt("Disputed") : refunded ? (p.refundedCents >= p.amountCents ? tt("Refunded") : tt("{amount} refunded", { amount: formatMoney(p.refundedCents, p.currency, locale) })) : null
          return (
            <li key={p.orderId} className="flex min-h-16 items-center gap-3 px-4 py-3" data-payment={p.orderId}>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14.5px] font-medium text-[#1a1a2e]">{p.buyerName}</p>
                <p className="truncate text-[13px] text-[#6b7280]">
                  {p.kind === "membership" ? tt("Membership") : p.productTitle} · {formatDay(p.createdAt, locale)}
                </p>
                {state ? (
                  <p className={`truncate text-[13px] ${p.status === "disputed" ? "text-[#b42318]" : "text-[#6b7280]"}`} data-payment-state="">
                    {state}
                  </p>
                ) : null}
                {done[p.orderId] ? (
                  <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-[#15803d]" role="status">
                    <Check className="h-3.5 w-3.5" aria-hidden />
                    {done[p.orderId]}
                  </p>
                ) : null}
              </div>
              <p className={`shrink-0 text-[14.5px] tabular-nums ${refunded && p.refundedCents >= p.amountCents ? "text-[#9ca3af] line-through" : "text-[#1a1a2e]"}`}>{formatMoney(p.amountCents, p.currency, locale)}</p>
              {p.refundableCents > 0 && p.status !== "disputed" ? (
                <button type="button" className={`${BTN_GHOST} shrink-0`} onClick={() => setRefunding(p)} data-payment-refund={p.orderId}>
                  {tt("Refund")}
                </button>
              ) : (
                <span className="hidden w-[68px] shrink-0 sm:block" aria-hidden />
              )}
            </li>
          )
        })}
      </ul>
      <RefundDialog
        communityId={communityId}
        payment={refunding}
        locale={locale}
        onClose={() => setRefunding(null)}
        onDone={(p, r) => {
          setRefunding(null)
          setPayments((list) =>
            (list ?? []).map((x) =>
              x.orderId === p.orderId
                ? { ...x, status: r.pending ? x.status : "refunded", refundedCents: x.refundedCents + (r.pending ? 0 : r.amountCents), refundableCents: Math.max(0, x.refundableCents - r.amountCents), subscriptionRunning: r.endedMembership ? false : x.subscriptionRunning }
                : x,
            ),
          )
          setDone((d) => ({
            ...d,
            [p.orderId]: `${r.pending ? tt("Refund started") : tt("Refunded")} ${formatMoney(r.amountCents, p.currency, locale)}${r.endedMembership ? tt(", membership ended") : ""}.${r.emailed ? tt(" {value} was emailed.", { value: p.buyerName.split(" ")[0] }) : ""}`,
          }))
        }}
      />
    </div>
  )
}

export function RefundDialog({
  communityId,
  payment,
  locale = "en-US",
  onClose,
  onDone,
}: {
  communityId: string
  payment: CommunityPaymentView | null
  locale?: string
  onClose: () => void
  onDone: (payment: CommunityPaymentView, result: RefundResult) => void
}) {
  const [shown, setShown] = useState<CommunityPaymentView | null>(payment)
  const [part, setPart] = useState(false)
  const [amount, setAmount] = useState("")
  const [reason, setReason] = useState("")
  const [end, setEnd] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!payment) return
    setShown(payment)
    setPart(false)
    setAmount("")
    setReason("")
    setEnd(false)
    setError(null)
  }, [payment])

  const p = shown
  const max = p?.refundableCents ?? 0
  const cents = part ? centsFromAmount(amount, p?.currency) : max
  const tooMuch = cents !== null && cents > max
  const money = (c: number) => formatMoney(c, p?.currency ?? "usd", locale)

  const submit = async () => {
    if (!p || busy) return
    if (!cents || tooMuch) return setError(tooMuch ? tt("At most {amount} can go back.", { amount: money(max) }) : tt("Enter an amount to refund."))
    setBusy(true)
    setError(null)
    const r = await call<{ refund: RefundResult }>(`/api/app/community/${communityId}/refunds`, {
      orderId: p.orderId,
      amountCents: part ? cents : undefined,
      /* What this dialog shows as left (lib/orders/refund-state): pressed again after a refund that went through, nothing is refunded twice. */
      refundableCents: max,
      reason: reason.trim() || undefined,
      endMembership: end,
    })
    setBusy(false)
    if (!r.ok) {
      /* The payment moved on: the dialog shows what it holds now, so the next press is on the real figure. */
      const a = r.answer
      if (a?.code === REFUND_CHANGED && typeof a.refundableCents === "number" && typeof a.refundedCents === "number") {
        const refundedCents = a.refundedCents
        setShown({ ...p, refundableCents: a.refundableCents, refundedCents, status: refundedCents > 0 ? "refunded" : p.status })
      }
      return setError(r.error)
    }
    onDone(p, r.data.refund)
  }

  const radio = (on: boolean, label: string, sub: string, pick: () => void, key: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={pick}
      className={`flex min-h-12 w-full items-center gap-3 px-3.5 py-2 text-left outline-none transition-colors duration-150 focus-visible:bg-[#f6f7f8] motion-reduce:transition-none [-webkit-tap-highlight-color:transparent] ${on ? "bg-[#f8f9fa]" : "hover:bg-[#fafafb]"}`}
      data-refund-choice={key}
    >
      <span className="min-w-0 flex-1">
        <span className={`block text-[14.5px] ${on ? "font-medium text-[#1a1a2e]" : "text-[#374151]"}`}>{label}</span>
        <span className="block text-[13px] text-[#6b7280]">{sub}</span>
      </span>
      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${on ? "border-[#1a1a2e] bg-[#1a1a2e] text-white" : "border-[#cfd2d8] bg-white"}`} aria-hidden>
        {on ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
      </span>
    </button>
  )

  return (
    <MembershipSheet
      open={!!payment}
      onClose={onClose}
      busy={busy}
      marker="refund"
      title={p ? tt("Refund {value}", { value: p.buyerName.split(" ")[0] }) : tt("Refund")}
      footer={(phone) => {
        const go = (
          <button key="go" type="button" className={`${BTN_PRIMARY} ${phone ? "h-11 w-full text-[15px]" : ""}`} onClick={() => void submit()} disabled={busy || !cents || tooMuch} data-refund-submit="">
            {busy ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
            {busy ? tt("Refunding") : cents && !tooMuch ? tt("Refund {amount}", { amount: money(cents) }) : tt("Refund")}
          </button>
        )
        const cancel = (
          <button key="cancel" type="button" className={phone ? `${BTN_SECONDARY} h-11 w-full text-[15px]` : BTN_GHOST} onClick={onClose} disabled={busy}>
            {tt("Cancel")}
          </button>
        )
        return phone ? [go, cancel] : [cancel, go]
      }}
    >
      {p ? (
        <div data-refund-form="">
          <p className="text-[14px] leading-relaxed text-[#6b7280]">
            {p.kind === "membership" ? tt("Membership payment") : p.productTitle} {tt("of {amount} on {date}.", { amount: money(p.amountCents), date: formatDay(p.createdAt, locale) })}
          </p>
          <div role="radiogroup" aria-label={tt("How much")} className="mt-3 divide-y divide-[#f0f1f3] overflow-hidden rounded-xl border border-[#e6e8eb] bg-white shadow-[0_1px_1px_rgba(16,24,40,0.04)]">
            {radio(!part, p.refundedCents > 0 ? tt("The rest") : tt("Full refund"), money(max), () => setPart(false), "full")}
            {radio(part, tt("Part of it"), tt("Choose the amount"), () => setPart(true), "part")}
          </div>
          {part ? (
            <input
              inputMode="decimal"
              autoFocus
              value={amount}
              onChange={(e) => setAmount(e.target.value.slice(0, 12))}
              placeholder={money(max)}
              aria-label={tt("Amount to refund")}
              className={`${FIELD} mt-3 h-11 tabular-nums shadow-[0_1px_1px_rgba(16,24,40,0.04)] ${tooMuch ? "border-[#f3b4ae]" : ""}`}
              data-refund-amount=""
            />
          ) : null}
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value.slice(0, REFUND_REASON_MAX))}
            rows={2}
            maxLength={REFUND_REASON_MAX}
            placeholder={tt("Reason, for your records (optional)")}
            aria-label={tt("Reason")}
            className={`${FIELD} mt-3 block resize-none shadow-[0_1px_1px_rgba(16,24,40,0.04)]`}
          />
          {p.kind === "membership" && p.subscriptionRunning ? (
            <label className="mt-3 flex min-h-11 cursor-pointer items-start gap-3 rounded-xl px-0.5 py-1.5" data-refund-end="">
              <input type="checkbox" checked={end} onChange={(e) => setEnd(e.target.checked)} className="mt-0.5 h-[18px] w-[18px] shrink-0 accent-[#1a1a2e]" />
              <span className="text-[14px] leading-snug text-[#374151]">
                {tt("End their membership now")}
                <span className="block text-[13px] text-[#6b7280]">{tt("Access stops today and they are not charged again. Otherwise it renews as usual.")}</span>
              </span>
            </label>
          ) : null}
          <p className="mt-3 text-[13px] leading-relaxed text-[#6b7280]">{tt("It goes back to their card in 5 to 10 business days, and your share comes back from your Stripe balance. They get an email.")}</p>
          {error ? (
            <p role="alert" className="mt-3 text-[13.5px] text-[#b42318]">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </MembershipSheet>
  )
}
