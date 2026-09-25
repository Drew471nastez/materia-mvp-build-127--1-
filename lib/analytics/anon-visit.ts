import { createHash, createHmac, randomBytes } from "node:crypto"

/**
 * ===========================================================================
 *  A VISIT WITHOUT COOKIES, FOR A VISITOR WHO SAID NO TO ANALYTICS
 * ===========================================================================
 * Server only. Used by app/api/track-view and app/api/track-event.
 *
 * WHAT WAS WRONG. Without analytics consent every page view was given a
 * fresh random visitor and a fresh random session. The reports count a
 * session per session id (lib/analytics/reports sessionKey), so a visitor
 * who declined and opened five pages was five sessions, five visitors and,
 * since the half hour repeat check is by visitor, five views of the same
 * page on five reloads. Sessions were inflated and conversion (orders over
 * sessions) deflated by however many visitors said no.
 *
 * WHAT IT IS NOW, the way Plausible does it. The visitor is a keyed hash of
 * the IP address, the browser's user agent and the creator, under a key
 * that changes every day (UTC):
 *
 *   visitor = "anon_" + HMAC(daily key, ip | user agent | creator)
 *   daily key = HMAC(server secret, "anon-visit:" + the UTC date)
 *
 * Nothing is stored on the visitor's device and nothing is read from it. The
 * IP address and the user agent are never written anywhere: only the hash
 * is, and it cannot be turned back into either. It is different for every
 * creator, so it cannot follow a visitor from one store to another, and it
 * is different every day, so it cannot follow them from one day to the next.
 *
 * A session is then what it is with consent: pages with less than 30
 * minutes between them. The last page this hashed visitor opened on this
 * creator's pages, if it was within 30 minutes, gives its session id; else a
 * new session starts. So the figures count a declining visitor's visit once,
 * as they count everybody else's.
 *
 * WHAT IT COSTS, said plainly. A visitor who declines is a new visitor each
 * UTC day and at a new network or browser, so over several days the number
 * of unique visitors is a little high for them; sessions and conversion are
 * right. Two people behind one IP address with the same browser build on the
 * same day are one visitor, as in Plausible. The daily key is derived from a
 * server secret (ANALYTICS_VISITOR_SECRET, else the service role key) rather
 * than a random salt kept in a table and deleted: whoever holds that secret
 * and a person's exact IP address and user agent could confirm that person
 * visited on a given day. Nobody else can, and changing the secret ends even
 * that. Without any secret (a local build), a random key per process is used,
 * which is private and merely less stable.
 */

/** Pages further apart than this are two visits (lib/analytics-utils sl_asid lasts as long). */
export const ANON_SESSION_MS = 30 * 60_000

const PROCESS_KEY = randomBytes(32).toString("hex")

function serverSecret(): string {
  return process.env.ANALYTICS_VISITOR_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || PROCESS_KEY
}

/** The UTC day, 2026-09-25. The key turns over at UTC midnight. */
export function utcDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10)
}

/** Today's key. Never stored, never sent: derived again on every request. */
export function dailyKey(now: number, secret = serverSecret()): string {
  return createHmac("sha256", secret).update(`anon-visit:${utcDay(now)}`).digest("hex")
}

/** The visitor's address, as the platform in front of the app saw it. */
export function clientIp(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for")
  const first = forwarded?.split(",")[0]?.trim()
  return first || headers.get("x-real-ip")?.trim() || headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() || null
}

/**
 * The declining visitor, for one creator, for one UTC day. Null without an
 * IP address: then there is nothing stable to hash, and the caller counts
 * the view with a throwaway id as before.
 */
export function anonVisitorId(input: { ip: string | null; userAgent: string | null; creatorId: string; now: number; secret?: string }): string | null {
  if (!input.ip) return null
  const key = dailyKey(input.now, input.secret)
  const digest = createHmac("sha256", key).update(`${input.ip}|${input.userAgent ?? ""}|${input.creatorId}`).digest("hex")
  return `anon_${digest.slice(0, 32)}`
}

/** A new visit's id, from the visitor and the moment it began. */
export function anonSessionId(visitorId: string, startedAt: number): string {
  return `s_${createHash("sha256").update(`${visitorId}|${startedAt}`).digest("hex").slice(0, 32)}`
}

type Db = { from: (table: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * The visit this page belongs to: the session of the visitor's last page on
 * this creator's pages if it was under 30 minutes ago, else a new one.
 */
export async function anonSession(db: Db, visitorId: string, creatorId: string, now: number): Promise<string> {
  const { data, error } = await db
    .from("analytics_events")
    .select("session_id, created_at")
    .eq("creator_id", creatorId)
    .eq("visitor_id", visitorId)
    .eq("event_type", "view")
    .gte("created_at", new Date(now - ANON_SESSION_MS).toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
  const last = !error && Array.isArray(data) ? (data[0] as { session_id?: string | null } | undefined) : undefined
  if (last?.session_id) return last.session_id
  return anonSessionId(visitorId, now)
}
