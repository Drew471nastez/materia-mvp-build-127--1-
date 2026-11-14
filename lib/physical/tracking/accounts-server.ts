import "server-only"

/**
 * ===========================================================================
 *  WHOSE TRACKING ACCOUNT: STORELIB'S OWN, OR THE STORE'S
 * ===========================================================================
 * Every store's parcels are followed with Storelib's own account
 * (./provider.ts platformAccount, from the environment) with nothing to set
 * up. A store that has its own AfterShip or 17TRACK account can add its key
 * in Settings > Integrations > Courier tracking: its parcels are then
 * followed there instead (its own carrier list, its own AfterShip pages).
 *
 * The key is put to the aggregator once before it is kept (a key it refuses
 * is not saved), sealed with COMMERCE_SECRETS_KEY (../secrets.ts) and never
 * sent back: the settings show its last four characters. Kept in
 * commerce_tracking_accounts (part 160), written by the server only.
 */

import type { Db } from "../auth"
import { openSecret, sealSecret, secretHint } from "../secrets"
import { ask } from "./http"
import { AFTERSHIP_BASE } from "./aftership"
import { SEVENTEENTRACK_BASE } from "./seventeentrack"
import type { TrackingProviderId } from "./model"
import { platformAccount, platformTrackingState, trackingProvider, trackingWebhookUrl, type TrackingAccount } from "./provider"

const missing = (e: { code?: string; message?: string } | null | undefined) => !!e && (e.code === "42P01" || e.code === "PGRST205" || e.code === "42703" || /does not exist|could not find/i.test(e.message ?? ""))

/** A store's own AfterShip or 17TRACK account, opened, or null. */
export async function ownAccount(db: Db, creatorId: string): Promise<TrackingAccount | null> {
  const { data, error } = await db.from("commerce_tracking_accounts").select("creator_id, provider, status, secret_ciphertext, webhook_secret_ciphertext").eq("creator_id", creatorId).maybeSingle()
  if (error || !data || data.status !== "connected") return null
  const key = openSecret(data.secret_ciphertext)
  const provider = trackingProvider(data.provider)
  if (!key || !provider) return null
  return { provider: provider.id, apiKey: key, webhookSecret: openSecret(data.webhook_secret_ciphertext), scope: "own", creatorId }
}

/** The account a store's parcels are followed with: its own, else Storelib's, else none. */
export async function accountFor(db: Db, creatorId: string, cache?: Map<string, TrackingAccount | null>): Promise<TrackingAccount | null> {
  if (cache?.has(creatorId)) return cache.get(creatorId) ?? null
  const a = (await ownAccount(db, creatorId).catch(() => null)) ?? platformAccount()
  cache?.set(creatorId, a)
  return a
}

/** Whether a store's parcels are followed automatically, and with what (the order pages say so). */
export async function trackingAvailable(db: Db, creatorId: string): Promise<{ on: boolean; providerName: string | null }> {
  const a = (await ownAccount(db, creatorId).catch(() => null)) ?? platformAccount()
  return { on: !!a, providerName: a ? trackingProvider(a.provider)!.name : null }
}

/* ── Settings > Integrations > Courier tracking ───────────────────────── */

export interface TrackingSettingsView {
  /** Storelib's own tracking, for every store. */
  platform: { on: boolean; providerName: string | null; webhooks: boolean }
  /** False before part 160: the store's own key can't be kept yet. */
  ready: boolean
  own: {
    provider: TrackingProviderId
    providerName: string
    status: string
    keyHint: string | null
    secretHint: string | null
    lastError: string | null
    verifiedAt: string | null
    lastWebhookAt: string | null
    /** Where the store points its own account's webhook. */
    webhookUrl: string | null
  } | null
  /** Parcels followed right now, and the last time one was read. */
  following: number | null
  lastCheckedAt: string | null
}

export async function loadTrackingSettings(db: Db, creatorId: string): Promise<TrackingSettingsView> {
  const p = platformTrackingState()
  const { data, error } = await db.from("commerce_tracking_accounts").select("provider, status, secret_ciphertext, webhook_secret_ciphertext, last_error, verified_at, last_webhook_at").eq("creator_id", creatorId).maybeSingle()
  const [{ count }, { data: last }] = await Promise.all([
    db.from("fulfillments").select("id", { count: "exact", head: true }).eq("creator_id", creatorId).not("tracking_number", "is", null).is("tracking_stopped_at", null).in("status", ["shipped", "in_transit", "out_for_delivery", "failed"]),
    db.from("fulfillments").select("tracking_checked_at").eq("creator_id", creatorId).not("tracking_checked_at", "is", null).order("tracking_checked_at", { ascending: false }).limit(1),
  ]).catch(() => [{ count: null }, { data: null }] as any[])
  const provider = data ? trackingProvider(data.provider) : null
  let webhookUrl: string | null = null
  try {
    webhookUrl = provider ? trackingWebhookUrl(provider.id, creatorId) : null
  } catch {
    webhookUrl = null
  }
  return {
    platform: { on: p.configured, providerName: p.providerName, webhooks: p.webhooks },
    ready: !missing(error),
    own:
      data && provider
        ? {
            provider: provider.id,
            providerName: provider.name,
            status: data.status,
            keyHint: secretHint(openSecret(data.secret_ciphertext)),
            secretHint: data.webhook_secret_ciphertext ? secretHint(openSecret(data.webhook_secret_ciphertext)) : null,
            lastError: data.last_error ?? null,
            verifiedAt: data.verified_at ?? null,
            lastWebhookAt: data.last_webhook_at ?? null,
            webhookUrl,
          }
        : null,
    following: typeof count === "number" ? count : null,
    lastCheckedAt: (last as { tracking_checked_at: string }[] | null)?.[0]?.tracking_checked_at ?? null,
  }
}

/** Is this key real? The cheapest read each aggregator offers; nothing is registered. */
export async function verifyTrackingKey(provider: TrackingProviderId, key: string): Promise<{ ok: true } | { ok: false; error: string; retry: boolean }> {
  try {
    if (provider === "aftership") {
      const r = await ask("AfterShip", `${AFTERSHIP_BASE}/couriers`, { headers: { "as-api-key": key } }, 1)
      return r.status === 200 ? { ok: true } : { ok: false, error: `AfterShip answered ${r.status}.`, retry: r.status >= 500 }
    }
    const r = await ask("17TRACK", `${SEVENTEENTRACK_BASE}/getquota`, { method: "POST", headers: { "17token": key }, body: {} }, 1)
    return r.status === 200 && r.body?.code === 0 ? { ok: true } : { ok: false, error: "17TRACK did not accept that key.", retry: false }
  } catch (e) {
    const err = e as { message?: string; retry?: boolean; code?: string }
    if (err.code === "key") return { ok: false, error: `${provider === "aftership" ? "AfterShip" : "17TRACK"} did not accept that key.`, retry: false }
    return { ok: false, error: (err.message ?? "The key could not be checked.").slice(0, 200), retry: err.retry !== false }
  }
}

export async function saveOwnTrackingAccount(db: Db, creatorId: string, body: Record<string, unknown>): Promise<{ ok: true } | { ok: false; error: string; status?: number }> {
  if (body.remove === true) {
    const { error } = await db.from("commerce_tracking_accounts").delete().eq("creator_id", creatorId)
    if (error && missing(error)) return { ok: false, error: "Your own tracking account can be added after the next Storelib update." }
    /* Its parcels go back to Storelib's own account on the next run: registered there again. */
    await db.from("fulfillments").update({ tracking_next_check_at: null }).eq("creator_id", creatorId).is("tracking_stopped_at", null).eq("tracking_account", "own")
    return { ok: true }
  }
  const provider = trackingProvider(typeof body.provider === "string" ? body.provider : null)
  if (!provider) return { ok: false, error: "Choose AfterShip or 17TRACK." }
  const key = typeof body.apiKey === "string" ? body.apiKey.trim() : ""
  const secret = typeof body.webhookSecret === "string" ? body.webhookSecret.trim() : ""
  const { data: had, error: readError } = await db.from("commerce_tracking_accounts").select("provider, secret_ciphertext").eq("creator_id", creatorId).maybeSingle()
  if (readError && missing(readError)) return { ok: false, error: "Your own tracking account can be added after the next Storelib update." }
  const sameProvider = had?.provider === provider.id
  if (!key && !sameProvider) return { ok: false, error: "Add your API key." }
  if (key && (key.length < 8 || key.length > 300 || /\s/.test(key))) return { ok: false, error: "That key doesn't look right." }
  if (secret && (secret.length < 8 || secret.length > 300)) return { ok: false, error: "The webhook secret is 8 to 300 characters." }
  const row: Record<string, unknown> = { creator_id: creatorId, provider: provider.id, status: "connected", last_error: null, updated_at: new Date().toISOString() }
  if (key) {
    const verdict = await verifyTrackingKey(provider.id, key)
    /* Read as the wide shape: the test build runs without strict narrowing. */
    const refused = verdict as { ok: boolean; error?: string; retry?: boolean }
    if (!refused.ok && !refused.retry) return { ok: false, error: refused.error ?? "That key was not accepted." }
    row.secret_ciphertext = sealSecret(key)
    row.verified_at = verdict.ok ? new Date().toISOString() : null
    if (!refused.ok) row.last_error = `Not checked: ${refused.error ?? ""}`.slice(0, 300)
  }
  if (secret) row.webhook_secret_ciphertext = sealSecret(secret)
  else if (!sameProvider) row.webhook_secret_ciphertext = null
  const { error } = await db.from("commerce_tracking_accounts").upsert(row, { onConflict: "creator_id" })
  if (error) return { ok: false, error: missing(error) ? "Your own tracking account can be added after the next Storelib update." : "That could not be saved." }
  /* Its open parcels are registered in this account on the next run. */
  await db.from("fulfillments").update({ tracking_next_check_at: null }).eq("creator_id", creatorId).is("tracking_stopped_at", null)
  return { ok: true }
}

/* ── the seller's hand on one shipment ────────────────────────────────── */

/** The seller changed a shipment's number: it is registered and read again on the next run. Quiet before part 160. */
export async function trackingNumberChanged(db: Db, fulfillmentId: string): Promise<void> {
  /* The old number's carrier state goes with it: kept, the new number's first state was compared against it and never applied, so a parcel already delivered stayed "in transit" for good. */
  const cleared = await db.from("fulfillments").update({ tracking_next_check_at: null, tracking_stopped_at: null, tracking_failures: 0, tracking_error: null, tracking_status: null }).eq("id", fulfillmentId)
  if (cleared?.error) await db.from("fulfillments").update({ tracking_next_check_at: null, tracking_stopped_at: null, tracking_failures: 0, tracking_error: null }).eq("id", fulfillmentId)
}

/** Pause or resume automatic updates on one shipment; the seller's own statuses always work. */
export async function setTrackingAuto(db: Db, creatorId: string, fulfillmentId: string, on: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await db.from("fulfillments").update({ tracking_auto: on, tracking_next_check_at: null, updated_at: new Date().toISOString() }).eq("id", fulfillmentId).eq("creator_id", creatorId)
  if (error) return { ok: false, error: missing(error) ? "Automatic tracking turns on after the next Storelib update." : "That could not be saved." }
  return { ok: true }
}
