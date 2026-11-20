/**
 * ===========================================================================
 *  CALENDLY AND CAL.COM BOOKINGS, WITHOUT A DATABASE OR A NETWORK
 * ===========================================================================
 * A OnePage's Booking block can link to or embed Calendly or Cal.com. A
 * booking made there now reaches Storelib: the provider calls a webhook
 * address Storelib made for the store (one unguessable `hook` per store and
 * provider), every call is checked against the signing secret kept sealed for
 * that store, and the booking is written to public.external_bookings
 * (run-now part 475), where /app/bookings shows it beside the store's own.
 *
 *   calendly   connected with a personal access token. Storelib reads the
 *              account (GET /users/me) and creates a webhook subscription
 *              for invitee.created and invitee.canceled, scope user, with a
 *              signing key it made (POST /webhook_subscriptions). Each call
 *              carries Calendly-Webhook-Signature: t=<unix seconds>,v1=<hex>,
 *              the HMAC SHA-256 of "<t>.<raw body>" with that key. A call
 *              whose t is more than REPLAY_TOLERANCE_S away is refused.
 *              Disconnect deletes the subscription (DELETE its URI).
 *   calcom     connected with an API key (Storelib creates the webhook with
 *              POST /v2/webhooks and deletes it on disconnect), or with no
 *              key: Storelib makes the secret and shows the address and
 *              secret for the creator to paste in Cal.com (Settings ›
 *              Developer › Webhooks). Each call carries X-Cal-Signature-256,
 *              the HMAC SHA-256 hex of the raw body with that secret; the
 *              body's createdAt, read only after the signature holds, must be
 *              within REPLAY_TOLERANCE_S.
 *
 * Everything here is pure (the HMACs are node:crypto), so the tests read
 * exactly what is asked of each provider and how each event is understood.
 */
import { createHmac, timingSafeEqual } from "node:crypto"

import { type ExternalProvider } from "./names"
export { EXTERNAL_PROVIDERS, EXTERNAL_PROVIDER_NAME, isExternalProvider, type ExternalProvider } from "./names"

/** How far a signed call's time may be from now, either way: older is a replay. */
export const REPLAY_TOLERANCE_S = 5 * 60

/** The largest webhook body read. Calendly's and Cal.com's are a few kilobytes. */
export const MAX_HOOK_BYTES = 256 * 1024

export const CALENDLY_API = "https://api.calendly.com"
export const CALCOM_API = "https://api.cal.com"
export const CALENDLY_EVENTS = ["invitee.created", "invitee.canceled"] as const
export const CALCOM_TRIGGERS = ["BOOKING_CREATED", "BOOKING_CANCELLED", "BOOKING_RESCHEDULED"] as const

/** The path part that names a store's webhook: random, url safe, 24 to 64 characters (part 475 checks the same). */
export const HOOK_ID = /^[A-Za-z0-9_-]{24,64}$/

export function hookPath(provider: ExternalProvider, hookId: string): string {
  return `/api/bookings/external/hook/${provider}/${hookId}`
}

/* ─── Signatures ──────────────────────────────────────────────────────── */

export type Verified = { ok: true } | { ok: false; reason: "missing" | "malformed" | "mismatch" | "stale" }

const hex = (s: string) => /^[0-9a-f]+$/i.test(s) && s.length % 2 === 0

function sameHex(a: string, b: string): boolean {
  if (!hex(a) || !hex(b) || a.length !== b.length) return false
  return timingSafeEqual(Buffer.from(a.toLowerCase(), "hex"), Buffer.from(b.toLowerCase(), "hex"))
}

export function calendlySignature(signingKey: string, t: number | string, raw: string): string {
  return createHmac("sha256", signingKey).update(`${t}.${raw}`, "utf8").digest("hex")
}

/** "t=1492774577,v1=5257a869…" read, or null. Several v1 values (a key being rotated) are all kept. */
export function parseCalendlySignature(header: string | null | undefined): { t: number; v1: string[] } | null {
  if (!header || header.length > 2000) return null
  let t: number | null = null
  const v1: string[] = []
  for (const part of header.split(",")) {
    const [k, ...rest] = part.trim().split("=")
    const v = rest.join("=").trim()
    if (k === "t" && /^\d{1,12}$/.test(v)) t = Number(v)
    else if (k === "v1" && v) v1.push(v)
  }
  return t !== null && v1.length ? { t, v1 } : null
}

/** Calendly-Webhook-Signature checked against the raw body, then its time. */
export function verifyCalendly(header: string | null | undefined, raw: string, signingKey: string, nowMs: number = Date.now()): Verified {
  if (!header) return { ok: false, reason: "missing" }
  const parsed = parseCalendlySignature(header)
  if (!parsed) return { ok: false, reason: "malformed" }
  const want = calendlySignature(signingKey, parsed.t, raw)
  if (!parsed.v1.some((v) => sameHex(v, want))) return { ok: false, reason: "mismatch" }
  if (Math.abs(nowMs / 1000 - parsed.t) > REPLAY_TOLERANCE_S) return { ok: false, reason: "stale" }
  return { ok: true }
}

export function calcomSignature(secret: string, raw: string): string {
  return createHmac("sha256", secret).update(raw, "utf8").digest("hex")
}

/** X-Cal-Signature-256 checked against the raw body. Its time is the body's createdAt (calcomFresh), read after this holds. */
export function verifyCalcom(header: string | null | undefined, raw: string, secret: string): Verified {
  if (!header) return { ok: false, reason: "missing" }
  const sig = header.trim().replace(/^sha256=/i, "")
  if (!hex(sig) || sig.length !== 64) return { ok: false, reason: "malformed" }
  return sameHex(sig, calcomSignature(secret, raw)) ? { ok: true } : { ok: false, reason: "mismatch" }
}

/** A signed Cal.com body is a replay when its createdAt is missing or more than REPLAY_TOLERANCE_S from now. */
export function calcomFresh(body: unknown, nowMs: number = Date.now()): boolean {
  const at = Date.parse(String((body as { createdAt?: unknown } | null)?.createdAt ?? ""))
  return Number.isFinite(at) && Math.abs(nowMs - at) <= REPLAY_TOLERANCE_S * 1000
}

/* ─── What a store connects with ──────────────────────────────────────── */

/** A Calendly personal access token is a long JWT; a Cal.com API key starts cal_live_ or cal_test_. */
export function credentialProblem(provider: ExternalProvider, value: string): string | null {
  const v = value.trim()
  if (provider === "calendly") return /^[A-Za-z0-9._-]{40,4000}$/.test(v) ? null : "Paste a Calendly personal access token (Integrations & apps › API and webhooks)."
  return /^cal_(live|test)_[A-Za-z0-9]{16,200}$/.test(v) ? null : "A Cal.com API key starts with cal_live_."
}

export interface ProviderRequest {
  method: "GET" | "POST" | "DELETE"
  url: string
  headers: Record<string, string>
  body?: string
}

const JSON_HEADERS = { "content-type": "application/json", accept: "application/json", "user-agent": "Storelib/1.0 (+https://storelib.com)" }

export function calendlyMeRequest(token: string): ProviderRequest {
  return { method: "GET", url: `${CALENDLY_API}/users/me`, headers: { ...JSON_HEADERS, authorization: `Bearer ${token.trim()}` } }
}

export function calendlySubscribeRequest(token: string, input: { url: string; organization: string; user: string; signingKey: string }): ProviderRequest {
  return {
    method: "POST",
    url: `${CALENDLY_API}/webhook_subscriptions`,
    headers: { ...JSON_HEADERS, authorization: `Bearer ${token.trim()}` },
    body: JSON.stringify({ url: input.url, events: [...CALENDLY_EVENTS], organization: input.organization, user: input.user, scope: "user", signing_key: input.signingKey }),
  }
}

/** The subscription's own URI, deleted as it is: only ever on api.calendly.com, so the token never goes anywhere else. */
export function calendlyUnsubscribeRequest(token: string, subscriptionUri: string): ProviderRequest | null {
  let u: URL
  try {
    u = new URL(subscriptionUri)
  } catch {
    return null
  }
  if (u.origin !== CALENDLY_API || !/^\/webhook_subscriptions\/[A-Za-z0-9-]{1,80}$/.test(u.pathname)) return null
  return { method: "DELETE", url: u.toString(), headers: { ...JSON_HEADERS, authorization: `Bearer ${token.trim()}` } }
}

export function calcomCreateHookRequest(apiKey: string, input: { url: string; secret: string }): ProviderRequest {
  return {
    method: "POST",
    url: `${CALCOM_API}/v2/webhooks`,
    headers: { ...JSON_HEADERS, authorization: `Bearer ${apiKey.trim()}` },
    body: JSON.stringify({ active: true, subscriberUrl: input.url, triggers: [...CALCOM_TRIGGERS], secret: input.secret }),
  }
}

export function calcomDeleteHookRequest(apiKey: string, webhookId: string): ProviderRequest | null {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(webhookId)) return null
  return { method: "DELETE", url: `${CALCOM_API}/v2/webhooks/${webhookId}`, headers: { ...JSON_HEADERS, authorization: `Bearer ${apiKey.trim()}` } }
}

/** The account a Calendly token reads: its URI, its organization and a name to show. */
export function calendlyAccountFrom(body: unknown): { user: string; organization: string; label: string | null } | null {
  const r = (body as { resource?: Record<string, unknown> } | null)?.resource
  if (!r || typeof r.uri !== "string" || typeof r.current_organization !== "string") return null
  const label = typeof r.email === "string" ? r.email : typeof r.name === "string" ? r.name : null
  return { user: r.uri, organization: r.current_organization, label: label ? label.slice(0, 200) : null }
}

export function calendlySubscriptionFrom(body: unknown): string | null {
  const uri = (body as { resource?: { uri?: unknown } } | null)?.resource?.uri
  return typeof uri === "string" && uri.startsWith(`${CALENDLY_API}/webhook_subscriptions/`) ? uri : null
}

export function calcomHookIdFrom(body: unknown): string | null {
  const d = (body as { data?: { id?: unknown } } | null)?.data
  const id = d?.id
  return typeof id === "string" || typeof id === "number" ? String(id) : null
}

/* ─── What an event means ─────────────────────────────────────────────── */

export interface ExternalBookingFields {
  externalId: string
  externalEventId: string | null
  eventName: string | null
  inviteeName: string | null
  inviteeEmail: string | null
  startsAt: string
  endsAt: string
  timezone: string | null
  location: string | null
}

export type ExternalChange =
  | { kind: "created"; key: string; booking: ExternalBookingFields; rescheduledFrom: string | null }
  | { kind: "cancelled"; key: string; externalId: string; reason: string | null; by: string | null; byHost: boolean }
  /** The booking was moved to another (Calendly cancels the old invitee with rescheduled true): it is kept, marked moved. */
  | { kind: "moved_away"; key: string; externalId: string; to: string | null }
  | { kind: "ignored"; reason: string }

type Obj = Record<string, unknown>
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {})
const text = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null
  const t = v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim()
  return t ? t.slice(0, max) : null
}
const iso = (v: unknown): string | null => {
  const t = Date.parse(String(v ?? ""))
  return Number.isFinite(t) ? new Date(t).toISOString() : null
}
const email = (v: unknown): string | null => {
  const e = text(v, 320)?.toLowerCase() ?? null
  return e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null
}
const zone = (v: unknown): string | null => {
  const z = text(v, 80)
  if (!z) return null
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: z })
    return z
  } catch {
    return null
  }
}

function calendlyWhere(loc: unknown): string | null {
  const l = obj(loc)
  return text(l.join_url, 500) ?? text(l.location, 500) ?? null
}

/** A Calendly webhook body (invitee.created or invitee.canceled), as a change to a booking. */
export function calendlyChange(body: unknown): ExternalChange {
  const b = obj(body)
  const event = b.event
  const p = obj(b.payload)
  const invitee = text(p.uri, 500)
  if (!invitee) return { kind: "ignored", reason: "no invitee" }
  if (event === "invitee.canceled") {
    if (p.rescheduled === true) return { kind: "moved_away", key: `calendly:moved:${invitee}`, externalId: invitee, to: text(p.new_invitee, 500) }
    const c = obj(p.cancellation)
    return { kind: "cancelled", key: `calendly:cancelled:${invitee}`, externalId: invitee, reason: text(c.reason, 500), by: text(c.canceled_by, 200), byHost: c.canceler_type === "host" }
  }
  if (event !== "invitee.created") return { kind: "ignored", reason: `event ${String(event).slice(0, 40)}` }
  const ev = obj(p.scheduled_event)
  const startsAt = iso(ev.start_time)
  const endsAt = iso(ev.end_time)
  if (!startsAt || !endsAt || Date.parse(endsAt) < Date.parse(startsAt)) return { kind: "ignored", reason: "no time" }
  const name = text(p.name, 200) ?? (text([p.first_name, p.last_name].filter((x) => typeof x === "string").join(" "), 200) || null)
  return {
    kind: "created",
    key: `calendly:created:${invitee}`,
    rescheduledFrom: text(p.old_invitee, 500),
    booking: {
      externalId: invitee,
      externalEventId: text(ev.uri, 500),
      eventName: text(ev.name, 300),
      inviteeName: name,
      inviteeEmail: email(p.email),
      startsAt,
      endsAt,
      timezone: zone(p.timezone),
      location: calendlyWhere(ev.location),
    },
  }
}

/** A Cal.com webhook body (BOOKING_CREATED, BOOKING_CANCELLED or BOOKING_RESCHEDULED), as a change to a booking. */
export function calcomChange(body: unknown): ExternalChange {
  const b = obj(body)
  const trigger = b.triggerEvent
  const p = obj(b.payload)
  const uid = text(p.uid, 500)
  if (trigger === "PING") return { kind: "ignored", reason: "ping" }
  if (!uid) return { kind: "ignored", reason: "no booking" }
  if (trigger === "BOOKING_CANCELLED") {
    const organizer = email(obj(p.organizer).email)
    const by = text(p.cancelledBy, 200)
    return { kind: "cancelled", key: `calcom:cancelled:${uid}`, externalId: uid, reason: text(p.cancellationReason, 500), by, byHost: !!by && !!organizer && by.toLowerCase() === organizer }
  }
  if (trigger !== "BOOKING_CREATED" && trigger !== "BOOKING_RESCHEDULED") return { kind: "ignored", reason: `trigger ${String(trigger).slice(0, 40)}` }
  const startsAt = iso(p.startTime)
  const endsAt = iso(p.endTime)
  if (!startsAt || !endsAt || Date.parse(endsAt) < Date.parse(startsAt)) return { kind: "ignored", reason: "no time" }
  const attendee = obj(Array.isArray(p.attendees) ? p.attendees[0] : null)
  const from = trigger === "BOOKING_RESCHEDULED" ? text(p.rescheduleUid, 500) ?? text(p.fromReschedule, 500) : null
  return {
    kind: "created",
    key: `calcom:${trigger === "BOOKING_RESCHEDULED" ? "rescheduled" : "created"}:${uid}`,
    rescheduledFrom: from && from !== uid ? from : null,
    booking: {
      externalId: uid,
      externalEventId: p.bookingId === undefined || p.bookingId === null ? null : text(String(p.bookingId), 500),
      eventName: text(p.eventTitle, 300) ?? text(p.type, 300) ?? text(p.title, 300),
      inviteeName: text(attendee.name, 200),
      inviteeEmail: email(attendee.email),
      startsAt,
      endsAt,
      timezone: zone(attendee.timeZone) ?? zone(obj(p.organizer).timeZone),
      location: text(obj(p.videoCallData).url, 500) ?? text(p.location, 500),
    },
  }
}

export function changeOf(provider: ExternalProvider, body: unknown): ExternalChange {
  return provider === "calendly" ? calendlyChange(body) : calcomChange(body)
}
