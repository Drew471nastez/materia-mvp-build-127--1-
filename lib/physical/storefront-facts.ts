/**
 * ===========================================================================
 *  WHAT A SHOP'S WEBSITE MAY SAY ABOUT DELIVERY, PICKUP AND RETURNS
 * ===========================================================================
 * Read from the store's own settings (Settings › Shipping and delivery,
 * Locations, Returns and refunds), so the website and the checkout never
 * disagree. Two readers:
 *
 *   shopFacts      the whole shop: returns, and where shipping turns free at
 *                  home. The free shipping banner and the cart's returns line,
 *                  on a site of Storelib's own (app/api/physical/storefront/
 *                  shop) and on an imported theme (lib/website-builder/
 *                  compat-site.ts).
 *   productDelivery  one product that ships: the cheapest way it is delivered
 *                  to the shop's home country and how long that takes, and
 *                  the pickup points that hold each option. The product
 *                  page's "Delivery and pickup" block, and an imported
 *                  theme's `variant.store_availabilities`.
 *
 * ONLY WHAT A BUYER WOULD SEE AT CHECKOUT: a price, a number of days, a
 * pickup point's name, town and "Usually ready in". Never a stock level, a
 * cost, a street address of a location that does not offer pickup.
 *
 * Never throws: a shop that cannot be read says nothing.
 */
import { loadLocations, loadProfiles } from "./config-server"
import { freeShippingFrom } from "./rates"
import { deliveryPromise } from "./delivery-promise"
import { PICKUP_READY_LABEL } from "./pickup"
import { liveVariant } from "./storefront-stock"
import type { Location, ShippingProfile } from "./types"
import type { PickupPoint, ProductDelivery } from "./delivery-lines"

export type { PickupPoint, ProductDelivery } from "./delivery-lines"

type Db = { from: (table: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

export interface ShopFacts {
  returns: { enabled: boolean; windowDays: number } | null
  freeShippingFromCents: number | null
}

/** The country the shop ships from: Store details, else its default location's. */
async function homeCountry(db: Db, creatorId: string, defaultLocationId: string | null | undefined): Promise<string | null> {
  const { data: store } = await db.from("store_settings").select("default_country").eq("creator_id", creatorId).maybeSingle()
  let country: string | null = (store as { default_country?: string | null } | null)?.default_country ?? null
  if (!country && defaultLocationId) {
    const { data: loc } = await db.from("inventory_locations").select("country").eq("id", defaultLocationId).eq("creator_id", creatorId).maybeSingle()
    country = (loc as { country?: string | null } | null)?.country ?? null
  }
  return country ? country.trim().toUpperCase() : null
}

export async function shopFacts(db: Db, creatorId: string): Promise<ShopFacts> {
  try {
    const [{ data: settings }, profiles] = await Promise.all([
      db.from("commerce_settings").select("returns_enabled, return_window_days, default_location_id").eq("creator_id", creatorId).maybeSingle(),
      loadProfiles(db as never, creatorId).catch(() => [] as ShippingProfile[]),
    ])
    const country = await homeCountry(db, creatorId, settings?.default_location_id).catch(() => null)
    const general = profiles.find((p) => p.isDefault) ?? profiles[0] ?? null
    return {
      /* Null until the shop has set up physical selling: nothing is said about returns it never chose. */
      returns: settings ? { enabled: settings.returns_enabled !== false, windowDays: Number(settings.return_window_days ?? 30) } : null,
      freeShippingFromCents: freeShippingFrom(general, country),
    }
  } catch {
    return { returns: null, freeShippingFromCents: null }
  }
}

type VariantRow = { id: string; name: string; active?: boolean | null; track_inventory?: boolean | null; inventory_policy?: string | null; price_cents?: number | null; weight_grams?: number | null; fulfillment_method?: string | null }

/**
 * Delivery and pickup for one published product that ships. `priceCents` is
 * what one costs, for a rate priced by order value. Null for a product that
 * is not for sale, does not ship, or a shop that cannot be read.
 */
export async function productDelivery(db: Db, creatorId: string, productId: string): Promise<ProductDelivery | null> {
  try {
    const { data: product } = await db
      .from("products")
      .select("id, price_cents, track_inventory, continue_selling, shipping_profile_id, weight_grams, requires_shipping, fulfillment_method")
      .eq("id", productId)
      .eq("creator_id", creatorId)
      .eq("type", "physical")
      .eq("status", "published")
      .maybeSingle()
    if (!product) return null
    const p = product as { price_cents?: number | null; track_inventory?: boolean | null; continue_selling?: boolean | null; shipping_profile_id?: string | null; weight_grams?: number | null; requires_shipping?: boolean | null; fulfillment_method?: string | null }
    const [{ data: settings }, profiles, locations, { data: variantRows }] = await Promise.all([
      db.from("commerce_settings").select("default_location_id").eq("creator_id", creatorId).maybeSingle(),
      loadProfiles(db as never, creatorId).catch(() => [] as ShippingProfile[]),
      loadLocations(db as never, creatorId).catch(() => [] as Location[]),
      db.from("product_variants").select("id, name, active, track_inventory, inventory_policy, price_cents, weight_grams, fulfillment_method").eq("product_id", productId).order("position", { ascending: true }),
    ])
    const variants = ((variantRows ?? []) as VariantRow[]).filter((v) => liveVariant(v))

    /* Shipping home: the cheapest rate for one of it, by the one rule the buy box says it (./delivery-promise.ts, F23), so every product page agrees. */
    let ship: ProductDelivery["ship"] = null
    let local = false
    const country = await homeCountry(db, creatorId, settings?.default_location_id).catch(() => null)
    if (country) {
      const promise = deliveryPromise({
        profiles,
        profileId: p.shipping_profile_id ?? null,
        country,
        priceCents: Math.max(0, Number(variants[0]?.price_cents ?? p.price_cents) || 0),
        weightGrams: Math.max(0, Number(variants[0]?.weight_grams ?? p.weight_grams) || 0),
        locations,
        shipsItself: (p.fulfillment_method ?? "self") === "self",
      })
      if (promise.shipping) ship = { country, priceCents: promise.shipping.priceCents, estimate: promise.shipping.estimate ?? "", freeFromCents: promise.freeOverCents }
      local = promise.localDelivery
    }

    /* Pickup: a location with pickup on that fulfils orders, for an item the seller ships themselves, holding the option (or selling it past zero). */
    const pickup: Record<string, PickupPoint[]> = {}
    const points = locations.filter((l) => l.pickupEnabled && l.active && l.fulfillsOrders)
    if (points.length && variants.length) {
      const held = new Map<string, number>()
      const { data: levels } = await db.from("inventory_levels").select("variant_id, location_id, available").in("variant_id", variants.map((v) => v.id)).in("location_id", points.map((l) => l.id))
      for (const l of (levels ?? []) as { variant_id: string; location_id: string; available: number }[]) held.set(`${l.variant_id}:${l.location_id}`, Math.max(0, Number(l.available) || 0))
      for (const v of variants) {
        /* A print on demand or dropshipped option never passes through the seller's hands. */
        if ((v.fulfillment_method ?? p.fulfillment_method ?? "self") !== "self") continue
        const tracked = v.track_inventory ?? p.track_inventory ?? true
        const keepSelling = v.inventory_policy === "continue" || p.continue_selling === true
        const here = points.filter((l) => !tracked || keepSelling || (held.get(`${v.id}:${l.id}`) ?? 0) > 0)
        if (here.length) pickup[v.id] = here.map((l) => ({ name: l.name, city: l.city, ready: PICKUP_READY_LABEL[l.pickupReady] ?? "Usually ready in 24 hours" }))
      }
    }
    return { ship, pickup, local }
  } catch {
    return null
  }
}
