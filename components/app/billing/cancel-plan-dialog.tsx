"use client"

/**
 * CANCEL PLAN, from the Subscription Overview in Settings > Plan.
 *
 * A dialog on a computer and the shared bottom sheet on a phone
 * (components/ui/sheet-dialog), drawn like the community's Leave dialog: one
 * question, calm rows to pick from, a note, and two buttons.
 *
 * WHAT HAPPENS IS SAID FIRST, from real data: Pro stays on until the end of
 * the period already paid for (the subscription's current_period_end, read
 * from Stripe), then the account is on Free. What changes on Free is the
 * plan comparison (lib/billing/plans planComparison) filtered to the rows
 * where the two plans differ, so it cannot say something the plans do not do.
 *
 * THE REASON IS OPTIONAL. Cancel plan works with nothing chosen; what is
 * chosen goes to app/api/billing/subscription/cancel (lib/billing/cancel-reasons).
 *
 * On a phone the sheet is `fill`: the words scroll between the handle and the
 * two buttons, so Keep Pro and Cancel plan are always in reach.
 */
import * as React from "react"
import { Loader2 } from "lucide-react"
import { SheetDialog, SheetDialogTitle } from "@/components/ui/sheet-dialog"
import { CANCEL_NOTE_MAX, CANCEL_REASONS, type CancelReason } from "@/lib/billing/cancel-reasons"
import { planComparison } from "@/lib/billing/plans"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { Rich } from "@/lib/i18n/rich"
import { appLocale, zoned } from "@/lib/i18n/format"

export function usePhone(): boolean {
  const [phone, setPhone] = React.useState(false)
  React.useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)")
    const sync = () => setPhone(mq.matches)
    sync()
    mq.addEventListener("change", sync)
    return () => mq.removeEventListener("change", sync)
  }, [])
  return phone
}

const longDate = (iso: string) => new Date(iso).toLocaleDateString(appLocale(), zoned({ month: "long", day: "numeric", year: "numeric" }))

/** The rows where Free differs from Pro: values side by side, and what Free does not have at all. */
function freeChanges() {
  const rows = planComparison().flatMap((s) => s.rows).filter((r) => r.free !== r.pro)
  return {
    /* "3% + $0.25", not "3% + $0.25 per sale": the row is already called Fee per sale, and the shorter value fits a phone's row. */
    values: (rows.filter((r) => typeof r.free === "string" && typeof r.pro === "string") as { label: string; free: string; pro: string }[]).map((r) => ({
      ...r,
      free: r.free.replace(/ per sale$/, ""),
      pro: r.pro.replace(/ per sale$/, ""),
    })),
    lost: rows.filter((r) => r.pro === true && r.free === false).map((r) => r.label),
  }
}

const REASON_ROW =
  "flex min-h-[44px] w-full items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left text-[14.5px] leading-snug outline-none transition-[background-color,border-color,box-shadow] duration-150 focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15 [-webkit-tap-highlight-color:transparent] sm:min-h-10 sm:text-[14px]"

export function CancelPlanDialog({
  open,
  onClose,
  planName,
  endsAt,
  busy,
  error,
  onConfirm,
}: {
  open: boolean
  onClose: () => void
  planName: string
  /** The end of the period paid for, as Stripe has it. Null when it could not be read. */
  endsAt: string | null
  busy: boolean
  error: string | null
  onConfirm: (feedback: { reason: CancelReason | null; note: string }) => void
}) {
  const phone = usePhone()
  const [reason, setReason] = React.useState<CancelReason | null>(null)
  const [note, setNote] = React.useState("")
  /* A fresh question each time it opens. */
  React.useEffect(() => {
    if (!open) return
    setReason(null)
    setNote("")
  }, [open])
  const changes = React.useMemo(freeChanges, [])
  const until = endsAt ? longDate(endsAt) : null
  const close = () => {
    if (!busy) onClose()
  }

  return (
    <SheetDialog
      open={open}
      onClose={close}
      phone={phone}
      label={tt("Cancel {planName}", { planName })}
      className="flex max-h-[calc(100dvh-48px)] max-w-[480px] flex-col gap-0 overflow-hidden rounded-2xl p-0"
      sheet={{ dismissible: !busy, maxHeight: "calc(var(--vv-h, 100dvh) * 0.9)" }}
    >
      <div className="flex min-h-0 flex-1 flex-col" data-cancel-plan-dialog="">
        <div className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain", phone ? "px-5 pb-4 pt-1" : "px-6 pb-5 pt-6")}>
          <SheetDialogTitle className="pr-8 text-[18px] font-semibold leading-snug text-[#1a1a2e]">{tt("Cancel {planName}?", { planName })}</SheetDialogTitle>
          <p className="mt-2 text-[14px] leading-relaxed text-[#4b5563]" data-cancel-until="">
            {until ? (
              <>
                <Rich text={tt("{planName} stays on until {until}, the end of the period you paid for. Then your account moves to Free and nothing more is charged.", { planName })} parts={{ until: <span className="font-semibold text-[#1a1a2e]">{until}</span> }} />
              </>
            ) : (
              <>{tt("{planName} stays on until the end of the period you paid for. Then your account moves to Free and nothing more is charged.", { planName })}</>
            )}
          </p>

          <div className="mt-4 rounded-xl border border-[#eceef1] bg-[#fafafb]" data-cancel-changes="">
            <p className="px-3.5 pb-1 pt-3 text-[13px] font-medium text-[#1a1a2e]">{tt("On Free")}{until ? tt(" from {until}", { until }) : ""}</p>
            <dl className="divide-y divide-[#eceef1] px-3.5 text-[13.5px]">
              {changes.values.map((row) => (
                <div key={row.label} className="flex items-center justify-between gap-3 py-2">
                  <dt className="text-[#6b7280]">{row.label}</dt>
                  <dd className="shrink-0 whitespace-nowrap text-right tabular-nums">
                    <span className="text-[#9ca3af] line-through decoration-[#c4c7cc]">{row.pro}</span>
                    <span className="ml-2 font-medium text-[#1a1a2e]">{row.free}</span>
                  </dd>
                </div>
              ))}
            </dl>
            {changes.lost.length > 0 ? (
              <p className="border-t border-[#eceef1] px-3.5 py-2.5 text-[13px] leading-5 text-[#6b7280]">
                {tt("Not on Free: {value}.", { value: changes.lost.map((l, i) => (i === 0 ? l : l.charAt(0).toLowerCase() + l.slice(1))).join(", ") })}
              </p>
            ) : null}
          </div>
          <p className="mt-2.5 text-[13px] leading-5 text-[#6b7280]">{tt("Your products, pages, customers and orders stay as they are.")}</p>

          <div className="mt-5">
            <p id="cancel-why" className="text-[14px] font-medium text-[#1a1a2e]">
              {tt("Why are you leaving?")} <span className="font-normal text-[#8a8f98]">{tt("Optional")}</span>
            </p>
            <div role="radiogroup" aria-labelledby="cancel-why" className="mt-2.5 space-y-1.5">
              {CANCEL_REASONS.map((r) => {
                const on = reason === r.key
                return (
                  <button
                    key={r.key}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setReason(on ? null : r.key)}
                    data-cancel-reason={r.key}
                    className={cn(REASON_ROW, on ? "border-[#1a1a2e] bg-white text-[#1a1a2e] shadow-[0_1px_2px_rgba(16,24,40,0.08)]" : "border-[#e6e8ec] bg-white text-[#374151] hover:bg-[#fafbfc] active:bg-[#f4f5f7]")}
                  >
                    <span aria-hidden className={cn("relative flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border transition-colors duration-150", on ? "border-[#1a1a2e]" : "border-[#c9ccd2]")}>
                      <span className={cn("h-2 w-2 rounded-full bg-[#1a1a2e] transition-[scale,opacity] duration-150 ease-out motion-reduce:transition-none", on ? "scale-100 opacity-100" : "scale-50 opacity-0")} />
                    </span>
                    <span className="min-w-0">{r.label}</span>
                  </button>
                )
              })}
            </div>
            <label className="mt-3 block">
              <span className="sr-only">{tt("Anything else to tell us")}</span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, CANCEL_NOTE_MAX))}
                rows={2}
                maxLength={CANCEL_NOTE_MAX}
                placeholder={tt("Anything else you'd like us to know")}
                className="block w-full resize-none rounded-xl border border-[#e6e8ec] bg-white px-3.5 py-2.5 text-[16px] leading-snug text-[#1a1a2e] shadow-[0_1px_1px_rgba(16,24,40,0.03)] outline-none placeholder:text-[#9ca3af] focus:border-[#c9ccd2] focus:ring-2 focus:ring-[#1a1a2e]/10 sm:text-[14.5px]"
                data-cancel-note=""
              />
            </label>
          </div>
        </div>

        <div className={cn("shrink-0 border-t border-[#f0f1f3] bg-white", phone ? "px-5 pb-[calc(16px+env(safe-area-inset-bottom,0px))] pt-3" : "px-6 py-4")}>
          {error ? (
            <p role="alert" className="mb-3 text-[13px] text-[#b42318]">
              {error}
            </p>
          ) : null}
          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={close}
              disabled={busy}
              data-cancel-keep=""
              className="inline-flex h-11 flex-1 items-center justify-center rounded-xl border border-[#e3e5e9] bg-white text-[15px] font-medium text-[#1a1a2e] shadow-[0_1px_1px_rgba(16,24,40,0.05)] outline-none transition-[background-color] duration-150 hover:bg-[#f8f9fa] active:bg-[#eef0f2] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20 disabled:opacity-60 [-webkit-tap-highlight-color:transparent]"
            >
              {tt("Keep {planName}", { planName })}
            </button>
            <button
              type="button"
              onClick={() => {
                if (!busy) onConfirm({ reason, note: note.trim() })
              }}
              aria-busy={busy}
              data-cancel-confirm=""
              className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-[#a61f15] bg-[#b42318] text-[15px] font-semibold text-white shadow-[0_1px_1.5px_rgba(16,24,40,0.18),inset_0_1px_0_rgba(255,255,255,0.10)] outline-none transition-[background-color] duration-150 hover:bg-[#a11f15] active:bg-[#8f1b12] focus-visible:ring-2 focus-visible:ring-[#b42318]/30 [-webkit-tap-highlight-color:transparent]"
            >
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  {tt("Cancelling")}
                </>
              ) : (
                tt("Cancel plan")
              )}
            </button>
          </div>
        </div>
      </div>
    </SheetDialog>
  )
}
