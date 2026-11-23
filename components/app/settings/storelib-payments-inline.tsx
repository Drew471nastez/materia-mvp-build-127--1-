"use client"

/**
 * Same Storelib Payments setup as Settings → Payments, for Payouts (and other surfaces).
 */
import { StorelibPaymentsSettings } from "@/components/app/settings/storelib-payments-settings"
import type { Overview } from "@/components/app/settings/payments-hub-shared"

export function StorelibPaymentsInline({ compact, manageRequest, openAs, panelOnly, onPanelShown, initial }: { compact?: boolean; manageRequest?: number; openAs?: "setup" | null; panelOnly?: boolean; onPanelShown?: () => void; initial?: Overview | null }) {
  if (panelOnly) return <StorelibPaymentsSettings compact manageRequest={manageRequest} openAs={openAs} panelOnly onPanelShown={onPanelShown} />
  return (
    <div data-storelib-payments-inline="">
      <StorelibPaymentsSettings compact={compact} manageRequest={manageRequest} openAs={openAs} initial={initial} />
    </div>
  )
}
