"use client"

/**
 * ===========================================================================
 *  YOUR MEMBERSHIP, AND CANCELLING IT (round 13, ask 39)
 * ===========================================================================
 * Mounted by the member's Membership page (worker F2). A quiet card: what
 * they pay, when it renews (or when it ends), and one action. Cancel opens
 * a sheet that says the one thing that matters first ("You keep access until
 * <date>. No further charges after that."), then asks why, optionally, with
 * the same six answers as leaving and a note. The subscription stops at the
 * end of the period they paid for (/api/community/<id>/membership, the
 * memberships engine underneath); the card then reads "Your membership ends
 * on <date>. No further charges." with Resume until then. The card and past
 * invoices stay on the account's membership page (Stripe's portal).
 *
 * Give it `initial` from the server (lib/communities/server/membership-
 * lifecycle communityMembershipView) to draw at once; without it the card
 * asks the route itself.
 */
import Link from "next/link"
import { useEffect, useState } from "react"
import { Check, Loader2 } from "lucide-react"
import { api, apiBase, type ApiResult } from "@/components/community/member/api"
import { BTN_GHOST, BTN_PRIMARY, BTN_SECONDARY, CARD, FIELD } from "@/components/community/member/ui"
import { CANCEL_NOTE_MAX, CANCEL_REASONS, formatDay, formatMoney, membershipStatusLine, type CancelReason, type CommunityMembershipView } from "@/lib/communities/membership-policy"
import { MembershipSheet } from "./sheet"

/* One read for the page: the plan's buttons and the contact form ask together and share the answer for a few seconds. */
const reads = new Map<string, { at: number; p: Promise<ApiResult<{ membership: CommunityMembershipView }>> }>()
function readView(communityId: string) {
  const hit = reads.get(communityId)
  if (hit && Date.now() - hit.at < 5000) return hit.p
  const p = api<{ membership: CommunityMembershipView }>(`${apiBase(communityId)}/membership`)
  reads.set(communityId, { at: Date.now(), p })
  return p
}

export function useMembershipView(communityId: string, initial: CommunityMembershipView | null | undefined) {
  const [view, setView] = useState<CommunityMembershipView | null>(initial ?? null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (initial) return
    let live = true
    void readView(communityId).then((r) => {
      if (!live) return
      if (r.ok) setView(r.data.membership)
      else if (r.error) setError(r.error)
    })
    return () => {
      live = false
    }
  }, [communityId, initial])
  return { view, setView, error }
}

export function CancelMembership({
  communityId,
  initial,
  locale = "en-US",
  onChange,
  variant = "card",
}: {
  communityId: string
  initial?: CommunityMembershipView | null
  locale?: string
  onChange?: (view: CommunityMembershipView) => void
  /** "card" (its own card: plan, line, actions) or "inline" (the actions only, inside a page's own plan section). */
  variant?: "card" | "inline"
  /** Accepted for the Membership page's slot; the dates come from the server's view. */
  slug?: string
  endsAt?: string | null
}) {
  const { view, setView, error: loadError } = useMembershipView(communityId, initial)
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<CancelReason | null>(null)
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState<"cancel" | "resume" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [justCancelled, setJustCancelled] = useState(false)

  const apply = (next: CommunityMembershipView) => {
    setView(next)
    onChange?.(next)
  }

  const act = async (action: "cancel" | "resume") => {
    if (busy) return
    setBusy(action)
    setError(null)
    const r = await api<{ membership: CommunityMembershipView }>(`${apiBase(communityId)}/membership`, {
      body: action === "cancel" ? { action, reason: reason ?? undefined, note: note.trim() || undefined } : { action },
    })
    setBusy(null)
    if (!r.ok) return setError(r.error)
    apply(r.data.membership)
    if (action === "cancel") {
      setOpen(false)
      setJustCancelled(true)
    } else setJustCancelled(false)
  }

  if (!view) {
    if (loadError || variant === "inline") return null
    return <div aria-hidden className={`${CARD} h-[132px] animate-pulse bg-[#fbfbfc] motion-reduce:animate-none`} data-membership-card="loading" />
  }
  if (view.kind === "none") return null

  const price = view.kind === "subscription" && view.amountCents > 0 && view.interval ? `${formatMoney(view.amountCents, view.currency, locale)}/${view.interval === "year" ? "year" : "month"}` : null
  const line = membershipStatusLine(view, locale)
  const ends = formatDay(view.periodEnd, locale)

  const sheetEl = (
    <MembershipSheet
      open={open}
      onClose={() => setOpen(false)}
      busy={busy === "cancel"}
      marker="cancel"
      title={view.status === "trialing" ? "Cancel your free trial?" : "Cancel your membership?"}
      footer={(phone) => {
        const confirm = (
          <button key="go" type="button" className={`${BTN_PRIMARY} ${phone ? "h-11 w-full text-[15px]" : ""}`} onClick={() => void act("cancel")} disabled={!!busy} data-membership-confirm="">
            {busy === "cancel" ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
            {busy === "cancel" ? "Cancelling" : "Cancel membership"}
          </button>
        )
        const keep = (
          <button key="keep" type="button" className={`${phone ? `${BTN_SECONDARY} h-11 w-full text-[15px]` : BTN_GHOST}`} onClick={() => setOpen(false)} disabled={!!busy}>
            Keep it
          </button>
        )
        return phone ? [confirm, keep] : [keep, confirm]
      }}
    >
      <p className="text-[14.5px] leading-relaxed text-[#1a1a2e]" data-membership-keeps="">
        {ends ? `You keep access until ${ends}. No further charges after that.` : "No further charges."}
      </p>
      <p className="mt-1 text-[13.5px] leading-relaxed text-[#6b7280]">You can resume any time before then.</p>
      <fieldset className="mt-4">
        <legend className="text-[13px] font-medium text-[#6b7280]">Why are you cancelling? Optional. Only the owner sees it.</legend>
        <div role="radiogroup" aria-label="Reason" className="mt-2 overflow-hidden rounded-xl border border-[#e6e8eb] bg-white shadow-[0_1px_1px_rgba(16,24,40,0.04)]">
          {CANCEL_REASONS.map((r, i) => {
            const on = reason === r.key
            return (
              <button
                key={r.key}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setReason(on ? null : r.key)}
                className={`flex min-h-12 w-full items-center gap-3 px-3.5 text-left text-[15px] outline-none transition-colors duration-150 focus-visible:bg-[#f6f7f8] active:bg-[#f1f2f4] active:duration-0 motion-reduce:transition-none [-webkit-tap-highlight-color:transparent] sm:min-h-11 sm:text-[14.5px] ${i ? "border-t border-[#f0f1f3]" : ""} ${on ? "bg-[#f8f9fa] font-medium text-[#1a1a2e]" : "text-[#374151] hover:bg-[#fafafb]"}`}
                data-cancel-reason={r.key}
              >
                <span className="min-w-0 flex-1">{r.label}</span>
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors duration-150 motion-reduce:transition-none ${on ? "border-[#1a1a2e] bg-[#1a1a2e] text-white" : "border-[#cfd2d8] bg-white"}`} aria-hidden>
                  {on ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
                </span>
              </button>
            )
          })}
        </div>
      </fieldset>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value.slice(0, CANCEL_NOTE_MAX))}
        rows={2}
        maxLength={CANCEL_NOTE_MAX}
        placeholder="Anything the owner should know (optional)"
        aria-label="Note for the owner"
        className={`${FIELD} mt-3 block resize-none shadow-[0_1px_1px_rgba(16,24,40,0.04)]`}
        data-cancel-note=""
      />
      {error && open ? (
        <p role="alert" className="mt-3 text-[13.5px] text-[#b42318]">
          {error}
        </p>
      ) : null}
    </MembershipSheet>
  )

  /*
    INLINE (the Membership page of worker F2, beside its Manage subscription
    link): only the action, the sheet, and once cancelled the line that says
    when it ends. The plan itself is in F2's own rows.
  */
  if (variant === "inline") {
    if (!(view.canCancel || view.canResume || justCancelled)) return null
    return (
      <>
        {view.status === "canceled" && view.access ? (
          <p className="order-first basis-full text-[14px] leading-relaxed text-[#4b5563]" data-membership-line="">
            {line}
          </p>
        ) : null}
        {error && !open ? (
          <p role="alert" className="order-first basis-full text-[13.5px] text-[#b42318]">
            {error}
          </p>
        ) : null}
        {view.canResume ? (
          <button type="button" className={BTN_PRIMARY} onClick={() => void act("resume")} disabled={!!busy} data-membership-resume="">
            {busy === "resume" ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
            {busy === "resume" ? "Resuming" : "Resume membership"}
          </button>
        ) : null}
        {view.canCancel ? (
          <button
            type="button"
            className={BTN_SECONDARY}
            onClick={() => {
              setReason(null)
              setNote("")
              setError(null)
              setOpen(true)
            }}
            data-membership-cancel=""
          >
            {view.status === "trialing" ? "Cancel free trial" : "Cancel membership"}
          </button>
        ) : null}
        {sheetEl}
      </>
    )
  }

  return (
    <section className={`${CARD} p-4 sm:p-5`} aria-labelledby="membership-plan-title" data-membership-card={view.kind} data-membership-status={view.status ?? ""}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 id="membership-plan-title" className="text-[13px] font-medium text-[#6b7280]">
            {view.kind === "subscription" ? "Your plan" : "Your membership"}
          </h2>
          <p className="mt-0.5 truncate text-[17px] font-semibold tabular-nums text-[#1a1a2e]">{price ?? view.communityName}</p>
        </div>
        {view.manageUrl ? (
          <Link href={view.manageUrl} className={`${BTN_GHOST} -mr-2 -mt-1 min-h-10`} data-membership-billing="">
            Card and invoices
          </Link>
        ) : null}
      </div>
      {line ? (
        <p className={`mt-2 text-[14px] leading-relaxed ${view.status === "past_due" ? "text-[#b42318]" : "text-[#4b5563]"}`} data-membership-line="">
          {justCancelled ? (
            <span className="mr-1.5 inline-flex h-4 w-4 translate-y-[3px] items-center justify-center rounded-full bg-[#1a1a2e] text-white" aria-hidden>
              <Check className="h-2.5 w-2.5" strokeWidth={3} />
            </span>
          ) : null}
          {line}
        </p>
      ) : null}
      {error && !open ? (
        <p role="alert" className="mt-2 text-[13.5px] text-[#b42318]">
          {error}
        </p>
      ) : null}
      {view.canCancel || view.canResume ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {view.canResume ? (
            <button type="button" className={BTN_PRIMARY} onClick={() => void act("resume")} disabled={!!busy} data-membership-resume="">
              {busy === "resume" ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
              {busy === "resume" ? "Resuming" : "Resume membership"}
            </button>
          ) : null}
          {view.canCancel ? (
            <button
              type="button"
              className={BTN_SECONDARY}
              onClick={() => {
                setReason(null)
                setNote("")
                setError(null)
                setOpen(true)
              }}
              data-membership-cancel=""
            >
              {view.status === "trialing" ? "Cancel free trial" : "Cancel membership"}
            </button>
          ) : null}
        </div>
      ) : null}

      {sheetEl}
    </section>
  )
}
