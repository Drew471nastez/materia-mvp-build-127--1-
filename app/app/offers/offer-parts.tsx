"use client"

/**
 * What the offers list (./offers-client.tsx) and the offer editor
 * (./offer-editor.tsx) share: the shapes the page is given, how an offer is
 * said in a list, money in the store's own currency, and the preview of how
 * an offer looks to a buyer, drawn from the same arithmetic the checkout
 * charges by (lib/offers/offers.ts).
 */
import * as React from "react"
import { Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { appLocale, zoned } from "@/lib/i18n/format"
import { moneyIn } from "./offer-money"
import { bundlePrice, discountLabel, offerUnitPrice, placementsOf, type Offer, type OfferState, type Placement } from "@/lib/offers/offers"
import { ProductThumb } from "../products/collections/collection-parts"

export interface OfferProduct {
  id: string
  title: string
  type: string
  published: boolean
  priceCents: number
  imageUrl: string | null
  payWhatYouWant: boolean
}

export interface OfferCollection {
  id: string
  title: string
}

export { currencySign, minorDigits, moneyIn } from "./offer-money"

export const KIND_WORD = { bundle: () => tt("Bundle"), checkout: () => tt("Upsell") } as const

export const PLACEMENT_WORD: Record<Placement, () => string> = {
  product: () => tt("Product page"),
  cart: () => tt("Cart"),
  checkout: () => tt("Checkout"),
}

export const STATE_WORD: Record<OfferState, () => string> = {
  active: () => tt("Active"),
  scheduled: () => tt("Scheduled"),
  ended: () => tt("Ended"),
  off: () => tt("Off"),
}

export const STATE_TONE: Record<OfferState, "success" | "neutral" | "attention"> = { active: "success", scheduled: "neutral", ended: "neutral", off: "neutral" }

const shortDate = (iso: string) => new Date(iso).toLocaleDateString(appLocale(), zoned({ month: "short", day: "numeric" }))

/** Where an offer shows, in a few words: "Product page, cart". */
export function placesText(o: Pick<Offer, "kind" | "placements">): string {
  const places = placementsOf(o)
  const words = places.map((p) => PLACEMENT_WORD[p]())
  return words.map((w, i) => (i === 0 ? w : w.toLowerCase())).join(", ")
}

/** The dates line of an offer that has dates: "Starts Oct 20", "Ends Nov 1". */
export function datesText(o: Pick<Offer, "startsAt" | "endsAt">, state: OfferState): string | null {
  if (state === "scheduled" && o.startsAt) return tt("Starts {date}", { date: shortDate(o.startsAt) })
  if (o.endsAt) return state === "ended" ? tt("Ended {date}", { date: shortDate(o.endsAt) }) : tt("Ends {date}", { date: shortDate(o.endsAt) })
  return null
}

/** What an offer holds, in a few words: its products for a bundle, the product it offers for an upsell. */
export function contentsText(o: Pick<Offer, "kind" | "productIds">, byId: Map<string, OfferProduct>): string {
  const names = o.productIds.map((id) => byId.get(id)?.title).filter(Boolean) as string[]
  if (o.kind === "checkout") return names[0] ?? tt("A product that was deleted")
  if (names.length <= 2) return names.join(" + ")
  return tt("{first} + {n} more", { first: names[0], n: names.length - 1 })
}

/** The discount as a list says it, in the store's currency. */
export const discountText = (o: Pick<Offer, "discountType" | "discountValue">, currency: string) => discountLabel(o, moneyIn(currency))

/** Up to three of an offer's product pictures, overlapping. */
export function OfferThumbs({ offer, byId }: { offer: Pick<Offer, "productIds">; byId: Map<string, OfferProduct> }) {
  const shown = offer.productIds.slice(0, 3)
  return (
    <span aria-hidden className="pointer-events-none flex shrink-0 -space-x-3">
      {shown.map((id, i) => {
        const p = byId.get(id)
        return (
          <span key={id} className={cn("rounded-[10px] ring-2 ring-white", i > 0 && "hidden sm:inline-flex")} style={{ zIndex: 3 - i }}>
            <ProductThumb src={p?.imageUrl ?? null} title={p?.title ?? ""} />
          </span>
        )
      })}
    </span>
  )
}

/**
 * HOW IT LOOKS TO A BUYER. A bundle as its products with a plus between
 * them, the set's price with the full price struck through and Add all to
 * cart; an upsell as its product with the price it adds at and Add. Drawn in
 * neutral colours: on the website the block's own colours paint it.
 */
export function OfferPreview({ draft, byId, currency }: { draft: Pick<Offer, "kind" | "title" | "productIds" | "discountType" | "discountValue">; byId: Map<string, OfferProduct>; currency: string }) {
  const money = moneyIn(currency)
  const items = draft.productIds.map((id) => byId.get(id)).filter(Boolean) as OfferProduct[]
  const label = draft.discountType === "none" ? null : discountLabel(draft, money)
  if (draft.kind === "bundle") {
    if (items.length < 2) return <PreviewEmpty>{tt("Pick two or more products to see the bundle.")}</PreviewEmpty>
    const { fullCents, priceCents } = bundlePrice(draft, items.map((p) => p.priceCents))
    return (
      <div data-offer-preview="bundle" className="rounded-xl border border-[#e5e7eb] bg-white p-3.5">
        <div className="mb-2.5 flex items-baseline justify-between gap-3">
          <p className="min-w-0 truncate text-[14px] font-semibold text-[#1a1a2e]">{draft.title.trim() || tt("Bundle")}</p>
          {label ? <span className="shrink-0 rounded-md bg-[#e3f5e9] px-1.5 py-0.5 text-[12px] font-medium text-[#14532d]">{label}</span> : null}
        </div>
        <div className="flex items-center gap-1.5">
          {items.map((p, i) => (
            <React.Fragment key={p.id}>
              {i > 0 ? <Plus aria-hidden className="h-3.5 w-3.5 shrink-0 text-[#9ca3af]" /> : null}
              <ProductThumb src={p.imageUrl} title={p.title} />
            </React.Fragment>
          ))}
        </div>
        <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-[#f1f2f4] pt-2.5">
          <span className="text-[13px] text-[#4b5563]">{tt("Together")}</span>
          <span className="tabular-nums">
            {priceCents < fullCents ? <span className="mr-1.5 text-[13px] text-[#9ca3af] line-through">{money(fullCents)}</span> : null}
            <span data-preview-price="" className="text-[15px] font-semibold text-[#1a1a2e]">{money(priceCents)}</span>
          </span>
        </div>
        <div className="mt-2.5 flex h-9 items-center justify-center rounded-lg border border-[#1a1a2e] text-[13px] font-semibold text-[#1a1a2e]">{tt("Add all to cart")}</div>
      </div>
    )
  }
  const p = items[0]
  if (!p) return <PreviewEmpty>{tt("Pick the product to offer to see it.")}</PreviewEmpty>
  const at = p.payWhatYouWant ? p.priceCents : offerUnitPrice(draft, p.priceCents)
  return (
    <div data-offer-preview="upsell" className="rounded-xl border border-[#e5e7eb] bg-white p-3">
      <p className="mb-2 flex items-center justify-between gap-2 text-[12.5px] font-medium text-[#6b7280]">
        <span className="truncate">{draft.title.trim() || tt("Upsell")}</span>
        {label ? <span className="shrink-0 rounded-md bg-[#e3f5e9] px-1.5 py-0.5 text-[11.5px] text-[#14532d]">{label}</span> : null}
      </p>
      <div className="flex items-center gap-3">
        <ProductThumb src={p.imageUrl} title={p.title} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-medium text-[#1a1a2e]">{p.title}</p>
          <p className="text-[13px] tabular-nums">
            <span data-preview-price="" className="font-medium text-[#1a1a2e]">{money(at)}</span>
            {at < p.priceCents ? <span className="ml-1.5 text-[#9ca3af] line-through">{money(p.priceCents)}</span> : null}
          </p>
        </div>
        <span className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-[#1a1a2e] px-2.5 text-[13px] font-semibold text-[#1a1a2e]">
          <Plus aria-hidden className="h-3.5 w-3.5" />
          {tt("Add")}
        </span>
      </div>
    </div>
  )
}

function PreviewEmpty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-dashed border-[#e5e7eb] px-3.5 py-5 text-center text-[13px] text-[#6b7280]">{children}</p>
}
