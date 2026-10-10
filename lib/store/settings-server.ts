import "server-only"

/**
 * ===========================================================================
 *  A STORE'S OWN DETAILS
 * ===========================================================================
 * `store_settings` (SQL part 109): the name receipts and order emails show,
 * the store's phone, the country it is based in, and how checkout behaves.
 * Read with the admin client, always filtered by the caller's own creator id
 * (lib/physical/auth.ts shopCaller). A database without part 109 reads as
 * the defaults and refuses to save with a message that says so.
 */
import { countryCode } from "@/lib/checkout/countries"
import { cleanPhone } from "./phone-rule"
import { checkoutConfig, mergeCheckout, type CheckoutConfig } from "./checkout-config"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export interface StoreSettings {
  storeName: string | null
  phone: string | null
  phoneCountry: string | null
  defaultCountry: string | null
  checkout: CheckoutConfig
  defaultSalesChannelId: string | null
  /** The picture on receipts and customer emails (SQL part 118); empty, the website's logo or the person's photo (lib/store/identity-server.ts). */
  logoUrl: string | null
  /** False until SQL part 109 has run. */
  ready: boolean
}

const MISSING = new Set(["42P01", "42703", "PGRST204", "PGRST205"])
export const NEEDS_PART = "Store settings need their database update. Run SQL part 109 in Supabase, then try again."

export function isMissingTable(error: { code?: string } | null | undefined): boolean {
  return !!error?.code && MISSING.has(error.code)
}

const BASE_COLUMNS = "store_name, phone, phone_country, default_country, checkout, default_sales_channel_id"

export async function loadStoreSettings(db: Db, creatorId: string): Promise<StoreSettings> {
  /* With the logo (part 118) when the column is there; without it on a database that hasn't run that part, so nothing else stops working. */
  let { data, error } = await db.from("store_settings").select(`${BASE_COLUMNS}, logo_url`).eq("creator_id", creatorId).maybeSingle()
  if (error && (error.code === "42703" || error.code === "PGRST204")) ({ data, error } = await db.from("store_settings").select(BASE_COLUMNS).eq("creator_id", creatorId).maybeSingle())
  const ready = !error || !isMissingTable(error)
  return {
    storeName: data?.store_name ?? null,
    phone: data?.phone ?? null,
    phoneCountry: data?.phone_country ?? null,
    defaultCountry: data?.default_country ?? null,
    checkout: checkoutConfig(data?.checkout),
    defaultSalesChannelId: data?.default_sales_channel_id ?? null,
    logoUrl: typeof data?.logo_url === "string" && data.logo_url ? data.logo_url : null,
    ready: ready && !error,
  }
}

/** Checkout's settings alone, for the two checkouts: the defaults on any failure, so a checkout never breaks over them. */
export async function loadCheckoutConfig(db: Db, creatorId: string | null | undefined): Promise<CheckoutConfig> {
  if (!creatorId) return checkoutConfig(null)
  try {
    const { data } = await db.from("store_settings").select("checkout").eq("creator_id", creatorId).maybeSingle()
    return checkoutConfig(data?.checkout)
  } catch {
    return checkoutConfig(null)
  }
}

/** The store's name for receipts and order emails, or null to use the person's own. */
export async function loadStoreName(db: Db, creatorId: string): Promise<string | null> {
  try {
    const { data } = await db.from("store_settings").select("store_name").eq("creator_id", creatorId).maybeSingle()
    const name = typeof data?.store_name === "string" ? data.store_name.trim() : ""
    return name || null
  } catch {
    return null
  }
}

export type SaveResult = { ok: true; settings: StoreSettings } | { ok: false; error: string; status: number }

const clean = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null
  const t = v.replace(/\s+/g, " ").trim()
  return t ? t.slice(0, max) : null
}

export async function saveStoreSettings(db: Db, creatorId: string, body: Record<string, unknown>): Promise<SaveResult> {
  const current = await loadStoreSettings(db, creatorId)
  if (!current.ready) return { ok: false, error: NEEDS_PART, status: 503 }
  const row: Record<string, unknown> = { creator_id: creatorId, updated_at: new Date().toISOString() }

  if ("storeName" in body) {
    const name = clean(body.storeName, 80)
    row.store_name = name
  }
  if ("defaultCountry" in body) {
    const code = body.defaultCountry ? countryCode(body.defaultCountry) : null
    if (body.defaultCountry && !code) return { ok: false, error: "Choose a country from the list.", status: 400 }
    row.default_country = code
  }
  if ("phone" in body || "phoneCountry" in body) {
    const country = "phoneCountry" in body ? (body.phoneCountry ? countryCode(body.phoneCountry) : null) : current.phoneCountry
    if (body.phoneCountry && !country) return { ok: false, error: "Choose the phone's country from the list.", status: 400 }
    const phone = cleanPhone("phone" in body ? body.phone : current.phone, country)
    if (phone === "bad") return { ok: false, error: "That phone number does not look complete. Type it with its area code.", status: 400 }
    row.phone = phone
    row.phone_country = phone ? country : null
  }
  if ("checkout" in body) row.checkout = mergeCheckout(current.checkout, body.checkout)
  if ("defaultSalesChannelId" in body) {
    const id = body.defaultSalesChannelId
    if (id !== null && (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id))) return { ok: false, error: "Choose a sales channel from the list.", status: 400 }
    if (id) {
      const { data: ch } = await db.from("sales_channels").select("id").eq("id", id).eq("creator_id", creatorId).maybeSingle()
      if (!ch) return { ok: false, error: "That sales channel is not one of yours.", status: 400 }
    }
    row.default_sales_channel_id = id
  }

  if ("logoUrl" in body) {
    const raw = typeof body.logoUrl === "string" ? body.logoUrl.trim() : ""
    /* A picture of the store's own (its files, an upload) or none, which means the default. */
    if (raw && (raw.length > 600 || !/^(https:\/\/|\/media\/)/.test(raw))) return { ok: false, error: "Choose the logo from your files.", status: 400 }
    row.logo_url = raw || null
  }

  /* The contact email lives on the creator row, where receipts already read it (lib/email.tsx resolveCreatorIdentity). */
  if ("supportEmail" in body) {
    const raw = typeof body.supportEmail === "string" ? body.supportEmail.trim().toLowerCase() : ""
    if (raw && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) return { ok: false, error: "That email address does not look right.", status: 400 }
    const { error: emailError } = await db.from("creators").update({ support_email: raw || null }).eq("id", creatorId)
    if (emailError) return { ok: false, error: "The contact email could not be saved. Try again in a moment.", status: 400 }
  }

  const { error } = await db.from("store_settings").upsert(row, { onConflict: "creator_id" })
  if (error && "logo_url" in row && (error.code === "42703" || error.code === "PGRST204")) return { ok: false, error: "The store logo needs its database update. Run SQL part 118 in Supabase, then try again.", status: 503 }
  if (error) return { ok: false, error: isMissingTable(error) ? NEEDS_PART : "That could not be saved. Try again in a moment.", status: isMissingTable(error) ? 503 : 400 }
  return { ok: true, settings: await loadStoreSettings(db, creatorId) }
}

/** Where the visitor is, from the edge's own reading of their address: a suggestion, never a fact. */
export function detectedCountry(headers: Headers): string | null {
  const raw = headers.get("x-vercel-ip-country") || headers.get("cf-ipcountry") || ""
  return countryCode(raw)
}
