"use client"

/**
 * THE PRODUCT'S PRICE ON STORELIB'S MARKETPLACE, when it is in US dollars
 * (lib/money/marketplace). One quiet line under the price: what buyers on
 * Explore see today ("about $12.34"), and, if the creator wants, a dollar
 * price of their own. Saving it is their approval; Storelib never sets,
 * rounds or changes it for them. Nothing shows for a dollar store, a plan,
 * a product not saved yet, or before the marketplace is switched over.
 */
import * as React from "react"
import { Input } from "@/components/ui/input"
import { api } from "@/components/physical/ui"
import { tt } from "@/lib/i18n/text"
import { shopMoneyIn } from "@/lib/store/shop-money"

interface State {
  enabled: boolean
  ready?: boolean
  storeCurrency?: string
  usdPerUnit?: number | null
  fixedCents?: number | null
  approvedAt?: string | null
}

const usd = (cents: number) => shopMoneyIn(cents, "USD", { grouping: true })

export function MarketplacePriceCard({ productId, priceText }: { productId: string | null; priceText: string }) {
  const [state, setState] = React.useState<State | null>(null)
  const [editing, setEditing] = React.useState(false)
  const [typed, setTyped] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!productId) return
    let live = true
    void api<State>(`/api/products/marketplace-price?productId=${encodeURIComponent(productId)}`).then((r) => live && r.ok && setState(r.data))
    return () => {
      live = false
    }
  }, [productId])

  if (!productId || !state?.enabled) return null
  const price = Number.parseFloat(priceText || "0")
  const converted = state.usdPerUnit && Number.isFinite(price) && price > 0 ? Math.round(price * state.usdPerUnit * 100) : null
  const fixed = state.approvedAt && typeof state.fixedCents === "number" ? state.fixedCents : null

  const save = async (cents: number | null) => {
    setBusy(true)
    setError(null)
    const r = await api<{ fixedCents: number | null; approvedAt: string | null }>("/api/products/marketplace-price", { method: "POST", body: { productId, usdCents: cents } })
    setBusy(false)
    if (!r.ok) return setError(r.error)
    setState((s) => (s ? { ...s, fixedCents: r.data.fixedCents, approvedAt: r.data.approvedAt } : s))
    setEditing(false)
  }

  return (
    <div className="space-y-2 rounded-lg bg-[#f8f9fa] px-3 py-2.5" data-marketplace-price="">
      <p className="text-[13px] leading-[18px] text-[#6b7280]">
        {fixed !== null
          ? tt("On Explore and the Storelib marketplace: {price}, your dollar price.", { price: usd(fixed) })
          : converted !== null
            ? tt("On Explore and the Storelib marketplace: about {price}, at today's exchange rate.", { price: usd(converted) })
            : tt("On Explore and the Storelib marketplace this shows in US dollars, at the day's exchange rate.")}
      </p>
      {editing ? (
        <div className="flex items-center gap-2">
          <div className="relative w-36">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[14px] text-[#6b7280]">$</span>
            <Input
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0.00"
              value={typed}
              onChange={(e) => setTyped(e.target.value.replace(/[^0-9.]/g, ""))}
              className="h-9 pl-6 text-sm tabular-nums"
              aria-label={tt("Dollar price")}
            />
          </div>
          <button
            type="button"
            disabled={busy || !(Number.parseFloat(typed) >= 0)}
            onClick={() => void save(Math.round(Number.parseFloat(typed) * 100))}
            className="h-9 rounded-lg bg-[#1a1a2e] px-3 text-[13px] font-medium text-white disabled:opacity-50"
          >
            {tt("Use this price")}
          </button>
          <button type="button" onClick={() => setEditing(false)} className="h-9 px-2 text-[13px] text-[#6b7280]">
            {tt("Cancel")}
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => {
              setTyped(fixed !== null ? (fixed / 100).toFixed(2) : converted !== null ? (converted / 100).toFixed(2) : "")
              setEditing(true)
            }}
            disabled={state.ready === false}
            className="text-[13px] font-medium text-[#1a1a2e] underline-offset-4 hover:underline disabled:opacity-50"
          >
            {fixed !== null ? tt("Change dollar price") : tt("Set my own dollar price")}
          </button>
          {fixed !== null ? (
            <button type="button" disabled={busy} onClick={() => void save(null)} className="text-[13px] text-[#6b7280] underline-offset-4 hover:underline">
              {tt("Use the converted price")}
            </button>
          ) : null}
        </div>
      )}
      {error ? <p className="text-[13px] text-[#b42318]">{error}</p> : null}
    </div>
  )
}
