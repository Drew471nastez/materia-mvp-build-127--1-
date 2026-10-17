"use client"

/**
 * THE STORE'S OFFERS IN THE CART (lib/offers, /api/offers/cart): the cart
 * drawer (HeaderSection's CartDrawerInner) and the cart page
 * (cart-page-body.tsx) both ask the server what this cart gets and what it
 * could add, once the presses have stopped, and draw:
 *
 *   savings       each bundle and upsell the cart gets now, with what it
 *                 takes off, above the subtotal
 *   suggestions   upsells shown in the cart that the cart qualifies for,
 *                 and bundles it holds part of ("add the rest"), each with
 *                 Add
 *
 * In the theme's own colours, passed in already resolved. Nothing here is a
 * price anybody pays: the checkout prices the cart again on the server and
 * applies each offer only while the cart qualifies.
 */
import * as React from "react"
import { Package, Plus } from "lucide-react"
import { checkoutItems, type CartLine } from "@/lib/website-builder/cart"

interface Item {
  id: string
  title: string
  slug: string
  imageUrl: string | null
  type: string
  priceCents: number
  variants: { id: string; name: string; priceCents: number }[]
}
export interface CartOffersData {
  offers: { offerId: string; title: string; savedCents: number; freeShipping: boolean }[]
  offerCents: number
  suggestions: { offerId: string; title: string; label: string | null; product: Item; offerPriceCents: number }[]
  completions: { offerId: string; title: string; label: string | null; missing: Item[]; savingCents: number }[]
}

/** What the server says this cart gets from the store's offers, asked again 400ms after the cart last changed. */
export function useCartOffers(lines: CartLine[], shopId: string | null, enabled = true): CartOffersData | null {
  const [data, setData] = React.useState<CartOffersData | null>(null)
  const items = JSON.stringify(checkoutItems(lines))
  React.useEffect(() => {
    if (!enabled || !shopId || lines.length === 0) {
      setData(null)
      return
    }
    let gone = false
    const t = window.setTimeout(() => {
      fetch("/api/offers/cart", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ shopId, items: JSON.parse(items) }) })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: CartOffersData | null) => {
          if (!gone && d && Array.isArray(d.offers)) setData(d)
        })
        .catch(() => undefined)
    }, 400)
    return () => {
      gone = true
      window.clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the cart's ids and amounts are what change
  }, [items, shopId, enabled])
  return data
}

const lineOf = (p: Item, variantId: string | null): CartLine => {
  const v = p.variants.find((x) => x.id === variantId) ?? (p.variants.length === 1 ? p.variants[0] : null)
  return { productId: p.id, variantId: v?.id ?? null, title: p.title, variantName: v && p.variants.length > 1 ? v.name : null, priceCents: v?.priceCents ?? p.priceCents, thumbnailUrl: p.imageUrl, slug: p.slug, digital: p.type !== "physical", physical: p.type === "physical", quantity: 1 }
}

export interface CartOfferColors {
  text: string
  muted?: string
  border: string
  buttonBg?: string
  buttonText?: string
}

/** Each offer the cart gets, as a line above the subtotal: its name and what it takes off. */
export function CartOfferSavings({ data, money, className }: { data: CartOffersData | null; money: (cents: number) => string; className?: string }) {
  const saving = (data?.offers ?? []).filter((o) => o.savedCents > 0)
  if (saving.length === 0) return null
  return (
    <div className={className} data-cart-offer-savings="">
      {saving.map((o) => (
        <div key={o.offerId} className="flex items-baseline justify-between gap-3">
          <span className="min-w-0 truncate opacity-70">{o.title}</span>
          <span className="shrink-0 tabular-nums">&minus;{money(o.savedCents)}</span>
        </div>
      ))}
    </div>
  )
}

/** Upsells to add and bundles to finish, each a row with its picture, its price and Add. */
export function CartOfferSuggestions({ data, onAdd, money, colors, radius = 10 }: { data: CartOffersData | null; onAdd: (lines: CartLine[]) => void; money: (cents: number) => string; colors: CartOfferColors; radius?: number }) {
  const [picks, setPicks] = React.useState<Record<string, string>>({})
  const rows = [
    ...(data?.completions ?? []).map((c) => ({ key: c.offerId, heading: c.title, label: c.label, items: c.missing, price: c.missing.reduce((n, i) => n + i.priceCents, 0), was: null as number | null, note: c.savingCents > 0 ? `Save ${money(c.savingCents)} on the set` : null })),
    ...(data?.suggestions ?? []).map((s) => ({ key: s.offerId, heading: s.title, label: s.label, items: [s.product], price: s.offerPriceCents, was: s.offerPriceCents < s.product.priceCents ? s.product.priceCents : null, note: null as string | null })),
  ]
  if (rows.length === 0) return null
  const muted = colors.muted ?? colors.text
  return (
    <section aria-label="You may also like" className="space-y-2.5" data-cart-offer-suggestions="">
      {rows.map((r) => {
        const first = r.items[0]
        const options = r.items.length === 1 && first.variants.length > 1 ? first.variants : null
        const chosen = options ? (picks[r.key] ?? options[0].id) : null
        return (
          <div key={r.key} className="border p-3" style={{ borderColor: colors.border, borderRadius: radius }} data-cart-offer={r.key}>
            <p className="mb-2 flex items-center justify-between gap-2 text-[12.5px] font-medium" style={{ color: muted }}>
              <span className="truncate">{r.heading}</span>
              {r.label ? <span className="shrink-0 rounded-full bg-[#dcfce7] px-2 py-0.5 text-[11.5px] text-[#166534]">{r.label}</span> : null}
            </p>
            <div className="flex items-center gap-3">
              <span className="flex shrink-0 -space-x-2">
                {r.items.slice(0, 2).map((i) =>
                  i.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={i.id} src={i.imageUrl} alt="" className="h-11 w-11 rounded-lg border object-cover" style={{ borderColor: colors.border }} />
                  ) : (
                    <span key={i.id} className="grid h-11 w-11 place-items-center rounded-lg border" style={{ borderColor: colors.border, color: muted }}>
                      <Package className="h-4 w-4" aria-hidden />
                    </span>
                  ),
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-medium" style={{ color: colors.text }}>
                  {r.items.map((i) => i.title).join(" + ")}
                </p>
                {options ? (
                  <select value={chosen ?? ""} onChange={(e) => setPicks((p) => ({ ...p, [r.key]: e.target.value }))} className="mt-1 h-8 max-w-full rounded-md border bg-transparent px-2 text-[13px]" style={{ borderColor: colors.border, color: colors.text }} aria-label={`${first.title} option`}>
                    {options.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="text-[13px] tabular-nums" style={{ color: colors.text }}>
                    <span className="font-medium">{money(r.price)}</span>
                    {r.was ? (
                      <span className="ml-1.5 line-through" style={{ color: muted }}>
                        {money(r.was)}
                      </span>
                    ) : null}
                    {r.note ? <span className="ml-1.5" style={{ color: muted }}>{r.note}</span> : null}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => onAdd(r.items.map((i) => lineOf(i, r.items.length === 1 ? chosen : null)))}
                className="inline-flex h-9 shrink-0 items-center gap-1 border px-3 text-[13.5px] font-semibold transition-opacity hover:opacity-85"
                style={{ borderColor: colors.buttonBg ?? colors.text, background: colors.buttonBg ?? "transparent", color: colors.buttonText ?? colors.text, borderRadius: Math.min(radius, 12) }}
                data-cart-offer-add=""
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
                Add
              </button>
            </div>
          </div>
        )
      })}
    </section>
  )
}
