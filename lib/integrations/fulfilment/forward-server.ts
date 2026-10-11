import "server-only"

/**
 * ===========================================================================
 *  ORDERS TO PRINTFUL AND PRINTIFY, TRACKING BACK TO THE BUYER
 * ===========================================================================
 * Connecting Printful or Printify in Settings > Integrations makes a
 * location of the same name (print on demand, forwarding to that
 * integration). A product set to Print on demand at that location is sent
 * there when it sells:
 *
 *   paid        queueForwarding (lib/physical/jobs-server.ts) queues a
 *               forward_fulfillment job for the location
 *   the job     forwardToProvider: the items still to ship from that
 *               location, by SKU, with the delivery address, to the
 *               provider (./printify.ts, ./printful.ts). Kept there as a
 *               draft for the seller to approve, or sent to production when
 *               they chose that. Written on the order's timeline either way.
 *               A provider that is busy or down: the job is tried again
 *               with backoff. A provider that says no (a SKU it does not
 *               have): the order says so and is marked to send by hand.
 *   shipped     the provider's webhook (app/api/integrations/webhooks), or
 *               a tracking_sync job every few hours when it can't send one,
 *               reads the order back from the provider and ships those
 *               items with the carrier and tracking number
 *               (partnerShipped: stock, status, timeline and the buyer's
 *               shipping email, as when the seller does it).
 *
 * Nothing is believed from a webhook body. Printify's are checked against
 * their signature, every webhook address carries a token only Storelib can
 * make, and the order is then read from the provider with the seller's key.
 */

import { createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto"
import type { Db } from "@/lib/physical/auth"
import { addOrderEvent as addOrderEventReal } from "@/lib/physical/events-server"
import { loadOrder as loadOrderReal, type PhysicalOrder } from "@/lib/physical/orders-server"
import { partnerShipped as partnerShippedReal } from "@/lib/physical/partner-server"
import { orderNumber } from "@/lib/physical/status"
import { regionCode } from "@/lib/physical/regions"
import { carrierOf } from "@/lib/physical/carriers"
import { openSecret, sealSecret } from "@/lib/physical/secrets"
import { getMainDomain } from "@/lib/url-helpers"
import { ProviderError, externalIdOf, checkoutIdOf } from "./http"
import { printful } from "./printful"
import { printify } from "./printify"
import type { ConnectorCredential, FulfilmentConnector, ProviderOrderInput, ProviderOrderState } from "./types"

export const CONNECTORS: Record<string, FulfilmentConnector> = { printify, printful }

export function connectorFor(provider: string | null | undefined): FulfilmentConnector | null {
  return provider && Object.prototype.hasOwnProperty.call(CONNECTORS, provider) ? CONNECTORS[provider] : null
}

/** What these functions reach outside themselves, so a test can watch them. */
export interface ForwardDeps {
  loadOrder: typeof loadOrderReal
  partnerShipped: typeof partnerShippedReal
  addOrderEvent: typeof addOrderEventReal
  now: () => number
}
/* Each one looked up when called: jobs-server imports this file and orders-server imports jobs-server, so at load they may not be there yet. */
const REAL: ForwardDeps = {
  loadOrder: (...a) => loadOrderReal(...a),
  partnerShipped: (...a) => partnerShippedReal(...a),
  addOrderEvent: (...a) => addOrderEventReal(...a),
  now: () => Date.now(),
}

/* ── the webhook address: a token only Storelib can make ──────────────── */

function urlKey(): Buffer {
  const own = process.env.COMMERCE_SECRETS_KEY
  const base = own || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!base) throw new Error("No key to sign integration webhook addresses with: set COMMERCE_SECRETS_KEY")
  return Buffer.from(hkdfSync("sha256", Buffer.from(base, "utf8"), Buffer.from("storelib-integration-webhooks"), Buffer.from(own ? "own" : "service"), 32))
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function webhookToken(provider: string, creatorId: string): string {
  const sig = createHmac("sha256", urlKey()).update(`${provider}:${creatorId.toLowerCase()}`).digest("base64url").slice(0, 32)
  return `${creatorId.toLowerCase()}.${sig}`
}

/** The creator a webhook address belongs to, or null when the token is not Storelib's. */
export function readWebhookToken(provider: string, token: string): string | null {
  const [creatorId, sig] = String(token ?? "").split(".")
  if (!creatorId || !sig || !UUID.test(creatorId)) return null
  const want = Buffer.from(webhookToken(provider, creatorId).split(".")[1])
  const got = Buffer.from(sig)
  return want.length === got.length && timingSafeEqual(want, got) ? creatorId.toLowerCase() : null
}

export function webhookUrl(provider: string, creatorId: string): string {
  return `https://${getMainDomain()}/api/integrations/webhooks/${provider}/${webhookToken(provider, creatorId)}`
}

/** Printify signs each delivery: X-Pfy-Signature: sha256=<hex HMAC-SHA256 of the raw body with the webhook's secret>. */
export function printifySignatureOk(secret: string, header: string | null, raw: string): boolean {
  const m = /^sha256=([0-9a-f]{64})$/i.exec(String(header ?? "").trim())
  if (!m || !secret) return false
  const want = Buffer.from(createHmac("sha256", secret).update(raw, "utf8").digest("hex"))
  const got = Buffer.from(m[1].toLowerCase())
  return want.length === got.length && timingSafeEqual(want, got)
}

/* ── connecting and disconnecting ─────────────────────────────────────── */

interface IntegrationRow {
  id: string
  creator_id: string
  provider: string
  status: string
  config: Record<string, unknown> | null
  secret_ciphertext: string | null
  webhook_secret_ciphertext: string | null
}

const ROW = "id, creator_id, provider, status, config, secret_ciphertext, webhook_secret_ciphertext"

function credentialOf(row: IntegrationRow): ConnectorCredential | null {
  const key = openSecret(row.secret_ciphertext)
  return key ? { key, config: row.config ?? {} } : null
}

/**
 * A key typed in Settings > Integrations, put to the provider: which shop
 * or store it works on. The row that is then saved, or what was wrong.
 */
export async function connectFields(
  provider: string,
  key: string,
  previous: Record<string, unknown> | null,
  choices: { autoConfirm?: unknown },
): Promise<{ ok: true; fields: Record<string, unknown> } | { ok: false; error: string }> {
  const c = connectorFor(provider)
  if (!c) return { ok: false, error: "That integration has nothing to connect." }
  try {
    const made = await c.connect(key)
    const now = new Date().toISOString()
    return {
      ok: true,
      fields: {
        secret_ciphertext: sealSecret(key),
        account_label: made.account ? made.account.slice(0, 120) : null,
        config: { ...made.config, auto_confirm: typeof choices.autoConfirm === "boolean" ? choices.autoConfirm : previous?.auto_confirm === true, verified_at: now },
        status: "connected",
        last_sync_at: now,
        last_error: null,
      },
    }
  } catch (e) {
    if (e instanceof ProviderError) return { ok: false, error: e.status === 401 || e.status === 403 ? `${c.name} did not accept that key.` : e.message }
    return { ok: false, error: `${c.name} could not be reached. Try again in a moment.` }
  }
}

/**
 * After a connect: the provider is asked to tell Storelib when parcels
 * ship (a fresh secret for Printify's signatures), and the location the
 * products point at is there. Neither can fail the connect: without the
 * webhook, tracking is read on a timer instead, and the page says so.
 */
export async function afterConnect(db: Db, creatorId: string, provider: string): Promise<void> {
  const c = connectorFor(provider)
  if (!c) return
  const { data: row } = await db.from("commerce_integrations").select(ROW).eq("creator_id", creatorId).eq("provider", provider).maybeSingle()
  if (!row) return
  const cred = credentialOf(row as IntegrationRow)
  const config = { ...((row as IntegrationRow).config ?? {}) }
  if (cred) {
    const secret = randomBytes(20).toString("hex")
    try {
      const r = await c.registerWebhooks(cred, webhookUrl(provider, creatorId), secret)
      config.webhooks = r.ok ? "on" : "off"
      config.webhook_note = r.note
      await db.from("commerce_integrations").update({ config, webhook_secret_ciphertext: r.ok ? sealSecret(secret) : null, updated_at: new Date().toISOString() }).eq("id", (row as IntegrationRow).id)
    } catch (e) {
      config.webhooks = "off"
      config.webhook_note = `${c.name} did not take Storelib's update address${e instanceof Error && e.message ? ` (${e.message.replace(/^[^:]+:\s*/, "").slice(0, 120)})` : ""}, so Storelib checks ${c.name} for tracking every few hours instead.`
      await db.from("commerce_integrations").update({ config, webhook_secret_ciphertext: null, updated_at: new Date().toISOString() }).eq("id", (row as IntegrationRow).id)
    }
  }
  await ensureProviderLocation(db, creatorId, provider, (row as IntegrationRow).id)
}

/** The provider's own location: found by its link, or by its name, or made. Returns its id. */
export async function ensureProviderLocation(db: Db, creatorId: string, provider: string, integrationId: string): Promise<string | null> {
  const c = connectorFor(provider)
  if (!c) return null
  const { data: linked } = await db.from("inventory_locations").select("id").eq("creator_id", creatorId).eq("integration_id", integrationId).limit(1).maybeSingle()
  if (linked?.id) return linked.id
  /* Connected before (and disconnected since): the location kept its name and its products, and is linked again. */
  const { data: named } = await db.from("inventory_locations").select("id, forwarding").eq("creator_id", creatorId).ilike("name", c.name).limit(1).maybeSingle()
  if (named?.id && (named.forwarding === "provider" || named.forwarding === "none")) {
    await db.from("inventory_locations").update({ forwarding: "provider", integration_id: integrationId, updated_at: new Date().toISOString() }).eq("id", named.id).eq("creator_id", creatorId)
    return named.id
  }
  for (const name of [c.name, `${c.name} orders`]) {
    const { data, error } = await db
      .from("inventory_locations")
      .insert({ creator_id: creatorId, name, kind: "print_on_demand", forwarding: "provider", integration_id: integrationId, holds_inventory: false, fulfills_orders: true })
      .select("id")
      .maybeSingle()
    if (data?.id) return data.id
    if (error && error.code !== "23505") return null
  }
  return null
}

/** Before the row goes: the provider stops sending to Storelib. Best effort; a key it no longer takes is no reason to keep a row. */
export async function beforeDisconnect(db: Db, creatorId: string, provider: string): Promise<void> {
  const c = connectorFor(provider)
  if (!c) return
  const { data: row } = await db.from("commerce_integrations").select(ROW).eq("creator_id", creatorId).eq("provider", provider).maybeSingle()
  const cred = row ? credentialOf(row as IntegrationRow) : null
  if (!cred) return
  await c.removeWebhooks(cred, webhookUrl(provider, creatorId)).catch(() => undefined)
}

/* ── an order, sent ───────────────────────────────────────────────────── */

const forwardedKey = (checkoutId: string, locationId: string) => `forwarded_provider:${checkoutId}:${locationId}`

async function integrationById(db: Db, creatorId: string, integrationId: string): Promise<IntegrationRow | null> {
  if (!UUID.test(integrationId)) return null
  const { data } = await db.from("commerce_integrations").select(ROW).eq("id", integrationId).eq("creator_id", creatorId).maybeSingle()
  return (data as IntegrationRow | null) ?? null
}

/** The items still to ship from one location, as the provider takes them. */
export function providerOrderFor(order: PhysicalOrder, locationId: string, autoConfirm: boolean): ProviderOrderInput | { error: string } {
  const open = order.lines.filter((l) => l.requiresShipping && l.locationId === locationId && l.quantity - l.fulfilled > 0)
  if (open.length === 0) return { error: "" }
  const noSku = open.filter((l) => !l.sku || !String(l.sku).trim())
  if (noSku.length > 0) return { error: `${noSku.map((l) => l.title).join(", ")} ${noSku.length === 1 ? "has" : "have"} no SKU, so the provider can't tell which of its products ${noSku.length === 1 ? "it is" : "they are"}. Give ${noSku.length === 1 ? "it" : "them"} the provider's SKU, then send this order yourself.` }
  const a = order.address as Record<string, any> | null
  if (!a?.line1 || !a?.city || !a?.country) return { error: "The order has no complete delivery address." }
  const country = String(a.country).toUpperCase()
  return {
    externalId: externalIdOf(order.id),
    label: orderNumber(order.id),
    address: {
      name: String(a.name ?? order.buyerName ?? "").trim() || "Customer",
      company: a.company ?? null,
      line1: String(a.line1),
      line2: a.line2 ? String(a.line2) : null,
      city: String(a.city),
      region: regionCode(country, a.region) ?? (a.region ? String(a.region) : null),
      postalCode: a.postalCode ? String(a.postalCode) : null,
      country,
      phone: a.phone ? String(a.phone) : order.buyerPhone,
      email: order.buyerEmail,
    },
    lines: open.map((l) => ({ sku: String(l.sku).trim(), quantity: l.quantity - l.fulfilled, title: l.variantName ? `${l.title} (${l.variantName})` : l.title, lineId: externalIdOf(l.orderId) })),
    autoConfirm,
  }
}

/** The forward_fulfillment job. Throws only for what is worth trying again. */
export async function forwardToProvider(db: Db, payload: Record<string, any>, deps: ForwardDeps = REAL): Promise<void> {
  const checkoutId = String(payload.checkoutId ?? "")
  const locationId = String(payload.locationId ?? "")
  const creatorId = String(payload.creatorId ?? "")
  const integration = await integrationById(db, creatorId, String(payload.integrationId ?? ""))
  const c = connectorFor(integration?.provider)
  const manual = (message: string, why: string) => deps.addOrderEvent(db, { checkoutId, creatorId, kind: "fulfillment.manual_needed", message, key: `provider_manual:${checkoutId}:${locationId}:${why}`.slice(0, 200) })
  if (!integration || !c || integration.status !== "connected") return manual("The print partner for this order is not connected any more. Send this order to them yourself.", "gone")
  const cred = credentialOf(integration)
  if (!cred) return manual(`${c.name}'s key could not be read. Connect ${c.name} again in Settings > Integrations, then send this order yourself.`, "key")

  const { data: done } = await db.from("commerce_order_events").select("id").eq("idempotency_key", forwardedKey(checkoutId, locationId)).maybeSingle()
  if (done) return
  const order = await deps.loadOrder(db, { creatorId, checkoutId })
  if (!order || order.cancelledAt || (order.status !== "paid" && order.status !== "partially_refunded")) return
  const input = providerOrderFor(order, locationId, cred.config.auto_confirm === true)
  if ("error" in input) return input.error ? manual(`${c.name}: ${input.error}`, "input") : undefined

  try {
    const sent = await c.submit(cred, input)
    await deps.addOrderEvent(db, {
      checkoutId,
      creatorId,
      kind: "fulfillment.forwarded",
      message: sent.stage === "draft" ? `Order sent to ${c.name}. Approve it there to have it made.` : `Order sent to ${c.name} for production.`,
      detail: { provider: c.id, provider_order_id: sent.providerOrderId, location_id: locationId, stage: sent.stage },
      key: forwardedKey(checkoutId, locationId),
    })
    await db.from("commerce_integrations").update({ last_sync_at: new Date(deps.now()).toISOString(), last_error: null, status: "connected" }).eq("id", integration.id)
    await scheduleTrackingSync(db, { creatorId, checkoutId, locationId, integrationId: integration.id, providerOrderId: sent.providerOrderId, round: 1 }, deps.now())
  } catch (e) {
    if (e instanceof ProviderError && !e.retry) {
      await db.from("commerce_integrations").update({ last_error: e.message.slice(0, 500) }).eq("id", integration.id)
      return manual(`${e.message.slice(0, 200)} The order was not sent. Send it yourself.`, `refused:${e.status}`)
    }
    throw e
  }
}

/* ── tracking, back ───────────────────────────────────────────────────── */

/** How long until the next look: soon at first, then a few times a day, for about three weeks. */
export const TRACKING_ROUNDS = 70
export function nextCheckDelayMs(round: number): number {
  return (round <= 3 ? 2 : 6) * 3600_000
}

export async function scheduleTrackingSync(db: Db, p: { creatorId: string; checkoutId: string; locationId: string; integrationId: string; providerOrderId: string; round: number }, now: number): Promise<void> {
  if (p.round > TRACKING_ROUNDS) return
  const { error } = await db.from("commerce_jobs").insert({
    creator_id: p.creatorId,
    kind: "tracking_sync",
    payload: { checkoutId: p.checkoutId, locationId: p.locationId, integrationId: p.integrationId, providerOrderId: p.providerOrderId, creatorId: p.creatorId, round: p.round },
    idempotency_key: `tracking_sync:${p.checkoutId}:${p.locationId}:${p.round}`,
    run_after: new Date(now + nextCheckDelayMs(p.round)).toISOString(),
    max_attempts: 3,
  })
  if (error && error.code !== "23505") console.error("[integrations] tracking check not queued:", error.code)
}

/**
 * What the provider says about its order, applied: each parcel with a
 * tracking number ships those items (or moves its shipment on to
 * delivered); a cancelled or stuck order is said on the timeline. True when
 * there is nothing left to wait for.
 */
export async function applyProviderState(
  db: Db,
  ctx: { creatorId: string; checkoutId: string; locationId: string | null; provider: string; name: string },
  state: ProviderOrderState,
  deps: ForwardDeps = REAL,
): Promise<{ finished: boolean; shipped: number }> {
  const { creatorId, checkoutId, locationId, name } = ctx
  if (state.stage === "cancelled") {
    await deps.addOrderEvent(db, { checkoutId, creatorId, kind: "fulfillment.manual_needed", message: `${name} cancelled its order. Send these items another way, or refund the buyer.`, key: `provider_cancelled:${checkoutId}:${locationId ?? ""}` })
    return { finished: true, shipped: 0 }
  }
  if (state.stage === "problem" && state.problem) {
    await deps.addOrderEvent(db, { checkoutId, creatorId, kind: "fulfillment.manual_needed", message: state.problem, key: `provider_problem:${checkoutId}:${locationId ?? ""}:${state.problem.slice(0, 40)}`.slice(0, 200) })
  }
  let shipped = 0
  for (const s of state.shipments) {
    if (!s.trackingNumber) continue
    const r = await deps.partnerShipped(db, {
      creatorId,
      checkoutId,
      locationId,
      /* "usps" as the buyer reads it, "USPS"; a carrier we don't know as the provider wrote it. */
      carrier: (s.carrier && carrierOf(s.carrier)?.name) || s.carrier,
      trackingNumber: s.trackingNumber,
      trackingUrl: s.trackingUrl && /^https:\/\//.test(s.trackingUrl) ? s.trackingUrl : null,
      status: s.delivered ? "delivered" : "shipped",
      partner: { provider: ctx.provider, name },
    })
    if (r.ok && r.kind !== "unchanged") shipped++
  }
  const allDelivered = state.shipments.length > 0 && state.shipments.every((s) => s.delivered)
  /* Printful never says delivered: shipped is the end of what it tells. Printify says delivered, so it is waited for. */
  const finished = state.stage === "delivered" || allDelivered || (state.stage === "shipped" && ctx.provider === "printful")
  return { finished, shipped }
}

/** The tracking_sync job. Throws only for what is worth trying again. */
export async function syncProviderTracking(db: Db, payload: Record<string, any>, deps: ForwardDeps = REAL): Promise<void> {
  const creatorId = String(payload.creatorId ?? "")
  const integration = await integrationById(db, creatorId, String(payload.integrationId ?? ""))
  const c = connectorFor(integration?.provider)
  const cred = integration ? credentialOf(integration) : null
  /* Disconnected since: nothing to read with, and the order's timeline already says it was sent there. */
  if (!integration || !c || !cred) return
  const state = await c.fetchOrder(cred, String(payload.providerOrderId ?? ""))
  const round = Number(payload.round ?? 1)
  const { finished } = await applyProviderState(db, { creatorId, checkoutId: String(payload.checkoutId), locationId: payload.locationId ? String(payload.locationId) : null, provider: c.id, name: c.name }, state, deps)
  if (!finished) await scheduleTrackingSync(db, { creatorId, checkoutId: String(payload.checkoutId), locationId: String(payload.locationId ?? ""), integrationId: integration.id, providerOrderId: state.providerOrderId || String(payload.providerOrderId), round: round + 1 }, deps.now())
}

/**
 * A webhook from the provider, after its address token was checked. The
 * body only says which order to look at; what happened is read from the
 * provider. Printify's signature is checked here, with the secret saved
 * when it was connected.
 */
export async function handleProviderWebhook(
  db: Db,
  input: { provider: string; creatorId: string; raw: string; signature: string | null },
  deps: ForwardDeps = REAL,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const c = connectorFor(input.provider)
  if (!c) return { status: 404, body: { error: "Not found." } }
  const { data } = await db.from("commerce_integrations").select(ROW).eq("creator_id", input.creatorId).eq("provider", c.id).maybeSingle()
  const row = data as IntegrationRow | null
  const cred = row ? credentialOf(row) : null
  if (!row || !cred || row.status !== "connected") return { status: 410, body: { error: "Not connected." } }
  if (c.id === "printify") {
    const secret = openSecret(row.webhook_secret_ciphertext)
    if (!secret || !printifySignatureOk(secret, input.signature, input.raw)) return { status: 401, body: { error: "The signature did not match." } }
  }
  let body: any
  try {
    body = JSON.parse(input.raw)
  } catch {
    return { status: 400, body: { error: "The body is not JSON." } }
  }
  const providerOrderId = c.id === "printify" ? (body?.resource?.type === "order" ? body?.resource?.id : null) : body?.data?.order?.id
  if (providerOrderId == null || String(providerOrderId) === "") return { status: 200, body: { ok: true, ignored: true } }
  let state: ProviderOrderState
  try {
    state = await c.fetchOrder(cred, String(providerOrderId))
  } catch (e) {
    /* The provider retries a delivery that was not answered 2xx: worth it when it was busy, not when the order is not ours. */
    if (e instanceof ProviderError && !e.retry) return { status: 200, body: { ok: true, ignored: true } }
    return { status: 503, body: { error: "Try again." } }
  }
  const checkoutId = checkoutIdOf(state.externalId)
  if (!checkoutId) return { status: 200, body: { ok: true, ignored: true } }
  const { data: co } = await db.from("commerce_checkouts").select("id, creator_id").eq("id", checkoutId).eq("creator_id", input.creatorId).maybeSingle()
  if (!co) return { status: 200, body: { ok: true, ignored: true } }
  const { data: locs } = await db.from("inventory_locations").select("id").eq("creator_id", input.creatorId).eq("integration_id", row.id)
  const ids = new Set(((locs ?? []) as { id: string }[]).map((l) => l.id))
  const order = await deps.loadOrder(db, { creatorId: input.creatorId, checkoutId })
  const locationId = order?.lines.find((l) => l.locationId && ids.has(l.locationId))?.locationId ?? null
  if (!order || !locationId) return { status: 200, body: { ok: true, ignored: true } }
  const out = await applyProviderState(db, { creatorId: input.creatorId, checkoutId, locationId, provider: c.id, name: c.name }, state, deps)
  await db.from("commerce_integrations").update({ last_sync_at: new Date(deps.now()).toISOString() }).eq("id", row.id)
  return { status: 200, body: { ok: true, shipped: out.shipped } }
}
