/**
 * ===========================================================================
 *  CAN THIS STORE SELL WHAT IT SHIPS? ONE ANSWER FOR EVERY SCREEN
 * ===========================================================================
 * Home's banner, the Products page, the product editor, Settings > Shipping,
 * the website builder, the bell and the emails all ask this, and all read
 * the answer from here, so they never disagree about what is missing.
 *
 * Each item is checked against what the checkout and the order code really
 * do (lib/physical/checkout-pricing-server.ts, rates.ts, checkout-server.ts),
 * not against a wish list:
 *
 *   BLOCKING, a buyer can't check out or the order can't ship
 *     payments       checkout refuses every card until payments are ready
 *                    (lib/payments/service checkoutReadyForCreator, the one
 *                    readiness source, transfers aware)
 *     delivery       no active rate in any zone, no pickup and no local
 *                    delivery: quoteDelivery has nothing to offer anywhere
 *     profile_rates  a live product ships with a profile that has no rates,
 *                    so that product never gets a delivery option
 *     rate_fit       a live product's own price or weight falls outside
 *                    every rate of its profile (a weight rate starting at
 *                    500 g and a product of 200 g): no option for it alone
 *     location       a product that tracks stock and no location that
 *                    fulfils orders: checkout reports it as out of stock
 *     partner        a print on demand location whose service is not
 *                    connected: orders are taken and never sent on
 *
 *   RECOMMENDED, it sells, but something will look wrong or cost money
 *     stock          live products with nothing in stock (buyers see sold out)
 *     weights        products with no weight while rates go by weight
 *                    (they ship at the lightest price)
 *     package        no box, while rates go by weight
 *     ship_from      the location orders ship from has no address
 *     pickup_hours   pickup is on and buyers aren't told when to come
 *     tax_rates      tax is on with no rate, so nothing is charged
 *     business       tax is charged and receipts don't name the business
 *     contact_email  replies to order emails go to the login address
 *
 * Not on the list, on purpose: the checkout links Storelib's own terms and
 * refund policy (app/checkout/site), so a store policy page is not needed to
 * sell; returns have working defaults (30 days); "how do you fulfil orders"
 * creates the first location, which `location` already covers.
 *
 * Pure and client safe. The reads are ./readiness-server.ts.
 */
import { ratePrice } from "./rates"
import type { Location, ShippingProfile } from "./types"

export type ReadinessLevel = "blocking" | "recommended"

export type ReadinessId =
  | "payments"
  | "delivery"
  | "profile_rates"
  | "rate_fit"
  | "location"
  | "partner"
  | "stock"
  | "weights"
  | "package"
  | "ship_from"
  | "pickup_hours"
  | "tax_rates"
  | "business"
  | "contact_email"

export interface ReadinessItem {
  id: ReadinessId
  level: ReadinessLevel
  /** What to do, short: "Add a shipping rate". */
  title: string
  /** Why it matters, one sentence. */
  why: string
  /** Where it is fixed: a page in /app. */
  href: string
  /** The button: "Fix", or a little more when it helps. */
  fix: string
  /** The products it is about, by name, when it is about some of them. */
  products?: string[]
}

/** One physical product, boiled down to what readiness asks of it. */
export interface ReadinessProduct {
  id: string
  title: string
  /** On sale now (status published). */
  live: boolean
  /** Any active variant needs to be posted. */
  requiresShipping: boolean
  /** Some active variant tracks stock and does not sell past zero (and is not printed to order). */
  tracked: boolean
  /** A buyer could add at least one variant to the cart today: stock somewhere it ships from, or not tracked. */
  inStock: boolean
  /** The lightest active variant's weight in grams; 0 or null is no weight. */
  weightGrams: number | null
  /** The cheapest active variant's price in cents. */
  priceCents: number
  shippingProfileId: string | null
  /** The location it is fulfilled from, when it names one. */
  locationId: string | null
}

export interface ReadinessFacts {
  /** lib/payments/service checkoutReadyForCreator. Null when it could not be read: nothing is claimed either way. */
  paymentsReady: boolean | null
  products: ReadinessProduct[]
  profiles: ShippingProfile[]
  locations: Location[]
  defaultLocationId: string | null
  packages: number
  /** The default box's empty weight, added to a parcel as the checkout adds it. */
  packageGrams: number
  taxMode: "none" | "manual" | "provider"
  taxRates: number
  /** A store contact email or support email is set (store_settings.contact_email, creators.support_email). */
  contactEmail: boolean
  /** The business behind the store is filled in (store_settings.legal, part 153). Null when it could not be read. */
  businessDetails: boolean | null
}

export interface PhysicalReadiness {
  /** Physical products, live or not. */
  physical: number
  /** Physical products on sale now. */
  live: number
  items: ReadinessItem[]
  blocking: number
  recommended: number
  /** Nothing blocking. */
  ready: boolean
  /** The blocking ids, sorted: the same gaps read the same. */
  signature: string
}

const SHIPPING = "/app/settings?tab=shipping"
const LOCATIONS = "/app/settings?tab=locations"
const TAXES = "/app/settings?tab=taxes"
const STORE = "/app/settings?tab=store"
const INTEGRATIONS = "/app/settings?tab=integrations"
const PAYOUTS = "/app/payouts"
const INVENTORY = "/app/inventory"
/** What the product editor asks with before a new product is saved (and so published). */
export const NEW_PRODUCT = "new"

const productHref = (id: string) => `/app/products/${encodeURIComponent(id)}`

/** Rates a buyer can actually be offered with nothing connected: active, and not priced by a carrier (none is connected yet). */
function usableRates(profile: ShippingProfile | null | undefined) {
  if (!profile) return []
  return profile.zones
    .filter((z) => z.restOfWorld || z.countries.length > 0 || (z.regions ?? []).length > 0)
    .flatMap((z) => z.rates)
    .filter((r) => r.active && r.kind !== "carrier")
}

/** The profile a product ships with: its own, else the General one, else the first, as quoteDelivery picks it. */
export function profileOf(profiles: ShippingProfile[], id: string | null): ShippingProfile | null {
  return profiles.find((p) => p.id === id) ?? profiles.find((p) => p.isDefault) ?? profiles[0] ?? null
}

/** Whether one unit of this product alone gets a price from some rate of its profile. */
export function fitsSomeRate(profile: ShippingProfile, p: Pick<ReadinessProduct, "weightGrams" | "priceCents">, packageGrams = 0): boolean {
  const grams = Math.max(0, p.weightGrams ?? 0)
  const totals = { units: 1, cents: Math.max(0, p.priceCents), grams: grams + Math.max(0, packageGrams), items: [{ grams, quantity: 1 }] }
  return usableRates(profile).some((r) => ratePrice(r, totals) !== null)
}

const BY_WEIGHT = new Set(["weight", "item_weight"])

/** "Mug", "Mug and Tee", "Mug, Tee and 3 more". */
export function namesOf(titles: string[]): string {
  const names = [...new Set(titles.filter(Boolean))]
  if (names.length <= 1) return names[0] ?? ""
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  return `${names[0]}, ${names[1]} and ${names.length - 2} more`
}

/**
 * The answer. `asLive` treats one product as on sale already: the product
 * editor asks before it is published what publishing it would run into.
 */
export function physicalReadiness(f: ReadinessFacts, opts: { asLive?: string | null } = {}): PhysicalReadiness {
  const products = f.products.map((p) => (opts.asLive && p.id === opts.asLive ? { ...p, live: true } : p))
  /* "new": a product not saved yet, which saving publishes. Only what is true of the store is asked about it: its price and weight aren't known. */
  if (opts.asLive === NEW_PRODUCT) products.push({ id: NEW_PRODUCT, title: "This product", live: true, requiresShipping: true, tracked: true, inStock: true, weightGrams: null, priceCents: -1, shippingProfileId: null, locationId: null })
  const unknown = (p: ReadinessProduct) => p.priceCents < 0
  const live = products.filter((p) => p.live)
  /* What is checked: the products on sale, or before anything is, every physical product (Settings' checklist). */
  const relevant = live.length ? live : products
  const shipping = relevant.filter((p) => p.requiresShipping)
  const items: ReadinessItem[] = []

  const activeLocations = f.locations.filter((l) => l.active)
  const fulfilling = activeLocations.filter((l) => l.fulfillsOrders)
  const pickup = activeLocations.some((l) => l.pickupEnabled)
  const local = activeLocations.some((l) => !!l.localDelivery?.enabled && (l.localDelivery.codes ?? []).length > 0)
  const otherWay = pickup || local
  const anyRates = f.profiles.some((p) => usableRates(p).length > 0)

  if (products.length === 0) return summary(products, items)

  if (f.paymentsReady === false) {
    items.push({ id: "payments", level: "blocking", title: "Set up payments", why: "Buyers can't pay at checkout until this is done.", href: PAYOUTS, fix: "Set up" })
  }

  if (shipping.length && !anyRates && !otherWay) {
    items.push({ id: "delivery", level: "blocking", title: "Add a shipping rate", why: "Checkout has no way to get an order to the buyer, so nobody can buy.", href: SHIPPING, fix: "Add rate" })
  } else if (shipping.length && !otherWay) {
    const noRates = shipping.filter((p) => usableRates(profileOf(f.profiles, p.shippingProfileId)).length === 0)
    if (noRates.length) {
      items.push({
        id: "profile_rates",
        level: "blocking",
        title: noRates.length === 1 ? `${noRates[0].title} has no shipping rate` : `${noRates.length} products have no shipping rate`,
        why: `${namesOf(noRates.map((p) => p.title))} ${noRates.length === 1 ? "uses" : "use"} a shipping profile with no rates, so buyers can't check out with ${noRates.length === 1 ? "it" : "them"}.`,
        href: SHIPPING,
        fix: "Add rate",
        products: noRates.map((p) => p.title),
      })
    }
    const misfit = shipping.filter((p) => {
      const profile = profileOf(f.profiles, p.shippingProfileId)
      return !unknown(p) && !!profile && usableRates(profile).length > 0 && !fitsSomeRate(profile, p, f.packageGrams)
    })
    if (misfit.length) {
      items.push({
        id: "rate_fit",
        level: "blocking",
        title: misfit.length === 1 ? `${misfit[0].title} gets no shipping price` : `${misfit.length} products get no shipping price`,
        why: "Their price or weight is outside every rate you have, so checkout offers no delivery for them on their own.",
        href: SHIPPING,
        fix: "Check rates",
        products: misfit.map((p) => p.title),
      })
    }
  }

  if (relevant.some((p) => p.tracked) && fulfilling.length === 0) {
    items.push({ id: "location", level: "blocking", title: "Add a location you ship from", why: "Products that track stock show as sold out until a location fulfils orders.", href: LOCATIONS, fix: "Add location" })
  }

  const usedLocations = new Set(relevant.map((p) => p.locationId).filter(Boolean) as string[])
  for (const l of fulfilling) {
    if (!l.partner || l.partner.connected || !usedLocations.has(l.id)) continue
    items.push({ id: "partner", level: "blocking", title: `Connect ${l.partner.name}`, why: `Orders for products made by ${l.partner.name} won't be sent to them until it's connected.`, href: INTEGRATIONS, fix: "Connect" })
    break
  }

  /* ── Recommended ── */

  const soldOut = live.filter((p) => p.tracked && !p.inStock)
  if (soldOut.length) {
    items.push({
      id: "stock",
      level: "recommended",
      title: soldOut.length === 1 ? `${soldOut[0].title} is out of stock` : `${soldOut.length} live products are out of stock`,
      why: soldOut.length === 1 ? "Buyers see it as sold out. Add stock, or let it keep selling when it runs out." : "Buyers see them as sold out. Add stock, or let them keep selling when they run out.",
      href: INVENTORY,
      fix: "Add stock",
      products: soldOut.map((p) => p.title),
    })
  }

  const weightRates = f.profiles.some((p) => usableRates(p).some((r) => BY_WEIGHT.has(r.kind)))
  if (weightRates) {
    const light = shipping.filter((p) => !unknown(p) && !(p.weightGrams && p.weightGrams > 0) && usableRates(profileOf(f.profiles, p.shippingProfileId)).some((r) => BY_WEIGHT.has(r.kind)))
    if (light.length) {
      items.push({
        id: "weights",
        level: "recommended",
        title: light.length === 1 ? `Add a weight to ${light[0].title}` : `Add weights to ${light.length} products`,
        why: "Your rates go by weight, so without one they ship at the lightest price.",
        href: light.length === 1 ? productHref(light[0].id) : "/app/products",
        fix: "Add weight",
        products: light.map((p) => p.title),
      })
    }
    if (f.packages === 0) {
      items.push({ id: "package", level: "recommended", title: "Add the box you ship in", why: "Its weight is added to every parcel, so rates by weight come out right.", href: SHIPPING, fix: "Add box" })
    }
  }

  const shipsFrom = fulfilling.find((l) => l.id === f.defaultLocationId) ?? fulfilling[0] ?? null
  if (shipsFrom && shipping.length && (!shipsFrom.addressLine1 || !shipsFrom.city || !shipsFrom.country)) {
    items.push({ id: "ship_from", level: "recommended", title: "Add the address you ship from", why: `${shipsFrom.name} has no full address. Labels, local delivery and returns need it.`, href: LOCATIONS, fix: "Add address" })
  }

  if (activeLocations.some((l) => l.pickupEnabled && !l.pickupHours)) {
    items.push({ id: "pickup_hours", level: "recommended", title: "Add pickup hours", why: "Buyers who choose pickup aren't told when they can come.", href: LOCATIONS, fix: "Add hours" })
  }

  if (f.taxMode === "manual" && f.taxRates === 0) {
    items.push({ id: "tax_rates", level: "recommended", title: "Add your tax rates", why: "Tax is turned on but there's no rate, so no tax is charged.", href: TAXES, fix: "Add rate" })
  }
  if (f.taxMode === "manual" && f.taxRates > 0 && f.businessDetails === false) {
    items.push({ id: "business", level: "recommended", title: "Add your business details", why: "Receipts that charge tax should show your business name and tax number.", href: STORE, fix: "Add details" })
  }

  if (!f.contactEmail) {
    items.push({ id: "contact_email", level: "recommended", title: "Add a contact email", why: "Buyers reply to order emails. Right now replies go to your login email.", href: STORE, fix: "Add email" })
  }

  return summary(products, items)
}

function summary(all: ReadinessProduct[], items: ReadinessItem[]): PhysicalReadiness {
  const products = all.filter((p) => p.id !== NEW_PRODUCT)
  const blocking = items.filter((i) => i.level === "blocking")
  return {
    physical: products.length,
    live: products.filter((p) => p.live).length,
    items,
    blocking: blocking.length,
    recommended: items.length - blocking.length,
    ready: blocking.length === 0,
    signature: blocking.map((i) => i.id).sort().join(","),
  }
}

/**
 * The blocking items a surface should name. Where the screen already says
 * "set up payments" in its own words (Home's payouts announcement, the
 * product editor's payout notice), payments is left out here, so one cause
 * is never two banners.
 */
export function blockingItems(r: PhysicalReadiness | null | undefined, opts: { skipPayments?: boolean } = {}): ReadinessItem[] {
  if (!r) return []
  return r.items.filter((i) => i.level === "blocking" && !(opts.skipPayments && i.id === "payments"))
}

export function recommendedItems(r: PhysicalReadiness | null | undefined): ReadinessItem[] {
  return r ? r.items.filter((i) => i.level === "recommended") : []
}

/**
 * Whether the bell and the email should speak: something live, and a gap
 * other than payments (payments has its own notices and emails, lib/notify
 * workflows/unfinished.ts and the bell's payouts_not_connected).
 */
export function needsNotice(r: PhysicalReadiness | null | undefined): boolean {
  return !!r && r.live > 0 && blockingItems(r, { skipPayments: true }).length > 0
}

/* ── What changed since last time ─────────────────────────────────────── */

/** What was last recorded for a store (physical_readiness_state, SQL part 162). */
export interface ReadinessState {
  /** Live physical products with a blocking gap other than payments. */
  broken: boolean
  /** How many times it has gone from fine to broken: each time is one notice. */
  episode: number
  signature: string
  /** Live physical products when it was recorded. */
  live: number
}

export interface ReadinessTransition {
  next: ReadinessState
  /** Something to tell the creator about: a store that was fine (or had nothing live) now has a gap. */
  notify: null | { episode: number; reason: "live" | "broke" }
}

/**
 * Pure. `prev` null is a store never recorded. A store that is broken and
 * stays broken says nothing new (the reminder is already planned); one that
 * gets fixed records it, and breaking again later is a new episode.
 */
export function readinessTransition(prev: ReadinessState | null, r: PhysicalReadiness): ReadinessTransition {
  const broken = needsNotice(r)
  const signature = blockingItems(r, { skipPayments: true }).map((i) => i.id).sort().join(",")
  const episode = prev?.episode ?? 0
  if (!broken) return { next: { broken: false, episode, signature: "", live: r.live }, notify: null }
  if (prev?.broken) return { next: { broken: true, episode, signature, live: r.live }, notify: null }
  /* "broke": it was selling and fine (the last zone deleted, say); "live": the first thing went on sale with a gap. */
  const reason: "live" | "broke" = prev && prev.live > 0 ? "broke" : "live"
  return { next: { broken: true, episode: episode + 1, signature, live: r.live }, notify: { episode: episode + 1, reason } }
}
