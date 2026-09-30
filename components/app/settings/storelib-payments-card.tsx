"use client"

import * as React from "react"
import { Check, CreditCard, RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"

function StripeMark() {
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-[#635bff] text-[18px] font-semibold leading-none text-white" aria-hidden>
      S
    </span>
  )
}

function Brand({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex h-5 items-center rounded-[4px] border border-[#e5e7eb] bg-white px-1 text-[9px] font-bold tracking-tight text-[#1a1a2e]", className)}>
      {children}
    </span>
  )
}

export function StorelibPaymentsCard({
  status,
  onRefresh,
  refreshing,
  children,
  footer,
}: {
  status: { label: string; tone: "amber" | "green" | "gray" }
  onRefresh?: () => void
  refreshing?: boolean
  children?: React.ReactNode
  footer?: React.ReactNode
}) {
  const pill = status.tone === "green" ? "bg-[#d1fae5] text-[#047857]" : status.tone === "amber" ? "bg-[#fef3c7] text-[#92400e]" : "bg-[#f3f4f6] text-[#4b5563]"
  return (
    <section className="overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white shadow-sm" data-storelib-payments-card="">
      <div className="flex items-start gap-3 px-4 py-4 sm:px-5">
        <StripeMark />
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-semibold text-[#111827]">Storelib Payments</h3>
          <p className="text-[12px] text-[#6b7280]">Card payments by Stripe · processing rates vary by country</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className={cn("rounded-full px-2.5 py-1 text-[12px] font-medium", pill)}>{status.label}</span>
          {onRefresh ? (
            <button
              type="button"
              aria-label="Refresh status"
              disabled={refreshing}
              onClick={onRefresh}
              className="flex h-8 w-8 items-center justify-center rounded-full text-[#6b7280] hover:bg-[#f3f4f6] disabled:opacity-50"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
            </button>
          ) : null}
        </div>
      </div>

      <div className="mx-4 mb-4 rounded-xl bg-[#f7f7f8] px-4 py-3 sm:mx-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#6b7280]">Your payment account</p>
        <ul className="mt-2 space-y-1.5 text-[13px] text-[#1f2937]">
          <li className="flex gap-2"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#16a34a]" /> Cards, Apple Pay, Google Pay and local methods</li>
          <li className="flex gap-2"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#16a34a]" /> Payouts go to your bank account</li>
          <li className="flex gap-2"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#16a34a]" /> Fraud checks on each payment</li>
        </ul>
      </div>

      <div className="mx-4 mb-4 flex items-center gap-3 rounded-xl border border-[#e5e7eb] px-3.5 py-3 sm:mx-5">
        <CreditCard className="h-4 w-4 shrink-0 text-[#6b7280]" />
        <span className="text-[13px] text-[#111827]">Available payment methods</span>
        <span className="ml-auto flex items-center gap-1">
          <Brand className="text-[#1a1f71]">VISA</Brand>
          <Brand className="text-[#eb001b]">MC</Brand>
          <Brand className="text-[#2e77bc]">AMEX</Brand>
          <Brand>Pay</Brand>
          <span className="text-[11px] text-[#6b7280]">+ more</span>
        </span>
      </div>

      {children}
      {footer}
    </section>
  )
}

export function StorelibPaymentsCardSkeleton() {
  return (
    <section className="overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white shadow-sm" aria-busy="true" aria-label="Loading payments">
      <div className="flex items-center gap-3 px-5 py-4">
        <div className="h-10 w-10 rounded-[10px] bg-[#f3f4f6]" />
        <div className="h-4 w-40 rounded bg-[#f3f4f6]" />
      </div>
      <div className="mx-5 mb-4 h-24 rounded-xl bg-[#f7f7f8]" />
      <div className="mx-5 mb-4 h-12 rounded-xl border border-[#e5e7eb]" />
      <div className="h-28 border-t border-[#f3f4f6]" />
    </section>
  )
}
