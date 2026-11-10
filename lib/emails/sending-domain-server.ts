import "server-only"

/**
 * ===========================================================================
 *  THE SELLER'S OWN SENDING DOMAIN, WITH MAILGUN
 * ===========================================================================
 * Adding, checking and removing a store's own domain on Storelib's Mailgun
 * account (the Domains API, v4), kept in email_sending_domains, and the
 * one read every sender asks: `verifiedSender`, the store's own address
 * when its domain is verified, else null and the email goes as Storelib's.
 *
 *   POST   /v4/domains                 the domain added; its SPF, DKIM and tracking records come back
 *   PUT    /v4/domains/{name}/verify   Mailgun looks the records up again; "active" is verified
 *   DELETE /v3/domains/{name}          removed from Storelib's account
 *
 * Storelib's own key (MAILGUN_API_KEY), never the seller's: the seller
 * gives DNS records, not credentials. A domain is one store's: a second
 * store asking for it is refused (unique on the domain), and a domain that
 * is already on the Mailgun account but not this store's is never taken.
 * DMARC is read from DNS here, since Mailgun does not check it. `fetch`
 * and the DNS lookup are the global ones and a parameter, so a test
 * stubs both and nothing real is called.
 */

import { resolveTxt } from "node:dns/promises"
import { dmarcRecord, domainProblem, fromLocalProblem, hasDmarc, ownFrom, recordsFromMailgun, sendingAddress, type SendingDomainStatus, type SendingDomainView, type SendingRecord } from "./sending-domain"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export type TxtLookup = (name: string) => Promise<string[][]>
const realTxt: TxtLookup = (name) => resolveTxt(name)

const TIMEOUT_MS = 15_000

function mailgunEnv() {
  return {
    key: process.env.MAILGUN_API_KEY || "",
    base: (process.env.MAILGUN_BASE_URL || "https://api.eu.mailgun.net").replace(/\/$/, ""),
    own: (process.env.MAILGUN_DOMAIN || "storelib.com").toLowerCase(),
  }
}

type Answer = { ok: boolean; status: number; body: Record<string, unknown> | null }

async function mailgun(method: "GET" | "POST" | "PUT" | "DELETE", path: string, form?: Record<string, string>): Promise<Answer> {
  const env = mailgunEnv()
  if (!env.key) return { ok: false, status: 0, body: { message: "Email sending is not set up on this server." } }
  let res: Response
  try {
    res = await fetch(`${env.base}${path}`, {
      method,
      headers: { Authorization: `Basic ${Buffer.from(`api:${env.key}`).toString("base64")}` },
      body: form ? new URLSearchParams(form) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    })
  } catch {
    return { ok: false, status: 0, body: null }
  }
  const text = await res.text().catch(() => "")
  let body: Record<string, unknown> | null = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = null
  }
  return { ok: res.ok, status: res.status, body }
}

function said(a: Answer): string {
  const m = typeof a.body?.message === "string" ? a.body.message : ""
  if (a.status === 0) return "The email provider could not be reached. Try again in a moment."
  if (a.status === 429 || a.status >= 500) return "The email provider is busy. Try again in a moment."
  return m && m.length < 200 ? m : `The email provider answered ${a.status}.`
}

/* ── the row ──────────────────────────────────────────────────────────── */

interface Row {
  id: string
  creator_id: string
  domain: string
  from_local: string
  status: SendingDomainStatus
  records: SendingRecord[] | null
  last_checked_at: string | null
  verified_at: string | null
  last_error: string | null
}
const COLS = "id, creator_id, domain, from_local, status, records, last_checked_at, verified_at, last_error"

function viewOf(r: Row): SendingDomainView {
  return {
    domain: r.domain,
    fromLocal: r.from_local,
    fromAddress: sendingAddress(r.from_local, r.domain),
    status: r.status,
    records: Array.isArray(r.records) ? r.records : [],
    lastCheckedAt: r.last_checked_at,
    verifiedAt: r.verified_at,
    lastError: r.last_error,
  }
}

export interface SendingDomainAnswer {
  domain: SendingDomainView | null
  /** The database part has run. */
  ready: boolean
  /** Mailgun is configured on this server. */
  available: boolean
}

export async function loadSendingDomain(db: Db, creatorId: string): Promise<SendingDomainAnswer> {
  const { data, error } = await db.from("email_sending_domains").select(COLS).eq("creator_id", creatorId).maybeSingle()
  return { domain: data ? viewOf(data as Row) : null, ready: !error, available: !!mailgunEnv().key }
}

/* ── the cache every sender reads ─────────────────────────────────────── */

const cache = new Map<string, { at: number; value: { address: string; domain: string } | null }>()
const CACHE_MS = 60_000

export function forgetSender(creatorId: string): void {
  cache.delete(creatorId)
}

/**
 * The store's own From address, when its domain is verified; null
 * otherwise (no domain, not verified yet, the table not there). Read by
 * campaigns, automations and the emails buyers get, kept a minute.
 */
export async function verifiedSender(db: Db, creatorId: string | null | undefined, now: number = Date.now()): Promise<{ address: string; domain: string } | null> {
  if (!creatorId) return null
  const hit = cache.get(creatorId)
  if (hit && now - hit.at < CACHE_MS) return hit.value
  let value: { address: string; domain: string } | null = null
  try {
    const { data } = await db.from("email_sending_domains").select("domain, from_local, status").eq("creator_id", creatorId).maybeSingle()
    if (data && data.status === "verified" && data.domain && data.from_local) value = { address: sendingAddress(data.from_local, data.domain), domain: data.domain }
  } catch {
    value = null
  }
  cache.set(creatorId, { at: now, value })
  if (cache.size > 5000) cache.clear()
  return value
}

/* ── add, check, change, remove ───────────────────────────────────────── */

type Result = { ok: true; view: SendingDomainAnswer } | { ok: false; error: string; status?: number }

async function checkDmarc(records: SendingRecord[], domain: string, txt: TxtLookup): Promise<SendingRecord[]> {
  let found: boolean | null = null
  try {
    found = hasDmarc(await txt(`_dmarc.${domain}`))
  } catch (e) {
    /* No such name is a DMARC record missing; any other failure is not knowing. */
    found = (e as { code?: string })?.code === "ENOTFOUND" || (e as { code?: string })?.code === "ENODATA" ? false : null
  }
  return [...records.filter((r) => r.kind !== "dmarc"), dmarcRecord(domain, found)]
}

export async function addSendingDomain(db: Db, creatorId: string, body: { domain?: unknown; fromLocal?: unknown }, opts: { txt?: TxtLookup; now?: number } = {}): Promise<Result> {
  const env = mailgunEnv()
  if (!env.key) return { ok: false, error: "Email sending is not set up on this server.", status: 503 }
  const d = domainProblem(body.domain, [env.own])
  if ("error" in d) return { ok: false, error: d.error }
  const l = fromLocalProblem(body.fromLocal)
  if ("error" in l) return { ok: false, error: l.error }
  const had = (await db.from("email_sending_domains").select(COLS).eq("creator_id", creatorId).maybeSingle()).data as Row | null
  if (had && had.domain !== d.domain) return { ok: false, error: "Remove your current domain first." }
  const taken = (await db.from("email_sending_domains").select("creator_id").eq("domain", d.domain).maybeSingle()).data as { creator_id: string } | null
  if (taken && taken.creator_id !== creatorId) return { ok: false, error: "That domain is already used by another Storelib store." }

  let answer = await mailgun("POST", "/v4/domains", { name: d.domain, spam_action: "disabled", web_scheme: "https", dkim_key_size: "2048" })
  if (!answer.ok && answer.status === 400 && /already exists/i.test(String(answer.body?.message ?? ""))) {
    /* On Storelib's account already: only this store's own (a second Add), never someone else's. */
    if (!had) return { ok: false, error: "That domain can't be added. If it is yours, write to support." }
    answer = await mailgun("GET", `/v4/domains/${encodeURIComponent(d.domain)}`)
  }
  if (!answer.ok) return { ok: false, error: said(answer), status: answer.status >= 500 || answer.status === 0 ? 502 : 400 }
  const now = new Date(opts.now ?? Date.now()).toISOString()
  const records = await checkDmarc(recordsFromMailgun(answer.body), d.domain, opts.txt ?? realTxt)
  const active = String((answer.body?.domain as Record<string, unknown> | undefined)?.state ?? "") === "active"
  const row = { creator_id: creatorId, domain: d.domain, from_local: l.local, provider: "mailgun", status: active ? "verified" : "pending", records, last_checked_at: now, verified_at: active ? now : null, last_error: null, updated_at: now }
  const { error } = await db.from("email_sending_domains").upsert(row, { onConflict: "creator_id" })
  if (error) {
    if (!had) await mailgun("DELETE", `/v3/domains/${encodeURIComponent(d.domain)}`)
    return { ok: false, error: error.code === "23505" ? "That domain is already used by another Storelib store." : error.code === "42P01" ? "Your own sending domain needs its database update first." : "The domain could not be saved.", status: error.code === "42P01" ? 503 : 400 }
  }
  forgetSender(creatorId)
  return { ok: true, view: await loadSendingDomain(db, creatorId) }
}

export async function verifySendingDomain(db: Db, creatorId: string, opts: { txt?: TxtLookup; now?: number } = {}): Promise<Result> {
  const { data } = await db.from("email_sending_domains").select(COLS).eq("creator_id", creatorId).maybeSingle()
  const row = data as Row | null
  if (!row) return { ok: false, error: "Add a domain first.", status: 404 }
  const answer = await mailgun("PUT", `/v4/domains/${encodeURIComponent(row.domain)}/verify`)
  const now = new Date(opts.now ?? Date.now()).toISOString()
  if (!answer.ok) {
    await db.from("email_sending_domains").update({ last_checked_at: now, last_error: said(answer).slice(0, 300), updated_at: now }).eq("id", row.id)
    return { ok: false, error: said(answer), status: answer.status === 404 ? 404 : 502 }
  }
  const records = await checkDmarc(recordsFromMailgun(answer.body), row.domain, opts.txt ?? realTxt)
  const active = String((answer.body?.domain as Record<string, unknown> | undefined)?.state ?? "") === "active"
  /* A verified domain whose records were taken away is not verified any more: mail goes as Storelib's again until they are back. */
  const status: SendingDomainStatus = active ? "verified" : row.status === "verified" || row.status === "failed" ? "failed" : "pending"
  const missing = records.filter((r) => r.kind !== "dmarc" && r.kind !== "tracking" && r.valid !== true).map((r) => r.kind.toUpperCase())
  await db
    .from("email_sending_domains")
    .update({ status, records, last_checked_at: now, verified_at: active ? (row.verified_at ?? now) : row.verified_at, last_error: active ? null : missing.length ? `Not found yet: ${missing.join(", ")}. DNS changes can take up to a day.` : null, updated_at: now })
    .eq("id", row.id)
  forgetSender(creatorId)
  return { ok: true, view: await loadSendingDomain(db, creatorId) }
}

export async function setSendingFrom(db: Db, creatorId: string, fromLocal: unknown): Promise<Result> {
  const l = fromLocalProblem(fromLocal)
  if ("error" in l) return { ok: false, error: l.error }
  const { data } = await db.from("email_sending_domains").select("id").eq("creator_id", creatorId).maybeSingle()
  if (!data) return { ok: false, error: "Add a domain first.", status: 404 }
  await db.from("email_sending_domains").update({ from_local: l.local, updated_at: new Date().toISOString() }).eq("id", data.id)
  forgetSender(creatorId)
  return { ok: true, view: await loadSendingDomain(db, creatorId) }
}

export async function removeSendingDomain(db: Db, creatorId: string): Promise<Result> {
  const { data } = await db.from("email_sending_domains").select("id, domain").eq("creator_id", creatorId).maybeSingle()
  if (data) {
    /* Off Storelib's account first; a domain Mailgun no longer has is a 404, which is what was wanted. */
    await mailgun("DELETE", `/v3/domains/${encodeURIComponent(data.domain)}`)
    await db.from("email_sending_domains").delete().eq("id", data.id)
  }
  forgetSender(creatorId)
  return { ok: true, view: await loadSendingDomain(db, creatorId) }
}

/* ── checked again without a press ────────────────────────────────────── */

/** How long after a check a domain is due another, by where it stands. */
export function recheckDue(row: { status: SendingDomainStatus; last_checked_at: string | null; created_at?: string | null }, now: number): boolean {
  const last = row.last_checked_at ? Date.parse(row.last_checked_at) : 0
  const age = row.created_at ? now - Date.parse(row.created_at) : 0
  if (row.status === "verified") return now - last >= 24 * 3600_000
  /* Waiting for DNS: every ten minutes for two days (records usually land within hours), then every six hours for a month, then left for the owner's Check DNS. */
  if (age > 30 * 86400_000) return false
  return now - last >= (age <= 2 * 86400_000 ? 10 * 60_000 : 6 * 3600_000)
}

/**
 * THE CRON'S LOOK (app/api/cron/physical, every ten minutes). A seller who
 * puts the records in and closes the page should not have to come back and
 * press Check DNS for their mail to start coming from their domain: a
 * domain waiting for DNS is asked about again on its own, and a verified one
 * once a day, so records taken away send mail back to Storelib's address
 * (status failed) instead of failing DMARC. A few a run; never throws.
 */
export async function recheckSendingDomains(db: Db, opts: { now?: number; limit?: number; txt?: TxtLookup } = {}): Promise<number> {
  if (!mailgunEnv().key) return 0
  const now = opts.now ?? Date.now()
  const limit = opts.limit ?? 4
  let rows: (Row & { created_at?: string | null })[] = []
  try {
    const { data, error } = await db.from("email_sending_domains").select(`${COLS}, created_at`).order("last_checked_at", { ascending: true, nullsFirst: true }).limit(200)
    if (error) return 0
    rows = (data ?? []) as (Row & { created_at?: string | null })[]
  } catch {
    return 0
  }
  let n = 0
  for (const r of rows.filter((x) => recheckDue(x, now)).slice(0, limit)) {
    const done = await verifySendingDomain(db, r.creator_id, { now, txt: opts.txt }).catch(() => null)
    if (done) n++
  }
  return n
}

/** For a send site that has the store and its name: the From and domain to send with, or null for Storelib's. */
export async function ownSendingFor(db: Db, creatorId: string | null | undefined, name: string): Promise<{ from: string; sendingDomain: string } | null> {
  const own = await verifiedSender(db, creatorId)
  return own ? { from: ownFrom(name, own.address), sendingDomain: own.domain } : null
}
