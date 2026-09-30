import { decimalsOf } from "@/lib/payments/money"
import type { HubOverview } from "@/lib/payments/hub-types"

export type Overview = HubOverview

export function money(minor: number, currency: string): string {
  const d = decimalsOf(currency)
  const value = minor / 10 ** d
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, minimumFractionDigits: d, maximumFractionDigits: d }).format(value)
  } catch {
    return `${currency} ${value.toFixed(d)}`
  }
}
