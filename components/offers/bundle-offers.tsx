"use client"

/**
 * "BUY IT TOGETHER": the store's bundles with this product in (lib/offers,
 * /api/offers/bundles), under the buy box on a product page and a website's
 * product section. Each item with its picture and price, the set's price
 * with the saving, and Add all to cart. This product goes in as chosen in
 * the buy box above; another item with options gets a small choice of its
 * own. The prices are for the page: the checkout works the discount out
 * again on the server, from the cart.
 */
import { useSitePaint } from "@/lib/appearance/site-paint-context"
import * as React from "react"
import { shopMoney } from "@/lib/store/shop-money"
import { Package, Plus } from "lucide-react"
import type { CartLine } from "@/lib/website-builder/cart"
import { bundlePrice, type DiscountType } from "@/lib/offers/offers"

interface Item {
  id: string
  title: string
  slug: string
  imageUrl: string | null
  type: string
  priceCents: number
  variants: { id: string; name: string; priceCents: number }[]
}
interface Bundle {
  offerId: string
  title: string
  label: string | null
  discountType: DiscountType
  discountValue: number
  items: Item[]
  fullCents: number
  priceCents: number
}

const money = (cents: number) => shopMoney(cents)

export function BundleOffers({
  productId,
  chosen,
  onAdd,
  ink = "#1a1a2e",
  muted = "#6b7280",
  accent = "#1a1a2e",
  radius = 10,
  disabled = false,
}: {
  productId: string
  /** This product as the buy box has it: the option chosen, or null while one still has to be. */
  chosen: { variantId: string; variantName: string | null; priceCents: number; imageUrl: string | null } | null
  onAdd: (lines: CartLine[]) => void
  ink?: string
  muted?: string
  accent?: string
  radius?: number
  disabled?: boolean
}) {
  const [bundles, setBundles] = React.useState<Bundle[]>([])
  /* Round 31: on Storelib's own product page these follow the person's look (lib/appearance/site-paint). */
  const paint = useSitePaint()
  ink = paint(ink, "ink")
  muted = paint(muted, "ink")
  const accentEdge = paint(accent, "line")
  accent = paint(accent, "ink")
  const [picks, setPicks] = React.useState<Record<string, string>>({})
  const [added, setAdded] = React.useState<string | null>(null)

  React.useEffect(() => {
    let gone = false
    fetch(`/api/offers/bundles?product=${encodeURIComponent(productId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { bundles?: Bundle[] } | null) => {
        if (gone || !d?.bundles) return
        setBundles(d.bundles)
        const first: Record<string, string> = {}
        for (const b of d.bundles) for (const i of b.items) if (i.id !== productId && i.variants[0]) first[i.id] = i.variants[0].id
        setPicks(first)
      })
      .catch(() => undefined)
    return () => {
      gone = true
    }
  }, [productId])

  if (bundles.length === 0) return null

  const lineFor = (i: Item): CartLine | null => {
    if (i.id === productId) {
      if (!chosen) return null
      return { productId: i.id, variantId: chosen.variantId, title: i.title, variantName: chosen.variantName, priceCents: chosen.priceCents, thumbnailUrl: chosen.imageUrl ?? i.imageUrl, slug: i.slug, digital: i.type !== "physical", physical: i.type === "physical", quantity: 1 }
    }
    const v = i.variants.find((x) => x.id === picks[i.id]) ?? (i.variants.length === 1 ? i.variants[0] : null)
    if (i.type === "physical" && !v) return null
    return { productId: i.id, variantId: v?.id ?? null, title: i.title, variantName: v && i.variants.length > 1 ? v.name : null, priceCents: v?.priceCents ?? i.priceCents, thumbnailUrl: i.imageUrl, slug: i.slug, digital: i.type !== "physical", physical: i.type === "physical", quantity: 1 }
  }

  return (
    <div className="space-y-4" data-bundle-offers="">
      {bundles.map((b) => {
        const lines = b.items.map(lineFor)
        const ready = lines.every(Boolean) && !disabled
        /* The set as chosen right now: an option with its own price changes it. */
        const { fullCents, priceCents } = bundlePrice(b, b.items.map((i, k) => lines[k]?.priceCents ?? i.priceCents))
        return (
          <section key={b.offerId} className="rounded-xl border p-4" style={{ borderColor: paint("rgba(0,0,0,0.1)", "line"), borderRadius: radius + 4 }} data-bundle={b.offerId} aria-label={b.title}>
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h3 className="text-[15px] font-semibold" style={{ color: ink }}>
                {b.title}
              </h3>
              {b.label ? (
                <span className="shrink-0 rounded-full bg-[#dcfce7] px-2 py-0.5 text-[12px] font-medium text-[#166534]" data-bundle-label="">
                  {b.label}
                </span>
              ) : null}
            </div>
            <div className="mb-3 flex items-center gap-1.5" aria-hidden>
              {b.items.map((i, k) => (
                <React.Fragment key={i.id}>
                  {k > 0 ? <Plus className="h-3.5 w-3.5 shrink-0" style={{ color: muted }} /> : null}
                  {i.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={i.imageUrl} alt="" className="h-14 w-14 shrink-0 rounded-lg border object-cover" style={{ borderColor: paint("rgba(0,0,0,0.08)", "line") }} />
                  ) : (
                    <span className="grid h-14 w-14 shrink-0 place-items-center rounded-lg border bg-black/[0.03]" style={{ borderColor: paint("rgba(0,0,0,0.08)", "line"), color: muted }}>
                      <Package className="h-4 w-4" />
                    </span>
                  )}
                </React.Fragment>
              ))}
            </div>
            <ul className="space-y-2">
              {b.items.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-3 text-[14px]">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate" style={{ color: ink }}>
                      {i.id === productId ? <span className="font-medium">This item: </span> : null}
                      {i.title}
                    </span>
                    {i.id !== productId && i.variants.length > 1 ? (
                      <select
                        value={picks[i.id] ?? ""}
                        onChange={(e) => setPicks((p) => ({ ...p, [i.id]: e.target.value }))}
                        className="mt-1 h-9 max-w-full rounded-md border bg-transparent px-2 text-[13px]"
                        style={{ borderColor: paint("rgba(0,0,0,0.14)", "line"), color: ink }}
                        aria-label={`${i.title} option`}
                      >
                        {i.variants.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.name}
                          </option>
                        ))}
                      </select>
                    ) : null}
                  </span>
                  <span className="shrink-0 tabular-nums" style={{ color: muted }}>
                    {money(lines[b.items.indexOf(i)]?.priceCents ?? i.priceCents)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex items-baseline justify-between gap-3 border-t pt-3" style={{ borderColor: paint("rgba(0,0,0,0.08)", "line") }}>
              <span className="text-[14px] font-medium" style={{ color: ink }}>
                Together
              </span>
              <span className="tabular-nums">
                {priceCents < fullCents ? (
                  <span className="mr-2 text-[14px] line-through" style={{ color: muted }}>
                    {money(fullCents)}
                  </span>
                ) : null}
                <span className="text-[17px] font-bold" style={{ color: ink }} data-bundle-price="">
                  {money(priceCents)}
                </span>
              </span>
            </div>
            <button
              type="button"
              disabled={!ready}
              onClick={() => {
                onAdd(lines as CartLine[])
                setAdded(b.offerId)
                window.setTimeout(() => setAdded(null), 2400)
              }}
              className="mt-3 w-full border-2 py-3 text-[14.5px] font-semibold transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
              style={{ borderColor: accentEdge, color: accent, borderRadius: radius }}
              data-bundle-add=""
            >
              {added === b.offerId ? "Added to cart" : chosen ? "Add all to cart" : "Choose your options above"}
            </button>
          </section>
        )
      })}
    </div>
  )
}
