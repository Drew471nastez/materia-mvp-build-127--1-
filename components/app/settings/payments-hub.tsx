"use client"

/**
 * Settings → Payments (Storelib Payments on Stripe Connect).
 */
import * as React from "react"
import { StorelibPaymentsSettings } from "@/components/app/settings/storelib-payments-settings"

export { money, type Overview } from "@/components/app/settings/payments-hub-shared"

export function PaymentsHub({ statementDescriptorSlot }: { statementDescriptorSlot?: React.ReactNode }) {
  return <StorelibPaymentsSettings statementDescriptorSlot={statementDescriptorSlot} />
}
