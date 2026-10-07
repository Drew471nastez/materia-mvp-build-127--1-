"use client"

/**
 * Same Storelib Payments setup as Settings → Payments, for Payouts (and other surfaces).
 */
import { StorelibPaymentsSettings } from "@/components/app/settings/storelib-payments-settings"

export function StorelibPaymentsInline({ compact, manageRequest, openAs, panelOnly, onPanelShown }: { compact?: boolean; manageRequest?: number; openAs?: "setup" | null; panelOnly?: boolean; onPanelShown?: () => void }) {
  if (panelOnly) return <StorelibPaymentsSettings compact manageRequest={manageRequest} openAs={openAs} panelOnly onPanelShown={onPanelShown} />
  return (
    <div data-storelib-payments-inline="">
      <StorelibPaymentsSettings compact={compact} manageRequest={manageRequest} openAs={openAs} />
    </div>
  )
}
