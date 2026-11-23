import "server-only"

/**
 * ===========================================================================
 *  TAKING A TAB'S BATCH, CHEAPLY: AT MOST ONE DATABASE CALL, OFTEN NONE
 * ===========================================================================
 * /api/live hands every batch here (components/platform/live-beacon.tsx sends
 * one a minute while the tab is shown, one as it hides). In order:
 *
 *   1. not ours: a body that does not parse, a bad session id
 *   2. not a person: a robot's signature (lib/analytics/user-agent), Vercel's
 *      bot header when the platform adds one, a prefetch, another site
 *   3. too fast: more than six batches a minute from one tab, in memory
 *   4. part 477 missing, remembered for a minute: nothing asked
 *   5. a heartbeat with nothing new from a tab this server wrote less than
 *      55 seconds ago: nothing asked
 *   6. consent, from the visitor's own record (never the page's word), and
 *      Global Privacy Control and Do Not Track from the request's headers
 *   7. the account, only with 6 and a sign in on the request, read from the
 *      token's signature (lib/auth/route-user, no Auth round trip), kept per
 *      tab for ten minutes
 *   8. a purchase: the receipt's token looked up in `orders` (completed),
 *      kept as the order's id; the token itself is never stored
 *   9. ONE call: part 477's `platform_live_ingest`
 *
 * SAMPLING. With LIVE_ANON_SAMPLE below 1 (an environment variable, 1 by
 * default), anonymous tabs are kept by a stable hash of their id: the same
 * tab is always in or always out, and the admin scales the counts it shows.
 * Signed in and consenting tabs are always kept. It is the lever for 10,000
 * people online at once (the report has the numbers).
 *
 * Never throws: the route answers 204 whatever happened.
 */
import { createHash } from "node:crypto"

import { loggable } from "@/lib/admin/plain-reason"
import { countryOf, deviceOf } from "@/lib/activity/creator-activity"
import { isMissingActivity } from "@/lib/activity/creator-activity-server"
import { isBotAgent, parseUserAgent } from "@/lib/analytics/user-agent"
import { CONSENT_COOKIE, allows, parse } from "@/lib/consent/consent"
import { carriesSignIn } from "@/lib/auth/no-session-paths"
import { rememberRung, rememberedRung } from "@/lib/supabase/missing-memory"

import { LIVE_PRESENCE_EVERY_MS, parseLiveBatch, type HostKind, type LiveEvent } from "./live"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

const INGEST_KEY = "platform_live_ingest"
const PURGE_KEY = "platform_live_purge"
/** After Supabase says part 477 is missing, batches are dropped for this long, then it is asked again. */
export const LIVE_MISSING_MS = 60_000
/** More than this many batches a minute from one tab is not the beacon. */
export const LIVE_PER_MINUTE = 6
/** How long this server remembers a tab's account, so a signed in tab is not read every minute. */
const ACCOUNT_MEMORY_MS = 10 * 60_000

const wroteAt = new Map<string, number>()
const perMinute = new Map<string, { since: number; count: number }>()
const accountOf = new Map<string, { userId: string | null; at: number }>()

export function forgetLiveMemory(): void {
  wroteAt.clear()
  perMinute.clear()
  accountOf.clear()
}

function tooFast(sid: string, now: number): boolean {
  const e = perMinute.get(sid)
  if (!e || now - e.since >= 60_000) {
    if (perMinute.size > 20_000) perMinute.clear()
    perMinute.set(sid, { since: now, count: 1 })
    return false
  }
  e.count += 1
  return e.count > LIVE_PER_MINUTE
}

type Headers = { get(name: string): string | null }

/**
 * Not a person. The signature list is the same one creator analytics uses.
 * Vercel's Bot Protection marks requests it has identified when it is on for
 * the project; when no such header arrives this costs nothing.
 */
export function isBotRequest(headers: Headers): boolean {
  if (isBotAgent(headers.get("user-agent"))) return true
  const verified = headers.get("x-vercel-verified-bot") ?? headers.get("x-vercel-bot")
  if (verified && verified !== "0" && verified.toLowerCase() !== "false") return true
  const purpose = `${headers.get("purpose") ?? ""} ${headers.get("sec-purpose") ?? ""}`.toLowerCase()
  if (/prefetch|prerender/.test(purpose)) return true
  return false
}

/** Sent by a page of another site: the beacon only ever posts to its own origin. */
export function isOtherSite(headers: Headers): boolean {
  const site = headers.get("sec-fetch-site")
  return !!site && site !== "same-origin"
}

/** The browser asked not to be tracked: Global Privacy Control (Sec-GPC: 1) or Do Not Track (DNT: 1). */
export function optedOut(headers: Headers): boolean {
  return headers.get("sec-gpc") === "1" || headers.get("dnt") === "1"
}

/**
 * May this tab be tied to an account? Only with the visitor's own yes to
 * analytics (the storelib_consent cookie, read on the server) and no opt out
 * signal from the browser. Without it the tab is anonymous: a random id
 * that dies with the tab, and nothing else.
 */
export function mayLink(consentCookie: string | undefined, headers: Headers, now: number): boolean {
  return allows(parse(consentCookie, now), "analytics") && !optedOut(headers)
}

/** Kept when its hash falls under the rate: stable per tab. */
export function sampledIn(sid: string, rate: number): boolean {
  if (!(rate < 1)) return true
  if (!(rate > 0)) return false
  const n = createHash("sha256").update(sid).digest().readUInt32BE(0)
  return n / 0x1_0000_0000 < rate
}

export function sampleRate(): number {
  const raw = Number(process.env.LIVE_ANON_SAMPLE)
  return Number.isFinite(raw) && raw > 0 && raw <= 1 ? raw : 1
}

/** The host a creator's website was opened on; Storelib's own is not kept. */
export function hostKindOf(host: string | null, mainDomain: string): { kind: HostKind; host: string | null } {
  const h = (host ?? "").split(":")[0].toLowerCase()
  const main = mainDomain.toLowerCase()
  if (!h || h === main || h === `www.${main}` || h === "localhost" || h === "127.0.0.1" || h.endsWith(".vercel.app")) return { kind: "storelib", host: null }
  return { kind: "site", host: /^[a-z0-9][a-z0-9.-]{0,99}$/.test(h) ? h : null }
}

export type LiveIngestInput = {
  body: unknown
  headers: Headers
  cookie: (name: string) => string | undefined
  cookieNames: string[]
  now: number
  mainDomain: string
  /** The signed in account, read from the token's signature; only called when consent allows. */
  account: () => Promise<string | null>
  sample?: number
}

export type LiveOutcome = "written" | "skipped" | "bot" | "refused" | "sampled_out" | "missing" | "failed"

/** A receipt's token to the order it is, when the order is paid and recent. Never stored. */
async function orderOfReceipt(db: Db, token: string, now: number): Promise<string | null> {
  try {
    const { data, error } = await db.from("orders").select("id, status, created_at").eq("receipt_token", token).maybeSingle()
    if (error || !data) return null
    const made = Date.parse(data.created_at ?? "")
    if (data.status !== "completed" || !Number.isFinite(made) || now - made > 24 * 3_600_000) return null
    return typeof data.id === "string" ? data.id : null
  } catch {
    return null
  }
}

export async function ingestLive(db: Db, input: LiveIngestInput): Promise<{ outcome: LiveOutcome; events: LiveEvent[]; linked: boolean; args?: Record<string, unknown> }> {
  const { kind, host } = hostKindOf(input.headers.get("host"), input.mainDomain)
  const batch = parseLiveBatch(input.body, input.now, kind)
  if (!batch) return { outcome: "refused", events: [], linked: false }
  if (isBotRequest(input.headers)) return { outcome: "bot", events: [], linked: false }
  if (isOtherSite(input.headers)) return { outcome: "refused", events: [], linked: false }
  if (tooFast(batch.sid, input.now)) return { outcome: "refused", events: [], linked: false }

  const consented = mayLink(input.cookie(CONSENT_COOKIE), input.headers, input.now)
  if (!consented && !sampledIn(batch.sid, input.sample ?? sampleRate())) return { outcome: "sampled_out", events: batch.events, linked: false }
  if (rememberedRung(INGEST_KEY, input.now) > 0) return { outcome: "missing", events: batch.events, linked: false }

  const last = wroteAt.get(batch.sid)
  if (!batch.events.length && last !== undefined && input.now - last < LIVE_PRESENCE_EVERY_MS) return { outcome: "skipped", events: [], linked: false }

  /* The account: only with consent and a sign in on the request. */
  let userId: string | null = null
  if (consented && carriesSignIn(input.cookieNames)) {
    const known = accountOf.get(batch.sid)
    if (known && input.now - known.at < ACCOUNT_MEMORY_MS) userId = known.userId
    else {
      try {
        userId = await input.account()
      } catch {
        userId = null
      }
      if (accountOf.size > 20_000) accountOf.clear()
      accountOf.set(batch.sid, { userId, at: input.now })
    }
  }

  /* A purchase is kept only as the order it is, checked here. */
  const events: Record<string, unknown>[] = []
  let paidChecked = false
  for (const e of batch.events) {
    if (e.kind === "page") events.push({ k: "p", a: e.area, p: e.path, at: e.at })
    else if (e.name === "order.paid") {
      if (paidChecked || !e.token) continue
      paidChecked = true
      const orderId = await orderOfReceipt(db, e.token, input.now)
      if (orderId) events.push({ k: "a", a: e.area, p: e.path, n: e.name, at: e.at, o: orderId })
    } else events.push({ k: "a", a: e.area, p: e.path, n: e.name, at: e.at })
  }

  const device = deviceOf(input.headers.get("user-agent"), parseUserAgent)
  const args = {
    p_sid: batch.sid,
    p_events: events,
    p_user: userId,
    p_consented: consented,
    p_host: host,
    p_country: countryOf(input.headers),
    p_device: device.device,
    p_os: device.os,
    p_browser: device.browser,
    /* The app's shell from the signature, or the page's own word that it is in the app. */
    p_shell: device.shell !== "web" ? device.shell : batch.app ? (device.os === "Android" ? "android_app" : "ios_app") : "web",
    p_source: batch.source,
  }
  try {
    const { data, error } = await db.rpc(INGEST_KEY, args)
    if (error) {
      if (isMissingActivity(error)) {
        rememberRung(INGEST_KEY, 1, input.now, LIVE_MISSING_MS)
        console.warn("[live] part 477 is not in the database yet; batches are dropped for a minute")
        return { outcome: "missing", events: batch.events, linked: !!userId }
      }
      console.error(`[live] batch not recorded: ${loggable(error)}`)
      return { outcome: "failed", events: batch.events, linked: !!userId }
    }
    if (wroteAt.size > 20_000) wroteAt.clear()
    if ((data as { session?: boolean } | null)?.session || !wroteAt.has(batch.sid)) wroteAt.set(batch.sid, input.now)
    return { outcome: "written", events: batch.events, linked: !!userId, args }
  } catch (e) {
    console.error(`[live] batch not recorded: ${loggable(e)}`)
    return { outcome: "failed", events: batch.events, linked: !!userId }
  }
}

/* ── Retention ─────────────────────────────────────────────────────────── */

export const LIVE_PURGE_BATCH = 5_000
export const LIVE_PURGE_ROUNDS = 20

/** Actions past 30 days, anonymous sessions past 7, the rest past 30, in batches, by the daily cleanup. */
export async function purgeOldLive(db: Db, now = Date.now()): Promise<{ removed: number; missing: boolean; failed: boolean }> {
  if (rememberedRung(PURGE_KEY, now) > 0) return { removed: 0, missing: true, failed: false }
  let removed = 0
  for (let round = 0; round < LIVE_PURGE_ROUNDS; round++) {
    try {
      const { data, error } = await db.rpc(PURGE_KEY, { p_limit: LIVE_PURGE_BATCH })
      if (error) {
        if (isMissingActivity(error)) {
          rememberRung(PURGE_KEY, 1, now, LIVE_MISSING_MS)
          return { removed, missing: true, failed: false }
        }
        console.error(`[live] cleanup stopped: ${loggable(error)}`)
        return { removed, missing: false, failed: true }
      }
      const n = typeof data === "number" ? data : Number(data) || 0
      removed += n
      if (n < LIVE_PURGE_BATCH) break
    } catch (e) {
      console.error(`[live] cleanup stopped: ${loggable(e)}`)
      return { removed, missing: false, failed: true }
    }
  }
  return { removed, missing: false, failed: false }
}
