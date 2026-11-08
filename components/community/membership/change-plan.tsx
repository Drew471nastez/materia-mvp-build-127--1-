"use client"

/**
 * ===========================================================================
 *  CHANGE PLAN (round AF): upgrade, downgrade, monthly and annual
 * ===========================================================================
 * A button beside Cancel on the member's plan card, shown only when there is
 * somewhere to move (GET /api/community/<id>/membership/plan). It opens the
 * same sheet as cancelling: the plans, theirs marked, Monthly or Annual, and
 * before anything changes what it costs, from Stripe's own invoice preview
 * (POST without confirm): paid now, credit for unused time, and the next
 * charge. Confirm makes the change on the server and the card redraws from
 * the answer. The rules are in lib/communities/plan-change.ts.
 */
import { useEffect, useRef, useState } from "react"
import { Check, Loader2 } from "lucide-react"
import { api, apiBase } from "@/components/community/member/api"
import { BTN_GHOST, BTN_PRIMARY, BTN_SECONDARY } from "@/components/community/member/ui"
import { formatMoney, type CommunityMembershipView } from "@/lib/communities/membership-policy"
import type { PlanInterval } from "@/lib/communities/plan-change"
import { getStripePromise } from "@/components/checkout/parts/stripe-loader"
import { MembershipSheet } from "./sheet"
import { confirmLabel, previewSentence, type PlanPreview as Preview } from "./plan-words"

interface PlanChoice {
  tierId: string
  productId: string
  name: string
  description: string | null
  currency: string
  monthlyCents: number | null
  yearlyCents: number | null
  current: { interval: PlanInterval } | null
}
interface PlanChoices {
  canChange: boolean
  reason: string | null
  currentInterval: PlanInterval
  plans: PlanChoice[]
}

export { confirmLabel, previewSentence }

export function ChangePlan({
  communityId,
  view,
  locale = "en-US",
  onChanged,
  className,
}: {
  communityId: string
  view: CommunityMembershipView
  locale?: string
  onChanged: (next: CommunityMembershipView) => void
  className?: string
}) {
  const eligible = view.kind === "subscription" && (view.status === "active" || view.status === "trialing") && !view.cancelAtPeriodEnd
  const [choices, setChoices] = useState<PlanChoices | null>(null)
  const [open, setOpen] = useState(false)
  const [tierId, setTierId] = useState<string>("")
  const [every, setEvery] = useState<PlanInterval>("month")
  const [preview, setPreview] = useState<Preview | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const asked = useRef(0)

  useEffect(() => {
    if (!eligible) return
    let live = true
    void api<{ choices: PlanChoices }>(`${apiBase(communityId)}/membership/plan`).then((r) => {
      if (live && r.ok) setChoices(r.data.choices)
    })
    return () => {
      live = false
    }
  }, [communityId, eligible, view.membershipId, view.amountCents, view.interval])

  const plan = choices?.plans.find((p) => p.tierId === tierId) ?? null
  const isCurrent = !!plan?.current && plan.current.interval === every

  /* Every pick asks for its own preview; an older answer never overwrites a newer pick. */
  useEffect(() => {
    if (!open || !plan || isCurrent) {
      setPreview(null)
      return
    }
    const n = ++asked.current
    setPreviewing(true)
    setError(null)
    void api<{ preview: Preview }>(`${apiBase(communityId)}/membership/plan`, { body: { tierId, interval: every } }).then((r) => {
      if (n !== asked.current) return
      setPreviewing(false)
      if (r.ok) setPreview(r.data.preview)
      else {
        setPreview(null)
        setError((r as { error: string }).error)
      }
    })
  }, [open, tierId, every, isCurrent, communityId, plan])

  if (!eligible || !choices?.canChange) return null

  const start = () => {
    const current = choices.plans.find((p) => p.current)
    const other = choices.plans.find((p) => !p.current && p.tierId)
    /* Opens on a change, not on what they have: another plan, else the other interval of theirs. */
    if (other) {
      setTierId(other.tierId)
      setEvery(choices.currentInterval === "year" && other.yearlyCents ? "year" : other.monthlyCents ? "month" : "year")
    } else if (current) {
      setTierId(current.tierId)
      setEvery(choices.currentInterval === "year" ? "month" : "year")
    }
    setError(null)
    setOpen(true)
  }

  const confirm = async () => {
    if (busy || !preview) return
    setBusy(true)
    setError(null)
    const r = await api<{ membership?: CommunityMembershipView; needsAction?: { clientSecret: string } }>(`${apiBase(communityId)}/membership/plan`, { body: { tierId, interval: every, confirm: true }, timeoutMs: 30_000 })
    if (!r.ok) {
      setBusy(false)
      return setError((r as { error: string }).error)
    }
    let view = r.data.membership ?? null
    /* Round AG: the bank wants to confirm the difference (3-D Secure): Stripe's own window, then the server finishes once it sees it paid. */
    if (r.data.needsAction) {
      const stripe = await getStripePromise()
      const confirmed = stripe ? await stripe.confirmCardPayment(r.data.needsAction.clientSecret) : null
      if (!confirmed || confirmed.error) {
        setBusy(false)
        return setError(`${confirmed?.error?.message ?? "Your bank did not approve the payment."} Nothing changed.`)
      }
      const fin = await api<{ membership?: CommunityMembershipView }>(`${apiBase(communityId)}/membership/plan`, { body: { tierId, interval: every, finish: true }, timeoutMs: 30_000 })
      if (!fin.ok) {
        setBusy(false)
        return setError((fin as { error: string }).error)
      }
      view = fin.data.membership ?? null
    }
    setBusy(false)
    setOpen(false)
    if (view) onChanged(view)
  }

  const price = (p: PlanChoice, i: PlanInterval) => {
    const c = i === "year" ? p.yearlyCents : p.monthlyCents
    return c ? `${formatMoney(c, p.currency, locale)}/${i === "year" ? "year" : "month"}` : null
  }

  return (
    <>
      <button type="button" className={className ?? BTN_SECONDARY} onClick={start} data-membership-change-plan="">
        Change plan
      </button>
      <MembershipSheet
        open={open}
        onClose={() => (busy ? undefined : setOpen(false))}
        busy={busy}
        marker="change-plan"
        title="Change plan"
        footer={(phone) => {
          const go = (
            <button key="go" type="button" className={`${BTN_PRIMARY} ${phone ? "h-11 w-full text-[15px]" : ""}`} onClick={() => void confirm()} disabled={busy || !preview || previewing} data-plan-change-confirm="">
              {busy ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
              {busy ? "Changing" : preview ? confirmLabel(preview.kind, preview.toName, preview.interval) : "Change plan"}
            </button>
          )
          const keep = (
            <button key="keep" type="button" className={`${phone ? `${BTN_SECONDARY} h-11 w-full text-[15px]` : BTN_GHOST}`} onClick={() => setOpen(false)} disabled={busy}>
              Keep my plan
            </button>
          )
          return phone ? [go, keep] : [keep, go]
        }}
      >
        <div role="radiogroup" aria-label="Plan" className="overflow-hidden rounded-xl border border-[#e6e8eb] bg-white shadow-[0_1px_1px_rgba(16,24,40,0.04)]">
          {choices.plans
            .filter((p) => p.tierId)
            .map((p, i) => {
              const on = p.tierId === tierId
              const line = price(p, every) ?? price(p, every === "year" ? "month" : "year")
              return (
                <button
                  key={p.tierId}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => {
                    setTierId(p.tierId)
                    if (!(every === "year" ? p.yearlyCents : p.monthlyCents)) setEvery(every === "year" ? "month" : "year")
                  }}
                  className={`flex min-h-14 w-full items-center gap-3 px-3.5 py-2.5 text-left outline-none transition-colors duration-150 focus-visible:bg-[#f6f7f8] motion-reduce:transition-none [-webkit-tap-highlight-color:transparent] ${i ? "border-t border-[#f0f1f3]" : ""} ${on ? "bg-[#f8f9fa]" : "hover:bg-[#fafafb]"}`}
                  data-plan-choice={p.tierId}
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-[15px] font-medium text-[#1a1a2e]">
                      {p.name}
                      {p.current ? <span className="rounded-full bg-[#eef0f2] px-2 py-0.5 text-[11.5px] font-medium text-[#4b5563]">Your plan</span> : null}
                    </span>
                    {line ? <span className="mt-0.5 block text-[13px] tabular-nums text-[#6b7280]">{line}</span> : null}
                  </span>
                  <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors duration-150 motion-reduce:transition-none ${on ? "border-[#1a1a2e] bg-[#1a1a2e] text-white" : "border-[#cfd2d8] bg-white"}`} aria-hidden>
                    {on ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
                  </span>
                </button>
              )
            })}
        </div>
        {plan && plan.monthlyCents && plan.yearlyCents ? (
          <div role="radiogroup" aria-label="How often to pay" className="mt-3 grid grid-cols-2 gap-1 rounded-xl bg-[#f1f2f4] p-1" data-plan-change-interval="">
            {(["month", "year"] as const).map((i) => (
              <button
                key={i}
                type="button"
                role="radio"
                aria-checked={every === i}
                onClick={() => setEvery(i)}
                className={`h-10 rounded-lg text-[14px] font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20 motion-reduce:transition-none ${every === i ? "bg-white text-[#1a1a2e] shadow-[0_1px_2px_rgba(16,24,40,0.08)]" : "text-[#6b7280]"}`}
              >
                {i === "year" ? "Annual" : "Monthly"}
              </button>
            ))}
          </div>
        ) : null}
        <div className="mt-4 min-h-[48px]" aria-live="polite" data-plan-change-preview="">
          {isCurrent ? (
            <p className="text-[14px] text-[#6b7280]">This is your plan now.</p>
          ) : previewing ? (
            <p className="flex items-center gap-2 text-[14px] text-[#6b7280]">
              <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> Working out the amounts
            </p>
          ) : preview ? (
            <p className="text-[14.5px] leading-relaxed text-[#1a1a2e]" data-plan-change-sentence="">
              {previewSentence(preview, locale)}
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="mt-2 text-[13.5px] text-[#b42318]">
              {error}
            </p>
          ) : null}
        </div>
        <p className="mt-2 text-[12.5px] leading-relaxed text-[#6b7280]">The new plan starts as soon as you confirm. Courses and products you bought separately stay yours.</p>
      </MembershipSheet>
    </>
  )
}
