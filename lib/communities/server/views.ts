import "server-only"

/**
 * ===========================================================================
 *  A COMMUNITY'S VIEWS: ONE PER VISITOR PER DAY
 * ===========================================================================
 * The eye on a community's card in Explore is `communities.view_count`, an
 * all time count kept by the database (part 87): community_record_view
 * writes one row per visitor, community and UTC day, and adds one to the
 * count only when that row is new. A reload, a second tab or coming back
 * after lunch is the same view; tomorrow is another.
 *
 * WHO THE VISITOR IS, without keeping anything that says who they are. The
 * key is an HMAC under a server secret of, in this order:
 *
 *   u:<user id>          signed in: the same person on every device
 *   b:<browser id>       signed out with analytics allowed: the first party
 *                        id the browser already keeps (materia_visitor, or
 *                        the server's visitor_id)
 *   a:<daily hash>       signed out without one: lib/analytics/anon-visit's
 *                        keyed hash of the address and the browser, which
 *                        changes every UTC day, the length of a view anyway
 *
 * Only the HMAC is stored. No raw IP, account id or cookie value leaves
 * this file, and a bot's user agent is not counted at all.
 *
 * NEVER IN THE PAGE'S WAY. Round 33: a page of the community that is on a
 * screen tells app/api/community/<id>/visit once a day (the layout's visit
 * beacon), which calls recordVisit in ./record-view.ts after the page has
 * drawn. A failure is logged and forgotten. The community's owner looking
 * at their own page is not a view.
 */
import { createHmac, randomBytes } from "node:crypto"
import { anonVisitorId } from "@/lib/analytics/anon-visit"
import { isBotAgent } from "@/lib/analytics/user-agent"
import { missing, reasonOf, type Db } from "./db"

const PROCESS_SECRET = randomBytes(32).toString("hex")

function secret(): string {
  return process.env.COMMUNITY_VIEW_SECRET || process.env.ANALYTICS_VISITOR_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || PROCESS_SECRET
}

/** A browser's own id, as the analytics code writes it: letters, digits, _ and -, at most 80. */
const BROWSER_ID = /^[A-Za-z0-9_-]{6,80}$/

export interface VisitorFacts {
  userId: string | null
  /** The first party browser id, when there is one (materia_visitor or visitor_id). */
  browserId?: string | null
  ip?: string | null
  userAgent?: string | null
}

/**
 * The key a view is stored under, or null when there is nothing stable to
 * key it by (no account, no browser id, no address) or the visitor is a bot.
 * 64 hex characters: inside the 16 to 128 the table allows.
 */
export function visitorKey(facts: VisitorFacts, communityId: string, now: number = Date.now(), key: string = secret()): string | null {
  if (!facts.userId && isBotAgent(facts.userAgent)) return null
  let subject: string | null = null
  if (facts.userId) subject = `u:${facts.userId}`
  else if (facts.browserId && BROWSER_ID.test(facts.browserId)) subject = `b:${facts.browserId}`
  else {
    const anon = anonVisitorId({ ip: facts.ip ?? null, userAgent: facts.userAgent ?? null, creatorId: communityId, now })
    if (anon) subject = `a:${anon}`
  }
  if (!subject) return null
  return createHmac("sha256", key).update(`community-view:${subject}`).digest("hex")
}

export type ViewOutcome = "counted" | "repeat" | "skipped" | "unavailable"

/**
 * HOW THE VISIT ARRIVED, kept with the day's row once SQL part 184 has run
 * (community_record_visit): the source in one word and the site that sent
 * the visitor (lib/communities/visit-source.ts), the kind of device, the
 * country, and whether they were already a member, so the community's
 * Analytics can say where visits came from and how many non-members joined.
 * Nothing in it says who the visitor is.
 */
export interface VisitFacts {
  source: string | null
  referrer: string | null
  device: "mobile" | "tablet" | "desktop" | null
  country: string | null
  member: boolean | null
}

/** Whether community_record_visit is there; false once it was not, until the server restarts. */
let visitReady = true

/** For tests: ask for community_record_visit again. */
export function resetVisitReady(): void {
  visitReady = true
}

/**
 * One view, through the database's own once a day rule. With `facts`, the
 * day's row keeps them (part 184); before that part, the view is counted
 * the way part 87 counts it, without them.
 */
export async function recordCommunityView(db: Db, communityId: string, key: string | null, facts?: VisitFacts | null): Promise<ViewOutcome> {
  if (!key) return "skipped"
  try {
    if (facts && visitReady) {
      const { data, error } = await db.rpc("community_record_visit", {
        p_community: communityId,
        p_visitor: key,
        p_source: facts.source,
        p_referrer: facts.referrer,
        p_device: facts.device,
        p_country: facts.country,
        p_member: facts.member,
      })
      if (!error) return data === true ? "counted" : "repeat"
      if (!missing(error)) {
        console.error(`[communities] visit: ${reasonOf(error)}`)
        return "unavailable"
      }
      visitReady = false
    }
    const { data, error } = await db.rpc("community_record_view", { p_community: communityId, p_visitor: key })
    if (error) {
      if (!missing(error)) console.error(`[communities] view: ${reasonOf(error)}`)
      return "unavailable"
    }
    return data === true ? "counted" : "repeat"
  } catch (e) {
    console.error(`[communities] view: ${reasonOf(e)}`)
    return "unavailable"
  }
}

/** The cron's tidy up: day rows older than three days are no longer needed to tell a repeat, and the nightly count has added up their facts (part 184, ../analytics.ts rollupTraffic). */
export const VIEW_DAYS_KEPT = 3

export async function purgeOldViewDays(db: Db, now: number = Date.now()): Promise<void> {
  const cutoff = new Date(now - VIEW_DAYS_KEPT * 86_400_000).toISOString().slice(0, 10)
  try {
    const { error } = await db.from("community_view_days").delete().lt("day", cutoff)
    if (error && !missing(error)) console.error(`[communities] view days purge: ${reasonOf(error)}`)
  } catch (e) {
    console.error(`[communities] view days purge: ${reasonOf(e)}`)
  }
}
