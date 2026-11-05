"use client"

/**
 * THE PRODUCT'S PRICE ON STORELIB'S MARKETPLACE, when it is in US dollars
 * (lib/money/marketplace). One small line under the price: what buyers on
 * Explore see today ("Explore price: about $12.34 · Set USD price"), and, if
 * the creator wants, a dollar price of their own, edited in place. Saving it is their approval; Storelib never sets,
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

  const shown = fixed ?? converted
  return (
    <div className="mt-1.5 text-[12px] leading-[18px] text-[#6b7280]" data-marketplace-price="">
      {editing ? (
        <div className="flex items-center gap-1.5">
          <span className="shrink-0">{tt("Explore price")}</span>
          <div className="relative w-24">
            <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[12px] text-[#6b7280]">$</span>
            <Input
              type="text"
              inputMode="decimal"
              autoComplete="off"
              autoFocus
              placeholder="0.00"
              value={typed}
              onChange={(e) => setTyped(e.target.value.replace(/[^0-9.]/g, ""))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && Number.parseFloat(typed) >= 0) {
                  e.preventDefault()
                  void save(Math.round(Number.parseFloat(typed) * 100))
                }
                if (e.key === "Escape") setEditing(false)
              }}
              className="h-7 rounded-md pl-5 text-[12px] tabular-nums"
              aria-label={tt("Dollar price")}
            />
          </div>
          <button
            type="button"
            disabled={busy || !(Number.parseFloat(typed) >= 0)}
            onClick={() => void save(Math.round(Number.parseFloat(typed) * 100))}
            className="h-7 rounded-md bg-[#1a1a2e] px-2.5 text-[12px] font-medium text-white transition-opacity disabled:opacity-50"
          >
            {tt("Save")}
          </button>
          <button type="button" onClick={() => setEditing(false)} className="h-7 px-1.5 text-[12px] text-[#6b7280] transition-colors hover:text-[#1a1a2e]">
            {tt("Cancel")}
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span>
            {shown !== null
              ? fixed !== null
                ? tt("Explore price: {price}", { price: usd(shown) })
                : tt("Explore price: about {price}", { price: usd(shown) })
              : tt("Explore shows this in US dollars.")}
          </span>
          <span aria-hidden className="text-[#d1d5db]">·</span>
          <button
            type="button"
            onClick={() => {
              setTyped(shown !== null ? (shown / 100).toFixed(2) : "")
              setEditing(true)
            }}
            disabled={state.ready === false}
            className="font-medium text-[#1a1a2e] underline-offset-2 transition-colors hover:underline disabled:opacity-50"
          >
            {fixed !== null ? tt("Edit") : tt("Set USD price")}
          </button>
          {fixed !== null ? (
            <button type="button" disabled={busy} onClick={() => void save(null)} className="text-[#6b7280] underline-offset-2 transition-colors hover:text-[#1a1a2e] hover:underline">
              {tt("Use rate")}
            </button>
          ) : null}
        </div>
      )}
      {error ? <p className="mt-1 text-[12px] text-[#b42318]">{error}</p> : null}
    </div>
  )
}
