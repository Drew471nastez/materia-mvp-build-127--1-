/**
 * ===========================================================================
 *  OMNISEND, BY ITS PUBLIC API (version 2026-03-15)
 * ===========================================================================
 * The store's API key (Omnisend › Store settings › API keys), sent as
 * `Authorization: Omnisend-API-Key <key>` with the `Omnisend-Version`
 * header every call needs (api-docs.omnisend.com/reference/authentication).
 *
 *   GET  /api/brands/current   the key works, and whose brand (brands.read)
 *   POST /api/contacts         one contact, created or updated by email (contacts.write)
 *   POST /api/batches          up to 100 contacts in one request ("endpoint": "contacts")
 *   POST /api/events           one order event (events.write)
 *   GET  /api/contacts         who unsubscribed: by status, then by updatedAtFrom (contacts.read)
 *
 * Every endpoint shares 400 requests a minute per brand; ./http.ts paces
 * calls under that.
 */

import { EMAIL_RE, ProviderError, marketingCall } from "./http"
import type { OmnisendEventBody } from "./orders"
import type { PulledAddress } from "./klaviyo"

export const OMNISEND_API = "https://api.omnisend.com/api"
export const OMNISEND_VERSION = "2026-03-15"
export const OMNISEND_SCOPES = ["brands.read", "contacts.read", "contacts.write", "events.write"]

const NAME = "Omnisend"

function headers(key: string, write: boolean): Record<string, string> {
  return { Authorization: `Omnisend-API-Key ${key}`, "Omnisend-Version": OMNISEND_VERSION, accept: "application/json", ...(write ? { "content-type": "application/json" } : {}) }
}

export async function omnisendConnect(key: string, scope: string): Promise<{ account: string | null; accountId: string | null }> {
  const r: any = await marketingCall(NAME, `${OMNISEND_API}/brands/current`, { headers: headers(key, false), limit: { key: scope, name: "omnisend" } }) // eslint-disable-line @typescript-eslint/no-explicit-any
  if (!r || typeof r !== "object" || !r.brandID) throw new ProviderError("Omnisend did not say which brand the key belongs to.", 400, false)
  return { account: (r.name || r.website || null) as string | null, accountId: String(r.brandID) }
}

export interface OmnisendPerson {
  email: string
  firstName: string | null
  lastName: string | null
  /** subscribed and unsubscribed set the email channel; null (a customer) leaves it as Omnisend has it. */
  status: "subscribed" | "unsubscribed" | null
  statusDate: string | null
}

/** One contact, as POST /api/contacts and each item of a contacts batch take it. */
export function omnisendContact(p: OmnisendPerson): Record<string, unknown> {
  const identifier: Record<string, unknown> = { type: "email", id: p.email }
  if (p.status) identifier.channels = { email: { status: p.status, ...(p.statusDate ? { statusDate: p.statusDate } : {}) } }
  const c: Record<string, unknown> = { identifiers: [identifier] }
  if (p.firstName) c.firstName = p.firstName
  if (p.lastName) c.lastName = p.lastName
  if (p.status === null) c.tags = ["storelib customer"]
  return c
}

export function omnisendBatchBody(people: OmnisendPerson[]): Record<string, unknown> {
  return { method: "POST", endpoint: "contacts", items: people.map(omnisendContact) }
}

export async function omnisendUpsertContacts(key: string, scope: string, people: OmnisendPerson[]): Promise<void> {
  if (people.length === 1) {
    await marketingCall(NAME, `${OMNISEND_API}/contacts`, { method: "POST", headers: headers(key, true), body: omnisendContact(people[0]), limit: { key: scope, name: "omnisend" } })
    return
  }
  for (let i = 0; i < people.length; i += 100) {
    await marketingCall(NAME, `${OMNISEND_API}/batches`, { method: "POST", headers: headers(key, true), body: omnisendBatchBody(people.slice(i, i + 100)), limit: { key: scope, name: "omnisend" } })
  }
}

export async function omnisendTrack(key: string, scope: string, e: OmnisendEventBody): Promise<void> {
  await marketingCall(NAME, `${OMNISEND_API}/events`, { method: "POST", headers: headers(key, true), body: e, limit: { key: scope, name: "omnisend" } })
}

/**
 * Who unsubscribed in Omnisend. The first time, every contact whose status
 * is unsubscribed (page by page, `after` kept between runs); from then on,
 * every contact changed since the last look (updatedAtFrom, oldest first),
 * of which the unsubscribed ones count.
 */
export function omnisendPullUrl(p: { since: string | null; after: string | null }): string {
  const q = new URLSearchParams()
  q.set("limit", "250")
  if (p.since) {
    q.set("updatedAtFrom", new Date(p.since).toISOString())
    q.set("sort", "updatedAt")
    q.set("direction", "asc")
  } else q.set("status", "unsubscribed")
  if (p.after) q.set("after", p.after)
  return `${OMNISEND_API}/contacts?${q.toString()}`
}

export async function omnisendPull(key: string, scope: string, p: { since: string | null; after: string | null }, maxPages = 4): Promise<{ people: PulledAddress[]; latest: string | null; after: string | null }> {
  const people: PulledAddress[] = []
  let latest: string | null = null
  let after = p.after
  for (let page = 0; page < maxPages; page++) {
    const r: any = await marketingCall(NAME, omnisendPullUrl({ since: p.since, after }), { headers: headers(key, false), limit: { key: scope, name: "omnisend" } }) // eslint-disable-line @typescript-eslint/no-explicit-any
    for (const c of Array.isArray(r?.contacts) ? r.contacts : []) {
      if (c?.updatedAt && (!latest || Date.parse(c.updatedAt) > Date.parse(latest))) latest = c.updatedAt
      const email = String(c?.email ?? "").trim().toLowerCase()
      if (c?.status !== "unsubscribed" || !EMAIL_RE.test(email)) continue
      const changed = (Array.isArray(c.statuses) ? c.statuses : []).find((s: any) => s?.channel === "email")?.statusChangedAt ?? null // eslint-disable-line @typescript-eslint/no-explicit-any
      people.push({ email, reason: "UNSUBSCRIBE", at: changed })
    }
    const next = r?.paging?.hasMore ? r?.paging?.cursors?.after : null
    after = typeof next === "string" && next ? next : null
    if (!after) break
  }
  return { people, latest, after }
}
