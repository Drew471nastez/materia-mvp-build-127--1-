import "server-only"

/**
 * ===========================================================================
 *  A SHOP'S PHYSICAL COMMERCE SETTINGS: READ AND WRITTEN HERE ONLY
 * ===========================================================================
 * Locations, shipping profiles with their zones and rates, packages, tax
 * rates and the shop's commerce settings. Every read and write is filtered
 * by the creator id the caller proved (./auth.ts), so one shop can never
 * read or change another's, whatever ids a request carries.
 */

import { COUNTRY_CODES } from "@/lib/checkout/countries"
import type { Db } from "./auth"
import { readTiers } from "./rates"
import { regionList } from "./regions"
import { FULFILLMENT_MODELS, LOCATION_KINDS, PICKUP_READY, type FulfillmentModel, type Location, type LocationKind, type PickupReady, type RateKind, type ShippingProfile, type ShippingRate, type ShippingZone, type UnitSystem } from "./types"
import type { TaxRate, TaxSettings } from "./totals"

export interface CommerceSettings {
  fulfillmentModel: FulfillmentModel | null
  defaultLocationId: string | null
  defaultPackageId: string | null
  unitSystem: UnitSystem
  returnsEnabled: boolean
  returnWindowDays: number
  taxMode: "none" | "manual" | "provider"
  pricesIncludeTax: boolean
  taxOnShipping: boolean
  lowStockDefault: number
  /** Email the seller when an item sells down to its low stock line. */
  lowStockAlerts: boolean
  onboardedAt: string | null
}

export const DEFAULT_SETTINGS: CommerceSettings = {
  fulfillmentModel: null,
  defaultLocationId: null,
  defaultPackageId: null,
  unitSystem: "metric",
  returnsEnabled: true,
  returnWindowDays: 30,
  taxMode: "none",
  pricesIncludeTax: false,
  taxOnShipping: false,
  lowStockDefault: 5,
  lowStockAlerts: true,
  onboardedAt: null,
}

export interface ShippingPackage {
  id: string
  name: string
  kind: "box" | "envelope" | "soft_package"
  lengthMm: number
  widthMm: number
  heightMm: number
  weightGrams: number
  isDefault: boolean
}

export interface TaxRateRow extends TaxRate {
  id: string
  name: string
}

/* ── reading ──────────────────────────────────────────────────────────── */

export async function loadSettings(db: Db, creatorId: string): Promise<CommerceSettings> {
  const { data } = await db.from("commerce_settings").select("*").eq("creator_id", creatorId).maybeSingle()
  if (!data) return { ...DEFAULT_SETTINGS }
  return {
    fulfillmentModel: (data.fulfillment_model as FulfillmentModel | null) ?? null,
    defaultLocationId: data.default_location_id ?? null,
    defaultPackageId: data.default_package_id ?? null,
    unitSystem: data.unit_system === "imperial" ? "imperial" : "metric",
    returnsEnabled: data.returns_enabled !== false,
    returnWindowDays: Number(data.return_window_days ?? 30),
    taxMode: data.tax_mode ?? "none",
    pricesIncludeTax: !!data.prices_include_tax,
    taxOnShipping: !!data.tax_on_shipping,
    lowStockDefault: Number(data.low_stock_default ?? 5),
    lowStockAlerts: data.low_stock_alerts !== false,
    onboardedAt: data.onboarded_at ?? null,
  }
}

export function locationFromRow(r: Record<string, any>): Location {
  return {
    id: r.id,
    name: r.name,
    kind: r.kind,
    country: r.country ?? null,
    city: r.city ?? null,
    addressLine1: r.address_line1 ?? null,
    addressLine2: r.address_line2 ?? null,
    region: r.region ?? null,
    postalCode: r.postal_code ?? null,
    phone: r.phone ?? null,
    email: r.email ?? null,
    active: r.active !== false,
    fulfillsOrders: r.fulfills_orders !== false,
    holdsInventory: r.holds_inventory !== false,
    priority: Number(r.priority ?? 0),
    forwarding: r.forwarding ?? "none",
    pickupEnabled: r.pickup_enabled === true,
    pickupInstructions: r.pickup_instructions ?? null,
    pickupReady: (PICKUP_READY as readonly string[]).includes(r.pickup_ready) ? (r.pickup_ready as PickupReady) : "24h",
  }
}

export async function loadLocations(db: Db, creatorId: string): Promise<Location[]> {
  const { data } = await db.from("inventory_locations").select("*").eq("creator_id", creatorId).order("priority", { ascending: true }).order("created_at", { ascending: true }).limit(100)
  return ((data ?? []) as Record<string, any>[]).map(locationFromRow)
}

export function rateFromRow(r: Record<string, any>): ShippingRate {
  return {
    id: r.id,
    zoneId: r.zone_id,
    name: r.name,
    kind: r.kind as RateKind,
    priceCents: Number(r.price_cents ?? 0),
    minValue: r.min_value ?? null,
    maxValue: r.max_value ?? null,
    tiers: readTiers(r.tiers),
    freeOverCents: r.free_over_cents ?? null,
    minDays: r.min_days ?? null,
    maxDays: r.max_days ?? null,
    active: r.active !== false,
    position: Number(r.position ?? 0),
  }
}

export async function loadProfiles(db: Db, creatorId: string): Promise<ShippingProfile[]> {
  const [{ data: profiles }, { data: zones }, { data: rates }] = await Promise.all([
    db.from("shipping_profiles").select("id, name, is_default, created_at").eq("creator_id", creatorId).order("created_at", { ascending: true }).limit(50),
    db.from("shipping_zones").select("*").eq("creator_id", creatorId).order("created_at", { ascending: true }).limit(500),
    db.from("shipping_rates").select("*").eq("creator_id", creatorId).order("position", { ascending: true }).limit(2000),
  ])
  const ratesByZone = new Map<string, ShippingRate[]>()
  for (const r of (rates ?? []) as Record<string, any>[]) {
    const list = ratesByZone.get(r.zone_id) ?? []
    list.push(rateFromRow(r))
    ratesByZone.set(r.zone_id, list)
  }
  const zonesByProfile = new Map<string, ShippingZone[]>()
  for (const z of (zones ?? []) as Record<string, any>[]) {
    const list = zonesByProfile.get(z.profile_id) ?? []
    list.push({ id: z.id, profileId: z.profile_id, name: z.name, countries: z.countries ?? [], regions: z.regions ?? [], restOfWorld: !!z.rest_of_world, rates: ratesByZone.get(z.id) ?? [] })
    zonesByProfile.set(z.profile_id, list)
  }
  return ((profiles ?? []) as Record<string, any>[]).map((p) => ({ id: p.id, name: p.name, isDefault: !!p.is_default, zones: zonesByProfile.get(p.id) ?? [] }))
}

export async function loadPackages(db: Db, creatorId: string): Promise<ShippingPackage[]> {
  const { data } = await db.from("shipping_packages").select("*").eq("creator_id", creatorId).order("created_at", { ascending: true }).limit(50)
  return ((data ?? []) as Record<string, any>[]).map((r) => ({
    id: r.id,
    name: r.name,
    kind: r.kind,
    lengthMm: r.length_mm,
    widthMm: r.width_mm,
    heightMm: r.height_mm,
    weightGrams: r.weight_grams ?? 0,
    isDefault: !!r.is_default,
  }))
}

export async function loadTaxRates(db: Db, creatorId: string): Promise<TaxRateRow[]> {
  const { data } = await db.from("commerce_tax_rates").select("id, country, region, name, rate_bps").eq("creator_id", creatorId).order("country").limit(500)
  return ((data ?? []) as Record<string, any>[]).map((r) => ({ id: r.id, country: r.country, region: r.region ?? null, name: r.name, rateBps: r.rate_bps }))
}

export async function loadTaxSettings(db: Db, creatorId: string, settings?: CommerceSettings): Promise<TaxSettings> {
  const s = settings ?? (await loadSettings(db, creatorId))
  if (s.taxMode !== "manual") return { mode: s.taxMode, pricesIncludeTax: s.pricesIncludeTax, taxOnShipping: s.taxOnShipping, rates: [] }
  const [rates, overrides] = await Promise.all([loadTaxRates(db, creatorId), loadTaxOverrides(db, creatorId)])
  return { mode: "manual", pricesIncludeTax: s.pricesIncludeTax, taxOnShipping: s.taxOnShipping, rates, overrides }
}

/** Products with their own rate in a region (SQL part 110); none before the part is run. */
export async function loadTaxOverrides(db: Db, creatorId: string): Promise<{ taxRateId: string; productId: string; rateBps: number }[]> {
  const { data, error } = await db.from("commerce_tax_overrides").select("tax_rate_id, product_id, rate_bps").eq("creator_id", creatorId).limit(1000)
  if (error) return []
  return ((data ?? []) as Record<string, any>[]).map((r) => ({ taxRateId: r.tax_rate_id, productId: r.product_id, rateBps: r.rate_bps }))
}

/* ── reading input ────────────────────────────────────────────────────── */

export function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null
  const v = value.replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, max)
  return v || null
}

export function int(value: unknown, min: number, max: number): number | null {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value
  if (typeof n !== "number" || !Number.isFinite(n)) return null
  const r = Math.round(n)
  return r < min || r > max ? null : r
}

export function countryList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.map((c) => (typeof c === "string" ? c.trim().toUpperCase() : "")).filter((c) => COUNTRY_CODES.has(c)))].slice(0, 260)
}

/* ── writing ──────────────────────────────────────────────────────────── */

export async function saveSettings(db: Db, creatorId: string, input: Record<string, unknown>): Promise<{ ok: true } | { ok: false; error: string }> {
  const row: Record<string, unknown> = { creator_id: creatorId, updated_at: new Date().toISOString() }
  if ("fulfillmentModel" in input) {
    if (input.fulfillmentModel !== null && !FULFILLMENT_MODELS.includes(input.fulfillmentModel as FulfillmentModel)) return { ok: false, error: "Choose how you fulfil orders." }
    row.fulfillment_model = input.fulfillmentModel
  }
  if ("returnsEnabled" in input) row.returns_enabled = input.returnsEnabled === true
  if ("returnWindowDays" in input) {
    const days = int(input.returnWindowDays, 0, 365)
    if (days === null) return { ok: false, error: "The return window is 0 to 365 days." }
    row.return_window_days = days
  }
  if ("taxMode" in input) {
    if (!["none", "manual", "provider"].includes(String(input.taxMode))) return { ok: false, error: "Choose how tax is charged." }
    row.tax_mode = input.taxMode
  }
  if ("unitSystem" in input) {
    if (input.unitSystem !== "metric" && input.unitSystem !== "imperial") return { ok: false, error: "Choose metric or imperial." }
    row.unit_system = input.unitSystem
  }
  if ("lowStockAlerts" in input) row.low_stock_alerts = input.lowStockAlerts === true
  if ("pricesIncludeTax" in input) row.prices_include_tax = input.pricesIncludeTax === true
  if ("taxOnShipping" in input) row.tax_on_shipping = input.taxOnShipping === true
  if ("lowStockDefault" in input) {
    const n = int(input.lowStockDefault, 0, 100000)
    if (n === null) return { ok: false, error: "Low stock is a whole number." }
    row.low_stock_default = n
  }
  for (const [key, col, table] of [
    ["defaultLocationId", "default_location_id", "inventory_locations"],
    ["defaultPackageId", "default_package_id", "shipping_packages"],
  ] as const) {
    if (!(key in input)) continue
    const id = input[key]
    if (id === null) {
      row[col] = null
      continue
    }
    if (typeof id !== "string") return { ok: false, error: "Choose one of your own." }
    const { data } = await db.from(table).select("id").eq("id", id).eq("creator_id", creatorId).maybeSingle()
    if (!data) return { ok: false, error: "Choose one of your own." }
    row[col] = id
  }
  if (input.markOnboarded === true) row.onboarded_at = new Date().toISOString()
  const { error } = await db.from("commerce_settings").upsert(row, { onConflict: "creator_id" })
  if (error) return { ok: false, error: "Settings could not be saved." }
  return { ok: true }
}

const KIND_NAMES: Record<LocationKind, string> = {
  home: "Home",
  warehouse: "Warehouse",
  print_on_demand: "Print on demand",
  dropshipper: "Dropshipping supplier",
  supplier: "Supplier",
  third_party_logistics: "Fulfillment center",
  retail: "Store",
  custom: "Location",
}

export function readLocation(input: Record<string, unknown>): { ok: true; row: Record<string, unknown> } | { ok: false; error: string } {
  const kind = (LOCATION_KINDS as readonly string[]).includes(String(input.kind)) ? (input.kind as LocationKind) : "home"
  const name = text(input.name, 80) ?? KIND_NAMES[kind]
  const country = input.country ? String(input.country).trim().toUpperCase() : null
  if (country && !COUNTRY_CODES.has(country)) return { ok: false, error: "Choose a country." }
  const email = text(input.email, 254)
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "Check the email address." }
  const forwarding = ["none", "email", "webhook", "provider"].includes(String(input.forwarding)) ? input.forwarding : "none"
  if (forwarding === "email" && !email) return { ok: false, error: "Add the email orders are sent to." }
  const pickupEnabled = input.pickupEnabled === true
  if (pickupEnabled && (!text(input.addressLine1, 200) || !text(input.city, 120) || !country)) return { ok: false, error: "Add the street, city and country so buyers know where to pick up." }
  const pickupReady = (PICKUP_READY as readonly string[]).includes(String(input.pickupReady)) ? String(input.pickupReady) : "24h"
  return {
    ok: true,
    row: {
      name,
      kind,
      address_line1: text(input.addressLine1, 200),
      address_line2: text(input.addressLine2, 200),
      city: text(input.city, 120),
      region: text(input.region, 120),
      postal_code: text(input.postalCode, 20),
      country,
      phone: text(input.phone, 40),
      email,
      active: input.active !== false,
      fulfills_orders: input.fulfillsOrders !== false,
      holds_inventory: input.holdsInventory !== false,
      priority: int(input.priority, 0, 1000) ?? 0,
      forwarding,
      pickup_enabled: pickupEnabled,
      pickup_instructions: typeof input.pickupInstructions === "string" ? input.pickupInstructions.replace(/[\u0000-\u0008\u000b-\u001f\u007f<>]/g, "").trim().slice(0, 1000) || null : null,
      pickup_ready: pickupReady,
      updated_at: new Date().toISOString(),
    },
  }
}

export const RATE_KINDS: RateKind[] = ["flat", "free", "price", "weight", "item_weight", "quantity", "carrier"]
const TIERED: RateKind[] = ["price", "weight", "item_weight"]

export function readRate(input: Record<string, unknown>): { ok: true; row: Record<string, unknown> } | { ok: false; error: string } {
  const kind = RATE_KINDS.includes(String(input.kind) as RateKind) ? (input.kind as RateKind) : null
  if (!kind) return { ok: false, error: "Choose a rate type." }
  const name = text(input.name, 80)
  if (!name) return { ok: false, error: "Name the rate as buyers will see it, like Standard or Express." }
  const opt = (v: unknown, min: number, max: number) => (v === null || v === "" || v === undefined ? null : int(v, min, max))
  const tiers = TIERED.includes(kind) ? readTiers(input.tiers) : []
  const tieredNow = TIERED.includes(kind) && (tiers.length > 0 || kind === "item_weight")
  if (tieredNow && tiers.length === 0) return { ok: false, error: "Add at least one price." }
  if (tieredNow && tiers[0].from !== 0) return { ok: false, error: "The first price starts from 0." }
  const price = kind === "free" ? 0 : tieredNow ? tiers[0].priceCents : int(input.priceCents, 0, 10_000_000)
  if (price === null) return { ok: false, error: "Enter the price." }
  const min = opt(input.minValue, 0, 1_000_000_000)
  const max = opt(input.maxValue, 0, 1_000_000_000)
  if (!tieredNow && (kind === "weight" || kind === "price" || kind === "quantity") && min === null && max === null) return { ok: false, error: "Set a minimum or a maximum for this rate." }
  if (min !== null && max !== null && max < min) return { ok: false, error: "The maximum is below the minimum." }
  if (tieredNow && max !== null && max <= tiers[tiers.length - 1].from) return { ok: false, error: "The limit must be above your last price step." }
  const freeOver = opt(input.freeOverCents, 1, 100_000_000)
  const minDays = opt(input.minDays, 0, 365)
  const maxDays = opt(input.maxDays, 0, 365)
  if (minDays !== null && maxDays !== null && maxDays < minDays) return { ok: false, error: "The delivery time range is the wrong way round." }
  return {
    ok: true,
    row: {
      name,
      kind,
      price_cents: price,
      /* free: min is the order value it starts at; tiered: max is the most it is offered for; older ranges keep both. */
      min_value: kind === "free" ? min : kind === "flat" || kind === "carrier" || tieredNow ? null : min,
      max_value: kind === "flat" || kind === "free" || kind === "carrier" ? null : max,
      tiers,
      free_over_cents: kind === "free" ? null : freeOver,
      min_days: minDays,
      max_days: maxDays,
      carrier: kind === "carrier" ? text(input.carrier, 40) : null,
      service_code: kind === "carrier" ? text(input.serviceCode, 60) : null,
      active: input.active !== false,
      updated_at: new Date().toISOString(),
    },
  }
}

/** A zone's places: countries, states (where Storelib lists them), or the rest of the world. */
export function readZonePlaces(body: Record<string, unknown>): { ok: true; countries: string[]; regions: string[] } | { ok: false; error: string } {
  const regions = regionList(body.regions)
  /* A country chosen whole and some of its states is the whole country. */
  const countries = countryList(body.countries)
  const parts = regions.filter((r) => !countries.includes(r.split("-")[0]))
  if (countries.length === 0 && parts.length === 0) return { ok: false, error: "Choose at least one country or state." }
  return { ok: true, countries, regions: parts }
}

/** The shop's default profile, made the first time anything needs one. */
export async function ensureDefaultProfile(db: Db, creatorId: string): Promise<string | null> {
  const { data: existing } = await db.from("shipping_profiles").select("id").eq("creator_id", creatorId).eq("is_default", true).maybeSingle()
  if (existing?.id) return existing.id
  const { data, error } = await db.from("shipping_profiles").insert({ creator_id: creatorId, name: "General", is_default: true }).select("id").single()
  if (error?.code === "23505") {
    const { data: again } = await db.from("shipping_profiles").select("id").eq("creator_id", creatorId).eq("is_default", true).maybeSingle()
    return again?.id ?? null
  }
  return data?.id ?? null
}

/** The shop's default location, made from the onboarding answer the first time it is needed. */
export async function ensureDefaultLocation(db: Db, creatorId: string, kind: LocationKind = "home"): Promise<string | null> {
  const settings = await loadSettings(db, creatorId)
  if (settings.defaultLocationId) return settings.defaultLocationId
  const { data: first } = await db.from("inventory_locations").select("id").eq("creator_id", creatorId).eq("active", true).order("priority").limit(1).maybeSingle()
  let id: string | null = first?.id ?? null
  if (!id) {
    const { data } = await db
      .from("inventory_locations")
      .insert({ creator_id: creatorId, name: KIND_NAMES[kind], kind, forwarding: "none" })
      .select("id")
      .single()
    id = data?.id ?? null
  }
  if (id) await db.from("commerce_settings").upsert({ creator_id: creatorId, default_location_id: id, updated_at: new Date().toISOString() }, { onConflict: "creator_id" })
  return id
}

/** What each fulfilment answer sets up: a first location of the right kind. */
export const MODEL_LOCATION: Record<FulfillmentModel, LocationKind> = {
  self: "home",
  warehouse: "warehouse",
  print_on_demand: "print_on_demand",
  dropshipping: "dropshipper",
  supplier: "supplier",
  third_party_logistics: "third_party_logistics",
  hybrid: "home",
}

/** A package's size and empty weight, as typed in Shipping and delivery. */
export function readPackage(body: Record<string, unknown>): { ok: true; row: Record<string, unknown> } | { ok: false; error: string } {
  const name = text(body.name, 80)
  if (!name) return { ok: false, error: "Name the package." }
  const kind = ["box", "envelope", "soft_package"].includes(String(body.kind)) ? body.kind : "box"
  const l = int(body.lengthMm, 1, 10_000)
  const w = int(body.widthMm, 1, 10_000)
  const h = int(body.heightMm, kind === "envelope" ? 0 : 1, 10_000)
  if (l === null || w === null || h === null) return { ok: false, error: "Enter the package size." }
  return { ok: true, row: { name, kind, length_mm: l, width_mm: w, height_mm: h, weight_grams: int(body.weightGrams, 0, 100_000) ?? 0, updated_at: new Date().toISOString() } }
}
