/**
 * ===========================================================================
 *  AN OFFER, TRIED ON A CART, AND WHAT TO WATCH FOR BEFORE SAVING IT
 * ===========================================================================
 * Products, Upsells and bundles (app/app/offers) shows the creator, while
 * they edit an offer, what a buyer's cart would get from it and from the
 * store's other offers together, and says plainly when it cannot apply or
 * when another offer competes for the same items. Both are the checkout's
 * own rules, never a second copy of them:
 *
 *   tryCart        the cart priced by applyOffers (./offers.ts), the very
 *                  function the checkout charges by, with the offer being
 *                  edited in its place among the store's offers (as if on
 *                  now, so a scheduled or switched off one can be tried)
 *   offerWarnings  a product that is a draft (no buyer sees the offer), a
 *                  tier that costs more per item than the one before it,
 *                  and every other offer on the same products, with which
 *                  one a buyer gets: each item takes one offer, the one
 *                  that saves more on it
 *
 * Pure: the route (app/api/store/offers/try) reads the store's own rows and
 * hands them in; the page and the tests call these directly.
 */
import { tt } from "@/lib/i18n/text"
import { applyOffers, offerState, type AppliedOffer, type LineOffer, type Offer, type OfferLine } from "./offers"
import { tierTotals } from "./pricing"

export const DRAFT_ID = "00000000-0000-4000-8000-000000000000"

export interface TryLine extends OfferLine {
  title: string
}

export interface TriedLine {
  productId: string
  title: string
  quantity: number
  unitCents: number
  savedCents: number
  offers: LineOffer[]
}

export interface Tried {
  lines: TriedLine[]
  applied: AppliedOffer[]
  subtotalCents: number
  savedCents: number
  totalCents: number
  freeShipping: boolean
}

/** The store's offers with the one being edited in its place (a new one last), switched on and with no dates, so it can be tried before it starts. */
export function withDraft(offers: Offer[], draft: Offer): Offer[] {
  const tried: Offer = { ...draft, active: true, startsAt: null, endsAt: null }
  const at = offers.findIndex((o) => o.id === draft.id)
  return at >= 0 ? offers.map((o, i) => (i === at ? tried : o)) : [...offers, tried]
}

/** A cart priced by the checkout's own offers, line by line. */
export function tryCart(lines: TryLine[], offers: Offer[], draft: Offer, now: Date = new Date()): Tried {
  const all = withDraft(offers, draft)
  const r = applyOffers(lines, all, { now })
  const out = lines.map((l, i) => ({ productId: l.productId, title: l.title, quantity: Math.max(0, Math.floor(l.quantity)), unitCents: l.unitCents, savedCents: r.discounts[i], offers: r.lineOffers[i] }))
  const subtotalCents = out.reduce((n, l) => n + l.unitCents * l.quantity, 0)
  const savedCents = out.reduce((n, l) => n + l.savedCents, 0)
  return { lines: out, applied: r.applied, subtotalCents, savedCents, totalCents: subtotalCents - savedCents, freeShipping: r.freeShipping }
}

/** The products an offer is about: a bundle's, an upsell's product, a quantity break's product. */
const productsOf = (o: Offer) => (o.kind === "checkout" ? o.productIds.slice(0, 1) : o.productIds)

/**
 * What to tell the creator before saving: each a sentence, the most
 * important first. `products`: the store's, with whether each is published
 * and its price (a quantity break's tiers are checked at it).
 */
export function offerWarnings(draft: Offer, offers: Offer[], products: { id: string; title: string; published: boolean; priceCents: number; type?: string }[], now: Date = new Date()): string[] {
  const out: string[] = []
  const byId = new Map(products.map((p) => [p.id, p]))
  const name = (id: string) => byId.get(id)?.title ?? tt("A product")

  /* A draft product: the page that would show the offer is not there, and the checkout never sells it. */
  for (const id of productsOf(draft)) {
    const p = byId.get(id)
    if (!p) out.push(tt("A product in this offer is no longer in your store, so the offer can't apply."))
    else if (!p.published) out.push(tt("{title} is a draft. Buyers see this offer once it's published.", { title: p.title }))
  }

  /* A quantity break on something that doesn't ship: a buyer gets one per order, so only a one-item tier can apply. */
  if (draft.kind === "quantity_break" && draft.productIds.length) {
    const p = byId.get(draft.productIds[0])
    if (p?.type && p.type !== "physical" && !(draft.tiers ?? []).some((t) => t.quantity + t.freeQuantity === 1 && (t.freeQuantity > 0 || t.discountValue > 0))) out.push(tt("{title} is one per order, so buyers can't reach these tiers. Quantity breaks are for products that ship.", { title: p.title }))
  }

  /* Tiers that make buying more cost more per item. */
  if (draft.kind === "quantity_break" && draft.tiers?.length) {
    const price = byId.get(draft.productIds[0])?.priceCents || 10_000
    let last: { n: number; unit: number } | null = null
    draft.tiers.forEach((t, i) => {
      const unit = tierTotals(price, t).unitPriceCents
      if (last && unit > last.unit) out.push(tt("Tier {n} costs more per item than tier {m}, so buying more costs buyers more.", { n: i + 1, m: last.n }))
      last = { n: i + 1, unit }
    })
  }

  /* Every other offer on now (or later) on the same products, and the rule that decides. */
  const others = offers.filter((o) => o.id !== draft.id && offerState(o, now) !== "off" && offerState(o, now) !== "ended")
  const mine = new Set(productsOf(draft))
  const collection = draft.kind === "quantity_break" && draft.productIds.length === 0 ? draft.triggerCollectionIds?.[0] ?? null : null
  for (const o of others) {
    const theirs = productsOf(o)
    const shared = theirs.filter((id) => mine.has(id))
    const sameCollection = collection && o.kind === "quantity_break" && o.productIds.length === 0 && o.triggerCollectionIds?.[0] === collection
    if (shared.length === 0 && !sameCollection) continue
    const what = shared.length ? name(shared[0]) : tt("These products")
    if (draft.kind === "quantity_break" && o.kind === "quantity_break") out.push(tt("{title} also has the quantity break “{offer}”. Only one applies to it: the one that saves more on the whole cart.", { title: what, offer: o.title }))
    else out.push(tt("{title} is also in “{offer}”. Each item gets one offer: the one that saves more on it.", { title: what, offer: o.title }))
  }
  return out
}
