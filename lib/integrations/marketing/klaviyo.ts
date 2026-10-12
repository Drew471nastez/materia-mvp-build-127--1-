/**
 * ===========================================================================
 *  KLAVIYO, BY ITS PUBLIC API (revision 2026-07-15)
 * ===========================================================================
 * The store's private API key (Klaviyo › Settings › API keys › Create
 * Private API Key), sent as `Authorization: Klaviyo-API-Key <key>` with the
 * `revision` header every call needs. What each call is, by Klaviyo's own
 * reference (developers.klaviyo.com/en/reference/...):
 *
 *   get_accounts                  GET  /api/accounts         the key works, and whose account
 *   get_lists                     GET  /api/lists            the lists to choose from
 *   bulk_subscribe_profiles       POST /api/profile-subscription-bulk-create-jobs   up to 1000, onto the list
 *   bulk_unsubscribe_profiles     POST /api/profile-subscription-bulk-delete-jobs   up to 100
 *   bulk_import_profiles          POST /api/profile-bulk-import-jobs                up to 10,000 customers, no consent
 *   create_event                  POST /api/events           one order event
 *   get_profiles                  GET  /api/profiles         who unsubscribed, by suppression time
 *
 * Scopes the key needs: accounts:read, lists:read, lists:write,
 * profiles:read, profiles:write, subscriptions:write, events:write.
 */

import { EMAIL_RE, ProviderError, marketingCall } from "./http"
import { klaviyoEventBody, type KlaviyoEventInput } from "./orders"

export const KLAVIYO_API = "https://a.klaviyo.com"
export const KLAVIYO_REVISION = "2026-07-15"
export const KLAVIYO_SCOPES = ["accounts:read", "lists:read", "lists:write", "profiles:read", "profiles:write", "subscriptions:write", "events:write"]

const NAME = "Klaviyo"

function headers(key: string, write: boolean): Record<string, string> {
  return {
    Authorization: `Klaviyo-API-Key ${key}`,
    revision: KLAVIYO_REVISION,
    accept: "application/vnd.api+json",
    ...(write ? { "content-type": "application/vnd.api+json" } : {}),
  }
}

/** A private key: "pk_" and its characters. A public site ID (six characters) is the onsite one, not this. */
export function looksLikeKlaviyoKey(key: string): boolean {
  return /^pk_[A-Za-z0-9_]{20,120}$/.test(key.trim())
}

export interface KlaviyoList {
  id: string
  name: string
}

export async function klaviyoLists(key: string, scope: string): Promise<KlaviyoList[]> {
  const out: KlaviyoList[] = []
  let url: string | null = `${KLAVIYO_API}/api/lists?fields[list]=name`
  /* Ten a page (Klaviyo's limit); a hundred lists is more than any store chooses from. */
  for (let page = 0; url && page < 10; page++) {
    const r: any = await marketingCall(NAME, url, { headers: headers(key, false), limit: { key: scope, name: "klaviyo:read" } }) // eslint-disable-line @typescript-eslint/no-explicit-any
    for (const l of Array.isArray(r?.data) ? r.data : []) if (l?.id) out.push({ id: String(l.id), name: String(l.attributes?.name ?? l.id).slice(0, 120) })
    const next: unknown = r?.links?.next
    url = typeof next === "string" && next.startsWith(`${KLAVIYO_API}/api/lists`) ? next : null
  }
  return out
}

/** Reads only: the account the key belongs to, and its lists. Refuses a key Klaviyo refuses. */
export async function klaviyoConnect(key: string, scope: string): Promise<{ account: string | null; accountId: string | null; lists: KlaviyoList[] }> {
  const r: any = await marketingCall(NAME, `${KLAVIYO_API}/api/accounts`, { headers: headers(key, false), limit: { key: scope, name: "klaviyo:accounts" } }) // eslint-disable-line @typescript-eslint/no-explicit-any
  const acc = Array.isArray(r?.data) ? r.data[0] : null
  if (!acc) throw new ProviderError("Klaviyo did not say which account the key belongs to.", 400, false)
  const lists = await klaviyoLists(key, scope)
  return { account: acc.attributes?.contact_information?.organization_name ?? null, accountId: acc.id ? String(acc.id) : null, lists }
}

export interface ConsentedProfile {
  email: string
  /** When they said yes, for a past subscriber sent on connect (historical_import). */
  consentedAt: string | null
}

/** bulk_subscribe_profiles: onto the store's list, marketing consent SUBSCRIBED. Past subscribers go as a historical import with their consent time, so they get no double opt-in and no welcome flow. */
export function klaviyoSubscribeBody(listId: string, profiles: ConsentedProfile[], historical: boolean): Record<string, unknown> {
  return {
    data: {
      type: "profile-subscription-bulk-create-job",
      attributes: {
        custom_source: "Storelib",
        profiles: {
          data: profiles.map((p) => ({
            type: "profile",
            attributes: { email: p.email, subscriptions: { email: { marketing: historical && p.consentedAt ? { consent: "SUBSCRIBED", consented_at: p.consentedAt } : { consent: "SUBSCRIBED" } } } },
          })),
        },
        ...(historical ? { historical_import: true } : {}),
      },
      relationships: { list: { data: { type: "list", id: listId } } },
    },
  }
}

export async function klaviyoSubscribe(key: string, scope: string, listId: string, profiles: ConsentedProfile[], historical: boolean): Promise<void> {
  for (let i = 0; i < profiles.length; i += 1000) {
    const chunk = profiles.slice(i, i + 1000)
    const hist = historical && chunk.every((p) => !!p.consentedAt)
    await marketingCall(NAME, `${KLAVIYO_API}/api/profile-subscription-bulk-create-jobs`, { method: "POST", headers: headers(key, true), body: klaviyoSubscribeBody(listId, chunk, hist), limit: { key: scope, name: "klaviyo:subscriptions" } })
  }
}

/**
 * bulk_unsubscribe_profiles, with no list: unsubscribed from the account's
 * email marketing, as Storelib's unsubscribe means "no more marketing from
 * this store". Klaviyo keeps them as a suppression.
 */
export function klaviyoUnsubscribeBody(emails: string[]): Record<string, unknown> {
  return {
    data: {
      type: "profile-subscription-bulk-delete-job",
      attributes: { profiles: { data: emails.map((email) => ({ type: "profile", attributes: { email, subscriptions: { email: { marketing: { consent: "UNSUBSCRIBED" } } } } })) } },
    },
  }
}

export async function klaviyoUnsubscribe(key: string, scope: string, emails: string[]): Promise<void> {
  for (let i = 0; i < emails.length; i += 100) {
    await marketingCall(NAME, `${KLAVIYO_API}/api/profile-subscription-bulk-delete-jobs`, { method: "POST", headers: headers(key, true), body: klaviyoUnsubscribeBody(emails.slice(i, i + 100)), limit: { key: scope, name: "klaviyo:subscriptions" } })
  }
}

/** bulk_import_profiles: customers as profiles, with no subscription (consent is never touched). */
export function klaviyoImportBody(people: { email: string; firstName: string | null; lastName: string | null }[]): Record<string, unknown> {
  return {
    data: {
      type: "profile-bulk-import-job",
      attributes: {
        profiles: {
          data: people.map((p) => ({ type: "profile", attributes: { email: p.email, ...(p.firstName ? { first_name: p.firstName } : {}), ...(p.lastName ? { last_name: p.lastName } : {}), properties: { storelib_customer: true } } })),
        },
      },
    },
  }
}

export async function klaviyoImportProfiles(key: string, scope: string, people: { email: string; firstName: string | null; lastName: string | null }[]): Promise<void> {
  for (let i = 0; i < people.length; i += 10_000) {
    await marketingCall(NAME, `${KLAVIYO_API}/api/profile-bulk-import-jobs`, { method: "POST", headers: headers(key, true), body: klaviyoImportBody(people.slice(i, i + 10_000)), limit: { key: scope, name: "klaviyo:import" } })
  }
}

export async function klaviyoTrack(key: string, scope: string, e: KlaviyoEventInput): Promise<void> {
  await marketingCall(NAME, `${KLAVIYO_API}/api/events`, { method: "POST", headers: headers(key, true), body: klaviyoEventBody(e), limit: { key: scope, name: "klaviyo:events" } })
}

export interface PulledAddress {
  email: string
  reason: string
  at: string | null
}

/**
 * Who was suppressed in Klaviyo since `since` (an unsubscribe, a spam
 * complaint, a bounce), oldest first: get_profiles filtered on the
 * suppression's time, with the subscriptions field. `list` also reads
 * people who left the store's list alone.
 */
export function klaviyoPullUrl(since: string, listId: string | null): string {
  const t = new Date(since).toISOString().replace(/\.\d{3}Z$/, "Z")
  const q = new URLSearchParams()
  q.set("additional-fields[profile]", "subscriptions")
  q.set("page[size]", "100")
  if (listId) {
    q.set("filter", `equals(subscriptions.email.marketing.list_suppressions.list_id,"${listId}"),greater-or-equal(subscriptions.email.marketing.list_suppressions.timestamp,${t})`)
    q.set("sort", "subscriptions.email.marketing.list_suppressions.timestamp")
  } else {
    q.set("filter", `greater-or-equal(subscriptions.email.marketing.suppression.timestamp,${t})`)
    q.set("sort", "subscriptions.email.marketing.suppression.timestamp")
  }
  return `${KLAVIYO_API}/api/profiles?${q.toString()}`
}

function suppressionOf(p: any, listId: string | null): { reason: string; at: string | null } | null { // eslint-disable-line @typescript-eslint/no-explicit-any
  const m = p?.attributes?.subscriptions?.email?.marketing
  if (!m) return null
  if (listId) {
    const l = (Array.isArray(m.list_suppressions) ? m.list_suppressions : []).find((x: any) => x?.list_id === listId) // eslint-disable-line @typescript-eslint/no-explicit-any
    return l ? { reason: String(l.reason ?? "UNSUBSCRIBE"), at: l.timestamp ?? null } : null
  }
  const s = Array.isArray(m.suppression) ? m.suppression[0] : m.suppression
  if (s?.reason) return { reason: String(s.reason), at: s.timestamp ?? null }
  if (String(m.consent ?? "").toUpperCase() === "UNSUBSCRIBED") return { reason: "UNSUBSCRIBE", at: m.consent_timestamp ?? m.last_updated ?? null }
  return null
}

export async function klaviyoPull(key: string, scope: string, since: string, listId: string | null, maxPages = 5): Promise<{ people: PulledAddress[]; latest: string | null; more: boolean }> {
  const people: PulledAddress[] = []
  let latest: string | null = null
  let url: string | null = klaviyoPullUrl(since, listId)
  let pages = 0
  while (url && pages < maxPages) {
    pages++
    const r: any = await marketingCall(NAME, url, { headers: headers(key, false), limit: { key: scope, name: "klaviyo:read" } }) // eslint-disable-line @typescript-eslint/no-explicit-any
    for (const p of Array.isArray(r?.data) ? r.data : []) {
      const email = String(p?.attributes?.email ?? "").trim().toLowerCase()
      const s = suppressionOf(p, listId)
      if (!s || !EMAIL_RE.test(email)) continue
      people.push({ email, reason: s.reason, at: s.at })
      if (s.at && (!latest || Date.parse(s.at) > Date.parse(latest))) latest = s.at
    }
    const next: unknown = r?.links?.next
    url = typeof next === "string" && next.startsWith(`${KLAVIYO_API}/api/profiles`) ? next : null
  }
  return { people, latest, more: !!url }
}
