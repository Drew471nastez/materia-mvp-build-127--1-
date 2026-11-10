import "server-only"
import { openSecret, sealSecret } from "@/lib/physical/secrets"
import {
  GoogleCalendarError,
  deleteEvent,
  freeBusy,
  googleCalendarConfig,
  insertEvent,
  moveEvent,
  refreshAccess,
  type BusyInterval,
  type EventInput,
  type Fetch,
  type Tokens,
  type WrittenEvent,
} from "./api"

/*
  ONE CREATOR'S GOOGLE CALENDAR, ON THE SERVER (round AR).

  google_calendar_connections (SQL part 410) keeps one row per creator: the
  refresh token and the current access token sealed with sealSecret (the
  way integration secrets are kept, lib/physical/secrets.ts), the calendars
  whose busy times block bookings, and the calendar bookings are written
  to. Only the service role reads the table, and every function here takes
  the owner id from the signed in session or the booking row, never from a
  request body.

  Google is a helper, never a gate: when it does not answer, slots are
  drawn from Storelib's own bookings and a booking is still kept. The
  server checks the slot again on submit either way.
*/

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any }

export interface ConnectionRow {
  owner_id: string
  google_email: string | null
  refresh_token_sealed: string
  access_token_sealed: string | null
  access_expires_at: string | null
  busy_calendar_ids: string[]
  write_calendar_id: string
  status: "connected" | "needs_reconnect"
  last_error: string | null
  updated_at: string
}

const COLUMNS = "owner_id,google_email,refresh_token_sealed,access_token_sealed,access_expires_at,busy_calendar_ids,write_calendar_id,status,last_error,updated_at"

export type ConnectionRead = { kind: "none" } | { kind: "unavailable" } | { kind: "connected"; row: ConnectionRow }

const missingTable = (e: { code?: string; message?: string } | null) => !!e && (e.code === "42P01" || e.code === "PGRST205" || /could not find the table|does not exist/i.test(e.message || ""))

export async function readConnection(db: Db, ownerId: string): Promise<ConnectionRead> {
  const { data, error } = await db.from("google_calendar_connections").select(COLUMNS).eq("owner_id", ownerId).maybeSingle()
  /* Before part 410, or a read that failed: Google is simply not used for this request. */
  if (error) return { kind: "unavailable" }
  return data ? { kind: "connected", row: { ...data, busy_calendar_ids: Array.isArray(data.busy_calendar_ids) ? data.busy_calendar_ids : ["primary"] } } : { kind: "none" }
}

export async function saveTokens(db: Db, ownerId: string, tokens: Tokens): Promise<{ ok: boolean; missing?: boolean }> {
  const existing = await readConnection(db, ownerId)
  const refresh = tokens.refreshToken || (existing.kind === "connected" ? openSecret(existing.row.refresh_token_sealed) : null)
  if (!refresh) return { ok: false }
  const row = {
    owner_id: ownerId,
    google_email: tokens.email,
    refresh_token_sealed: sealSecret(refresh),
    access_token_sealed: sealSecret(tokens.accessToken),
    access_expires_at: new Date(tokens.expiresAt).toISOString(),
    scopes: tokens.scope.slice(0, 2000),
    status: "connected",
    last_error: null,
    updated_at: new Date().toISOString(),
  }
  const { error } = await db.from("google_calendar_connections").upsert(row, { onConflict: "owner_id" })
  if (error) return { ok: false, missing: missingTable(error) }
  return { ok: true }
}

async function markReconnect(db: Db, ownerId: string, reason: string) {
  await db.from("google_calendar_connections").update({ status: "needs_reconnect", last_error: reason.slice(0, 500), updated_at: new Date().toISOString() }).eq("owner_id", ownerId)
}

/** A live access token, refreshed when it has under a minute left. Null when there is no usable connection. */
export async function accessToken(db: Db, row: ConnectionRow, fetcher: Fetch = fetch, now = Date.now()): Promise<string | null> {
  const config = googleCalendarConfig()
  if (!config || row.status !== "connected") return null
  const cached = openSecret(row.access_token_sealed)
  if (cached && row.access_expires_at && Date.parse(row.access_expires_at) - 60_000 > now) return cached
  const refresh = openSecret(row.refresh_token_sealed)
  if (!refresh) {
    await markReconnect(db, row.owner_id, "The saved Google sign in could not be read.")
    return null
  }
  try {
    const fresh = await refreshAccess(fetcher, config, refresh, now)
    await db
      .from("google_calendar_connections")
      .update({ access_token_sealed: sealSecret(fresh.accessToken), access_expires_at: new Date(fresh.expiresAt).toISOString(), updated_at: new Date(now).toISOString(), last_error: null })
      .eq("owner_id", row.owner_id)
    return fresh.accessToken
  } catch (e) {
    if (e instanceof GoogleCalendarError && e.reconnect) await markReconnect(db, row.owner_id, e.message)
    return null
  }
}

/** The creator's Google busy times in range, each padded by the booking buffer on both sides. Empty when not connected or when Google does not answer. */
export async function googleBusy(db: Db, ownerId: string, fromMs: number, toMs: number, bufferMinutes = 0, fetcher: Fetch = fetch): Promise<BusyInterval[]> {
  if (!googleCalendarConfig()) return []
  const conn = await readConnection(db, ownerId).catch(() => ({ kind: "unavailable" }) as const)
  if (conn.kind !== "connected") return []
  const token = await accessToken(db, conn.row, fetcher)
  if (!token) return []
  try {
    const pad = bufferMinutes * 60_000
    return (await freeBusy(fetcher, token, conn.row.busy_calendar_ids, fromMs, toMs)).map((b) => ({ start: b.start - pad, end: b.end + pad }))
  } catch (e) {
    if (e instanceof GoogleCalendarError && e.reconnect) await markReconnect(db, ownerId, e.message)
    console.warn("[google-calendar] busy times not read:", e instanceof Error ? e.message.slice(0, 200) : "error")
    return []
  }
}

export type SyncOutcome = { kind: "skipped" } | { kind: "written"; event: WrittenEvent; calendarId: string } | { kind: "deleted" } | { kind: "failed"; reason: string }

/**
 * Keeps a booking's Google event in step with it: written when it is
 * confirmed, moved when it moves, removed when it is cancelled or
 * declined. The event id (and a Meet's address) is saved on the booking.
 */
export async function syncBookingEvent(
  db: Db,
  input: { ownerId: string; booking: { id: string; status: string; google_event_id: string | null; google_calendar_id: string | null }; event: EventInput },
  fetcher: Fetch = fetch,
): Promise<SyncOutcome> {
  if (!googleCalendarConfig()) return { kind: "skipped" }
  const conn = await readConnection(db, input.ownerId).catch(() => ({ kind: "unavailable" }) as const)
  if (conn.kind !== "connected") return { kind: "skipped" }
  const token = await accessToken(db, conn.row, fetcher)
  if (!token) return { kind: "failed", reason: "Google Calendar needs to be connected again." }
  const { booking } = input
  const calendarId = booking.google_calendar_id || conn.row.write_calendar_id || "primary"
  try {
    if (booking.status === "cancelled" || booking.status === "declined") {
      if (!booking.google_event_id) return { kind: "skipped" }
      await deleteEvent(fetcher, token, calendarId, booking.google_event_id)
      await db.from("form_bookings").update({ google_event_id: null, updated_at: new Date().toISOString() }).eq("id", booking.id).eq("owner_id", input.ownerId)
      return { kind: "deleted" }
    }
    if (booking.status !== "confirmed") return { kind: "skipped" }
    const event = booking.google_event_id ? await moveEvent(fetcher, token, calendarId, booking.google_event_id, input.event) : await insertEvent(fetcher, token, calendarId, input.event)
    const patch: Record<string, unknown> = { google_event_id: event.id, google_calendar_id: calendarId, updated_at: new Date().toISOString() }
    if (event.meetUrl && input.event.meet) {
      const { data } = await db.from("form_bookings").select("location").eq("id", booking.id).eq("owner_id", input.ownerId).maybeSingle()
      patch.location = { ...((data?.location as Record<string, unknown> | null) || { kind: "google_meet" }), meet_url: event.meetUrl }
    }
    await db.from("form_bookings").update(patch).eq("id", booking.id).eq("owner_id", input.ownerId)
    return { kind: "written", event, calendarId }
  } catch (e) {
    if (e instanceof GoogleCalendarError && e.reconnect) await markReconnect(db, input.ownerId, e.message)
    const reason = e instanceof Error ? e.message.slice(0, 300) : "Google Calendar did not answer."
    console.warn("[google-calendar] booking event not synced:", booking.id, reason)
    return { kind: "failed", reason }
  }
}
