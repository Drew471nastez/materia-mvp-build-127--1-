/**
 * ===========================================================================
 *  REPORTS IN THE STORE'S CURRENCY, FROM EACH SALE'S OWN DAY
 * ===========================================================================
 * Every order keeps the currency it was charged in (orders.currency): a lei
 * store has lei orders from its website, euro orders from a market, dollar
 * orders from Storelib's marketplace and its dollar plans. Adding their cents
 * together as one number was never a total of anything.
 *
 * So before a report adds anything up, each order is turned into the store's
 * currency at the European Central Bank's rate of the order's own day (the
 * last published day before it, at most a week back, for weekends and
 * holidays), from the same daily rates every conversion on Storelib uses
 * (lib/markets/fx-server, fx_rates). That is a reporting figure only:
 *
 *   - the order itself is never changed; a report works on a copy
 *   - an order already in the store's currency is counted exactly as it is
 *   - an order whose day has no rate is NOT guessed: it is left out of the
 *     money and counted, so the page can say how many were not converted
 *   - an order with no currency at all is counted as it is (the column has
 *     had a default since before currencies existed) and counted as unknown,
 *     for the reconciliation report (scripts/reconcile-order-currency.mjs)
 *
 * Pure, so the routes, Home and the tests convert the same way.
 */
import { convertMinor, type FxRates } from "@/lib/markets/money"

/** How far back a day's rates may stand in for a date with none (weekends, holidays). */
export const RATE_LOOKBACK_DAYS = 7

const DAY_MS = 86_400_000

/** One published day's rates, as fx_rates keeps them: per euro. */
export interface DayRates {
  asOf: string
  rates: Record<string, number>
}

/** "2026-10-18" for an instant, in UTC (the ECB's days are calendar days). */
export function dayOf(at: string | number | Date): string | null {
  const t = typeof at === "number" ? at : at instanceof Date ? at.getTime() : Date.parse(at)
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null
}

/**
 * The rates that stand for a date: that day's, else the last published day
 * before it within RATE_LOOKBACK_DAYS. `days` sorted by asOf, oldest first.
 * Null when there is none: the caller converts nothing rather than guess.
 */
export function ratesForDate(days: DayRates[], date: string): FxRates | null {
  const at = Date.parse(`${date}T00:00:00Z`)
  if (!Number.isFinite(at)) return null
  let lo = 0
  let hi = days.length - 1
  let found = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (days[mid].asOf <= date) {
      found = mid
      lo = mid + 1
    } else hi = mid - 1
  }
  if (found < 0) return null
  const day = days[found]
  const dayAt = Date.parse(`${day.asOf}T00:00:00Z`)
  if (!Number.isFinite(dayAt) || at - dayAt > RATE_LOOKBACK_DAYS * DAY_MS) return null
  return { asOf: day.asOf, rates: day.rates }
}

/** The money columns a report reads of an order. */
export interface ReportMoneyRow {
  created_at: string
  currency?: string | null
  amount_cents?: number | null
  refund_amount_cents?: number | null
  tip_cents?: number | null
  tax_cents?: number | null
  shipping_cents?: number | null
  fee_cents?: number | null
  application_fee_cents?: number | null
}

export interface ReportConversion<T> {
  /** The rows to add up: in the store's currency, the unconvertible ones left out. */
  rows: T[]
  /** Rows that were in another currency and were converted. */
  converted: number
  /** Rows in another currency that no rate could convert: left out of the money. */
  unconverted: number
  /** Rows with no currency recorded: counted as they are. */
  unknown: number
}

const MONEY_KEYS = ["amount_cents", "refund_amount_cents", "tip_cents", "tax_cents", "shipping_cents", "fee_cents", "application_fee_cents"] as const

/** "RON" from "ron", null for anything that is not a currency code. */
export function codeOf(raw: unknown): string | null {
  const c = typeof raw === "string" ? raw.trim().toUpperCase() : ""
  return /^[A-Z]{3}$/.test(c) ? c : null
}

/**
 * Each row in `target` (the store's currency), for a report to add up.
 * Never changes the rows it is given; converted rows are copies.
 */
export function inReportingCurrency<T extends ReportMoneyRow>(rows: T[], target: string, days: DayRates[]): ReportConversion<T> {
  const to = codeOf(target)
  const out: T[] = []
  let converted = 0
  let unconverted = 0
  let unknown = 0
  for (const row of rows) {
    const from = codeOf(row.currency)
    if (!from) {
      unknown += 1
      out.push(row)
      continue
    }
    if (!to || from === to) {
      out.push(row)
      continue
    }
    const date = dayOf(row.created_at)
    const fx = date ? ratesForDate(days, date) : null
    const at = date ? Date.parse(`${date}T12:00:00Z`) : NaN
    const copy = { ...row, currency: to.toLowerCase() } as unknown as Record<string, unknown>
    let ok = !!fx
    for (const key of MONEY_KEYS) {
      const v = row[key]
      if (typeof v !== "number" || v === 0 || !ok) continue
      const c = convertMinor(Math.abs(v), from, to, fx, { now: at })
      if (c === null) ok = false
      else copy[key] = v < 0 ? -c : c
    }
    if (!ok) {
      unconverted += 1
      continue
    }
    converted += 1
    out.push(copy as T)
  }
  return { rows: out, converted, unconverted, unknown }
}

/** Whether any row is in a currency other than `target`: the only case a report needs rates at all. */
export function needsConversion(rows: ReportMoneyRow[], target: string): boolean {
  const to = codeOf(target)
  return rows.some((r) => {
    const from = codeOf(r.currency)
    return !!from && !!to && from !== to
  })
}

/** The first and last day the rows cover, for reading just the rates they need. */
export function daySpan(rows: ReportMoneyRow[]): { from: string; to: string } | null {
  let from: string | null = null
  let to: string | null = null
  for (const r of rows) {
    const d = dayOf(r.created_at)
    if (!d) continue
    if (!from || d < from) from = d
    if (!to || d > to) to = d
  }
  return from && to ? { from, to } : null
}
