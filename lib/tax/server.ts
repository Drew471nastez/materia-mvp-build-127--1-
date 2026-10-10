import "server-only"

/**
 * ===========================================================================
 *  A STORE'S TAX, READ AND WRITTEN
 * ===========================================================================
 * For every store, whatever it sells (Settings › Taxes): the switches on
 * commerce_settings (SQL part 78, `tax_digital` from part 110), the regions
 * in commerce_tax_rates (part 78) and the product overrides in
 * commerce_tax_overrides (part 110). Always filtered by the caller's own
 * creator id. The arithmetic is lib/tax/rules.ts.
 */
import { COUNTRY_CODES } from "@/lib/checkout/countries"
import { regionCode, regionsOf } from "@/lib/physical/regions"
import { bpsFromPercent, type TaxOverrideRow, type TaxRegionRow } from "./rules"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export interface TaxSetup {
  enabled: boolean
  included: boolean
  onShipping: boolean
  digital: boolean
  regions: (TaxRegionRow & { id: string; name: string })[]
  overrides: (TaxOverrideRow & { id: string; name: string; productTitle: string | null })[]
  /** False until the database has what Taxes needs (parts 78 and 110). */
  ready: boolean
}

const MISSING = new Set(["42P01", "42703", "PGRST204", "PGRST205"])
const missing = (e: { code?: string } | null | undefined) => !!e?.code && MISSING.has(e.code)
export const TAX_NEEDS_PART = "Taxes need their database update. Run SQL parts 78 and 110 in Supabase, then try again."

/** "CA" and "California" are one state where Storelib knows the list. */
export function sameRegion(country: string, a: string, b: string): boolean {
  if (a.trim().toLowerCase() === b.trim().toLowerCase()) return true
  const ca = regionCode(country, a)
  return ca !== null && ca === regionCode(country, b)
}

export async function loadTaxSetup(db: Db, creatorId: string): Promise<TaxSetup> {
  const [settings, rates, overrides] = await Promise.all([
    db.from("commerce_settings").select("tax_mode, prices_include_tax, tax_on_shipping, tax_digital").eq("creator_id", creatorId).maybeSingle(),
    db.from("commerce_tax_rates").select("id, country, region, name, rate_bps").eq("creator_id", creatorId).order("country").limit(500),
    db.from("commerce_tax_overrides").select("id, tax_rate_id, product_id, name, rate_bps, products(title)").eq("creator_id", creatorId).limit(1000),
  ])
  /* An older database without tax_digital: read the rest without it. */
  let s = settings.data as Record<string, unknown> | null
  let ready = !missing(settings.error) && !missing(rates.error) && !missing(overrides.error)
  if (missing(settings.error)) {
    const again = await db.from("commerce_settings").select("tax_mode, prices_include_tax, tax_on_shipping").eq("creator_id", creatorId).maybeSingle()
    s = again.data
  }
  if (missing(rates.error)) ready = false
  return {
    enabled: s?.tax_mode === "manual",
    included: s?.prices_include_tax === true,
    onShipping: s?.tax_on_shipping === true,
    digital: s?.tax_digital === true,
    regions: ((rates.data ?? []) as Record<string, unknown>[]).map((r) => ({ id: String(r.id), country: String(r.country), region: (r.region as string | null) ?? null, name: String(r.name ?? "Tax"), rateBps: Number(r.rate_bps) || 0 })),
    overrides: ((overrides.data ?? []) as Record<string, unknown>[]).map((o) => ({
      id: String(o.id),
      taxRateId: String(o.tax_rate_id),
      productId: String(o.product_id),
      name: String(o.name ?? "Tax"),
      rateBps: Number(o.rate_bps) || 0,
      productTitle: ((o.products as { title?: string } | null)?.title as string | undefined) ?? null,
    })),
    ready,
  }
}

type Done = { ok: true } | { ok: false; error: string; status: number }

export async function saveTaxSwitches(db: Db, creatorId: string, body: Record<string, unknown>): Promise<Done> {
  const row: Record<string, unknown> = { creator_id: creatorId, updated_at: new Date().toISOString() }
  if (typeof body.enabled === "boolean") row.tax_mode = body.enabled ? "manual" : "none"
  if (typeof body.included === "boolean") row.prices_include_tax = body.included
  if (typeof body.onShipping === "boolean") row.tax_on_shipping = body.onShipping
  if (typeof body.digital === "boolean") row.tax_digital = body.digital
  const { error } = await db.from("commerce_settings").upsert(row, { onConflict: "creator_id" })
  if (error) return { ok: false, error: missing(error) ? TAX_NEEDS_PART : "That could not be saved. Try again in a moment.", status: missing(error) ? 503 : 400 }
  return { ok: true }
}

const clean = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null
  const t = v.replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, max)
  return t || null
}

export async function addTaxRegion(db: Db, creatorId: string, body: Record<string, unknown>): Promise<Done> {
  const country = typeof body.country === "string" ? body.country.trim().toUpperCase() : ""
  if (!COUNTRY_CODES.has(country)) return { ok: false, error: "Choose a country.", status: 400 }
  let region = clean(body.region, 120)
  if (region && regionsOf(country).length) {
    const known = regionsOf(country).find((r) => r.code === region || r.name.toLowerCase() === region!.toLowerCase())
    if (!known) return { ok: false, error: "Choose a state or province from the list.", status: 400 }
    region = known.code
  }
  const bps = bpsFromPercent(body.rate)
  if (bps === null) return { ok: false, error: "Type the rate as a percentage between 0 and 100.", status: 400 }
  const name = clean(body.name, 60) ?? "VAT"
  const { error } = await db.from("commerce_tax_rates").insert({ creator_id: creatorId, country, region, name, rate_bps: bps })
  if (error?.code === "23505") return { ok: false, error: region ? "That state already has a rate. Edit it instead." : "That country already has a rate. Edit it instead.", status: 409 }
  if (error) return { ok: false, error: missing(error) ? TAX_NEEDS_PART : "The region could not be added. Try again in a moment.", status: missing(error) ? 503 : 400 }
  return { ok: true }
}

export async function updateTaxRegion(db: Db, creatorId: string, id: string, body: Record<string, unknown>): Promise<Done> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if ("rate" in body) {
    const bps = bpsFromPercent(body.rate)
    if (bps === null) return { ok: false, error: "Type the rate as a percentage between 0 and 100.", status: 400 }
    patch.rate_bps = bps
  }
  if ("name" in body) patch.name = clean(body.name, 60) ?? "VAT"
  const { data, error } = await db.from("commerce_tax_rates").update(patch).eq("id", id).eq("creator_id", creatorId).select("id")
  if (error) return { ok: false, error: "That could not be saved. Try again in a moment.", status: 400 }
  if (!data?.length) return { ok: false, error: "That region is not one of yours.", status: 404 }
  return { ok: true }
}

export async function deleteTaxRegion(db: Db, creatorId: string, id: string): Promise<Done> {
  const { error } = await db.from("commerce_tax_rates").delete().eq("id", id).eq("creator_id", creatorId)
  if (error) return { ok: false, error: "That region could not be removed. Try again in a moment.", status: 400 }
  return { ok: true }
}

export async function addTaxOverride(db: Db, creatorId: string, body: Record<string, unknown>): Promise<Done> {
  const regionId = typeof body.taxRateId === "string" ? body.taxRateId : ""
  const productId = typeof body.productId === "string" ? body.productId : ""
  if (!/^[0-9a-f-]{36}$/i.test(regionId) || !/^[0-9a-f-]{36}$/i.test(productId)) return { ok: false, error: "Choose a region and a product.", status: 400 }
  const bps = bpsFromPercent(body.rate)
  if (bps === null) return { ok: false, error: "Type the rate as a percentage between 0 and 100.", status: 400 }
  const [{ data: region }, { data: product }] = await Promise.all([
    db.from("commerce_tax_rates").select("id").eq("id", regionId).eq("creator_id", creatorId).maybeSingle(),
    db.from("products").select("id").eq("id", productId).eq("creator_id", creatorId).maybeSingle(),
  ])
  if (!region || !product) return { ok: false, error: "That region or product is not one of yours.", status: 404 }
  const { error } = await db.from("commerce_tax_overrides").insert({ creator_id: creatorId, tax_rate_id: regionId, product_id: productId, name: clean(body.name, 60) ?? "Reduced rate", rate_bps: bps })
  if (error?.code === "23505") return { ok: false, error: "That product already has its own rate in this region.", status: 409 }
  if (error) return { ok: false, error: missing(error) ? TAX_NEEDS_PART : "The rate could not be added. Try again in a moment.", status: missing(error) ? 503 : 400 }
  return { ok: true }
}

export async function deleteTaxOverride(db: Db, creatorId: string, id: string): Promise<Done> {
  const { error } = await db.from("commerce_tax_overrides").delete().eq("id", id).eq("creator_id", creatorId)
  if (error) return { ok: false, error: "That rate could not be removed. Try again in a moment.", status: 400 }
  return { ok: true }
}

/** For the two checkouts: the whole setup, or no tax at all on any failure, so a checkout never breaks over it. */
export async function loadTaxForCheckout(db: Db, creatorId: string | null | undefined): Promise<TaxSetup | null> {
  if (!creatorId) return null
  try {
    const setup = await loadTaxSetup(db, creatorId)
    return setup.enabled ? setup : null
  } catch {
    return null
  }
}
