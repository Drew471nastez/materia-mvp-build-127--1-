"use client"

import { Check, RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"
import { AmexMark, ApplePayMark, GooglePayMark, MastercardMark, StripeMark, VisaMark } from "./payment-marks"

function pillTone(status: string): string {
  if (status === "Payments active") return "bg-[#dcfce7] text-[#166534]"
  if (status === "Under review") return "bg-[#e0e7ff] text-[#3730a3]"
  return "bg-[#fef3c7] text-[#92400e]"
}

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
  /** Only the header: the selling points and the payment methods are for a creator not set up yet. */
  quiet?: boolean
  children?: React.ReactNode
  footer?: React.ReactNode
}) {
  return (
    <section
      className="mx-auto w-full max-w-[720px] overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white text-left shadow-[0_1px_2px_rgba(16,24,40,0.04)]"
      data-storelib-payments-card=""
    >
      <div className="flex items-center gap-3 px-4 pb-3 pt-4 sm:px-5 sm:pt-5">
        <StripeMark className="h-10 w-10 shrink-0" />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[15px] font-semibold leading-5 text-[#1a1a2e]">Storelib Payments</h3>
          <p className="truncate text-[12px] leading-4 text-[#6b7280] max-sm:hidden">Powered by Stripe</p>
          <span className={cn("mt-1 inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium sm:hidden", pillTone(status))}>{status}</span>
        </div>
        <span className={cn("shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[12px] font-medium max-sm:hidden", pillTone(status))}>{status}</span>
        {onRefresh ? (
          <button
            type="button"
            aria-label="Refresh status"
            disabled={refreshing}
            onClick={onRefresh}
            className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-[#e5e7eb] bg-white text-[#6b7280] shadow-[inset_0_-1px_0_rgba(0,0,0,0.06)] transition-colors hover:bg-[#f7f7f8] hover:text-[#1a1a2e] disabled:opacity-60"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
          </button>
        ) : null}
      </div>

      {quiet ? null : (
        <div className="space-y-2.5 px-4 pb-4 sm:px-5">
          <ul className="space-y-2 rounded-xl bg-[#f7f7f8] px-3.5 py-3 text-[13px] text-[#1f2937]">
            {["Cards, Apple Pay, Google Pay and local methods", "Payouts straight to your bank", "Fraud checks on every payment"].map((line) => (
              <li key={line} className="flex items-start gap-2">
                <Check className="mt-[3px] h-3.5 w-3.5 shrink-0 text-[#16a34a]" strokeWidth={2.5} />
                {line}
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-2 rounded-xl border border-[#eceef1] px-3.5 py-2.5">
            <span className="text-[13px] text-[#1a1a2e]">Payment methods</span>
            <span className="ml-auto flex items-center gap-1.5">
              <VisaMark />
              <MastercardMark />
              <AmexMark />
              <span className="hidden items-center gap-1.5 sm:flex">
                <ApplePayMark />
                <GooglePayMark />
              </span>
            </span>
          </div>
        </div>
      )}

      {children}
      {footer}
    </section>
  )
}

export function StorelibPaymentsCardSkeleton() {
  return (
    <section className="mx-auto w-full max-w-[720px] overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white p-5" aria-busy="true" aria-label="Loading payments">
      <div className="flex items-center gap-3">
        <span className="h-10 w-10 animate-pulse rounded-[10px] bg-[#f1f2f4]" />
        <div className="flex-1 space-y-2">
          <span className="block h-3 w-36 animate-pulse rounded-full bg-[#f1f2f4]" />
          <span className="block h-2.5 w-24 animate-pulse rounded-full bg-[#f1f2f4]" />
        </div>
      </div>
      <span className="mt-5 block h-24 animate-pulse rounded-xl bg-[#f7f7f8]" />
      <span className="mt-3 block h-11 animate-pulse rounded-xl bg-[#f7f7f8]" />
    </section>
  )
}
