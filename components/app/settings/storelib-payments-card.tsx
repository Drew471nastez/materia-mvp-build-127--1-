"use client"

import * as React from "react"
import { Check, CreditCard, RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"
import { BADGE_COPY, type StorelibPaymentsBadge } from "@/lib/payments/stripe/creator-badge"

const BADGE_CLASS: Record<StorelibPaymentsBadge, string> = {
  setup: "bg-[#f3f4f6] text-[#4b5563]",
  review: "bg-[#fef3c7] text-[#92400e]",
  action: "bg-[#ffedd5] text-[#c2410c]",
  active: "bg-[#d1fae5] text-[#047857]",
}

export function StorelibPaymentsMark({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#1a1a2e] text-[13px] font-bold tracking-tight text-white",
        className,
      )}
      aria-hidden
    >
      SL
    </div>
  )
}

export function StorelibPaymentsCard({
  badge,
  checkoutOpen,
  onRefresh,
  refreshing,
  onPrimaryAction,
  primaryDisabled,
  children,
  footer,
}: {
  badge: StorelibPaymentsBadge
  checkoutOpen: boolean
  onRefresh?: () => void
  refreshing?: boolean
  onPrimaryAction?: () => void
  primaryDisabled?: boolean
  children?: React.ReactNode
  footer?: React.ReactNode
}) {
  const copy = BADGE_COPY[badge]
  const showCta = copy.cta && badge === "setup" && onPrimaryAction

  return (
    <section className="overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white shadow-sm">
      <div className="border-b border-[#f0f1f3] px-4 py-4 sm:px-5 sm:py-4">
        <div className="flex items-start gap-3">
          <StorelibPaymentsMark />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-[15px] font-semibold text-[#1a1a2e] sm:text-[16px]">Storelib Payments</h3>
              <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", BADGE_CLASS[badge])}>{copy.label}</span>
            </div>
            <p className="mt-0.5 text-[12px] text-[#9ca3af]">No extra Storelib transaction fees · Card rates vary by country</p>
          </div>
          {onRefresh ? (
            <button
              type="button"
              aria-label="Refresh status"
              disabled={refreshing}
              onClick={onRefresh}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#e5e7eb] text-[#6b7280] transition-colors hover:bg-[#f9fafb] disabled:opacity-50"
            >
              <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
            </button>
          ) : null}
        </div>
      </div>

      <div className="space-y-4 px-4 py-4 sm:px-5 sm:py-5">
        <div className="rounded-xl border border-[#d1fae5]/80 bg-[#ecfdf5]/60 px-3.5 py-3 sm:px-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[#6b7280]">Your payment account</p>
          <ul className="mt-2 space-y-1.5 text-[13px] text-[#374151]">
            <li className="flex items-start gap-2"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#047857]" /> Cards, Apple Pay, Google Pay and local methods</li>
            <li className="flex items-start gap-2"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#047857]" /> Payouts to your bank account</li>
            <li className="flex items-start gap-2"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#047857]" /> Fraud protection built in</li>
          </ul>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-y border-[#f0f1f3] py-3">
          <div className="flex items-center gap-2 text-[12px] font-medium text-[#6b7280]">
            <CreditCard className="h-4 w-4" />
            Payment methods
          </div>
          <p className="text-[12px] text-[#9ca3af]">Visa · Mastercard · Amex · Apple Pay · Google Pay</p>
        </div>

        <div className="min-h-[52px]">
          <p className="text-[14px] font-medium text-[#1a1a2e]">{copy.line}</p>
          <p className="mt-1 text-[12px] text-[#9ca3af]">
            {checkoutOpen ? "Checkout is on for your products." : "Checkout stays off until setup is finished."}
          </p>
        </div>

        {showCta ? (
          <div className="flex flex-col items-center gap-2 border-t border-[#f0f1f3] pt-5 text-center">
            <p className="text-[15px] font-semibold text-[#1a1a2e]">Set up payments to start accepting money</p>
            <p className="max-w-md text-[12px] leading-5 text-[#6b7280]">
              Storelib uses a regulated payment partner to verify your identity and pay you securely. You will not need a separate merchant account.
            </p>
            <button
              type="button"
              disabled={primaryDisabled}
              onClick={onPrimaryAction}
              className="mt-2 inline-flex h-11 min-w-[200px] items-center justify-center rounded-xl bg-[#1a1a2e] px-6 text-[14px] font-semibold text-white transition-colors hover:bg-[#26262b] disabled:opacity-60"
            >
              {copy.cta}
            </button>
          </div>
        ) : null}

        {children}

        {footer}
      </div>
    </section>
  )
}
