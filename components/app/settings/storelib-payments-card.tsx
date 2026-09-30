"use client"

import { Check, RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"
import { AmexMark, ApplePayMark, GooglePayMark, MastercardMark, StripeMark, VisaMark } from "./payment-marks"

export function StorelibPaymentsCard({
  status,
  onRefresh,
  refreshing,
  quiet,
  children,
  footer,
}: {
  status: string
  onRefresh?: () => void
  refreshing?: boolean
  quiet?: boolean
  children?: React.ReactNode
  footer?: React.ReactNode
}) {
  const live = status === "Payments active"
  return (
    <section className="mx-auto w-full max-w-[560px] overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white text-left shadow-sm" data-storelib-payments-card="">
      <div className="flex flex-wrap items-start gap-3 px-4 py-4 sm:px-5">
        <StripeMark />
        <div className="min-w-0 flex-1 pt-0.5">
          <h3 className="text-[15px] font-semibold text-[#111827]">Storelib Payments</h3>
          <p className="text-[12px] text-[#6b7280]">Card payments by Stripe</p>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <span className={cn("rounded-full px-2.5 py-1 text-[12px] font-medium", live ? "bg-[#d1fae5] text-[#047857]" : "bg-[#fef3c7] text-[#92400e]")}>{status}</span>
          {onRefresh ? (
            <button type="button" aria-label="Refresh status" disabled={refreshing} onClick={onRefresh} className="flex h-8 w-8 items-center justify-center rounded-full text-[#6b7280] hover:bg-[#f3f4f6] disabled:opacity-50">
              <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
            </button>
          ) : null}
        </div>
      </div>

      {quiet ? null : (
      <div className="mx-4 mb-3 rounded-xl bg-[#f7f7f8] px-3.5 py-3 sm:mx-5">
        <ul className="space-y-1.5 text-[13px] text-[#1f2937]">
          <li className="flex gap-2"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#16a34a]" /> Cards, Apple Pay and Google Pay</li>
          <li className="flex gap-2"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#16a34a]" /> Payouts to your bank</li>
        </ul>
      </div>
      )}

      {quiet ? null : <div className="mx-4 mb-4 flex items-center gap-2 rounded-xl border border-[#e5e7eb] px-3 py-2.5 sm:mx-5">
        <span className="text-[13px] text-[#111827]">Payment methods</span>
        <span className="ml-auto flex items-center gap-1.5">
          <VisaMark />
          <MastercardMark />
          <AmexMark />
          <span className="hidden sm:contents"><ApplePayMark /><GooglePayMark /></span>
        </span>
      </div>}

      {children}
      {footer}
    </section>
  )
}

export function StorelibPaymentsCardSkeleton() {
  return (
    <section className="mx-auto h-[280px] w-full max-w-[560px] rounded-2xl border border-[#e5e7eb] bg-white" aria-busy="true" aria-label="Loading payments" />
  )
}

export function SetupSteps({ step }: { step: 1 | 2 | 3 }) {
  const items = ["Personal info", "Verification", "Bank account"]
  return (
    <ol className="mb-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-[12px] text-[#6b7280]">
      {items.map((label, i) => {
        const n = (i + 1) as 1 | 2 | 3
        const on = n === step
        return (
          <li key={label} className="flex items-center gap-2">
            <span className={cn("flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold", on ? "bg-[#111827] text-white" : "bg-[#f3f4f6] text-[#6b7280]")}>{n}</span>
            <span className={on ? "font-medium text-[#111827]" : undefined}>{label}</span>
          </li>
        )
      })}
    </ol>
  )
}
