"use client"

/**
 * Same Storelib Payments setup as Settings → Payments, for Payouts (and other surfaces).
 */
import { StorelibPaymentsSettings } from "@/components/app/settings/storelib-payments-settings"

export function StorelibPaymentsInline({ compact }: { compact?: boolean }) {
  return (
    <div className={compact ? "mt-2 max-w-[720px]" : undefined} data-storelib-payments-inline="">
      <StorelibPaymentsSettings compact={compact} />
    </div>
  )
}
