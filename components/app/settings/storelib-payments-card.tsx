"use client"

import * as React from "react"
import { CreditCard, Landmark, RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"

const BRANDS = ["Visa", "Mastercard", "Amex", "Apple Pay", "Google Pay"] as const

function Dot({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={cn("h-2 w-2 shrink-0 rounded-full", on ? "bg-[#16a34a]" : "bg-[#d1d5db]")}
    />
  )
}

export function StorelibPaymentsCard({
  accepting,
  payingOut,
  bankLine,
  manageLabel,
  onManage,
  manageDisabled,
  onRefresh,
  refreshing,
  children,
}: {
  accepting: boolean
  payingOut: boolean
  bankLine: string
  manageLabel: string
  onManage?: () => void
  manageDisabled?: boolean
  onRefresh?: () => void
  refreshing?: boolean
  children?: React.ReactNode
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white shadow-sm" data-storelib-payments-card="">
      <div className="flex items-center justify-between gap-3 px-4 py-4 sm:px-5">
        <h3 className="text-[15px] font-semibold tracking-tight text-[#111827]">Storelib Payments</h3>
        <div className="flex items-center gap-1.5">
          {onRefresh ? (
            <button
              type="button"
              aria-label="Refresh status"
              disabled={refreshing}
              onClick={onRefresh}
              className="flex h-8 w-8 items-center justify-center rounded-full text-[#6b7280] transition-colors hover:bg-[#f3f4f6] disabled:opacity-50"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
            </button>
          ) : null}
          {onManage ? (
            <button
              type="button"
              disabled={manageDisabled}
              onClick={onManage}
              className="inline-flex h-8 items-center justify-center rounded-full bg-[#f3f4f6] px-3.5 text-[13px] font-medium text-[#111827] transition-colors hover:bg-[#e5e7eb] disabled:opacity-60"
            >
              {manageLabel}
            </button>
          ) : null}
        </div>
      </div>

      <div className="mx-3 mb-3 overflow-hidden rounded-xl border border-[#e5e7eb] sm:mx-4">
        <div className="grid grid-cols-2 divide-x divide-[#e5e7eb]">
          <div className="flex min-h-12 items-center gap-2 px-3.5 py-3 text-[13px] font-medium text-[#111827]">
            <Dot on={accepting} />
            {accepting ? "Accepting payments" : "Not accepting yet"}
          </div>
          <div className="flex min-h-12 items-center gap-2 px-3.5 py-3 text-[13px] font-medium text-[#111827]">
            <Dot on={payingOut} />
            {payingOut ? "Receiving payouts" : "Payouts not set up"}
          </div>
        </div>

        <button
          type="button"
          onClick={onManage}
          disabled={!onManage || manageDisabled}
          className="flex min-h-12 w-full items-center gap-3 border-t border-[#e5e7eb] px-3.5 py-3 text-left transition-colors hover:bg-[#fafafa] disabled:hover:bg-transparent"
        >
          <CreditCard className="h-4 w-4 shrink-0 text-[#6b7280]" />
          <span className="text-[13px] text-[#111827]">Payment methods</span>
          <span className="ml-auto flex min-w-0 items-center gap-1">
            {BRANDS.slice(0, 3).map((name) => (
              <span key={name} className="hidden rounded-md border border-[#e5e7eb] bg-white px-1.5 py-0.5 text-[10px] font-semibold text-[#374151] sm:inline">
                {name === "Mastercard" ? "MC" : name === "Apple Pay" ? "Pay" : name}
              </span>
            ))}
            <span className="rounded-full bg-[#f3f4f6] px-1.5 py-0.5 text-[11px] font-medium text-[#6b7280]">+{BRANDS.length}</span>
          </span>
        </button>

        <button
          type="button"
          onClick={onManage}
          disabled={!onManage || manageDisabled}
          className="flex min-h-12 w-full items-center gap-3 border-t border-[#e5e7eb] px-3.5 py-3 text-left transition-colors hover:bg-[#fafafa] disabled:hover:bg-transparent"
        >
          <Landmark className="h-4 w-4 shrink-0 text-[#6b7280]" />
          <span className="text-[13px] text-[#111827]">Payouts</span>
          <span className="ml-auto truncate text-[13px] text-[#6b7280]">{bankLine}</span>
        </button>
      </div>

      <div className="border-t border-[#f3f4f6] bg-[#f9fafb] px-4 py-3 text-[13px] leading-5 text-[#6b7280] sm:px-5">
        Storelib Payments sends each sale to your bank. Card processing rates vary by country and currency.
      </div>

      {children}
    </section>
  )
}

export function StorelibPaymentsCardSkeleton() {
  return (
    <section className="overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white shadow-sm" aria-busy="true" aria-label="Loading payments">
      <div className="flex items-center justify-between px-4 py-4 sm:px-5">
        <div className="h-4 w-36 rounded bg-[#f3f4f6]" />
        <div className="h-8 w-16 rounded-full bg-[#f3f4f6]" />
      </div>
      <div className="mx-3 mb-3 overflow-hidden rounded-xl border border-[#e5e7eb] sm:mx-4">
        <div className="grid grid-cols-2 divide-x divide-[#e5e7eb]">
          <div className="h-12 bg-[#fafafa]" />
          <div className="h-12 bg-[#fafafa]" />
        </div>
        <div className="h-12 border-t border-[#e5e7eb]" />
        <div className="h-12 border-t border-[#e5e7eb]" />
      </div>
      <div className="h-12 border-t border-[#f3f4f6] bg-[#f9fafb]" />
    </section>
  )
}
