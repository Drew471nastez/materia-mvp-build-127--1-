"use client"

/**
 * Same Storelib Payments setup as Settings → Payments, for Payouts (and other surfaces).
 */
import { PAYMENTS_SURFACE } from "@/components/app/settings/payments-layout"
import { cn } from "@/lib/utils"
import { StorelibPaymentsSettings } from "@/components/app/settings/storelib-payments-settings"

export function StorelibPaymentsInline({ compact, manageRequest, panelOnly }: { compact?: boolean; manageRequest?: number; panelOnly?: boolean }) {
  if (panelOnly) return <StorelibPaymentsSettings compact manageRequest={manageRequest} panelOnly />
  return (
    <div className={cn(PAYMENTS_SURFACE, "mt-2")} data-storelib-payments-inline="">
      <StorelibPaymentsSettings compact={compact} manageRequest={manageRequest} />
    </div>
  )
}
