"use client"

import { Check, RefreshCw } from "lucide-react"
import { Shimmer, ShimmerBlock } from "@/components/ui/shimmer"
import { cn } from "@/lib/utils"
import { PAYMENTS_SURFACE } from "@/components/app/settings/payments-layout"
import { AmexMark, ApplePayMark, GooglePayMark, MastercardMark, StorelibPaymentsBrand, VisaMark } from "./payment-marks"

function pillTone(status: string): string {
  if (status === "Payments active") return "bg-[#dcfce7] text-[#166534]"
  if (status === "Under review") return "bg-[#e0e7ff] text-[#3730a3]"
  return "bg-[#fef3c7] text-[#92400e]"
}

function StatusPill({ status, className }: { status: string; className?: string }) {
  return (
    <span className={cn("inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium sm:text-[12px]", pillTone(status), className)}>
      {status}
    </span>
  )
}

function PaymentsCardHeader({
  status,
  onRefresh,
  refreshing,
  statusPlaceholder,
}: {
  status?: string
  onRefresh?: () => void
  refreshing?: boolean
  statusPlaceholder?: boolean
}) {
  return (
    <div className="flex items-center gap-3 px-4 pb-3 pt-4 sm:px-6 sm:pt-5">
      <StorelibPaymentsBrand size="lg" className="flex-1" />
      {statusPlaceholder ? (
        <ShimmerBlock className="h-6 w-[104px] shrink-0 rounded-full" />
      ) : status ? (
        <StatusPill status={status} className="shrink-0" />
      ) : null}
      {onRefresh ? (
        <button
          type="button"
          aria-label="Refresh status"
          disabled={refreshing}
          onClick={onRefresh}
          className="hidden h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-[#e5e7eb] bg-white text-[#6b7280] shadow-[inset_0_-1px_0_rgba(0,0,0,0.06)] transition-colors hover:bg-[#f7f7f8] hover:text-[#1a1a2e] disabled:opacity-60 sm:flex"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
        </button>
      ) : null}
    </div>
  )
}

const FEATURES = ["Cards, Apple Pay, Google Pay and local methods", "Payouts straight to your bank", "Fraud checks on every payment"]

function PaymentsFeatures() {
  return (
    <div className="space-y-2.5 px-4 pb-4 sm:px-6">
      <ul className="space-y-2 rounded-xl bg-[#f7f7f8] px-3.5 py-3 text-[13px] text-[#1f2937]">
        {FEATURES.map((line) => (
          <li key={line} className="flex items-start gap-2">
            <Check className="mt-[3px] h-3.5 w-3.5 shrink-0 text-[#16a34a]" strokeWidth={2.5} />
            {line}
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-2 rounded-xl border border-[#eceef1] px-3.5 py-2.5">
        <span className="min-w-0 truncate text-[13px] text-[#1a1a2e]">Payment methods</span>
        <span className="ml-auto flex shrink-0 items-center gap-1.5">
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
  )
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
      className={cn(PAYMENTS_SURFACE, "overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white text-left shadow-[0_1px_2px_rgba(16,24,40,0.04)]")}
      data-storelib-payments-card=""
    >
      <PaymentsCardHeader status={status} onRefresh={onRefresh} refreshing={refreshing} />

      {quiet ? null : <PaymentsFeatures />}

      {children}
      {footer}
    </section>
  )
}

/** The card while the overview loads: the same header and selling points, the action as light gray shapes. */
export function StorelibPaymentsCardLoading() {
  return (
    <section
      className={cn(PAYMENTS_SURFACE, "overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white text-left shadow-[0_1px_2px_rgba(16,24,40,0.04)]")}
      aria-busy="true"
      aria-label="Loading payments"
      data-storelib-payments-card=""
      data-storelib-payments-loading-card=""
    >
      <PaymentsCardHeader statusPlaceholder />
      <PaymentsFeatures />
      <Shimmer className="border-t border-[#f1f2f4] px-4 py-8 sm:px-10 sm:py-12" label="Loading">
        <ShimmerBlock className="mx-auto h-5 w-[min(100%,280px)] rounded-full" />
        <ShimmerBlock className="mx-auto mt-3 h-4 w-[min(100%,220px)] rounded-full" />
        <ShimmerBlock className="mx-auto mt-6 h-11 w-full max-w-[200px] rounded-xl" />
      </Shimmer>
    </section>
  )
}

