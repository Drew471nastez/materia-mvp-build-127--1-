import "server-only"

/**
 * ===========================================================================
 *  KLAVIYO AND OMNISEND, CONNECTED: WHAT FLOWS, AND HOW
 * ===========================================================================
 * Connected with the store's private key (Settings › Integrations ›
 * Klaviyo or Omnisend), checked with the provider before it is saved,
 * sealed (lib/physical/secrets.ts) and never sent back: the page shows its
 * last four characters.
 *
 * OUT, TO THE PROVIDER
 *   subscribers   the store's contacts who said yes (./consent.ts): on the
 *                 chosen Klaviyo list, or Omnisend email subscribers.
 *                 Customers who did not ask are profiles or contacts with
 *                 no marketing consent, never on a list. An unsubscribe on
 *                 Storelib is an unsubscribe there.
 *   order events  every sale, physical or digital (they are customers):
 *                 Klaviyo Placed Order and Ordered Product, Fulfilled,
 *                 Canceled and Refunded Order, and Started Checkout only
 *                 for a checkout whose news box was ticked; Omnisend placed
 *                 order, paid for order, order fulfilled, order canceled,
 *                 order refunded (./orders.ts).
 * IN, FROM THE PROVIDER
 *   unsubscribes  read every sync (Klaviyo's suppressions, Omnisend's
 *                 unsubscribed contacts); a Storelib subscriber who left
 *                 there is unsubscribed here, unless they said yes again on
 *                 Storelib after it (./consent.ts pullApplies).
 *
 * HOW. Everything is a commerce job (kind marketing_sync, the queue in
 * lib/physical/jobs-server.ts): an order event queues one per provider as
 * it happens (lib/physical/events-server.ts), and the cron queues a sync
 * every quarter hour per connected store (/api/cron/physical). Each job is
 * keyed, retried with backoff when the provider is busy or down, and paced
 * under its rate limits (./http.ts). Each thing sent is written down in
 * marketing_sync_items (SQL part 161) before the job ends, so a retried job
 * or a second run never sends it twice; that table is also the card's
 * counts. Disconnecting deletes the key, the record and every job not yet
 * run.
 *
 * BACKFILL. Chosen when connecting: the subscribers already on Storelib
 * (and the unsubscribed, so they are suppressed there too) and the last 90
 * days of orders go in batches, as past data (Klaviyo's historical import
 * and backfill, so no welcome email and no flow fires for them).
 */

import { createHash } from "node:crypto"
import { openSecret, sealSecret, secretHint } from "@/lib/physical/secrets"
import { ProviderError, nameParts } from "./http"
import { contactPush, consentedAt, pullApplies, pulledStatus, type ContactPush, type SubscriberRow } from "./consent"
import { KLAVIYO_SCOPES, klaviyoConnect, klaviyoImportProfiles, klaviyoLists, klaviyoPull, klaviyoSubscribe, klaviyoTrack, klaviyoUnsubscribe, looksLikeKlaviyoKey, type KlaviyoList, type PulledAddress } from "./klaviyo"
import { OMNISEND_SCOPES, omnisendConnect, omnisendPull, omnisendTrack, omnisendUpsertContacts, type OmnisendPerson } from "./omnisend"
import { fromDigitalOrder, fromPhysicalOrder, klaviyoEventsFor, omnisendEventsFor, type MarketingEvent, type MarketingOrder } from "./orders"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export type MarketingProvider = "klaviyo" | "omnisend"
export const MARKETING_PROVIDERS: MarketingProvider[] = ["klaviyo", "omnisend"]
export const PROVIDER_NAME: Record<MarketingProvider, string> = { klaviyo: "Klaviyo", omnisend: "Omnisend" }
export const SCOPES: Record<MarketingProvider, string[]> = { klaviyo: KLAVIYO_SCOPES, omnisend: OMNISEND_SCOPES }

export function isMarketingProvider(p: unknown): p is MarketingProvider {
  return p === "klaviyo" || p === "omnisend"
}

/** What the sync reaches outside itself (./deps-server.ts), so a test can hand in its own. */
export interface MarketingDeps {
  loadOrder: (db: Db, where: { creatorId: string; checkoutId: string }) => Promise<any> // eslint-disable-line @typescript-eslint/no-explicit-any
  orderUrl: (db: Db, co: { creator_id: string; receipt_token: string }) => Promise<string | null>
  now: () => number
}

/* ── how much one job does ─────────────────────────────────────────────── */

export const SYNC_EVERY_MS = 15 * 60_000
export const SUBSCRIBERS_PER_RUN = 1000
export const ORDERS_PER_RUN = 40
export const BACKFILL_DAYS = 90
const EPOCH = "2012-01-01T00:00:00.000Z"

/* ── the record of what was sent ──────────────────────────────────────── */

export function emailHash(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex")
}
const contactKey = (email: string) => `c:${emailHash(email)}`
const pulledKey = (email: string) => `p:${emailHash(email)}`

async function itemsIn(db: Db, creatorId: string, provider: MarketingProvider, keys: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  for (let i = 0; i < keys.length; i += 200) {
    const { data } = await db.from("marketing_sync_items").select("item_key, state").eq("creator_id", creatorId).eq("provider", provider).in("item_key", keys.slice(i, i + 200))
    for (const r of (data ?? []) as { item_key: string; state: string }[]) out.set(r.item_key, r.state)
  }
  return out
}

async function writeItems(db: Db, creatorId: string, provider: MarketingProvider, items: { key: string; state: string }[], now: number): Promise<void> {
  const at = new Date(now).toISOString()
  for (let i = 0; i < items.length; i += 500) {
    const rows = items.slice(i, i + 500).map((x) => ({ creator_id: creatorId, provider, item_key: x.key, state: x.state, updated_at: at }))
    const { error } = await db.from("marketing_sync_items").upsert(rows, { onConflict: "creator_id,provider,item_key" })
    if (error) throw new Error(`The sync record could not be written (${error.code ?? "error"}).`)
  }
}

/* ── the integration row ──────────────────────────────────────────────── */

interface Row {
  id: string
  creator_id: string
  provider: MarketingProvider
  status: string
  account_label: string | null
  config: Record<string, any> | null // eslint-disable-line @typescript-eslint/no-explicit-any
  secret_ciphertext: string | null
  last_sync_at: string | null
  last_error: string | null
}
const ROW = "id, creator_id, provider, status, account_label, config, secret_ciphertext, last_sync_at, last_error"

async function rowOf(db: Db, creatorId: string, provider: MarketingProvider): Promise<Row | null> {
  const { data } = await db.from("commerce_integrations").select(ROW).eq("creator_id", creatorId).eq("provider", provider).maybeSingle()
  return (data as Row | null) ?? null
}

async function saveConfig(db: Db, row: Row, patch: Record<string, unknown>, extra: Record<string, unknown> = {}): Promise<void> {
  row.config = { ...(row.config ?? {}), ...patch }
  await db.from("commerce_integrations").update({ config: row.config, updated_at: new Date().toISOString(), ...extra }).eq("id", row.id)
}

async function noteError(db: Db, row: Row, message: string): Promise<void> {
  await db.from("commerce_integrations").update({ last_error: message.slice(0, 500), updated_at: new Date().toISOString() }).eq("id", row.id)
}

/* ── connect, change, disconnect ──────────────────────────────────────── */

export interface MarketingView {
  provider: MarketingProvider
  connected: boolean
  keyHint: string | null
  account: string | null
  listId: string | null
  listName: string | null
  backfill: boolean
  /** The 90 day backfill: still sending, or done. Null when it was not asked for. */
  backfillState: "running" | "done" | null
  lastSyncAt: string | null
  lastError: string | null
  counts: { subscribed: number; unsubscribed: number; customers: number; events: number; pulled: number }
  scopes: string[]
  /** Part 161 has not run: nothing can be kept yet. */
  ready: boolean
}

async function countState(db: Db, creatorId: string, provider: MarketingProvider, state: string): Promise<number> {
  const { count } = await db.from("marketing_sync_items").select("id", { count: "exact", head: true }).eq("creator_id", creatorId).eq("provider", provider).eq("state", state)
  return Number(count ?? 0)
}

export async function loadMarketing(db: Db, creatorId: string): Promise<MarketingView[]> {
  const { data, error } = await db.from("commerce_integrations").select(ROW).eq("creator_id", creatorId).in("provider", MARKETING_PROVIDERS)
  const ready = !(await db.from("marketing_sync_items").select("id", { count: "exact", head: true }).eq("creator_id", creatorId)).error
  const rows = new Map(((error ? [] : data) ?? []).map((r: Row) => [r.provider, r]))
  const out: MarketingView[] = []
  for (const provider of MARKETING_PROVIDERS) {
    const r = rows.get(provider) as Row | undefined
    const connected = !!r && r.status === "connected"
    const c = r?.config ?? {}
    const counts = { subscribed: 0, unsubscribed: 0, customers: 0, events: 0, pulled: 0 }
    if (r && ready) {
      const [a, b, cu, e, p] = await Promise.all(["subscribed", "unsubscribed", "customer", "sent", "pulled"].map((s) => countState(db, creatorId, provider, s)))
      Object.assign(counts, { subscribed: a, unsubscribed: b, customers: cu, events: e, pulled: p })
    }
    out.push({
      provider,
      connected,
      keyHint: r?.secret_ciphertext ? secretHint(openSecret(r.secret_ciphertext)) : null,
      account: r?.account_label ?? null,
      listId: typeof c.list_id === "string" ? c.list_id : null,
      listName: typeof c.list_name === "string" ? c.list_name : null,
      backfill: c.backfill === true,
      backfillState: c.backfill === true ? (c.backfill_done_at ? "done" : "running") : null,
      lastSyncAt: r?.last_sync_at ?? null,
      lastError: r?.last_error ?? null,
      counts,
      scopes: SCOPES[provider],
      ready,
    })
  }
  return out
}

function refusal(name: string, e: unknown): string {
  if (e instanceof ProviderError) {
    if (e.status === 401) return `${name} did not accept that key.`
    if (e.status === 403) return `${name} accepted the key, but it is missing a permission. Make a key with: ${name === "Klaviyo" ? KLAVIYO_SCOPES.join(", ") : OMNISEND_SCOPES.join(", ")}.`
    return e.message
  }
  return `${name} could not be reached. Try again in a moment.`
}

/**
 * Settings › Integrations › Klaviyo or Omnisend. One body, one of:
 *   { step: "check", apiKey }                      the key is put to the provider; its account and (Klaviyo) lists come back; nothing is saved
 *   { step: "connect", apiKey, listId, backfill }  checked again, then saved sealed, and the first sync queued
 *   { listId }                                     Klaviyo: subscribers go to another list from now on
 *   { disconnect: true }                           the key, the record and the waiting jobs are gone
 */
export async function saveMarketing(
  db: Db,
  creatorId: string,
  provider: MarketingProvider,
  body: Record<string, unknown>,
  now: number = Date.now(),
): Promise<{ ok: true; lists?: KlaviyoList[]; account?: string | null; queued?: boolean } | { ok: false; error: string; status?: number }> {
  const name = PROVIDER_NAME[provider]
  if (body.disconnect === true) {
    await disconnectMarketing(db, creatorId, provider)
    return { ok: true }
  }
  const had = await rowOf(db, creatorId, provider)
  const typed = typeof body.apiKey === "string" ? body.apiKey.trim() : ""

  /* A new list for a store already connected. */
  if (!typed && had && typeof body.listId === "string" && provider === "klaviyo") {
    const key = openSecret(had.secret_ciphertext)
    if (!key) return { ok: false, error: "Connect Klaviyo again: its key could not be read." }
    let lists: KlaviyoList[]
    try {
      lists = await klaviyoLists(key, creatorId)
    } catch (e) {
      return { ok: false, error: refusal(name, e) }
    }
    const list = lists.find((l) => l.id === body.listId)
    if (!list) return { ok: false, error: "That list is not in your Klaviyo account any more." }
    await saveConfig(db, had, { list_id: list.id, list_name: list.name })
    return { ok: true, lists }
  }
  if (!typed && had && body.step === "lists" && provider === "klaviyo") {
    const key = openSecret(had.secret_ciphertext)
    if (!key) return { ok: false, error: "Connect Klaviyo again: its key could not be read." }
    try {
      return { ok: true, lists: await klaviyoLists(key, creatorId) }
    } catch (e) {
      return { ok: false, error: refusal(name, e) }
    }
  }

  if (!typed) return { ok: false, error: `Add your ${name} API key.` }
  if (typed.length < 10 || typed.length > 300 || /\s/.test(typed)) return { ok: false, error: "That key doesn't look right." }
  if (provider === "klaviyo" && !looksLikeKlaviyoKey(typed)) return { ok: false, error: "Use a Klaviyo private API key: it starts with pk_. The six character public key is the one for sign up forms." }

  let account: string | null = null
  let accountId: string | null = null
  let lists: KlaviyoList[] = []
  try {
    if (provider === "klaviyo") ({ account, accountId, lists } = await klaviyoConnect(typed, creatorId))
    else ({ account, accountId } = await omnisendConnect(typed, creatorId))
  } catch (e) {
    return { ok: false, error: refusal(name, e) }
  }
  if (body.step === "check") return { ok: true, account, lists }

  let list: KlaviyoList | null = null
  if (provider === "klaviyo") {
    list = lists.find((l) => l.id === body.listId) ?? null
    if (!list) return { ok: false, error: lists.length ? "Choose the list your subscribers go to." : "Make a list in Klaviyo first (Audience › Lists & segments), then connect." }
  }
  const at = new Date(now).toISOString()
  const backfill = body.backfill === true
  const config = {
    list_id: list?.id ?? null,
    list_name: list?.name ?? null,
    account_id: accountId,
    connected_at: at,
    verified_at: at,
    backfill,
    /* Where each part of the sync starts: with a backfill, everything already there; without, only what happens from now. */
    subs_cursor: { at: backfill ? EPOCH : at, id: "" },
    digital_cursor: { at: backfill ? new Date(now - BACKFILL_DAYS * 86_400_000).toISOString() : at, id: "" },
    physical_cursor: { at: backfill ? new Date(now - BACKFILL_DAYS * 86_400_000).toISOString() : at, id: "" },
    /* Unsubscribes already there are read first, so nobody who left is put back on a list. */
    pull: { since: null, list_since: null, after: null, initial_done: false },
  }
  /* A different account than before: the record of what was sent is for that one, so it starts again. */
  if (had && (had.config?.account_id ?? null) !== accountId) await db.from("marketing_sync_items").delete().eq("creator_id", creatorId).eq("provider", provider)
  const { error } = await db.from("commerce_integrations").upsert(
    { creator_id: creatorId, provider, category: "marketing", status: "connected", account_label: account ? account.slice(0, 120) : null, secret_ciphertext: sealSecret(typed), config, last_sync_at: at, last_error: null, updated_at: at },
    { onConflict: "creator_id,provider" },
  )
  if (error) return { ok: false, error: error.code === "23514" ? `${name} needs its database update first (SQL part 161).` : "The integration could not be saved.", status: error.code === "23514" ? 503 : 500 }
  const queued = await queueSync(db, creatorId, provider, now, `${Date.parse(at)}`)
  return { ok: true, account, lists, queued }
}

export async function disconnectMarketing(db: Db, creatorId: string, provider: MarketingProvider): Promise<void> {
  await db.from("commerce_integrations").delete().eq("creator_id", creatorId).eq("provider", provider)
  /* Jobs not run yet stop here; one already running finds no key and does nothing. */
  await db
    .from("commerce_jobs")
    .update({ status: "done", last_error: "Disconnected", finished_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("creator_id", creatorId)
    .eq("kind", "marketing_sync")
    .in("status", ["queued", "failed"])
    .ilike("idempotency_key", `mkt:${provider}:%`)
  await db.from("marketing_sync_items").delete().eq("creator_id", creatorId).eq("provider", provider)
}

/* ── queueing ─────────────────────────────────────────────────────────── */

async function insertJob(db: Db, creatorId: string, key: string, payload: Record<string, unknown>, runAfter?: number): Promise<boolean> {
  const { error } = await db.from("commerce_jobs").insert({ creator_id: creatorId, kind: "marketing_sync", payload, idempotency_key: key.slice(0, 200), max_attempts: 8, ...(runAfter ? { run_after: new Date(runAfter).toISOString() } : {}) })
  if (error && error.code !== "23505") console.error("[marketing] job not queued:", error.code)
  return !error
}

/** Runs the queue after this response (next/server after), as the order jobs do; outside a request the cron does. */
async function runSoon(): Promise<void> {
  try {
    const { after } = await import("next/server")
    after(async () => {
      const { createAdminClient } = await import("@/lib/supabase/admin")
      const { runJobs } = await import("@/lib/physical/jobs-server")
      await runJobs(createAdminClient(), 5)
    })
  } catch {
    /* Outside a request (a test, a script): the cron picks it up. */
  }
}

export async function queueSync(db: Db, creatorId: string, provider: MarketingProvider, now: number, tag: string, runAfter?: number): Promise<boolean> {
  const made = await insertJob(db, creatorId, `mkt:${provider}:sync:${creatorId}:${tag}`, { op: "sync", provider, creatorId }, runAfter)
  if (made && !runAfter) await runSoon()
  return made
}

/** The cron, every ten minutes: one sync per connected store and provider per quarter hour (the key makes a second one nothing). */
export async function scheduleMarketingSyncs(db: Db, now: number = Date.now()): Promise<number> {
  const { data, error } = await db.from("commerce_integrations").select("creator_id, provider").in("provider", MARKETING_PROVIDERS).eq("status", "connected").limit(2000)
  if (error) return 0
  let n = 0
  const slot = Math.floor(now / SYNC_EVERY_MS)
  for (const r of (data ?? []) as { creator_id: string; provider: MarketingProvider }[]) {
    if (await insertJob(db, r.creator_id, `mkt:${r.provider}:sync:${r.creator_id}:slot${slot}`, { op: "sync", provider: r.provider, creatorId: r.creator_id })) n++
  }
  return n
}

/** Order timeline kinds that are a marketing event (lib/physical/events-server.ts calls this for them). */
export const ORDER_EVENT_KINDS: Record<string, MarketingEvent> = {
  "payment.paid": "placed",
  "fulfillment.created": "fulfilled",
  "fulfillment.delivered": "fulfilled",
  "order.cancelled": "cancelled",
  "payment.refunded": "refunded",
  "checkout.started": "started",
}

/** An order event happened: a job per connected marketing provider, keyed so the same event is queued once. */
export async function queueMarketingEvent(db: Db, e: { creatorId: string; checkoutId: string; kind: string; key?: string | null }): Promise<number> {
  const event = ORDER_EVENT_KINDS[e.kind]
  if (!event) return 0
  const { data, error } = await db.from("commerce_integrations").select("provider").eq("creator_id", e.creatorId).in("provider", MARKETING_PROVIDERS).eq("status", "connected")
  if (error || !data?.length) return 0
  let n = 0
  for (const r of data as { provider: MarketingProvider }[]) {
    const key = `mkt:${r.provider}:ev:${event}:${e.checkoutId}:${e.key ?? e.kind}`
    if (await insertJob(db, e.creatorId, key, { op: "event", provider: r.provider, creatorId: e.creatorId, orderRef: e.checkoutId, event })) n++
  }
  if (n) await runSoon()
  return n
}

/* ── the job ──────────────────────────────────────────────────────────── */

/** The marketing_sync job. Throws only for what is worth trying again (the provider busy or down). */
export async function runMarketingJob(db: Db, payload: Record<string, any>, deps: MarketingDeps): Promise<void> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const provider = payload?.provider
  const creatorId = String(payload?.creatorId ?? "")
  if (!isMarketingProvider(provider) || !creatorId) return
  const row = await rowOf(db, creatorId, provider)
  if (!row || row.status !== "connected") return
  const key = openSecret(row.secret_ciphertext)
  if (!key) {
    await noteError(db, row, `${PROVIDER_NAME[provider]}'s key could not be read. Connect it again.`)
    return
  }
  try {
    if (payload.op === "event") await sendOrderEvent(db, row, key, String(payload.orderRef ?? ""), payload.event as MarketingEvent, deps)
    else if (payload.op === "sync") await runSync(db, row, key, deps)
  } catch (e) {
    if (e instanceof ProviderError && !e.retry) {
      await noteError(db, row, e.message)
      return
    }
    if (e instanceof ProviderError) await noteError(db, row, e.message)
    throw e
  }
}

async function markSynced(db: Db, row: Row, now: number): Promise<void> {
  await db.from("commerce_integrations").update({ last_sync_at: new Date(now).toISOString(), last_error: null, updated_at: new Date(now).toISOString() }).eq("id", row.id)
}

/* ── order events ─────────────────────────────────────────────────────── */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * One Storelib event, sent as each provider's events (Placed Order makes
 * an Ordered Product per line too). Each provider event is written down as
 * it goes, so a job retried after half of them went sends only the rest.
 */
async function sendEvents(db: Db, row: Row, key: string, order: MarketingOrder, event: MarketingEvent, opts: { backfill: boolean; now: number; checkoutUrl?: string | null }): Promise<number> {
  const provider = row.provider
  const nowIso = new Date(opts.now).toISOString()
  const ref = event === "refunded" ? `${order.id}:${order.refundedCents}` : order.id
  type Out = { itemKey: string; state: "sent" | "line"; send: () => Promise<void> }
  const out: Out[] = []
  if (provider === "klaviyo") {
    klaviyoEventsFor(order, event, { backfill: opts.backfill, now: nowIso, checkoutUrl: opts.checkoutUrl }).forEach((e, i) =>
      out.push({ itemKey: `e:${event}:${ref}:${i}`, state: i === 0 ? "sent" : "line", send: () => klaviyoTrack(key, row.creator_id, e) }),
    )
  } else {
    omnisendEventsFor(order, event, { creatorId: row.creator_id, now: nowIso }).forEach((e, i) => out.push({ itemKey: `e:${event}:${ref}:${i}`, state: i === 0 ? "sent" : "line", send: () => omnisendTrack(key, row.creator_id, e) }))
  }
  if (!out.length) return 0
  const done = await itemsIn(db, row.creator_id, provider, out.map((o) => o.itemKey))
  let sent = 0
  for (const o of out) {
    if (done.has(o.itemKey)) continue
    await o.send()
    await writeItems(db, row.creator_id, provider, [{ key: o.itemKey, state: o.state }], opts.now)
    sent++
  }
  return sent
}

async function physicalOrder(db: Db, creatorId: string, checkoutId: string, deps: MarketingDeps): Promise<{ order: MarketingOrder; co: Record<string, any> } | null> { // eslint-disable-line @typescript-eslint/no-explicit-any
  if (!UUID.test(checkoutId)) return null
  const { data: co } = await db.from("commerce_checkouts").select("id, creator_id, receipt_token, cancel_reason, email_opt_in, buyer_email, status").eq("id", checkoutId).eq("creator_id", creatorId).maybeSingle()
  if (!co) return null
  const loaded = await deps.loadOrder(db, { creatorId, checkoutId })
  if (!loaded) return null
  const url = co.receipt_token ? await deps.orderUrl(db, { creator_id: creatorId, receipt_token: co.receipt_token }).catch(() => null) : null
  const order = fromPhysicalOrder(loaded, { orderUrl: url, cancelReason: co.cancel_reason ?? null })
  return order ? { order, co } : null
}

/** Is this address someone who left? Then no Started Checkout, whatever the box said. */
async function unsubscribedHere(db: Db, creatorId: string, email: string): Promise<boolean> {
  const { data } = await db.from("subscribers").select("status, is_active").eq("creator_id", creatorId).eq("email", email).maybeSingle()
  return !!data && contactPush({ id: "", email, status: data.status, is_active: data.is_active }) === "unsubscribed"
}

async function sendOrderEvent(db: Db, row: Row, key: string, checkoutId: string, event: MarketingEvent, deps: MarketingDeps): Promise<void> {
  const found = await physicalOrder(db, row.creator_id, checkoutId, deps)
  if (!found) return
  const { order, co } = found
  const now = deps.now()
  if (event === "started") {
    /* Only a checkout whose "Email me news and offers" box was ticked, and never for someone who unsubscribed. Klaviyo only: Omnisend has no order event for it. */
    if (row.provider !== "klaviyo" || co.email_opt_in !== true) return
    if (await unsubscribedHere(db, row.creator_id, order.email)) return
  } else if (event === "placed") {
    if (!["paid", "partially_refunded", "refunded"].includes(order.paymentStatus)) return
  } else if (event === "fulfilled") {
    /* A first parcel of three is not the order fulfilled: sent when everything has gone. */
    if (order.fulfillmentStatus !== "fulfilled" && order.fulfillmentStatus !== "delivered") return
  } else if (event === "refunded") {
    if (order.refundedCents <= 0) return
  } else if (event === "cancelled") {
    if (!order.cancelledAt && order.paymentStatus !== "cancelled") return
  }
  /* An event about an order that was never sent (placed before connecting, without a backfill) goes with its Placed Order first, so the provider has the order it is about. */
  if (event !== "placed" && event !== "started") {
    const placedKey = `e:placed:${order.id}:0`
    const had = await itemsIn(db, row.creator_id, row.provider, [placedKey])
    if (!had.has(placedKey)) await sendEvents(db, row, key, order, "placed", { backfill: Date.parse(order.paidAt ?? order.createdAt) < Date.parse(row.config?.connected_at ?? "") , now })
  }
  await sendEvents(db, row, key, order, event, { backfill: false, now })
  await markSynced(db, row, now)
}

/* ── the sync: unsubscribes in, subscribers and missed orders out ─────── */

type Cursor = { at: string; id: string }

/** Rows after a cursor, oldest first: those at the cursor's time with a larger id, then those after it. */
async function pageAfter(db: Db, table: string, cols: string, col: string, cursor: Cursor, limit: number, where: (q: any) => any): Promise<Record<string, any>[]> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const out: Record<string, any>[] = [] // eslint-disable-line @typescript-eslint/no-explicit-any
  if (cursor.id) {
    const { data, error } = await where(db.from(table).select(cols).eq(col, cursor.at).gt("id", cursor.id)).order("id", { ascending: true }).limit(limit)
    if (error) throw new Error(`${table} could not be read (${error.code ?? "error"}).`)
    out.push(...(data ?? []))
  }
  if (out.length < limit) {
    const { data, error } = await where(db.from(table).select(cols).gt(col, cursor.at)).order(col, { ascending: true }).order("id", { ascending: true }).limit(limit - out.length)
    if (error) throw new Error(`${table} could not be read (${error.code ?? "error"}).`)
    out.push(...(data ?? []))
  }
  return out
}

async function runSync(db: Db, row: Row, key: string, deps: MarketingDeps): Promise<void> {
  const now = deps.now()
  let more = false
  const pulled = await pullUnsubscribes(db, row, key, now)
  more = more || pulled.more
  /* Nothing goes on a list until the unsubscribes already there have been read. */
  if (row.config?.pull?.initial_done) {
    const pushed = await pushSubscribers(db, row, key, now)
    more = more || pushed.more
  } else more = true
  const orders = await pushOrders(db, row, key, deps, now)
  more = more || orders.more
  const patch: Record<string, unknown> = {}
  if (!more && row.config?.backfill === true && !row.config?.backfill_done_at) patch.backfill_done_at = new Date(now).toISOString()
  await saveConfig(db, row, patch, { last_sync_at: new Date(now).toISOString(), last_error: null })
  /* More than one run's worth (a backfill, a big import): the next batch straight after. */
  if (more) await queueSync(db, row.creator_id, row.provider, now, `more${Math.floor(now / 1000)}`)
}

async function pullUnsubscribes(db: Db, row: Row, key: string, now: number): Promise<{ more: boolean }> {
  const p = { since: null as string | null, list_since: null as string | null, after: null as string | null, initial_done: false, ...(row.config?.pull ?? {}) }
  let people: PulledAddress[] = []
  let more = false
  if (row.provider === "klaviyo") {
    /* The first look reads the whole account's unsubscribes, so it reads more a run. */
    const pages = p.initial_done ? 5 : 20
    const g = await klaviyoPull(key, row.creator_id, p.since ?? EPOCH, null, pages)
    people.push(...g.people)
    if (g.latest) p.since = g.latest
    else if (!g.more && !p.since) p.since = new Date(now - 60_000).toISOString()
    more = more || g.more
    const listId = typeof row.config?.list_id === "string" ? row.config.list_id : null
    if (listId) {
      const l = await klaviyoPull(key, row.creator_id, p.list_since ?? EPOCH, listId, pages)
      people.push(...l.people)
      if (l.latest) p.list_since = l.latest
      else if (!l.more && !p.list_since) p.list_since = new Date(now - 60_000).toISOString()
      more = more || l.more
    }
    if (!more) p.initial_done = true
  } else {
    const o = await omnisendPull(key, row.creator_id, { since: p.initial_done ? p.since : null, after: p.after }, p.initial_done ? 4 : 10)
    people = o.people
    if (!p.initial_done) {
      p.after = o.after
      if (!o.after) {
        p.initial_done = true
        p.since = new Date(Date.parse(row.config?.connected_at ?? new Date(now).toISOString()) - 60_000).toISOString()
      } else more = true
    } else {
      /* Oldest first from `since`, which moves to the newest seen: the next run carries on from there. */
      p.after = null
      if (o.latest) p.since = o.latest
      more = !!o.after
    }
  }
  if (people.length) await applyPulled(db, row, people, now)
  await saveConfig(db, row, { pull: p })
  return { more }
}

/** A provider's unsubscribes, on Storelib: the subscriber is unsubscribed (or bounced, or complained), and written down so it is not sent back. */
async function applyPulled(db: Db, row: Row, people: PulledAddress[], now: number): Promise<void> {
  const byEmail = new Map<string, PulledAddress>()
  for (const p of people) byEmail.set(p.email, p)
  const emails = [...byEmail.keys()]
  const items: { key: string; state: string }[] = []
  for (let i = 0; i < emails.length; i += 200) {
    const { data } = await db.from("subscribers").select("id, email, status, is_active, subscribed_at, consent_timestamp").eq("creator_id", row.creator_id).in("email", emails.slice(i, i + 200))
    for (const s of (data ?? []) as SubscriberRow[]) {
      const said = byEmail.get(String(s.email).toLowerCase())
      if (!said || !pullApplies(s, said.at)) continue
      const status = pulledStatus(said.reason)
      const { error } = await db
        .from("subscribers")
        .update({ status, is_active: false, unsubscribed_at: new Date(now).toISOString() })
        .eq("id", s.id)
        .eq("status", "subscribed")
      if (error) continue
      items.push({ key: contactKey(String(s.email)), state: "unsubscribed" }, { key: pulledKey(String(s.email)), state: "pulled" })
    }
  }
  if (items.length) await writeItems(db, row.creator_id, row.provider, items, now)
}

interface Planned {
  row: SubscriberRow
  email: string
  plan: Exclude<ContactPush, "skip">
}

/**
 * Sends a group, and when the provider refuses the whole of it for one bad
 * address (a 400), each one alone, so one typo never holds the rest back.
 * A refused key or permission (401, 403) stops it all: nothing else would
 * go either.
 */
async function sendGroup(list: Planned[], send: (g: Planned[]) => Promise<void>): Promise<{ sent: Planned[]; refused: string | null }> {
  if (!list.length) return { sent: [], refused: null }
  try {
    await send(list)
    return { sent: list, refused: null }
  } catch (e) {
    if (!(e instanceof ProviderError) || e.retry || e.status === 401 || e.status === 403 || list.length === 1) {
      if (e instanceof ProviderError && !e.retry && e.status !== 401 && e.status !== 403) return { sent: [], refused: e.message }
      throw e
    }
    const sent: Planned[] = []
    let refused: string | null = null
    for (const one of list.slice(0, 100)) {
      try {
        await send([one])
        sent.push(one)
      } catch (err) {
        if (!(err instanceof ProviderError) || err.retry || err.status === 401 || err.status === 403) throw err
        refused = err.message
      }
    }
    return { sent, refused }
  }
}

async function pushSubscribers(db: Db, row: Row, key: string, now: number): Promise<{ more: boolean }> {
  const cursor: Cursor = row.config?.subs_cursor ?? { at: new Date(now).toISOString(), id: "" }
  const rows = (await pageAfter(db, "subscribers", "id, email, name, status, is_active, subscribed_at, consent_timestamp, unsubscribed_at, updated_at", "updated_at", cursor, SUBSCRIBERS_PER_RUN, (q) => q.eq("creator_id", row.creator_id))) as SubscriberRow[]
  if (!rows.length) return { more: false }
  const planned: Planned[] = []
  for (const r of rows) {
    const plan = contactPush(r)
    if (plan !== "skip") planned.push({ row: r, email: String(r.email).trim().toLowerCase(), plan })
  }
  const had = await itemsIn(db, row.creator_id, row.provider, planned.map((p) => contactKey(p.email)))
  /* Already there as it is now: nothing to send. */
  const todo = planned.filter((p) => had.get(contactKey(p.email)) !== p.plan)
  const connectedAt = Date.parse(row.config?.connected_at ?? "") || now
  const subscribe = todo.filter((p) => p.plan === "subscribed")
  const leave = todo.filter((p) => p.plan === "unsubscribed")
  const customers = todo.filter((p) => p.plan === "customer")
  const results: { sent: Planned[]; refused: string | null }[] = []
  if (row.provider === "klaviyo") {
    const listId = String(row.config?.list_id ?? "")
    if (!listId) throw new ProviderError("Choose the Klaviyo list your subscribers go to.", 400, false)
    const past = subscribe.filter((p) => row.config?.backfill === true && Date.parse(p.row.subscribed_at ?? "") < connectedAt)
    const fresh = subscribe.filter((p) => !past.includes(p))
    results.push(await sendGroup(past, (g) => klaviyoSubscribe(key, row.creator_id, listId, g.map((p) => ({ email: p.email, consentedAt: consentedAt(p.row, now) })), true)))
    results.push(await sendGroup(fresh, (g) => klaviyoSubscribe(key, row.creator_id, listId, g.map((p) => ({ email: p.email, consentedAt: null })), false)))
    results.push(await sendGroup(leave, (g) => klaviyoUnsubscribe(key, row.creator_id, g.map((p) => p.email))))
    results.push(await sendGroup(customers, (g) => klaviyoImportProfiles(key, row.creator_id, g.map((p) => ({ email: p.email, ...splitName(p.row.name) })))))
  } else {
    const person = (p: Planned): OmnisendPerson => ({
      email: p.email,
      ...splitName(p.row.name),
      status: p.plan === "subscribed" ? "subscribed" : p.plan === "unsubscribed" ? "unsubscribed" : null,
      statusDate: p.plan === "subscribed" ? consentedAt(p.row, now) : p.plan === "unsubscribed" ? new Date(Date.parse(p.row.unsubscribed_at ?? "") || now).toISOString() : null,
    })
    for (const group of [subscribe, leave, customers]) results.push(await sendGroup(group, (g) => omnisendUpsertContacts(key, row.creator_id, g.map(person))))
  }
  const sent = results.flatMap((r) => r.sent)
  if (sent.length) await writeItems(db, row.creator_id, row.provider, sent.map((p) => ({ key: contactKey(p.email), state: p.plan })), now)
  const refused = results.map((r) => r.refused).find(Boolean)
  const last = rows[rows.length - 1]
  await saveConfig(db, row, { subs_cursor: { at: last.updated_at, id: last.id } })
  if (refused) await noteError(db, row, `Some addresses were refused: ${refused}`)
  return { more: rows.length >= SUBSCRIBERS_PER_RUN }
}

function splitName(name: string | null | undefined): { firstName: string | null; lastName: string | null } {
  const n = nameParts(name)
  return { firstName: n.first, lastName: n.last }
}

/**
 * Sales the events missed: a download bought on its own (it has no order
 * timeline), and, for a backfill, the last 90 days of both kinds. Each goes
 * as Placed Order; a past one already cancelled, refunded or fulfilled says
 * so too. The record makes an order the live path sent nothing here.
 */
async function pushOrders(db: Db, row: Row, key: string, deps: MarketingDeps, now: number): Promise<{ more: boolean }> {
  const connectedAt = Date.parse(row.config?.connected_at ?? "") || now
  let more = false
  /* Physical orders: only those paid before connecting are missing (a backfill); after it, each one came through its own event. */
  const pc: Cursor = row.config?.physical_cursor ?? { at: new Date(now).toISOString(), id: "" }
  if (Date.parse(pc.at) < connectedAt) {
    const cos = await pageAfter(db, "commerce_checkouts", "id, paid_at", "paid_at", pc, ORDERS_PER_RUN, (q) => q.eq("creator_id", row.creator_id).in("status", ["paid", "partially_refunded", "refunded"]))
    for (const co of cos) {
      if (Date.parse(co.paid_at) >= connectedAt) break
      const found = await physicalOrder(db, row.creator_id, co.id, deps)
      if (found) await sendPast(db, row, key, found.order, now, connectedAt)
      pc.at = co.paid_at
      pc.id = co.id
    }
    const reachedNow = cos.length < ORDERS_PER_RUN || cos.some((c) => Date.parse(c.paid_at) >= connectedAt)
    if (reachedNow) pc.at = new Date(connectedAt).toISOString()
    more = more || !reachedNow
    await saveConfig(db, row, { physical_cursor: pc })
  }
  /* Downloads, courses, memberships: every sale since the cursor, whenever. */
  const dc: Cursor = row.config?.digital_cursor ?? { at: new Date(now).toISOString(), id: "" }
  const orders = await pageAfter(db, "orders", "id, product_id, variant_id, variant_name, buyer_email, buyer_first_name, buyer_last_name, amount_cents, refund_amount_cents, refund_reason, currency, status, created_at", "created_at", dc, ORDERS_PER_RUN, (q) =>
    q.eq("creator_id", row.creator_id).is("checkout_id", null).in("status", ["completed", "refunded"]),
  )
  if (orders.length) {
    const ids = [...new Set(orders.map((o) => o.product_id).filter(Boolean))]
    const { data: products } = ids.length ? await db.from("products").select("id, title, thumbnail_url").in("id", ids) : { data: [] }
    const byId = new Map(((products ?? []) as { id: string; title: string | null; thumbnail_url: string | null }[]).map((p) => [p.id, p]))
    for (const o of orders) {
      const p = byId.get(o.product_id)
      const order = fromDigitalOrder(o, p ? { title: p.title, image_url: p.thumbnail_url } : null, { productUrl: null })
      if (order) await sendPast(db, row, key, order, now, connectedAt)
      dc.at = o.created_at
      dc.id = o.id
    }
    await saveConfig(db, row, { digital_cursor: dc })
    more = more || orders.length >= ORDERS_PER_RUN
  }
  return { more }
}

async function sendPast(db: Db, row: Row, key: string, order: MarketingOrder, now: number, connectedAt: number): Promise<void> {
  const past = Date.parse(order.paidAt ?? order.createdAt) < connectedAt
  await sendEvents(db, row, key, order, "placed", { backfill: past, now })
  if (!past) return
  /* What already happened to a past order, so the provider's record of it is whole. */
  if (order.fulfillmentStatus === "fulfilled" || order.fulfillmentStatus === "delivered") await sendEvents(db, row, key, order, "fulfilled", { backfill: true, now })
  if (order.cancelledAt) await sendEvents(db, row, key, order, "cancelled", { backfill: true, now })
  if (order.refundedCents > 0) await sendEvents(db, row, key, order, "refunded", { backfill: true, now })
}
