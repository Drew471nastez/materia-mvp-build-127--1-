import { createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto"

/*
  GOOGLE CALENDAR, AS STORELIB ASKS IT (round AR).

  Three-legged OAuth for the creator's own Google account, on the server
  only: the browser is sent to Google's consent screen with a signed state,
  Google sends it back to /api/google-calendar/callback with a code, and
  the server trades the code for tokens. The refresh token is sealed before
  it is stored (lib/google-calendar/server.ts) and never reaches a browser.

  What is asked, each with the documented endpoint:
    calendarList  GET  /calendar/v3/users/me/calendarList    the calendars to choose from
    freeBusy      POST /calendar/v3/freeBusy                 busy times that block slots
    events        POST/PATCH/DELETE /calendar/v3/calendars/<id>/events[/<event>]
                  with conferenceDataVersion=1 when a Meet is wanted

  Every call takes `fetch` as an argument, so tests replay recorded
  responses and never reach Google. No Google library is bundled.

  Env: GOOGLE_CALENDAR_CLIENT_ID and GOOGLE_CALENDAR_CLIENT_SECRET. With
  either unset, googleCalendarConfig() is null and every screen says Google
  Calendar is not set up yet.
*/

export const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
export const TOKEN_URL = "https://oauth2.googleapis.com/token"
export const REVOKE_URL = "https://oauth2.googleapis.com/revoke"
export const API = "https://www.googleapis.com/calendar/v3"
export const SCOPES = ["openid", "email", "https://www.googleapis.com/auth/calendar.readonly", "https://www.googleapis.com/auth/calendar.events"]
export const CALLBACK_PATH = "/api/google-calendar/callback"

export type Fetch = (input: string, init?: RequestInit) => Promise<Response>

export interface GoogleCalendarConfig {
  clientId: string
  clientSecret: string
}

export function googleCalendarConfig(env: Record<string, string | undefined> = process.env): GoogleCalendarConfig | null {
  const clientId = env.GOOGLE_CALENDAR_CLIENT_ID?.trim()
  const clientSecret = env.GOOGLE_CALENDAR_CLIENT_SECRET?.trim()
  return clientId && clientSecret ? { clientId, clientSecret } : null
}

export class GoogleCalendarError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** The grant was revoked or expired: the creator has to connect again. */
    readonly reconnect = false,
  ) {
    super(message)
  }
}

/* ── The state carried through Google's consent screen ───────────────────── */

function stateKey(env: Record<string, string | undefined> = process.env): Buffer {
  const own = env.COMMERCE_SECRETS_KEY
  const base = own || env.SUPABASE_SERVICE_ROLE_KEY
  if (!base) throw new Error("No key to sign the Google state with: set COMMERCE_SECRETS_KEY")
  return Buffer.from(hkdfSync("sha256", Buffer.from(base, "utf8"), Buffer.from("storelib-google-calendar-state"), Buffer.from(own ? "own" : "service"), 32))
}

/**
 * The state names the signed in user, a nonce also kept in an http only
 * cookie, and an expiry, signed: the callback refuses a state made for
 * someone else, one from another browser, or one older than ten minutes.
 */
export function makeState(userId: string, now = Date.now()): { state: string; nonce: string } {
  const nonce = randomBytes(16).toString("base64url")
  const body = Buffer.from(JSON.stringify({ u: userId, n: nonce, e: now + 10 * 60_000 })).toString("base64url")
  const mac = createHmac("sha256", stateKey()).update(body).digest("base64url")
  return { state: `${body}.${mac}`, nonce }
}

export function readState(state: unknown, nonce: unknown, userId: string, now = Date.now()): boolean {
  if (typeof state !== "string" || typeof nonce !== "string" || state.length > 600) return false
  const [body, mac] = state.split(".")
  if (!body || !mac) return false
  const want = Buffer.from(createHmac("sha256", stateKey()).update(body).digest("base64url"))
  const got = Buffer.from(mac)
  if (want.length !== got.length || !timingSafeEqual(want, got)) return false
  try {
    const v = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { u?: string; n?: string; e?: number }
    return v.u === userId && v.n === nonce && typeof v.e === "number" && v.e > now
  } catch {
    return false
  }
}

export function consentUrl(config: GoogleCalendarConfig, redirectUri: string, state: string): string {
  const q = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  })
  return `${AUTH_URL}?${q.toString()}`
}

/* ── Tokens ──────────────────────────────────────────────────────────────── */

export interface Tokens {
  accessToken: string
  expiresAt: number
  refreshToken: string | null
  scope: string
  email: string | null
}

/** The email in an id_token Google just returned over TLS from its own token endpoint (OpenID Connect 3.1.3.7: no further check needed for a direct answer). */
export function emailOfIdToken(idToken: unknown): string | null {
  if (typeof idToken !== "string") return null
  const part = idToken.split(".")[1]
  if (!part) return null
  try {
    const claims = JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as { email?: unknown }
    return typeof claims.email === "string" && claims.email.includes("@") ? claims.email.slice(0, 320) : null
  } catch {
    return null
  }
}

async function tokenCall(fetcher: Fetch, body: Record<string, string>, now: number): Promise<Tokens> {
  const res = await fetcher(TOKEN_URL, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body).toString() })
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null
  if (!res.ok || !data || typeof data.access_token !== "string") {
    const code = typeof data?.error === "string" ? data.error : ""
    throw new GoogleCalendarError(code === "invalid_grant" ? "Google stopped accepting this connection. Connect Google Calendar again." : "Google did not answer the sign in. Try again.", res.status, code === "invalid_grant")
  }
  return {
    accessToken: data.access_token,
    expiresAt: now + Math.max(60, Number(data.expires_in) || 3600) * 1000,
    refreshToken: typeof data.refresh_token === "string" ? data.refresh_token : null,
    scope: typeof data.scope === "string" ? data.scope : "",
    email: emailOfIdToken(data.id_token),
  }
}

export function exchangeCode(fetcher: Fetch, config: GoogleCalendarConfig, code: string, redirectUri: string, now = Date.now()): Promise<Tokens> {
  return tokenCall(fetcher, { code, client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" }, now)
}

export function refreshAccess(fetcher: Fetch, config: GoogleCalendarConfig, refreshToken: string, now = Date.now()): Promise<Tokens> {
  return tokenCall(fetcher, { refresh_token: refreshToken, client_id: config.clientId, client_secret: config.clientSecret, grant_type: "refresh_token" }, now)
}

export async function revokeToken(fetcher: Fetch, token: string): Promise<void> {
  await fetcher(REVOKE_URL, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token }).toString() }).catch(() => null)
}

/* ── Calendars ───────────────────────────────────────────────────────────── */

async function call<T>(fetcher: Fetch, token: string, path: string, init: RequestInit = {}): Promise<T | null> {
  const res = await fetcher(`${API}${path}`, { ...init, headers: { authorization: `Bearer ${token}`, accept: "application/json", ...(init.body ? { "content-type": "application/json" } : {}), ...(init.headers || {}) } })
  if (res.status === 204) return null
  const data = (await res.json().catch(() => null)) as T | { error?: { message?: string } } | null
  if (!res.ok) {
    const message = (data as { error?: { message?: string } } | null)?.error?.message
    throw new GoogleCalendarError(message ? `Google Calendar: ${String(message).slice(0, 200)}` : `Google Calendar answered ${res.status}.`, res.status, res.status === 401)
  }
  return data as T
}

export interface CalendarChoice {
  id: string
  name: string
  primary: boolean
  canWrite: boolean
  color: string | null
}

export async function listCalendars(fetcher: Fetch, token: string): Promise<CalendarChoice[]> {
  const data = await call<{ items?: { id?: string; summary?: string; summaryOverride?: string; primary?: boolean; accessRole?: string; backgroundColor?: string }[] }>(fetcher, token, "/users/me/calendarList?minAccessRole=freeBusyReader&maxResults=100")
  return (data?.items || [])
    .filter((c) => typeof c.id === "string" && c.id)
    .map((c) => ({
      id: c.id!,
      name: (c.summaryOverride || c.summary || c.id || "").slice(0, 200),
      primary: c.primary === true,
      canWrite: c.accessRole === "owner" || c.accessRole === "writer",
      color: typeof c.backgroundColor === "string" && /^#[0-9a-f]{6}$/i.test(c.backgroundColor) ? c.backgroundColor : null,
    }))
    .sort((a, b) => Number(b.primary) - Number(a.primary) || a.name.localeCompare(b.name))
}

export interface BusyInterval {
  start: number
  end: number
}

/** Busy times of these calendars in [fromMs, toMs). A calendar Google answers with an error for adds no busy times (the caller logs it). */
export async function freeBusy(fetcher: Fetch, token: string, calendarIds: string[], fromMs: number, toMs: number): Promise<BusyInterval[]> {
  if (!calendarIds.length) return []
  const data = await call<{ calendars?: Record<string, { busy?: { start?: string; end?: string }[]; errors?: unknown[] }> }>(fetcher, token, "/freeBusy", {
    method: "POST",
    body: JSON.stringify({ timeMin: new Date(fromMs).toISOString(), timeMax: new Date(toMs).toISOString(), items: calendarIds.slice(0, 20).map((id) => ({ id })) }),
  })
  const out: BusyInterval[] = []
  for (const cal of Object.values(data?.calendars || {})) {
    for (const b of cal.busy || []) {
      const start = Date.parse(b.start || "")
      const end = Date.parse(b.end || "")
      if (Number.isFinite(start) && Number.isFinite(end) && end > start) out.push({ start, end })
    }
  }
  return out.sort((a, b) => a.start - b.start)
}

export interface EventInput {
  bookingId: string
  title: string
  description: string
  startsAt: string
  endsAt: string
  timeZone: string
  location?: string | null
  attendeeEmail?: string | null
  attendeeName?: string | null
  meet?: boolean
}

export interface WrittenEvent {
  id: string
  meetUrl: string | null
  htmlLink: string | null
}

function eventBody(e: EventInput) {
  return {
    summary: e.title.slice(0, 300),
    description: e.description.slice(0, 7000),
    start: { dateTime: e.startsAt, timeZone: e.timeZone },
    end: { dateTime: e.endsAt, timeZone: e.timeZone },
    ...(e.location ? { location: e.location.slice(0, 500) } : {}),
    ...(e.attendeeEmail ? { attendees: [{ email: e.attendeeEmail, ...(e.attendeeName ? { displayName: e.attendeeName.slice(0, 120) } : {}) }] } : {}),
    extendedProperties: { private: { storelib_booking: e.bookingId } },
    reminders: { useDefault: true },
  }
}

function written(data: { id?: string; hangoutLink?: string; htmlLink?: string; conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] } } | null): WrittenEvent {
  if (!data?.id) throw new GoogleCalendarError("Google Calendar did not return the event.", 502)
  const video = data.conferenceData?.entryPoints?.find((p) => p.entryPointType === "video")?.uri || data.hangoutLink || null
  return { id: data.id, meetUrl: video && /^https:\/\/meet\.google\.com\//.test(video) ? video : null, htmlLink: data.htmlLink || null }
}

const calendarPath = (calendarId: string) => `/calendars/${encodeURIComponent(calendarId)}/events`

/** A new event. With `meet`, Google makes a Meet for it (conferenceDataVersion=1). Invitations are Storelib's own email, so Google sends none. */
export async function insertEvent(fetcher: Fetch, token: string, calendarId: string, e: EventInput): Promise<WrittenEvent> {
  const body = {
    ...eventBody(e),
    ...(e.meet ? { conferenceData: { createRequest: { requestId: `storelib-${e.bookingId}`, conferenceSolutionKey: { type: "hangoutsMeet" } } } } : {}),
  }
  return written(await call(fetcher, token, `${calendarPath(calendarId)}?conferenceDataVersion=1&sendUpdates=none`, { method: "POST", body: JSON.stringify(body) }))
}

/** A moved booking: the same event, its new time. */
export async function moveEvent(fetcher: Fetch, token: string, calendarId: string, eventId: string, e: Pick<EventInput, "startsAt" | "endsAt" | "timeZone">): Promise<WrittenEvent> {
  return written(
    await call(fetcher, token, `${calendarPath(calendarId)}/${encodeURIComponent(eventId)}?conferenceDataVersion=1&sendUpdates=none`, {
      method: "PATCH",
      body: JSON.stringify({ start: { dateTime: e.startsAt, timeZone: e.timeZone }, end: { dateTime: e.endsAt, timeZone: e.timeZone } }),
    }),
  )
}

/** A cancelled booking: its event removed. An event already gone (404, 410) is fine. */
export async function deleteEvent(fetcher: Fetch, token: string, calendarId: string, eventId: string): Promise<void> {
  try {
    await call(fetcher, token, `${calendarPath(calendarId)}/${encodeURIComponent(eventId)}?sendUpdates=none`, { method: "DELETE" })
  } catch (e) {
    if (e instanceof GoogleCalendarError && (e.status === 404 || e.status === 410)) return
    throw e
  }
}
