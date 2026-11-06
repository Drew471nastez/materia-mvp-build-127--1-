"use client"
import { useEffect, useSyncExternalStore } from "react"
import type { VariantPriceFacts } from "@/lib/pricing/variant-price"
type Price = {
  id: string
  price_cents?: number | null
  compare_at_cents?: number | null
  pay_what_you_want?: boolean | null
  pwyw_min_price_cents?: number | null
  currency?: string | null
} & VariantPriceFacts
const prices = new Map<string, Price>(),
  readAt = new Map<string, number>(),
  pending = new Set<string>(),
  listeners = new Set<() => void>()
let timer: ReturnType<typeof setTimeout> | undefined
const subscribe = (fn: () => void) => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
const priceKey = (id: string, marketplace: boolean) =>
  `${marketplace ? "marketplace" : "store"}:${id}`
function schedule() {
  if (timer || !pending.size) return
  timer = setTimeout(async () => {
    timer = undefined
    const context = [...pending][0].split(":")[0]
    const keys = [...pending]
      .filter((k) => k.startsWith(context + ":"))
      .slice(0, 75)
    for (const key of keys) {
      pending.delete(key)
      readAt.set(key, Date.now())
    }
    try {
      const res = await fetch(
        "/api/products/prices?context=" +
          context +
          "&ids=" +
          keys.map((k) => k.split(":")[1]).join(","),
        { cache: "no-store" },
      )
      if (!res.ok) return
      const body = await res.json()
      for (const row of body.prices || []) {
        if (prices.size >= 500) prices.delete(prices.keys().next().value!)
        prices.set(`${context}:${row.id}`, row)
      }
      for (const fn of listeners) fn()
    } catch {
    } finally {
      schedule()
    }
  }, 16)
}
function requestPrice(id: string, marketplace: boolean) {
  const key = priceKey(id, marketplace)
  if (
    !/^[\da-f-]{36}$/i.test(id) ||
    Date.now() - (readAt.get(key) || 0) < 30_000
  )
    return
  pending.add(key)
  schedule()
}
/** Fallback lists share one batch per currency context. Never overwrite
 * server-converted facts with raw store prices, including after navigation. */
export function useCanonicalPrice<T extends Price>(
  product: T,
  marketplace = true,
): T {
  const key = priceKey(product.id, marketplace)
  const latest = useSyncExternalStore(
    subscribe,
    () => prices.get(key),
    () => undefined,
  )
  useEffect(() => {
    if (product.variant_prices_known) return
    requestPrice(product.id, marketplace)
    const refresh = () => requestPrice(product.id, marketplace)
    window.addEventListener("focus", refresh)
    return () => window.removeEventListener("focus", refresh)
  }, [product.id, product.variant_prices_known, marketplace])
  return product.variant_prices_known
    ? product
    : latest
      ? { ...product, ...latest }
      : product
}
