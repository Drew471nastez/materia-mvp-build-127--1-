import "server-only"

/**
 * ===========================================================================
 *  WHICH OF THE PARTNER'S PRODUCTS EACH STORELIB VARIANT IS
 * ===========================================================================
 * Gelato and CJ Dropshipping don't share SKUs with the seller the way a
 * Printful store does, so the seller matches each Storelib variant to the
 * partner's own, once, in Settings › Integrations (components/physical/
 * partner-links.tsx). A match is a row of fulfilment_variant_links (SQL part
 * 162): for CJ a variant id (vid) chosen from CJ's catalogue, searched by SKU
 * or keyword; for Gelato a product UID and the print file's https address.
 * Every match is checked with the partner when it is saved, so a typo shows
 * up there and not on a paid order. Nothing is ever matched by a guess.
 *
 * STOCK FROM CJ, per product, when the seller turns it on: each matched
 * variant's stock in CJ's warehouses (the country orders ship from) becomes
 * its stock at the CJ location, a provider_sync movement in its history. It
 * runs when turned on, when CJ says stock moved (its STOCK webhook, which only
 * names variants to read again), and every six hours (an inventory_sync job).
 */

import { publicUrlProblem } from "@/lib/api/public-fetch"
import { openSecret } from "@/lib/physical/secrets"
import { cjStock, cjVariantByVid } from "./cj"
import { gelatoProductExists, PRODUCT_UID } from "./gelato"
import type { ConnectorCredential, VariantLink } from "./types"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export const LINKED_PROVIDERS = ["gelato", "cj_dropshipping"] as const
export type LinkedProvider = (typeof LINKED_PROVIDERS)[number]
export const isLinkedProvider = (p: string): p is LinkedProvider => (LINKED_PROVIDERS as readonly string[]).includes(p)

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MISSING = new Set(["42P01", "PGRST205", "42703"])
export const LINKS_NEED_SQL = "Matching products turns on after SQL part 162 runs."

export interface LinkRow {
  variantId: string
  productId: string
  productTitle: string
  variantName: string | null
  sku: string | null
  /** Sent from this partner's location (its own or its product's), so its orders go there. */
  atPartner: boolean
  link: { providerVariantId: string; label: string | null; providerSku: string | null; fileUrl: string | null; stockSync: boolean; stockLevel: number | null; stockSyncedAt: string | null; stockError: string | null } | null
}

interface IntegrationRow {
  id: string
  provider: string
  status: string
  config: Record<string, unknown> | null
  secret_ciphertext: string | null
}

async function integrationOf(db: Db, creatorId: string, provider: string): Promise<IntegrationRow | null> {
  const { data } = await db.from("commerce_integrations").select("id, provider, status, config, secret_ciphertext").eq("creator_id", creatorId).eq("provider", provider).maybeSingle()
  return (data as IntegrationRow | null) ?? null
}

/** The seller's key and config, with config changes (a refreshed CJ token) kept on the row. */
export function credentialFor(db: Db, row: IntegrationRow): ConnectorCredential | null {
  const key = openSecret(row.secret_ciphertext)
  if (!key) return null
  const config = { ...(row.config ?? {}) }
  return {
    key,
    config,
    persist: async (patch) => {
      Object.assign(config, patch)
      await db.from("commerce_integrations").update({ config, updated_at: new Date().toISOString() }).eq("id", row.id)
    },
  }
}

async function partnerLocations(db: Db, creatorId: string, integrationId: string): Promise<string[]> {
  const { data } = await db.from("inventory_locations").select("id").eq("creator_id", creatorId).eq("integration_id", integrationId)
  return ((data ?? []) as { id: string }[]).map((l) => l.id)
}

/** Every physical variant of the shop, those sent from the partner first, each with its match. */
export async function loadLinkRows(db: Db, creatorId: string, provider: LinkedProvider): Promise<{ ok: true; rows: LinkRow[]; locationId: string | null } | { ok: false; error: string }> {
  const integration = await integrationOf(db, creatorId, provider)
  if (!integration || integration.status !== "connected") return { ok: false, error: "Connect it first." }
  const locs = await partnerLocations(db, creatorId, integration.id)
  const { data: products } = await db.from("products").select("id, title, type, fulfillment_location_id").eq("creator_id", creatorId).eq("type", "physical").limit(300)
  const list = (products ?? []) as { id: string; title: string; fulfillment_location_id: string | null }[]
  if (list.length === 0) return { ok: true, rows: [], locationId: locs[0] ?? null }
  const { data: variants } = await db.from("product_variants").select("id, product_id, name, sku, fulfillment_location_id").in("product_id", list.map((p) => p.id)).limit(1000)
  const { data: links, error } = await db.from("fulfilment_variant_links").select("variant_id, provider_variant_id, label, provider_sku, file_url, stock_sync, stock_level, stock_synced_at, stock_error").eq("creator_id", creatorId).eq("provider", provider)
  if (error && MISSING.has(error.code)) return { ok: false, error: LINKS_NEED_SQL }
  const linkOf = new Map(((links ?? []) as Record<string, any>[]).map((l) => [l.variant_id, l]))
  const productOf = new Map(list.map((p) => [p.id, p]))
  const rows: LinkRow[] = ((variants ?? []) as Record<string, any>[]).flatMap((v) => {
    const p = productOf.get(v.product_id)
    if (!p) return []
    const l = linkOf.get(v.id)
    const where = v.fulfillment_location_id ?? p.fulfillment_location_id ?? null
    return [
      {
        variantId: v.id,
        productId: p.id,
        productTitle: p.title,
        variantName: v.name && v.name !== "Default" ? v.name : null,
        sku: v.sku ?? null,
        atPartner: !!where && locs.includes(where),
        link: l ? { providerVariantId: l.provider_variant_id, label: l.label ?? null, providerSku: l.provider_sku ?? null, fileUrl: l.file_url ?? null, stockSync: l.stock_sync === true, stockLevel: l.stock_level ?? null, stockSyncedAt: l.stock_synced_at ?? null, stockError: l.stock_error ?? null } : null,
      },
    ]
  })
  rows.sort((a, b) => Number(b.atPartner) - Number(a.atPartner) || a.productTitle.localeCompare(b.productTitle) || String(a.variantName ?? "").localeCompare(String(b.variantName ?? "")))
  return { ok: true, rows, locationId: locs[0] ?? null }
}

/** The matches for the variants of one order, for the forwarding (forward-server.ts). Empty when the table is not there yet. */
export async function linksForVariants(db: Db, creatorId: string, provider: string, variantIds: string[]): Promise<Map<string, VariantLink>> {
  const ids = [...new Set(variantIds.filter((v) => UUID.test(v)))]
  const out = new Map<string, VariantLink>()
  if (ids.length === 0 || !isLinkedProvider(provider)) return out
  const { data } = await db.from("fulfilment_variant_links").select("variant_id, provider_variant_id, file_url").eq("creator_id", creatorId).eq("provider", provider).in("variant_id", ids)
  for (const l of (data ?? []) as Record<string, any>[]) if (l.provider_variant_id) out.set(l.variant_id, { providerVariantId: String(l.provider_variant_id), fileUrl: l.file_url ?? null })
  return out
}

/** A match, checked with the partner, then saved. Or removed (providerVariantId empty). */
export async function saveLink(
  db: Db,
  creatorId: string,
  provider: LinkedProvider,
  input: { variantId?: unknown; providerVariantId?: unknown; fileUrl?: unknown; label?: unknown },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const variantId = typeof input.variantId === "string" ? input.variantId : ""
  if (!UUID.test(variantId)) return { ok: false, error: "Choose a variant." }
  const { data: v } = await db.from("product_variants").select("id, product_id").eq("id", variantId).maybeSingle()
  const { data: p } = v ? await db.from("products").select("id, creator_id, type").eq("id", v.product_id).maybeSingle() : { data: null }
  if (!v || !p || p.creator_id !== creatorId) return { ok: false, error: "That variant is not yours." }
  const pvid = typeof input.providerVariantId === "string" ? input.providerVariantId.trim() : ""
  if (!pvid) {
    const { error } = await db.from("fulfilment_variant_links").delete().eq("creator_id", creatorId).eq("provider", provider).eq("variant_id", variantId)
    if (error && MISSING.has(error.code)) return { ok: false, error: LINKS_NEED_SQL }
    return error ? { ok: false, error: "The match could not be removed." } : { ok: true }
  }
  const integration = await integrationOf(db, creatorId, provider)
  const cred = integration && integration.status === "connected" ? credentialFor(db, integration) : null
  if (!integration || !cred) return { ok: false, error: "Connect it first." }
  const row: Record<string, unknown> = { creator_id: creatorId, provider, product_id: p.id, variant_id: variantId, updated_at: new Date().toISOString() }
  if (provider === "cj_dropshipping") {
    let found
    try {
      found = await cjVariantByVid(cred, pvid)
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "CJ could not be reached. Try again in a moment." }
    }
    if (!found) return { ok: false, error: "CJ has no variant with that id." }
    Object.assign(row, { provider_variant_id: found.vid, provider_product_id: found.pid, provider_sku: found.sku || null, label: (found.name || found.sku || found.vid).slice(0, 200), file_url: null })
  } else {
    if (!PRODUCT_UID.test(pvid)) return { ok: false, error: "That doesn't look like a Gelato product UID." }
    const fileUrl = typeof input.fileUrl === "string" ? input.fileUrl.trim() : ""
    if (!fileUrl.startsWith("https://") || publicUrlProblem(fileUrl) || fileUrl.length > 1000) return { ok: false, error: "Add the print file as a public https address (a PDF or PNG)." }
    const exists = await gelatoProductExists(cred.key, pvid)
    if (exists.ok === false) return { ok: false, error: exists.error }
    Object.assign(row, { provider_variant_id: pvid, provider_product_id: null, provider_sku: null, label: typeof input.label === "string" && input.label.trim() ? input.label.trim().slice(0, 200) : pvid.slice(0, 200), file_url: fileUrl })
  }
  const { error } = await db.from("fulfilment_variant_links").upsert(row, { onConflict: "creator_id,provider,variant_id" })
  if (error && MISSING.has(error.code)) return { ok: false, error: LINKS_NEED_SQL }
  return error ? { ok: false, error: "The match could not be saved." } : { ok: true }
}

/* ── stock from CJ ────────────────────────────────────────────────────── */

export interface StockDeps {
  /** The variant's available stock at a location now. */
  available: (db: Db, creatorId: string, variantId: string, locationId: string) => Promise<number>
  /** Moves on hand by delta (lib/physical/inventory-server applyInventory, reason provider_sync). */
  adjust: (db: Db, a: { creatorId: string; variantId: string; locationId: string; delta: number; key: string }) => Promise<{ ok: boolean; error?: string }>
  now: () => number
}

/** Turns CJ stock on or off for every matched variant of one product, and syncs it now when on. */
export async function setStockSync(db: Db, creatorId: string, productId: string, on: boolean, deps: StockDeps): Promise<{ ok: true; synced: number } | { ok: false; error: string }> {
  if (!UUID.test(productId)) return { ok: false, error: "Choose a product." }
  const { data, error } = await db.from("fulfilment_variant_links").update({ stock_sync: on, updated_at: new Date(deps.now()).toISOString() }).eq("creator_id", creatorId).eq("provider", "cj_dropshipping").eq("product_id", productId).select("variant_id")
  if (error && MISSING.has(error.code)) return { ok: false, error: LINKS_NEED_SQL }
  if (error) return { ok: false, error: "Stock sync could not be changed." }
  if (!(data ?? []).length) return { ok: false, error: "Match this product's variants to CJ first." }
  if (!on) return { ok: true, synced: 0 }
  const r = await syncCjStock(db, creatorId, deps, { productId })
  return r.ok ? { ok: true, synced: r.synced } : r
}

/**
 * Each matched variant with stock sync on gets CJ's stock at the CJ location. Only those named when given (a STOCK
 * webhook's variants, or one product). A variant CJ can't be read for keeps its stock, with why on its row.
 */
export async function syncCjStock(db: Db, creatorId: string, deps: StockDeps, only: { vids?: string[]; productId?: string } = {}): Promise<{ ok: true; synced: number; failed: number } | { ok: false; error: string }> {
  const integration = await integrationOf(db, creatorId, "cj_dropshipping")
  const cred = integration && integration.status === "connected" ? credentialFor(db, integration) : null
  if (!integration || !cred) return { ok: false, error: "CJ Dropshipping is not connected." }
  const [locationId] = await partnerLocations(db, creatorId, integration.id)
  if (!locationId) return { ok: false, error: "The CJ location is missing. Connect CJ again to make it." }
  let q = db.from("fulfilment_variant_links").select("variant_id, provider_variant_id, product_id").eq("creator_id", creatorId).eq("provider", "cj_dropshipping").eq("stock_sync", true)
  if (only.productId) q = q.eq("product_id", only.productId)
  if (only.vids) q = q.in("provider_variant_id", only.vids.slice(0, 200))
  const { data, error } = await q.limit(200)
  if (error && MISSING.has(error.code)) return { ok: false, error: LINKS_NEED_SQL }
  const country = typeof cred.config.from_country === "string" && /^[A-Z]{2}$/.test(cred.config.from_country) ? cred.config.from_country : null
  let synced = 0
  let failed = 0
  for (const l of (data ?? []) as { variant_id: string; provider_variant_id: string }[]) {
    const at = new Date(deps.now()).toISOString()
    try {
      const qty = await cjStock(cred, l.provider_variant_id, country)
      const now = await deps.available(db, creatorId, l.variant_id, locationId)
      const delta = qty - now
      if (delta !== 0) {
        const r = await deps.adjust(db, { creatorId, variantId: l.variant_id, locationId, delta, key: `cj_stock:${l.variant_id}:${at}` })
        if (!r.ok) throw new Error(r.error ?? "Stock could not be changed.")
      }
      await db.from("fulfilment_variant_links").update({ stock_level: qty, stock_synced_at: at, stock_error: null }).eq("creator_id", creatorId).eq("provider", "cj_dropshipping").eq("variant_id", l.variant_id)
      synced++
    } catch (e) {
      failed++
      await db.from("fulfilment_variant_links").update({ stock_error: (e instanceof Error ? e.message : "CJ could not be read.").slice(0, 300) }).eq("creator_id", creatorId).eq("provider", "cj_dropshipping").eq("variant_id", l.variant_id)
      /* CJ busy or down: the rest wait for the next round rather than spend the allowance. */
      if (e && typeof e === "object" && (e as { retry?: boolean }).retry) break
    }
  }
  await db.from("commerce_integrations").update({ last_sync_at: new Date(deps.now()).toISOString() }).eq("id", integration.id)
  return { ok: true, synced, failed }
}

export const STOCK_EVERY_MS = 6 * 3600_000

/** The next six hourly stock round for a shop, keyed by its time slot so it is queued once. */
export async function scheduleStockSync(db: Db, creatorId: string, now: number): Promise<void> {
  const slot = Math.floor(now / STOCK_EVERY_MS) + 1
  const { error } = await db.from("commerce_jobs").insert({
    creator_id: creatorId,
    kind: "inventory_sync",
    payload: { creatorId, provider: "cj_dropshipping" },
    idempotency_key: `inventory_sync:cj:${creatorId}:${slot}`,
    run_after: new Date(slot * STOCK_EVERY_MS).toISOString(),
    max_attempts: 3,
  })
  if (error && error.code !== "23505") console.error("[integrations] stock sync not queued:", error.code)
}

/** The inventory_sync job: a round of CJ stock, then the next one, while any product still asks for it. */
export async function runStockSyncJob(db: Db, payload: Record<string, any>, deps: StockDeps): Promise<void> {
  const creatorId = String(payload.creatorId ?? "")
  if (!UUID.test(creatorId)) return
  const r = await syncCjStock(db, creatorId, deps)
  if (r.ok === false) return
  const { data } = await db.from("fulfilment_variant_links").select("variant_id").eq("creator_id", creatorId).eq("provider", "cj_dropshipping").eq("stock_sync", true).limit(1)
  if ((data ?? []).length) await scheduleStockSync(db, creatorId, deps.now())
}
