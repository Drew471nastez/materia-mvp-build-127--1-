import "server-only"

/**
 * ===========================================================================
 *  CONNECTING SHIPPO, EASYPOST AND SHIPSTATION
 * ===========================================================================
 * Settings › Integrations › (Shippo | EasyPost | ShipStation) › Connect.
 * The key is put to the provider's own API before anything is kept: one it
 * refuses is not saved, one it accepts is sealed (lib/physical/secrets.ts)
 * and only its last four characters ever go back to the browser. A provider
 * that can't be reached is not saved as connected either: the seller is told
 * to try again, never shown a connection that was not checked.
 *
 *   Shippo, EasyPost   GET carrier accounts / addresses with the key
 *                      (lib/physical/provider-verify.ts); a test key is said
 *                      to be one, and its labels are free samples
 *   ShipStation        GET /stores with the key and secret; then ShipStation
 *                      is asked to post SHIP_NOTIFY to Storelib's own address
 *                      for this store (a token only Storelib can make). When
 *                      it won't, shipments are read on a timer instead and
 *                      the card says so.
 *
 * Disconnecting removes the row and, for ShipStation, the webhook first.
 */

import type { Db } from "@/lib/physical/auth"
import { providerInfo } from "@/lib/physical/providers"
import { verifyProviderKey } from "@/lib/physical/provider-verify"
import { openSecret, sealSecret } from "@/lib/physical/secrets"
import { getMainDomain } from "@/lib/url-helpers"
import { webhookToken } from "../fulfilment/forward-server"
import { ProviderError } from "../fulfilment/http"
import { shipstation } from "./shipstation"

export const SHIPPING_APPS = ["shippo", "easypost", "shipstation"] as const
export type ShippingAppId = (typeof SHIPPING_APPS)[number]

export function isShippingApp(provider: string | null | undefined): provider is ShippingAppId {
  return !!provider && (SHIPPING_APPS as readonly string[]).includes(provider)
}

/** Where ShipStation posts SHIP_NOTIFY for one store: app/api/integrations/shipstation/[token]. */
export function shipStationNotifyUrl(creatorId: string): string {
  return `https://${getMainDomain()}/api/integrations/shipstation/${webhookToken("shipstation", creatorId)}`
}

type Saved = { ok: true } | { ok: false; error: string }

export async function saveShippingApp(db: Db, creatorId: string, provider: ShippingAppId, body: Record<string, unknown>): Promise<Saved> {
  const info = providerInfo(provider)!
  const { data: had } = await db.from("commerce_integrations").select("id, status, config, secret_ciphertext").eq("creator_id", creatorId).eq("provider", provider).maybeSingle()
  const key = typeof body.apiKey === "string" ? body.apiKey.trim() : ""
  const secret = typeof body.apiSecret === "string" ? body.apiSecret.trim() : ""
  if (!key && !secret) {
    if (had?.status === "connected") return { ok: true }
    return { ok: false, error: provider === "shipstation" ? "Add your ShipStation API key and API secret." : `Add your ${info.name} API key.` }
  }
  if (key.length < 8 || key.length > 400) return { ok: false, error: "That key doesn't look right." }
  if (provider === "shipstation" && (secret.length < 8 || secret.length > 400 || key.includes(":"))) return { ok: false, error: "Add both the API key and the API secret from ShipStation › Settings › Account › API Settings." }

  const now = new Date().toISOString()
  let account: string | null = null
  let mode: "test" | "live" | null = null
  if (provider === "shipstation") {
    try {
      account = (await shipstation.verify(`${key}:${secret}`)).account
    } catch (e) {
      if (e instanceof ProviderError && (e.status === 401 || e.status === 403)) return { ok: false, error: "ShipStation did not accept that key and secret." }
      return { ok: false, error: e instanceof ProviderError && e.status === 429 ? "ShipStation is busy. Try again in a minute." : "ShipStation could not be reached. Try again in a moment." }
    }
  } else {
    const verdict = await verifyProviderKey(provider, key)
    if (verdict.state === "rejected") return { ok: false, error: verdict.error }
    if (verdict.state !== "verified") return { ok: false, error: verdict.state === "unreachable" ? verdict.error : `${info.name} could not check that key. Try again in a moment.` }
    account = verdict.account
    mode = verdict.mode ?? null
  }

  /* A key replaced: the old ShipStation webhook goes first, so two never post the same shipment. */
  if (provider === "shipstation" && had) await dropShipStationWebhook(had).catch(() => undefined)

  const sealed = sealSecret(provider === "shipstation" ? `${key}:${secret}` : key)
  const keep = (had?.config ?? {}) as Record<string, unknown>
  const config: Record<string, unknown> = {
    verified_at: now,
    ...(mode ? { mode } : {}),
    /* What it has done, kept across a key change: the card's "Labels bought" and "Orders sent". */
    ...(typeof keep.labels_bought === "number" ? { labels_bought: keep.labels_bought } : {}),
    ...(typeof keep.orders_sent === "number" ? { orders_sent: keep.orders_sent } : {}),
  }
  const { error } = await db
    .from("commerce_integrations")
    .upsert({ creator_id: creatorId, provider, category: "shipping", status: "connected", account_label: account ? account.slice(0, 120) : null, secret_ciphertext: sealed, webhook_secret_ciphertext: null, config, last_sync_at: now, last_error: null, updated_at: now }, { onConflict: "creator_id,provider" })
  if (error) return { ok: false, error: "The integration could not be saved." }

  if (provider === "shipstation") {
    try {
      const hook = await shipstation.subscribe(`${key}:${secret}`, shipStationNotifyUrl(creatorId))
      config.webhooks = "on"
      config.webhook_id = hook.id
      config.webhook_note = null
    } catch (e) {
      config.webhooks = "off"
      config.webhook_note = `ShipStation did not take Storelib's update address${e instanceof Error && e.message ? ` (${e.message.replace(/^[^:]+:\s*/, "").slice(0, 120)})` : ""}, so Storelib checks ShipStation for shipments every few hours instead.`
    }
    await db.from("commerce_integrations").update({ config, updated_at: new Date().toISOString() }).eq("creator_id", creatorId).eq("provider", provider)
  }
  return { ok: true }
}

async function dropShipStationWebhook(row: { config?: Record<string, unknown> | null; secret_ciphertext?: string | null }): Promise<void> {
  const id = row.config?.webhook_id
  const pair = openSecret(row.secret_ciphertext ?? null)
  if (typeof id !== "string" || !pair) return
  await shipstation.unsubscribe(pair, id)
}

/** Before the row goes: ShipStation stops posting to Storelib. Best effort: a key it no longer takes is no reason to keep the row. */
export async function beforeShippingDisconnect(db: Db, creatorId: string, provider: string): Promise<void> {
  if (provider !== "shipstation") return
  const { data } = await db.from("commerce_integrations").select("config, secret_ciphertext").eq("creator_id", creatorId).eq("provider", provider).maybeSingle()
  if (data) await dropShipStationWebhook(data).catch(() => undefined)
}

/** The sealed key of a connected label app, opened; null when it is not connected. */
export async function connectedKey(db: Db, creatorId: string, provider: string): Promise<{ id: string; key: string; config: Record<string, unknown> } | null> {
  const { data } = await db.from("commerce_integrations").select("id, status, secret_ciphertext, config").eq("creator_id", creatorId).eq("provider", provider).maybeSingle()
  if (!data || data.status !== "connected") return null
  const key = openSecret(data.secret_ciphertext)
  return key ? { id: data.id, key, config: (data.config ?? {}) as Record<string, unknown> } : null
}

/** What happened last, on the card: when it last worked, or what went wrong. */
export async function noteSync(db: Db, integrationId: string, outcome: { ok: true; bump?: "labels_bought" | "orders_sent"; config?: Record<string, unknown> } | { ok: false; error: string }): Promise<void> {
  const now = new Date().toISOString()
  if (outcome.ok === false) {
    await db.from("commerce_integrations").update({ last_error: outcome.error.slice(0, 500), updated_at: now }).eq("id", integrationId)
    return
  }
  const patch: Record<string, unknown> = { last_sync_at: now, last_error: null, updated_at: now }
  if (outcome.bump || outcome.config) {
    const { data } = await db.from("commerce_integrations").select("config").eq("id", integrationId).maybeSingle()
    const config = { ...((data?.config ?? {}) as Record<string, unknown>), ...(outcome.config ?? {}) }
    if (outcome.bump) config[outcome.bump] = (typeof config[outcome.bump] === "number" ? (config[outcome.bump] as number) : 0) + 1
    patch.config = config
  }
  await db.from("commerce_integrations").update(patch).eq("id", integrationId)
}
