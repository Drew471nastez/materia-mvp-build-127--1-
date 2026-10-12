/**
 * THE SMALL SUMMARY ON THE WEBSITE AND ONEPAGE SCREENS: what it counts, how
 * it reads, and where it links. Pure, for the endpoint
 * (app/api/analytics/summary), the line (components/app/analytics-summary-line)
 * and the tests.
 */
import { propertyParam, type PropertySelector } from "./properties"
import { tt } from "@/lib/i18n/text"
import { appLocale } from "@/lib/i18n/format"

/** The period the line counts: the Analytics page's own "Last 30 days", so the link opens on the same numbers. */
export const SUMMARY_PRESET = "last_30_days" as const

/** Analytics, on the same period, already filtered to this place. */
export function summaryHref(selector: PropertySelector): string {
  const p = new URLSearchParams({ range: SUMMARY_PRESET })
  const property = propertyParam(selector)
  if (property) p.set("property", property)
  return `/app/analytics?${p.toString()}`
}

const count = new Intl.NumberFormat(appLocale())

/** "Last 30 days: 1,240 visitors · 18 orders", or "No visits yet" before anybody came. */
export function summaryText(s: { visitors: number; orders: number }): string {
  if (s.visitors <= 0 && s.orders <= 0) return tt("No visits yet")
  const v = `${count.format(s.visitors)} ${s.visitors === 1 ? "visitor" : "visitors"}`
  const o = `${count.format(s.orders)} ${s.orders === 1 ? "order" : "orders"}`
  return tt("Last 30 days: {v} · {o}", { v, o })
}
