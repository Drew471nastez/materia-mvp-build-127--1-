/**
 * ===========================================================================
 *  UPSELLS AND BUNDLES: WHAT AN OFFER TAKES OFF A CART
 * ===========================================================================
 * A store's offers (store_offers, SQL part 116) are of two kinds:
 *
 *   bundle     two to five products bought together. Each complete set in
 *              the cart (one of each) gets the offer's discount: a percent
 *              off every item in the set, or a fixed amount off the set,
 *              shared across its items by price.
 *   checkout   one product suggested in the checkout, shown when the cart
 *              holds any of its trigger products (or anything at all, when
 *              it names none). Once it's in the cart, one of it gets the
 *              discount, as long as the cart still qualifies.
 *
 * This file is the arithmetic and nothing else, so the page, the server and
 * the tests agree on it. The server is the only one that charges: it runs
 * applyOffers on the cart it priced itself from the database
 * (lib/physical/checkout-pricing-server.ts), never on numbers a browser
 * sent. Every unit is discounted by one offer at most, an offer never takes
 * a line below zero, and a code applies after, to what's left.
 */

export const OFFER_KINDS = ["bundle", "checkout"] as const
export type OfferKind = (typeof OFFER_KINDS)[number]
export const DISCOUNT_TYPES = ["percent", "fixed", "none"] as const
export type DiscountType = (typeof DISCOUNT_TYPES)[number]

export const MAX_BUNDLE = 5
export const MAX_TRIGGERS = 20
export const MAX_PERCENT = 90
export const MAX_OFFERS = 50

export interface Offer {
  id: string
  kind: OfferKind
  title: string
  productIds: string[]
  triggerIds: string[]
  discountType: DiscountType
  /** Percent (1 to 90) or cents, by discountType. */
  discountValue: number
  active: boolean
}

export interface OfferLine {
  productId: string
  unitCents: number
  quantity: number
}

export interface AppliedOffer {
  offerId: string
  title: string
  kind: OfferKind
  savedCents: number
}

const uniq = (ids: string[]) => [...new Set(ids)]

/** How a store's offer reads in a list: "15% off", "$5.00 off", "No discount". */
export function discountLabel(o: Pick<Offer, "discountType" | "discountValue">, money: (cents: number) => string = (c) => `$${(c / 100).toFixed(2)}`): string {
  if (o.discountType === "percent" && o.discountValue > 0) return `${o.discountValue}% off`
  if (o.discountType === "fixed" && o.discountValue > 0) return `${money(o.discountValue)} off`
  return "No discount"
}

/** One unit's discount under an offer, never more than the unit. */
function unitOff(o: Offer, unitCents: number): number {
  if (o.discountType === "percent") return Math.min(unitCents, Math.round((unitCents * Math.min(MAX_PERCENT, Math.max(0, o.discountValue))) / 100))
  if (o.discountType === "fixed") return Math.min(unitCents, Math.max(0, Math.round(o.discountValue)))
  return 0
}

/** Whether a checkout offer's conditions hold for a cart, leaving its own product out of the count. */
export function triggered(o: Offer, cart: { productId: string; quantity: number }[]): boolean {
  const target = o.productIds[0]
  const others = cart.filter((l) => l.productId !== target && l.quantity > 0)
  if (o.triggerIds.length === 0) return others.length > 0
  const wanted = new Set(o.triggerIds)
  return others.some((l) => wanted.has(l.productId))
}

/**
 * What each line of a cart gets off, from the store's active offers, in
 * their order: bundles first, then checkout offers. `discounts[i]` is for
 * `lines[i]`.
 */
export function applyOffers(lines: OfferLine[], offers: Offer[]): { discounts: number[]; applied: AppliedOffer[] } {
  const discounts = lines.map(() => 0)
  const free = lines.map((l) => Math.max(0, Math.floor(l.quantity)))
  const applied: AppliedOffer[] = []
  const linesOf = (productId: string) => lines.map((l, i) => (l.productId === productId ? i : -1)).filter((i) => i >= 0)
  const unitsOf = (productId: string) => linesOf(productId).reduce((n, i) => n + free[i], 0)
  /** Takes `count` undiscounted units of a product, dearest first, and says which line each came from. */
  const take = (productId: string, count: number): number[] => {
    const out: number[] = []
    const order = linesOf(productId).sort((a, b) => lines[b].unitCents - lines[a].unitCents)
    for (const i of order) {
      while (out.length < count && free[i] > 0) {
        free[i]--
        out.push(i)
      }
    }
    return out
  }

  const active = offers.filter((o) => o.active && o.discountType !== "none" && o.discountValue > 0)
  const ordered = [...active.filter((o) => o.kind === "bundle"), ...active.filter((o) => o.kind === "checkout")]

  for (const o of ordered) {
    let saved = 0
    if (o.kind === "bundle") {
      const ids = uniq(o.productIds)
      if (ids.length < 2 || ids.length > MAX_BUNDLE) continue
      const sets = Math.min(...ids.map(unitsOf))
      if (!Number.isFinite(sets) || sets <= 0) continue
      for (let s = 0; s < sets; s++) {
        const units = ids.map((id) => take(id, 1)[0])
        if (o.discountType === "percent") {
          for (const i of units) {
            const d = unitOff(o, lines[i].unitCents)
            discounts[i] += d
            saved += d
          }
        } else {
          /* A fixed amount off the set, shared by price; the last item takes the rounding. */
          const setCents = units.reduce((n, i) => n + lines[i].unitCents, 0)
          const off = Math.min(setCents, Math.max(0, Math.round(o.discountValue)))
          let left = off
          units.forEach((i, k) => {
            const share = k === units.length - 1 ? left : Math.floor((off * lines[i].unitCents) / Math.max(1, setCents))
            const d = Math.min(share, lines[i].unitCents)
            discounts[i] += d
            left -= d
            saved += d
          })
        }
      }
    } else {
      const target = o.productIds[0]
      if (!target || unitsOf(target) <= 0 || !triggered(o, lines)) continue
      const [i] = take(target, 1)
      if (i === undefined) continue
      const d = unitOff(o, lines[i].unitCents)
      discounts[i] += d
      saved += d
    }
    if (saved > 0) applied.push({ offerId: o.id, title: o.title, kind: o.kind, savedCents: saved })
  }

  /* Never below zero: a line's discounts together stop at what the line costs. */
  lines.forEach((l, i) => (discounts[i] = Math.min(discounts[i], l.unitCents * Math.max(0, Math.floor(l.quantity)))))
  return { discounts, applied }
}

/** The checkout offers to suggest for a cart: their product isn't in it yet, and the cart qualifies. */
export function suggestionsFor(cart: { productId: string; quantity: number }[], offers: Offer[]): Offer[] {
  const inCart = new Set(cart.filter((l) => l.quantity > 0).map((l) => l.productId))
  return offers.filter((o) => o.active && o.kind === "checkout" && o.productIds[0] && !inCart.has(o.productIds[0]) && triggered(o, cart)).slice(0, 3)
}

/** The bundles a product's page shows: active ones with it in. */
export function bundlesWith(productId: string, offers: Offer[]): Offer[] {
  return offers.filter((o) => o.active && o.kind === "bundle" && o.productIds.includes(productId)).slice(0, 2)
}

/** What a set costs with an offer's discount, for showing on a page (the server works it out again at checkout). */
export function bundlePrice(o: Pick<Offer, "discountType" | "discountValue">, unitCents: number[]): { fullCents: number; priceCents: number } {
  const fullCents = unitCents.reduce((n, c) => n + c, 0)
  if (o.discountType === "percent") return { fullCents, priceCents: unitCents.reduce((n, c) => n + c - Math.min(c, Math.round((c * Math.min(MAX_PERCENT, o.discountValue)) / 100)), 0) }
  if (o.discountType === "fixed") return { fullCents, priceCents: Math.max(0, fullCents - Math.min(fullCents, o.discountValue)) }
  return { fullCents, priceCents: fullCents }
}

/** One unit's price under a checkout offer, for showing. */
export function offerUnitPrice(o: Pick<Offer, "discountType" | "discountValue">, unitCents: number): number {
  return unitCents - unitOff({ ...o, id: "", kind: "checkout", title: "", productIds: [], triggerIds: [], active: true } as Offer, unitCents)
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** An offer as the store's editor sent it, checked, or what is wrong with it. */
export function readOffer(body: Record<string, unknown> | null): { ok: true; offer: Omit<Offer, "id"> } | { ok: false; error: string } {
  if (!body) return { ok: false, error: "Bad request." }
  const kind = OFFER_KINDS.includes(body.kind as OfferKind) ? (body.kind as OfferKind) : null
  if (!kind) return { ok: false, error: "Choose a bundle or a checkout offer." }
  const title = typeof body.title === "string" ? body.title.replace(/\s+/g, " ").trim().slice(0, 80) : ""
  if (!title) return { ok: false, error: "Give it a name buyers will see, like “Complete the set”." }
  const ids = (v: unknown) => (Array.isArray(v) ? uniq(v.filter((x): x is string => typeof x === "string" && UUID.test(x))) : [])
  const productIds = ids(body.productIds)
  const triggerIds = kind === "checkout" ? ids(body.triggerIds).filter((id) => id !== productIds[0]).slice(0, MAX_TRIGGERS) : []
  if (kind === "bundle" && (productIds.length < 2 || productIds.length > MAX_BUNDLE)) return { ok: false, error: `A bundle has 2 to ${MAX_BUNDLE} products.` }
  if (kind === "checkout" && productIds.length !== 1) return { ok: false, error: "Choose the product to offer." }
  const discountType = DISCOUNT_TYPES.includes(body.discountType as DiscountType) ? (body.discountType as DiscountType) : "percent"
  const raw = Math.round(Number(body.discountValue))
  const discountValue = discountType === "none" ? 0 : Number.isFinite(raw) ? raw : 0
  if (discountType === "percent" && (discountValue < 1 || discountValue > MAX_PERCENT)) return { ok: false, error: `A percent off is 1 to ${MAX_PERCENT}.` }
  if (discountType === "fixed" && (discountValue < 1 || discountValue > 10_000_000)) return { ok: false, error: "Enter the amount off." }
  return { ok: true, offer: { kind, title, productIds, triggerIds, discountType, discountValue, active: body.active !== false } }
}
