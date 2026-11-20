import "server-only"

/**
 * ===========================================================================
 *  CALENDLY AND CAL.COM: CONNECTING, DISCONNECTING AND TAKING THEIR BOOKINGS
 * ===========================================================================
 * The rules are ./providers.ts. Here is what touches the database (run-now
 * part 475) and the providers:
 *
 *   connect      one row per store and provider in
 *                external_booking_connections. The creator's token or key
 *                and the signing secret Storelib made are sealed together
 *                (lib/physical/secrets, as Mailchimp's and Klaviyo's keys are)
 *                and never sent back; the screen shows the account only.
 *   disconnect   the provider's webhook removed with the stored token or key
 *                (a manual Cal.com webhook is the creator's to delete, and the
 *                screen says so), then the row deleted. Bookings already in
 *                Storelib stay.
 *   an event     written to external_bookings, one row per owner, provider
 *                and the provider's booking id, so the same event twice (a
 *                retry, a replay inside the window) writes nothing more and
 *                tells nobody twice. A cancel or move changes only a booking
 *                still confirmed.
 *   telling      the bell (and the phone) as a native booking rings it, and
 *                the creator's email when the person who booked moved or
 *                cancelled it (lib/bookings/announce does the same for native
 *                bookings). The visitor is never emailed: Calendly and Cal.com
 *                already did.
 *
 * Every function takes its database and its network as arguments, so
 * tests/onepage-reviews-bookings.test.ts runs them against fakes.
 */
import { randomBytes } from "node:crypto"
import { openSecret, sealSecret } from "@/lib/physical/secrets"
import { ownerChangeMail, when, type MailParts } from "@/lib/bookings/emails"
import {
  EXTERNAL_PROVIDER_NAME,
  HOOK_ID,
  calcomCreateHookRequest,
  calcomDeleteHookRequest,
  calcomHookIdFrom,
  calendlyAccountFrom,
  calendlyMeRequest,
  calendlySubscribeRequest,
  calendlySubscriptionFrom,
  calendlyUnsubscribeRequest,
  credentialProblem,
  hookPath,
  isExternalProvider,
  type ExternalChange,
  type ExternalProvider,
  type ProviderRequest,
} from "./providers"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = { from: (table: string) => any }
export type Answer = { status: number; body: unknown }
export type Ask = (req: ProviderRequest) => Promise<Answer>

export const NEEDS_PART = "Calendly and Cal.com bookings need the Bookings database update (SQL part 475)."

const CONNECTIONS = "external_booking_connections"
const BOOKINGS = "external_bookings"
const CONNECTION_ROW = "id, creator_id, owner_id, provider, hook_id, mode, status, secret_ciphertext, remote_webhook_id, account_label, last_event_at, last_error, last_error_at, created_at"

export interface ConnectionRow {
  id: string
  creator_id: string
  owner_id: string
  provider: ExternalProvider
  hook_id: string
  mode: "api" | "manual"
  status: "connected" | "waiting"
  secret_ciphertext: string | null
  remote_webhook_id: string | null
  account_label: string | null
  last_event_at: string | null
  last_error: string | null
  last_error_at: string | null
  created_at?: string | null
}

export interface ExternalBookingRow {
  id: string
  owner_id: string
  creator_id: string
  source: ExternalProvider
  external_id: string
  external_event_id: string | null
  event_name: string | null
  invitee_name: string | null
  invitee_email: string | null
  starts_at: string
  ends_at: string
  timezone: string | null
  location: string | null
  status: "confirmed" | "cancelled" | "rescheduled"
  cancel_reason: string | null
  cancelled_by: string | null
  rescheduled_to: string | null
  rescheduled_from: string | null
  created_at: string
}

export const EXTERNAL_BOOKING_COLUMNS =
  "id, owner_id, creator_id, source, external_id, external_event_id, event_name, invitee_name, invitee_email, starts_at, ends_at, timezone, location, status, cancel_reason, cancelled_by, rescheduled_to, rescheduled_from, created_at"

/** The table is not there yet: part 475 has not run. */
export function missingTable(error: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!error) return false
  const code = String(error.code ?? "")
  return code === "42P01" || code === "PGRST205" || code === "PGRST204" || code === "42703" || /external_booking/.test(String(error.message ?? "")) && /does not exist|could not find/i.test(String(error.message ?? ""))
}

type Sealed = { credential: string | null; signing: string }

export function sealConnection(s: Sealed): string {
  return sealSecret(JSON.stringify(s))
}

export function openConnection(sealed: string | null | undefined): Sealed | null {
  const plain = openSecret(sealed)
  if (!plain) return null
  try {
    const v = JSON.parse(plain) as Partial<Sealed>
    return typeof v.signing === "string" && v.signing ? { credential: typeof v.credential === "string" ? v.credential : null, signing: v.signing } : null
  } catch {
    return null
  }
}

/** A fetch with a deadline, its body read as JSON when it is JSON. Status 0: no answer. */
export async function askJson(req: ProviderRequest): Promise<Answer> {
  try {
    const res = await fetch(req.url, { method: req.method, headers: req.headers, body: req.body, signal: AbortSignal.timeout(10_000), cache: "no-store" })
    const raw = await res.text().catch(() => "")
    try {
      return { status: res.status, body: raw ? JSON.parse(raw) : null }
    } catch {
      return { status: res.status, body: raw }
    }
  } catch {
    return { status: 0, body: null }
  }
}

/* ─── What the screens read ───────────────────────────────────────────── */

export interface ConnectionView {
  provider: ExternalProvider
  connected: boolean
  /** A pasted Cal.com webhook that has not sent its first booking yet. */
  waiting: boolean
  mode: "api" | "manual" | null
  account: string | null
  webhookUrl: string | null
  lastEventAt: string | null
  lastError: string | null
}

export interface ConnectionsAnswer {
  connections: ConnectionView[]
  /** Part 475 has run. */
  ready: boolean
}

export async function loadConnections(db: Db, creatorId: string, origin: string): Promise<ConnectionsAnswer> {
  const { data, error } = await db.from(CONNECTIONS).select(CONNECTION_ROW).eq("creator_id", creatorId)
  const rows = new Map<string, ConnectionRow>(((error ? [] : data) ?? []).map((r: ConnectionRow) => [r.provider, r]))
  return {
    ready: !error,
    connections: (["calendly", "calcom"] as const).map((provider) => {
      const r = rows.get(provider)
      return {
        provider,
        connected: !!r,
        waiting: r?.status === "waiting",
        mode: r?.mode ?? null,
        account: r?.account_label ?? null,
        /* The address is only worth showing where the creator pasted it themselves. */
        webhookUrl: r && r.mode === "manual" ? `${origin}${hookPath(provider, r.hook_id)}` : null,
        lastEventAt: r?.last_event_at ?? null,
        lastError: r?.last_error ?? null,
      }
    }),
  }
}

/* ─── Connecting ──────────────────────────────────────────────────────── */

export type ConnectResult = { ok: true; webhookUrl?: string; secret?: string } | { ok: false; error: string; status: number }

const newHookId = () => randomBytes(24).toString("base64url")
const newSigningKey = () => randomBytes(32).toString("base64url")

function refusal(provider: ExternalProvider, a: Answer): string {
  const name = EXTERNAL_PROVIDER_NAME[provider]
  if (a.status === 0) return `${name} did not answer. Try again in a moment.`
  if (a.status === 401) return provider === "calendly" ? "Calendly did not accept that token. Make a new personal access token and paste it." : "Cal.com did not accept that key."
  if (a.status === 403) return provider === "calendly" ? "Calendly refused the webhook. Webhooks need a paid Calendly plan (Standard or higher)." : "Cal.com refused the webhook for this key."
  return `${name} answered with an error (${a.status}). Try again.`
}

async function rowOf(db: Db, creatorId: string, provider: ExternalProvider): Promise<{ row: ConnectionRow | null; error: { code?: string } | null }> {
  const { data, error } = await db.from(CONNECTIONS).select(CONNECTION_ROW).eq("creator_id", creatorId).eq("provider", provider).maybeSingle()
  return { row: (data as ConnectionRow | null) ?? null, error }
}

/**
 * One request from the card:
 *   { provider: "calendly", token }               subscription made with the token
 *   { provider: "calcom", apiKey }                webhook made with the key
 *   { provider: "calcom", manual: true }          address and secret to paste, returned once
 * Connecting again replaces the old connection, its webhook removed first.
 */
export async function connectExternal(db: Db, who: { creatorId: string; ownerId: string }, body: Record<string, unknown>, origin: string, ask: Ask = askJson): Promise<ConnectResult> {
  const provider = body.provider
  if (!isExternalProvider(provider)) return { ok: false, error: "Bad request.", status: 400 }
  const existing = await rowOf(db, who.creatorId, provider)
  if (existing.error && missingTable(existing.error)) return { ok: false, error: NEEDS_PART, status: 409 }
  const hookId = newHookId()
  const signing = newSigningKey()
  const url = `${origin}${hookPath(provider, hookId)}`
  const manual = provider === "calcom" && body.manual === true
  const credential = manual ? null : typeof body.token === "string" ? body.token.trim() : typeof body.apiKey === "string" ? body.apiKey.trim() : ""
  if (!manual) {
    const problem = credentialProblem(provider, credential ?? "")
    if (problem) return { ok: false, error: problem, status: 400 }
  }

  let remote: string | null = null
  let account: string | null = null
  if (provider === "calendly") {
    const me = await ask(calendlyMeRequest(credential!))
    const acc = me.status >= 200 && me.status < 300 ? calendlyAccountFrom(me.body) : null
    if (!acc) return { ok: false, error: refusal("calendly", me.status >= 200 && me.status < 300 ? { status: 500, body: null } : me), status: 400 }
    const sub = await ask(calendlySubscribeRequest(credential!, { url, organization: acc.organization, user: acc.user, signingKey: signing }))
    remote = sub.status >= 200 && sub.status < 300 ? calendlySubscriptionFrom(sub.body) : null
    if (!remote) return { ok: false, error: refusal("calendly", sub.status >= 200 && sub.status < 300 ? { status: 500, body: null } : sub), status: 400 }
    account = acc.label
  } else if (!manual) {
    const made = await ask(calcomCreateHookRequest(credential!, { url, secret: signing }))
    remote = made.status >= 200 && made.status < 300 ? calcomHookIdFrom(made.body) : null
    if (!remote) return { ok: false, error: `${refusal("calcom", made.status >= 200 && made.status < 300 ? { status: 500, body: null } : made)} You can add the webhook in Cal.com yourself instead.`, status: 400 }
  }

  /* The old connection's webhook goes before the new row replaces it, so it never sends to an address that answers 404. */
  if (existing.row) await removeRemote(existing.row, ask)
  const now = new Date().toISOString()
  const row = {
    creator_id: who.creatorId,
    owner_id: who.ownerId,
    provider,
    hook_id: hookId,
    mode: manual ? "manual" : "api",
    status: manual ? "waiting" : "connected",
    secret_ciphertext: sealConnection({ credential: manual ? null : credential, signing }),
    remote_webhook_id: remote,
    account_label: account,
    last_event_at: null,
    last_error: null,
    last_error_at: null,
    updated_at: now,
  }
  const { error } = await db.from(CONNECTIONS).upsert(row, { onConflict: "creator_id,provider" })
  if (error) {
    /* Nothing kept: the webhook just made goes again, so the provider is never left sending to nothing. */
    await removeRemote({ provider, mode: manual ? "manual" : "api", remote_webhook_id: remote, secret_ciphertext: row.secret_ciphertext }, ask)
    return { ok: false, error: missingTable(error) ? NEEDS_PART : "That could not be saved. Try again.", status: missingTable(error) ? 409 : 500 }
  }
  return manual ? { ok: true, webhookUrl: url, secret: signing } : { ok: true }
}

/** The provider's webhook removed with the stored token or key. True when it is gone (or was never Storelib's to remove). */
export async function removeRemote(row: Pick<ConnectionRow, "provider" | "mode" | "remote_webhook_id" | "secret_ciphertext">, ask: Ask = askJson): Promise<boolean> {
  if (row.mode === "manual" || !row.remote_webhook_id) return true
  const sealed = openConnection(row.secret_ciphertext)
  if (!sealed?.credential) return false
  const req = row.provider === "calendly" ? calendlyUnsubscribeRequest(sealed.credential, row.remote_webhook_id) : calcomDeleteHookRequest(sealed.credential, row.remote_webhook_id)
  if (!req) return false
  const a = await ask(req)
  return (a.status >= 200 && a.status < 300) || a.status === 404
}

export type DisconnectResult = { ok: true; remoteRemoved: boolean; manual: boolean } | { ok: false; error: string; status: number }

/** The webhook removed, then the connection. The bookings it brought stay in Storelib. */
export async function disconnectExternal(db: Db, creatorId: string, provider: unknown, ask: Ask = askJson): Promise<DisconnectResult> {
  if (!isExternalProvider(provider)) return { ok: false, error: "Bad request.", status: 400 }
  const { row, error } = await rowOf(db, creatorId, provider)
  if (error) return missingTable(error) ? { ok: true, remoteRemoved: true, manual: false } : { ok: false, error: "That could not be disconnected. Try again.", status: 500 }
  if (!row) return { ok: true, remoteRemoved: true, manual: false }
  const remoteRemoved = await removeRemote(row, ask)
  const { error: delError } = await db.from(CONNECTIONS).delete().eq("id", row.id).eq("creator_id", creatorId)
  if (delError) return { ok: false, error: "That could not be disconnected. Try again.", status: 500 }
  return { ok: true, remoteRemoved, manual: row.mode === "manual" }
}

/* ─── Taking an event ─────────────────────────────────────────────────── */

export async function connectionByHook(db: Db, provider: ExternalProvider, hookId: string): Promise<ConnectionRow | null> {
  if (!HOOK_ID.test(hookId)) return null
  const { data, error } = await db.from(CONNECTIONS).select(CONNECTION_ROW).eq("provider", provider).eq("hook_id", hookId).maybeSingle()
  if (error) return null
  return (data as ConnectionRow | null) ?? null
}

/** What changed, for the notices: nothing (seen before, or not ours), or which notice to send for which row. */
export interface Applied {
  /** Null: nothing to tell (seen before, not ours, or a move's old half). */
  tell: "new" | "moved" | "cancelled" | null
  row: ExternalBookingRow | null
  /** The host did it themselves (no email to them). */
  byHost: boolean
  previousStart: string | null
}
const NOTHING: Applied = { tell: null, row: null, byHost: false, previousStart: null }

/**
 * One event written. Idempotent: a booking is inserted once per owner,
 * provider and booking id (the insert ignores one already there), and a
 * cancel or a move changes only a booking still confirmed, so the same event
 * again changes nothing and returns no notice.
 */
export async function applyChange(db: Db, conn: Pick<ConnectionRow, "owner_id" | "creator_id" | "provider">, change: ExternalChange, nowIso: string = new Date().toISOString()): Promise<Applied> {
  /* Every change names the owner and the provider: a booking id of another store changes nothing. */
  const update = (patch: Record<string, unknown>) => db.from(BOOKINGS).update(patch).eq("owner_id", conn.owner_id).eq("source", conn.provider)
  if (change.kind === "ignored") return NOTHING

  if (change.kind === "created") {
    const b = change.booking
    const insert = {
      owner_id: conn.owner_id,
      creator_id: conn.creator_id,
      source: conn.provider,
      external_id: b.externalId,
      external_event_id: b.externalEventId,
      event_name: b.eventName,
      invitee_name: b.inviteeName,
      invitee_email: b.inviteeEmail,
      starts_at: b.startsAt,
      ends_at: b.endsAt,
      timezone: b.timezone,
      location: b.location,
      status: "confirmed",
      rescheduled_from: change.rescheduledFrom,
      updated_at: nowIso,
    }
    const { data, error } = await db.from(BOOKINGS).upsert(insert, { onConflict: "owner_id,source,external_id", ignoreDuplicates: true }).select(EXTERNAL_BOOKING_COLUMNS)
    if (error) throw new Error(missingTable(error) ? NEEDS_PART : `booking not saved (${error.code ?? "error"})`)
    const row = ((data ?? []) as ExternalBookingRow[])[0] ?? null
    let previousStart: string | null = null
    if (change.rescheduledFrom) {
      /* The booking it replaces, kept and marked moved, pointing at the new one: whichever of the two events came first. */
      const { data: old } = await update({ status: "rescheduled", rescheduled_to: b.externalId, updated_at: nowIso }).eq("external_id", change.rescheduledFrom).neq("status", "cancelled").select("starts_at")
      previousStart = ((old ?? []) as { starts_at: string }[])[0]?.starts_at ?? null
    }
    if (!row) return NOTHING
    return { tell: change.rescheduledFrom ? "moved" : "new", row, byHost: false, previousStart }
  }

  if (change.kind === "moved_away") {
    const { error } = await update({ status: "rescheduled", rescheduled_to: change.to, updated_at: nowIso }).eq("external_id", change.externalId).eq("status", "confirmed").select("id")
    if (error && missingTable(error)) throw new Error(NEEDS_PART)
    return NOTHING
  }

  /* Cancelled: only a booking still confirmed, so a cancel sent twice tells once. */
  const { data, error } = await update({ status: "cancelled", cancel_reason: change.reason, cancelled_by: change.by, updated_at: nowIso }).eq("external_id", change.externalId).eq("status", "confirmed").select(EXTERNAL_BOOKING_COLUMNS)
  if (error && missingTable(error)) throw new Error(NEEDS_PART)
  const row = ((data ?? []) as ExternalBookingRow[])[0] ?? null
  return row ? { tell: "cancelled", row, byHost: change.byHost, previousStart: null } : NOTHING
}

/** The connection heard from: its time, and a pasted Cal.com webhook is connected from its first signed call. */
export async function noteEvent(db: Db, conn: Pick<ConnectionRow, "id">, nowIso: string = new Date().toISOString()): Promise<void> {
  await db.from(CONNECTIONS).update({ last_event_at: nowIso, status: "connected", last_error: null, last_error_at: null, updated_at: nowIso }).eq("id", conn.id)
}

/* ─── Telling the creator ─────────────────────────────────────────────── */

export interface ExternalAnnounceDeps {
  notify: (n: { userId: string; kind: "system"; source: "system"; title: string; body: string; url: string; dedupeKey: string }) => Promise<unknown>
  email: (m: MailParts & { to: string; fromName: string; replyTo?: string | null }) => Promise<{ success: boolean }>
  identity: (ownerId: string) => Promise<{ fromName: string; sellerEmail: string | null; replyTo: string | null }>
  origin: string
}

export interface ExternalAnnounced {
  bell: boolean
  ownerEmail: boolean
}

/**
 * The bell for a new, moved or cancelled booking (keyed by the booking and the change, so a retry never rings
 * twice), and the creator's email when the person who booked moved or cancelled it, as a native booking does.
 */
export async function announceExternal(deps: ExternalAnnounceDeps, applied: Applied): Promise<ExternalAnnounced> {
  const out: ExternalAnnounced = { bell: false, ownerEmail: false }
  if (!applied.tell || !applied.row) return out
  const b = applied.row
  const name = EXTERNAL_PROVIDER_NAME[b.source]
  const who = b.invitee_name || b.invitee_email || "Someone"
  const title = b.event_name || name
  const tz = b.timezone || "UTC"
  const link = `${deps.origin}/app/bookings?booking=${b.id}`
  const safely = async (fn: () => Promise<unknown>) => {
    try {
      await fn()
      return true
    } catch (e) {
      console.warn("[bookings] an external booking notice was not sent:", b.id, applied.tell, e instanceof Error ? e.message.slice(0, 200) : "error")
      return false
    }
  }
  const head = applied.tell === "new" ? `New booking on ${name}` : applied.tell === "moved" ? `Booking moved on ${name}` : `Booking cancelled on ${name}`
  out.bell = await safely(() =>
    deps.notify({ userId: b.owner_id, kind: "system", source: "system", title: head, body: `${who}, ${title}, ${when(b.starts_at, tz)}`.slice(0, 200), url: `/app/bookings?booking=${b.id}`, dedupeKey: `booking:${b.source}:${applied.tell}:${b.id}` }),
  )
  if (applied.tell !== "new" && !applied.byHost) {
    const identity = await deps.identity(b.owner_id).catch(() => ({ fromName: "", sellerEmail: null, replyTo: null }))
    if (identity.sellerEmail) {
      const mail = ownerChangeMail({
        kind: applied.tell === "moved" ? "moved" : "cancelled",
        title,
        who,
        booking: { id: b.id, startsAt: b.starts_at, endsAt: b.ends_at, visitorTimezone: b.timezone, ownerTimezone: tz, location: null, sequence: 0, cancelReason: b.cancel_reason },
        previousStart: applied.previousStart,
        link,
      })
      out.ownerEmail = await safely(async () => {
        const sent = await deps.email({ ...mail, to: identity.sellerEmail!, fromName: "Storelib Bookings", replyTo: b.invitee_email })
        if (!sent.success) throw new Error("not sent")
      })
    }
  }
  return out
}
