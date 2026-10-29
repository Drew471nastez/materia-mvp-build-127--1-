"use client"

import { useEffect, useId, useMemo, useRef, useState } from "react"
import type { CompetitorPlan } from "@/lib/alternatives/types"
import { compare, grossCents, verdict, MAX_PRICE_CENTS, MAX_SALES, type PlanCost } from "@/lib/alternatives/calculator"
import { bucket, trackAlternatives } from "@/lib/alternatives/track"
import { STORELIB } from "@/lib/alternatives/storelib"

const fmt = (cents: number) =>
  `${cents < 0 ? "-" : ""}$${(Math.abs(cents) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** "12.5" or "12,50" to cents; anything else is 0. */
function toCents(raw: string): number {
  const n = Number(raw.replace(",", ".").replace(/[^\d.]/g, ""))
  return Number.isFinite(n) ? Math.round(n * 100) : 0
}

function toCount(raw: string): number {
  const n = Number(raw.replace(/[^\d]/g, ""))
  return Number.isFinite(n) ? n : 0
}

/**
 * ===========================================================================
 *  THE FEE CALCULATOR ON A COMPARISON PAGE
 * ===========================================================================
 * A price and a number of sales in a month; every plan's cost for that month
 * under it. The sums are lib/alternatives/calculator, which uses Storelib's
 * own fee function. The server renders it with the page's defaults, so the
 * table is there to read without JavaScript; typing recomputes it.
 *
 * A phone gets one block per plan rather than a six column table, from the
 * same rows, so nothing scrolls sideways at 360px.
 */
export function FeeCalculator({
  slug,
  competitor,
  plans,
  defaults,
}: {
  slug: string
  competitor: string
  plans: CompetitorPlan[]
  defaults: { priceDollars: number; sales: number }
}) {
  const id = useId()
  const [price, setPrice] = useState(String(defaults.priceDollars))
  const [sales, setSales] = useState(String(defaults.sales))
  const input = { priceCents: Math.min(MAX_PRICE_CENTS, toCents(price)), sales: Math.min(MAX_SALES, toCount(sales)) }
  const rows = useMemo(() => compare(competitor, plans, input), [competitor, plans, input.priceCents, input.sales]) // eslint-disable-line react-hooks/exhaustive-deps
  const result = verdict(rows)
  const gross = grossCents(input)

  /* One event per settled pair of numbers, a second and a half after the last keystroke, and at most ten a page. */
  const sent = useRef(0)
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    const t = window.setTimeout(() => {
      if (sent.current >= 10) return
      sent.current += 1
      trackAlternatives("Fee calculator used", { page: slug, price: bucket(input.priceCents / 100), sales: bucket(input.sales) })
    }, 1500)
    return () => window.clearTimeout(t)
  }, [slug, input.priceCents, input.sales])

  const anyUnknown = rows.some((r) => r.totalExcludesProcessing)

  return (
    <div className="rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]" data-fee-calculator>
      <form className="grid grid-cols-2 gap-3 border-b border-[#eef0f2] p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end sm:gap-5 sm:p-6" onSubmit={(e) => e.preventDefault()}>
        <div>
          <label htmlFor={`${id}-price`} className="block text-[13px] font-medium text-[#1a1a2e]">
            Price per sale
          </label>
          <div className="mt-1.5 flex h-11 items-center rounded-[10px] border border-[#d4d7dc] bg-white px-3 focus-within:border-[#1a1a2e] focus-within:ring-1 focus-within:ring-[#1a1a2e]">
            <span aria-hidden className="text-[15px] text-[#6b7280]">$</span>
            <input
              id={`${id}-price`}
              inputMode="decimal"
              autoComplete="off"
              value={price}
              onChange={(e) => setPrice(e.target.value.slice(0, 9))}
              className="ml-1 w-full min-w-0 bg-transparent text-[15px] tabular-nums text-[#1a1a2e] outline-none"
            />
          </div>
        </div>
        <div>
          <label htmlFor={`${id}-sales`} className="block text-[13px] font-medium text-[#1a1a2e]">
            Sales a month
          </label>
          <input
            id={`${id}-sales`}
            inputMode="numeric"
            autoComplete="off"
            value={sales}
            onChange={(e) => setSales(e.target.value.slice(0, 6))}
            className="mt-1.5 h-11 w-full min-w-0 rounded-[10px] border border-[#d4d7dc] bg-white px-3 text-[15px] tabular-nums text-[#1a1a2e] outline-none focus:border-[#1a1a2e] focus:ring-1 focus:ring-[#1a1a2e]"
          />
        </div>
        <p className="col-span-2 text-[14px] text-[#6b7280] sm:col-span-1 sm:pb-3 sm:text-right">
          Monthly sales <span className="font-semibold tabular-nums text-[#1a1a2e]">{fmt(gross)}</span>
        </p>
      </form>

      <p className="px-4 pt-4 text-[15px] leading-[1.55] text-[#1a1a2e] sm:px-6" aria-live="polite" data-calculator-verdict>
        {result && gross > 0 ? <Verdict competitor={competitor} result={result} /> : "Enter a price and a number of sales."}
      </p>

      {/* Computer and tablet: one table. */}
      <div className="hidden px-6 pb-2 pt-3 sm:block">
        <table className="w-full border-collapse text-left text-[14px]">
          <caption className="sr-only">
            One month of fees on {competitor} and on Storelib for these sales
          </caption>
          <thead>
            <tr className="border-b border-[#eef0f2] text-[12.5px] text-[#6b7280]">
              <th scope="col" className="py-2.5 pr-3 font-medium">Plan</th>
              <th scope="col" className="py-2.5 pr-3 text-right font-medium">Subscription</th>
              <th scope="col" className="py-2.5 pr-3 text-right font-medium">Platform fees</th>
              <th scope="col" className="py-2.5 pr-3 text-right font-medium">Card processing</th>
              <th scope="col" className="py-2.5 pr-3 text-right font-medium">Total</th>
              <th scope="col" className="py-2.5 text-right font-medium">You keep</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className={`border-b border-[#f1f2f4] last:border-0 ${r.isStorelib ? "bg-[#f8f9fa]" : ""}`}>
                <th scope="row" className="py-3 pl-2 pr-3 font-medium text-[#1a1a2e]">
                  {r.platform} {r.plan}
                </th>
                <td className="py-3 pr-3 text-right tabular-nums text-[#374151]">{fmt(r.planCents)}</td>
                <td className="py-3 pr-3 text-right tabular-nums text-[#374151]">{fmt(r.feeCents)}</td>
                <td className="py-3 pr-3 text-right tabular-nums text-[#374151]">
                  {r.processingCents === null ? <span className="text-[13px] text-[#6b7280]">Not known</span> : fmt(r.processingCents)}
                </td>
                <td className="py-3 pr-3 text-right font-semibold tabular-nums text-[#1a1a2e]">
                  {fmt(r.totalCents)}
                  {r.totalExcludesProcessing ? <span className="text-[#6b7280]"> +</span> : null}
                </td>
                <td className="py-3 pr-2 text-right tabular-nums text-[#374151]">{fmt(r.keepCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Phone: a block per plan, the same rows. */}
      <ul className="space-y-2 px-4 pb-2 pt-3 sm:hidden">
        {rows.map((r) => (
          <li key={r.key} className={`rounded-xl border border-[#eef0f2] p-3 ${r.isStorelib ? "bg-[#f8f9fa]" : ""}`}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[14px] font-semibold text-[#1a1a2e]">
                {r.platform} {r.plan}
              </span>
              <span className="text-[14px] font-semibold tabular-nums text-[#1a1a2e]">
                {fmt(r.totalCents)}
                {r.totalExcludesProcessing ? " +" : ""}
              </span>
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[13px]">
              <dt className="text-[#6b7280]">Subscription</dt>
              <dd className="text-right tabular-nums text-[#374151]">{fmt(r.planCents)}</dd>
              <dt className="text-[#6b7280]">Platform fees</dt>
              <dd className="text-right tabular-nums text-[#374151]">{fmt(r.feeCents)}</dd>
              <dt className="text-[#6b7280]">Card processing</dt>
              <dd className="text-right tabular-nums text-[#374151]">{r.processingCents === null ? "Not known" : fmt(r.processingCents)}</dd>
              <dt className="text-[#6b7280]">You keep</dt>
              <dd className="text-right tabular-nums text-[#374151]">{fmt(r.keepCents)}</dd>
            </dl>
          </li>
        ))}
      </ul>

      <div className="space-y-1.5 px-4 pb-5 pt-2 text-[12.5px] leading-[1.5] text-[#6b7280] sm:px-6">
        <p>
          One month, subscriptions billed monthly, US cards. Storelib&apos;s fee is worked out by the same function checkout uses, including the lower rate with no fixed part on orders under {STORELIB.smallOrderBelow}. Storelib card processing is Stripe&apos;s standard US rate.
        </p>
        {rows
          .filter((r) => !r.isStorelib)
          .map((r) => (
            <p key={r.key}>
              {r.platform} {r.plan}: card processing {r.processingLabel.charAt(0).toLowerCase() + r.processingLabel.slice(1)}.
            </p>
          ))}
        {anyUnknown ? <p>A total marked + leaves out card processing because its rate could not be confirmed, so the real cost is higher.</p> : null}
      </div>
    </div>
  )
}

function Verdict({ competitor, result }: { competitor: string; result: NonNullable<ReturnType<typeof verdict>> }) {
  const name = (r: PlanCost) => `${r.platform} ${r.plan}`
  const on = result.basis === "total" ? "a month, card processing included" : `a month in plan and platform fees (${competitor}'s card processing rate is not known, so processing is left out on both sides)`
  if (result.cheaper === "same") return <>{name(result.storelib)} and {name(result.competitor)} cost the same {on}.</>
  if (result.cheaper === "storelib")
    return (
      <>
        <strong className="font-semibold">{name(result.storelib)}</strong> costs <strong className="font-semibold tabular-nums">{fmt(result.differenceCents)}</strong> less than {name(result.competitor)} {on}.
      </>
    )
  return (
    <>
      <strong className="font-semibold">{name(result.competitor)}</strong> costs <strong className="font-semibold tabular-nums">{fmt(result.differenceCents)}</strong> less than {name(result.storelib)} {on}.
    </>
  )
}
