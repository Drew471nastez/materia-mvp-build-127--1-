import "server-only"

/**
 * The tax a store's orders carried in a period, read by the store (lib/analytics/creator-orders scopedOrders), and the
 * store's tax status in words. The figures come from lib/tax/report-model.ts. Nothing here files or pays tax anywhere.
 */
import { byCreator, ownRows, scopedOrders } from "@/lib/analytics/creator-orders"
import { stripeTaxOn } from "./membership"
import { summarizeTax, type TaxOrderRow, type TaxPeriod, type TaxSummary } from "./report-model"
import type { TaxSetup } from "./server"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any

const COLUMNS = "id, tax_cents, tax_country, tax_label, status, created_at"
/* With what a refund gave back and the order's currency, so a part refund keeps part of its tax (report-model keptTax). */
const FULL_COLUMNS = `${COLUMNS}, amount_cents, refund_amount_cents, currency`

export async function taxOrders(admin: Admin, creatorId: string, days: TaxPeriod): Promise<TaxOrderRow[]> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString()
  const read = async (columns: string) => {
    const rows = await byCreator(async (scope) => {
      const { data, error } = await scopedOrders(admin, columns, scope, creatorId, null).gt("tax_cents", 0).gte("created_at", since).order("created_at", { ascending: false }).limit(5000)
      if (error) throw new Error(error.message)
      return (data ?? []) as TaxOrderRow[]
    })
    return ownRows(rows)
  }
  try {
    return await read(FULL_COLUMNS)
  } catch {
    try {
      /* An older database without the refund columns: the tax as charged. */
      return await read(COLUMNS)
    } catch {
      /* Before the taxes part (78/110) there is no tax column: nothing collected to show. */
      return []
    }
  }
}

export interface TaxStatusLine {
  key: "store" | "memberships"
  /** Which of the lines below it is, so the panel says it in the dashboard's language (taxes-panel statusWords). */
  state: "charging" | "no_region" | "off" | "auto" | "own_rates" | "none"
  /** Regions the store charges in, and whether digital sales are taxed too. */
  count: number
  digital: boolean
  title: string
  detail: string
  tone: "on" | "off" | "auto"
}

/** The store's tax in two plain lines: its own sales, and memberships (which Storelib's Stripe account takes). */
export function taxStatus(setup: Pick<TaxSetup, "enabled" | "digital" | "regions">): TaxStatusLine[] {
  const regions = setup.regions.length
  const store: TaxStatusLine = setup.enabled && regions
    ? { key: "store", state: "charging", count: regions, digital: setup.digital, tone: "on", title: `Charging tax in ${regions} ${regions === 1 ? "region" : "regions"}`, detail: setup.digital ? "On physical and digital sales, at the rates you set below." : "On physical sales, at the rates you set below. Digital sales are not taxed (switch below)." }
    : setup.enabled
      ? { key: "store", state: "no_region", count: 0, digital: setup.digital, tone: "off", title: "Tax is on, but no region is set", detail: "Nothing is charged until you add a region below." }
      : { key: "store", state: "off", count: 0, digital: setup.digital, tone: "off", title: "Not charging tax", detail: "Buyers pay your prices and nothing more." }
  const memberships: TaxStatusLine = stripeTaxOn()
    ? { key: "memberships", state: "auto", count: regions, digital: setup.digital, tone: "auto", title: "Memberships: worked out automatically", detail: "Community plans and memberships are charged through Storelib's Stripe account, and Stripe Tax works out the rate from where the buyer is, on every renewal." }
    : setup.enabled && setup.digital && regions
      ? { key: "memberships", state: "own_rates", count: regions, digital: setup.digital, tone: "on", title: "Memberships: your rates", detail: "Community plans and memberships charge your rate for the buyer's country, on every renewal." }
      : { key: "memberships", state: "none", count: 0, digital: setup.digital, tone: "off", title: "Memberships: no tax", detail: "Turn on tax on digital products and add a region to charge it on memberships." }
  return [store, memberships]
}

export async function taxOverview(admin: Admin, creatorId: string, setup: TaxSetup, days: TaxPeriod, currency?: string): Promise<{ status: TaxStatusLine[]; summary: TaxSummary; days: TaxPeriod }> {
  const rows = await taxOrders(admin, creatorId, days)
  return { status: taxStatus(setup), summary: summarizeTax(rows, currency), days }
}
