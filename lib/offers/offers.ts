import { tt } from "@/lib/i18n/text"
/**
 * ===========================================================================
 *  UPSELLS AND BUNDLES: WHAT AN OFFER TAKES OFF A CART
 * ===========================================================================
 * A store's offers (store_offers, SQL parts 116 and 213) are of two kinds:
 *
 *   bundle     two to five products bought together. Each complete set in
 *              the cart (one of each) gets the offer's discount: a percent
 *              off every item in the set, a fixed amount off the set,
 *              shared across its items by price, or free shipping on the
 *              order. Shown on each of its products' pages, and in the cart
 *              as "add the rest" while part of the set is in it.
 *   checkout   one product suggested to a buyer (an upsell, or an order
 *              bump), shown when the cart holds any of its trigger products
 *              or a product from its trigger collections (or anything at
 *              all, when it names none), and the cart is worth at least its
 *              minimum. Shown where the store chose: the product page of a
 *              trigger product, the cart, the checkout. Once it's in the
 *              cart, up to its limit per order (one by default) gets the
 *              discount, as long as the cart still qualifies.
 *
 * Every offer may have a start and an end, a limit per order, and a rule for
 * codes: whether a discount code can be used on top of it. When it can't,
 * the buyer gets whichever saves more on the order (Shopify's rule for an
 * automatic discount that doesn't combine), and is told why the code was
 * refused when the offer wins.
 *
 * This file is the arithmetic and nothing else, so the page, the server and
 * the tests agree on it. The server is the only one that charges: it runs
 * applyOffers on the cart it priced itself from the database
 * (lib/physical/checkout-pricing-server.ts, lib/checkout/pricing.ts), never
 * on numbers a browser sent. Every unit is discounted by one offer at most,
 * an offer never takes a line below zero, a pay what you want amount is
 * never discounted (the buyer named it, held to its minimum), and a code
 * applies after, to what's left.
 */

export const OFFER_KINDS = ["bundle", "checkout"] as const
export type OfferKind = (typeof OFFER_KINDS)[number]
export const DISCOUNT_TYPES = ["percent", "fixed", "free_shipping", "none"] as const
export type DiscountType = (typeof DISCOUNT_TYPES)[number]
/** Where a buyer sees an offer. */
export const PLACEMENTS = ["product", "cart", "checkout"] as const
export type Placement = (typeof PLACEMENTS)[number]
/** The places each kind can be shown. A bundle is completed on a product page or in the cart, never added in one press at the checkout. */
export const PLACEMENTS_FOR: Record<OfferKind, readonly Placement[]> = { bundle: ["product", "cart"], checkout: ["product", "cart", "checkout"] }

export const MAX_BUNDLE = 5
export const MAX_TRIGGERS = 20
export const MAX_PERCENT = 90
export const MAX_OFFERS = 50
export const MAX_PER_ORDER = 99
export const MAX_FIXED_CENTS = 10_000_000

export interface Offer {
  id: string
  kind: OfferKind
  title: string
  productIds: string[]
  triggerIds: string[]
  discountType: DiscountType
  /** Percent (1 to 90) or cents, by discountType; 0 for free shipping and none. */
  discountValue: number
  active: boolean
  /** A checkout offer's trigger collections: a product from any of them in the cart qualifies it (SQL part 213). */
  triggerCollectionIds?: string[]
  /** Where it shows; every place its kind allows when unset. */
  placements?: Placement[]
  /** ISO times. Before the start and from the end it neither shows nor applies. */
  startsAt?: string | null
  endsAt?: string | null
  /** Whether a discount code can be used on top. True when unset. */
  combinesWithCodes?: boolean
  /** Complete sets (bundle) or units (checkout offer) discounted in one order. Unset: every set, or one unit. */
  maxPerOrder?: number | null
  /** A checkout offer's minimum: the rest of the cart is worth at least this, in cents. */
  minSubtotalCents?: number | null
}

export interface OfferLine {
  productId: string
  unitCents: number
  quantity: number
  /** The collections this product is in, for a checkout offer's trigger collections. */
  collectionIds?: string[]
  /** A pay what you want amount: counted toward a set and a trigger, never discounted. */
  payWhatYouWant?: boolean
}

export interface AppliedOffer {
  offerId: string
  title: string
  kind: OfferKind
  savedCents: number
  /** It gives the order free shipping. */
  freeShipping?: boolean
}

export interface OfferResult {
  discounts: number[]
  applied: AppliedOffer[]
  freeShipping: boolean
}

export type OfferState = "active" | "scheduled" | "ended" | "off"

const uniq = (ids: string[]) => [...new Set(ids)]
const at = (iso: string | null | undefined) => {
  if (!iso) return null
  const t = Date.parse(iso)
  return Number.isFinite(t) ? t : null
}

/** Where an offer shows: what it chose, held to what its kind allows; all of those when it chose nothing. */
export function placementsOf(o: Pick<Offer, "kind" | "placements">): Placement[] {
  const allowed = PLACEMENTS_FOR[o.kind] ?? []
  const chosen = Array.isArray(o.placements) ? o.placements.filter((p) => allowed.includes(p)) : null
  return chosen === null ? [...allowed] : uniq(chosen) as Placement[]
}

/** Off, waiting for its start, past its end, or on now. */
export function offerState(o: Pick<Offer, "active" | "startsAt" | "endsAt">, now: Date = new Date()): OfferState {
  if (!o.active) return "off"
  const t = now.getTime()
  const end = at(o.endsAt)
  if (end !== null && t >= end) return "ended"
  const start = at(o.startsAt)
  if (start !== null && t < start) return "scheduled"
  return "active"
}

export const offerLive = (o: Pick<Offer, "active" | "startsAt" | "endsAt">, now: Date = new Date()) => offerState(o, now) === "active"

/** Whether it takes anything off or ships for free; "none" only suggests. */
const discounting = (o: Offer) => o.discountType === "free_shipping" || ((o.discountType === "percent" || o.discountType === "fixed") && o.discountValue > 0)

/** How a store's offer reads in a list: "15% off", "$5.00 off", "Free shipping", "No discount". */
export function discountLabel(o: Pick<Offer, "discountType" | "discountValue">, money: (cents: number) => string = (c) => `$${(c / 100).toFixed(2)}`): string {
  if (o.discountType === "percent" && o.discountValue > 0) return tt("{discountValue}% off", { discountValue: o.discountValue })
  if (o.discountType === "fixed" && o.discountValue > 0) return tt("{amount} off", { amount: money(o.discountValue) })
  if (o.discountType === "free_shipping") return tt("Free shipping")
  return tt("No discount")
}

/** One unit's discount under an offer, never more than the unit. */
function unitOff(o: Pick<Offer, "discountType" | "discountValue">, unitCents: number): number {
  if (o.discountType === "percent") return Math.min(unitCents, Math.round((unitCents * Math.min(MAX_PERCENT, Math.max(0, o.discountValue))) / 100))
  if (o.discountType === "fixed") return Math.min(unitCents, Math.max(0, Math.round(o.discountValue)))
  return 0
}

/**
 * Whether a checkout offer's conditions hold for a cart, leaving its own
 * product out: one of its trigger products, or a product from one of its
 * trigger collections (anything at all when it names neither), and the rest
 * of the cart worth at least its minimum.
 */
export function triggered(o: Offer, cart: { productId: string; quantity: number; unitCents?: number; collectionIds?: string[] }[]): boolean {
  const target = o.productIds[0]
  const others = cart.filter((l) => l.productId !== target && l.quantity > 0)
  if (others.length === 0) return false
  const min = Math.max(0, Math.round(Number(o.minSubtotalCents) || 0))
  if (min > 0 && others.reduce((n, l) => n + Math.max(0, Number(l.unitCents) || 0) * l.quantity, 0) < min) return false
  const products = new Set(o.triggerIds)
  const collections = new Set(o.triggerCollectionIds ?? [])
  if (products.size === 0 && collections.size === 0) return true
  return others.some((l) => products.has(l.productId) || (l.collectionIds ?? []).some((c) => collections.has(c)))
}

/**
 * What each line of a cart gets off, from the store's offers that are on
 * now, in their order: bundles first, then checkout offers. `discounts[i]`
 * is for `lines[i]`. `withCode`: a code is being used too, so the offers
 * that don't combine with codes are left out.
 */
export function applyOffers(lines: OfferLine[], offers: Offer[], opts: { now?: Date; withCode?: boolean } = {}): OfferResult {
  const now = opts.now ?? new Date()
  const discounts = lines.map(() => 0)
  const free = lines.map((l) => Math.max(0, Math.floor(l.quantity)))
  const applied: AppliedOffer[] = []
  let freeShipping = false
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
  const limit = (o: Offer, fallback: number) => {
    const n = Math.floor(Number(o.maxPerOrder))
    return Number.isFinite(n) && n >= 1 ? Math.min(MAX_PER_ORDER, n) : fallback
  }

  const on = offers.filter((o) => offerLive(o, now) && discounting(o) && !(opts.withCode && o.combinesWithCodes === false))
  const ordered = [...on.filter((o) => o.kind === "bundle"), ...on.filter((o) => o.kind === "checkout")]

  for (const o of ordered) {
    let saved = 0
    let ships = false
    if (o.kind === "bundle") {
      const ids = uniq(o.productIds)
      if (ids.length < 2 || ids.length > MAX_BUNDLE) continue
      const complete = Math.min(...ids.map(unitsOf))
      if (!Number.isFinite(complete) || complete <= 0) continue
      if (o.discountType === "free_shipping") {
        ships = true
      } else {
        const sets = Math.min(complete, limit(o, Infinity))
        for (let s = 0; s < sets; s++) {
          const units = ids.map((id) => take(id, 1)[0])
          /* A pay what you want amount is in the set but never discounted: the rest of the set takes the discount. */
          const priced = units.filter((i) => !lines[i].payWhatYouWant)
          if (o.discountType === "percent") {
            for (const i of priced) {
              const d = unitOff(o, lines[i].unitCents)
              discounts[i] += d
              saved += d
            }
          } else {
            /* A fixed amount off the set, shared by price; the last item takes the rounding. */
            const setCents = priced.reduce((n, i) => n + lines[i].unitCents, 0)
            const off = Math.min(setCents, Math.max(0, Math.round(o.discountValue)))
            let left = off
            priced.forEach((i, k) => {
              const share = k === priced.length - 1 ? left : Math.floor((off * lines[i].unitCents) / Math.max(1, setCents))
              const d = Math.min(share, lines[i].unitCents)
              discounts[i] += d
              left -= d
              saved += d
            })
          }
        }
      }
    } else {
      const target = o.productIds[0]
      if (!target || unitsOf(target) <= 0 || !triggered(o, lines)) continue
      if (o.discountType === "free_shipping") {
        ships = true
      } else {
        for (const i of take(target, limit(o, 1))) {
          if (lines[i].payWhatYouWant) continue
          const d = unitOff(o, lines[i].unitCents)
          discounts[i] += d
          saved += d
        }
      }
    }
    if (ships) freeShipping = true
    if (saved > 0 || ships) applied.push({ offerId: o.id, title: o.title, kind: o.kind, savedCents: saved, ...(ships ? { freeShipping: true } : {}) })
  }

  /* Never below zero: a line's discounts together stop at what the line costs. */
  lines.forEach((l, i) => (discounts[i] = Math.min(discounts[i], l.unitCents * Math.max(0, Math.floor(l.quantity)))))
  return { discounts, applied, freeShipping }
}

/** A code's discounts on what each line costs after the offers, or why it can't be used. */
export type CodeResult = { discounts: number[] } | { error: string }

export interface Stacked extends OfferResult {
  /** The code's part of each line, on top of `discounts`. */
  codeDiscounts: number[]
  /** Why the code could not be used, when it couldn't. */
  error: string | null
}

/**
 * Offers and a code together, by each offer's own rule. Every offer that
 * combines keeps its discount and the code comes off what's left. When one
 * that doesn't combine applies, the buyer gets whichever saves more: the
 * code with the offers that combine, or every offer and no code. The offers
 * winning refuses the code with the reason, and the caller prices the cart
 * without it.
 */
export function stackWithCode(lines: OfferLine[], offers: Offer[], code: ((remaining: number[]) => CodeResult) | null, opts: { now?: Date } = {}): Stacked {
  const all = applyOffers(lines, offers, opts)
  const none = lines.map(() => 0)
  if (!code) return { ...all, codeDiscounts: none, error: null }
  const byId = new Map(offers.map((o) => [o.id, o]))
  const blocking = all.applied.filter((a) => byId.get(a.offerId)?.combinesWithCodes === false)
  const remaining = (d: number[]) => lines.map((l, i) => Math.max(0, l.unitCents * Math.max(0, Math.floor(l.quantity)) - d[i]))
  if (blocking.length === 0) {
    const c = code(remaining(all.discounts))
    if ("error" in c) return { ...all, codeDiscounts: none, error: c.error }
    return { ...all, codeDiscounts: c.discounts, error: null }
  }
  const combo = applyOffers(lines, offers, { ...opts, withCode: true })
  const c = code(remaining(combo.discounts))
  if ("error" in c) return { ...all, codeDiscounts: none, error: c.error }
  const sum = (d: number[]) => d.reduce((n, x) => n + x, 0)
  if (sum(combo.discounts) + sum(c.discounts) >= sum(all.discounts)) return { ...combo, codeDiscounts: c.discounts, error: null }
  return { ...all, codeDiscounts: none, error: tt("That code can't be used with {title}, which already saves more on this order.", { title: blocking[0].title }) }
}

/** The checkout offers to suggest for a cart, in one place: on now, shown there, their product isn't in the cart yet, and the cart qualifies. */
export function suggestionsFor(cart: { productId: string; quantity: number; unitCents?: number; collectionIds?: string[] }[], offers: Offer[], opts: { placement?: Placement; now?: Date } = {}): Offer[] {
  const now = opts.now ?? new Date()
  const placement = opts.placement ?? "checkout"
  const inCart = new Set(cart.filter((l) => l.quantity > 0).map((l) => l.productId))
  return offers.filter((o) => o.kind === "checkout" && offerLive(o, now) && placementsOf(o).includes(placement) && o.productIds[0] && !inCart.has(o.productIds[0]) && triggered(o, cart)).slice(0, 3)
}

/** Bundles the cart holds part of, with what's missing from each: shown in the cart as "add the rest". */
export function bundleCompletions(cart: { productId: string; quantity: number }[], offers: Offer[], opts: { now?: Date } = {}): { offer: Offer; missing: string[] }[] {
  const now = opts.now ?? new Date()
  const inCart = new Set(cart.filter((l) => l.quantity > 0).map((l) => l.productId))
  return offers
    .filter((o) => o.kind === "bundle" && offerLive(o, now) && placementsOf(o).includes("cart"))
    .flatMap((o) => {
      const ids = uniq(o.productIds)
      const missing = ids.filter((id) => !inCart.has(id))
      return missing.length > 0 && missing.length < ids.length ? [{ offer: o, missing }] : []
    })
    .slice(0, 2)
}

/** The bundles a product's page shows: on now, shown on product pages, with it in. */
export function bundlesWith(productId: string, offers: Offer[], opts: { now?: Date } = {}): Offer[] {
  const now = opts.now ?? new Date()
  return offers.filter((o) => o.kind === "bundle" && offerLive(o, now) && placementsOf(o).includes("product") && o.productIds.includes(productId)).slice(0, 2)
}

/** The checkout offers a product's page suggests: on now, shown on product pages, triggered by this product (or by anything), and not this product itself. */
export function upsellsFor(productId: string, collectionIds: string[], offers: Offer[], opts: { now?: Date } = {}): Offer[] {
  const now = opts.now ?? new Date()
  const mine = new Set(collectionIds)
  return offers
    .filter((o) => {
      if (o.kind !== "checkout" || !offerLive(o, now) || !placementsOf(o).includes("product")) return false
      if (!o.productIds[0] || o.productIds[0] === productId) return false
      const colls = o.triggerCollectionIds ?? []
      if (o.triggerIds.length === 0 && colls.length === 0) return true
      return o.triggerIds.includes(productId) || colls.some((c) => mine.has(c))
    })
    .slice(0, 2)
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
  return unitCents - unitOff(o, unitCents)
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A time as the editor sent it: an ISO string, or null for none. */
function readTime(v: unknown): string | null | "bad" {
  if (v === null || v === undefined || v === "") return null
  if (typeof v !== "string") return "bad"
  const t = Date.parse(v)
  return Number.isFinite(t) ? new Date(t).toISOString() : "bad"
}

/** An offer as the store's editor sent it, checked, or what is wrong with it. */
export function readOffer(body: Record<string, unknown> | null): { ok: true; offer: Omit<Offer, "id"> } | { ok: false; error: string } {
  if (!body) return { ok: false, error: tt("Bad request.") }
  const kind = OFFER_KINDS.includes(body.kind as OfferKind) ? (body.kind as OfferKind) : null
  if (!kind) return { ok: false, error: tt("Choose a bundle or a checkout offer.") }
  const title = typeof body.title === "string" ? body.title.replace(/\s+/g, " ").trim().slice(0, 80) : ""
  if (!title) return { ok: false, error: tt("Give it a name buyers will see, like “Complete the set”.") }
  const ids = (v: unknown) => (Array.isArray(v) ? uniq(v.filter((x): x is string => typeof x === "string" && UUID.test(x))) : [])
  const productIds = ids(body.productIds)
  const triggerIds = kind === "checkout" ? ids(body.triggerIds).filter((id) => id !== productIds[0]).slice(0, MAX_TRIGGERS) : []
  const triggerCollectionIds = kind === "checkout" ? ids(body.triggerCollectionIds).slice(0, MAX_TRIGGERS) : []
  if (kind === "bundle" && (productIds.length < 2 || productIds.length > MAX_BUNDLE)) return { ok: false, error: tt("A bundle has 2 to {maxBundle} products.", { maxBundle: MAX_BUNDLE }) }
  if (kind === "checkout" && productIds.length !== 1) return { ok: false, error: tt("Choose the product to offer.") }
  const discountType = DISCOUNT_TYPES.includes(body.discountType as DiscountType) ? (body.discountType as DiscountType) : "percent"
  const raw = Math.round(Number(body.discountValue))
  const discountValue = discountType === "none" || discountType === "free_shipping" ? 0 : Number.isFinite(raw) ? raw : 0
  if (discountType === "percent" && (discountValue < 1 || discountValue > MAX_PERCENT)) return { ok: false, error: tt("A percent off is 1 to {maxPercent}.", { maxPercent: MAX_PERCENT }) }
  if (discountType === "fixed" && (discountValue < 1 || discountValue > MAX_FIXED_CENTS)) return { ok: false, error: tt("Enter the amount off.") }
  const allowed = PLACEMENTS_FOR[kind]
  const placements = Array.isArray(body.placements) ? uniq(body.placements.filter((p): p is Placement => typeof p === "string" && allowed.includes(p as Placement))) as Placement[] : [...allowed]
  if (placements.length === 0) return { ok: false, error: tt("Choose at least one place to show it.") }
  const startsAt = readTime(body.startsAt)
  const endsAt = readTime(body.endsAt)
  if (startsAt === "bad" || endsAt === "bad") return { ok: false, error: tt("Enter a date and time.") }
  if (startsAt && endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) return { ok: false, error: tt("The end has to be after the start.") }
  const max = body.maxPerOrder === null || body.maxPerOrder === undefined || body.maxPerOrder === "" ? null : Math.floor(Number(body.maxPerOrder))
  if (max !== null && (!Number.isFinite(max) || max < 1 || max > MAX_PER_ORDER)) return { ok: false, error: tt("A limit per order is 1 to {max}.", { max: MAX_PER_ORDER }) }
  const min = kind === "checkout" && body.minSubtotalCents !== null && body.minSubtotalCents !== undefined && body.minSubtotalCents !== "" ? Math.round(Number(body.minSubtotalCents)) : null
  if (min !== null && (!Number.isFinite(min) || min < 0 || min > MAX_FIXED_CENTS)) return { ok: false, error: tt("Enter the order minimum as an amount.") }
  return {
    ok: true,
    offer: {
      kind,
      title,
      productIds,
      triggerIds,
      triggerCollectionIds,
      discountType,
      discountValue,
      active: body.active !== false,
      placements,
      startsAt,
      endsAt,
      combinesWithCodes: body.combinesWithCodes !== false,
      maxPerOrder: max,
      minSubtotalCents: min && min > 0 ? min : null,
    },
  }
}
