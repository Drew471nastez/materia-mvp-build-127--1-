"use client"

/**
 * Same Storelib Payments setup as Settings → Payments, for Payouts (and other surfaces).
 */
import { StorelibPaymentsSettings } from "@/components/app/settings/storelib-payments-settings"

export function StorelibPaymentsInline({ compact, manageRequest }: { compact?: boolean; manageRequest?: number }) {
  return (
    <div className="mx-auto mt-2 w-full max-w-[560px]" data-storelib-payments-inline="">
      <StorelibPaymentsSettings compact={compact} manageRequest={manageRequest} />
    </div>
  )
}
