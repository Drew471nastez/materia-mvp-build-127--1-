import "server-only"

/**
 * ===========================================================================
 *  ONE COMMUNITY PAGE VIEW, FROM THE PAGE'S OWN SCRIPT
 * ===========================================================================
 * ./views.ts says what a view is: one a visitor a community a UTC day.
 *
 * ROUND 33: COUNTED BY THE PAGE, NOT BY THE RENDER. The feed and /about
 * used to count a view while they rendered on the server. That missed
 * every other way in (a post from Instagram, a space from a notification,
 * an event, the invite landing, Learn), and it counted what nobody saw:
 * Explore asks for a whole community page when a pointer rests on its card
 * (explore-communities-results.tsx, router.prefetch "full"), so every card
 * a mouse crossed was a visit from Explore, and the click that followed,
 * answered from that prefetch, was no request at all. Now every page under
 * /community/<slug> (and its own domain) carries the beacon
 * (components/community/public/visit-beacon.tsx, from the community's
 * layout): when a page is really on a screen, it posts what it knows once a
 * day to app/api/community/<id>/visit, which calls recordVisit here.
 *
 * WHAT IS KEPT WITH THE VIEW (SQL part 184): the source and the site that
 * sent the visitor (lib/communities/visit-source.ts, from the referrer the
 * page's request carried and the address with its utm tags), the kind of
 * device from the browser's signature (an iPad by its touch screen), the
 * country from the edge's header, and whether a signed in visitor is
 * already a member. Nothing in them says who the visitor is.
 *
 * NOT COUNTED: the owner, or the store account the community belongs to,
 * on their own community; a draft or a suspended community; anything that
 * is not a person's browser (isPersonBrowser).
 */
import { clientIp } from "@/lib/analytics/anon-visit"
import { getMainDomain } from "@/lib/url-helpers"
import { isPersonBrowser, visitCountry, visitDevice, visitSource } from "@/lib/communities/visit-source"
import { reasonOf, type Db } from "./db"
import { recordCommunityView, visitorKey, type ViewOutcome, type VisitFacts, type VisitorFacts } from "./views"

/** Whether a signed in visitor is an active member of the community. Null when it cannot be told. */
async function isMember(db: Db, communityId: string, userId: string | null): Promise<boolean | null> {
  if (!userId) return false
  try {
    const { data, error } = await db.from("community_members").select("status").eq("community_id", communityId).eq("user_id", userId).maybeSingle()
    if (error) return null
    return (data as { status?: string } | null)?.status === "active"
  } catch {
    return null
  }
}

/** Whether this signed in person owns the community, or is the store account it belongs to. */
async function isOwnerOf(db: Db, community: VisitCommunity, userId: string | null): Promise<boolean> {
  if (!userId) return false
  if (community.owner_user_id === userId) return true
  if (!community.creator_id) return false
  try {
    const { data } = await db.from("creators").select("user_id").eq("id", community.creator_id).maybeSingle()
    return (data as { user_id?: string } | null)?.user_id === userId
  } catch {
    return false
  }
}

/** What the beacon sends: the page's address with its query, the page it came from, and the screen's touch points. */
export interface VisitBody {
  path: string | null
  referrer: string | null
  touch: number | null
}

/** The body, tidied: a path on this site, an http(s) referrer, a small whole number. Anything else is null. */
export function readVisitBody(raw: unknown): VisitBody {
  const b = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  const path = typeof b.path === "string" && b.path.startsWith("/") && !b.path.startsWith("//") ? b.path.slice(0, 600) : null
  const referrer = typeof b.referrer === "string" && /^https?:\/\//i.test(b.referrer) ? b.referrer.slice(0, 600) : null
  const touch = typeof b.touch === "number" && Number.isInteger(b.touch) && b.touch >= 0 && b.touch <= 32 ? b.touch : null
  return { path, referrer, touch }
}

export interface VisitCommunity {
  id: string
  slug: string
  status: string
  owner_user_id?: string | null
  creator_id?: string | null
}

export interface VisitRequest {
  headers: Headers
  /** The first party browser id, when there is one (materia_visitor, or the server's visitor_id). */
  browserId: string | null
  userId: string | null
  body: VisitBody
}

export type VisitOutcome = ViewOutcome | "owner" | "not_a_person" | "not_published"

/** The facts a view is kept with, from the request and what the page said. Pure apart from its inputs; the tests read it. */
export function visitFactsOf(req: Pick<VisitRequest, "headers" | "body">, slug: string, mainDomain: string = getMainDomain()): Omit<VisitFacts, "member"> {
  const ua = req.headers.get("user-agent")
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host")
  const from = visitSource({ referer: req.body.referrer, path: req.body.path, slug, mainDomain, userAgent: ua, pageHost: host })
  return { source: from.source, referrer: from.referrer, device: visitDevice(ua, req.body.touch), country: visitCountry(req.headers) }
}

/** One page view: counted once a visitor a day, or why not. Never throws. */
export async function recordVisit(db: Db, community: VisitCommunity, req: VisitRequest): Promise<VisitOutcome> {
  try {
    if (community.status !== "published") return "not_published"
    const ua = req.headers.get("user-agent")
    if (!isPersonBrowser(ua)) return "not_a_person"
    if (await isOwnerOf(db, community, req.userId)) return "owner"
    const facts: VisitorFacts = { userId: req.userId, browserId: req.browserId, ip: clientIp(req.headers), userAgent: ua }
    const key = visitorKey(facts, community.id)
    if (!key) return "skipped"
    const visit = visitFactsOf(req, community.slug)
    return await recordCommunityView(db, community.id, key, { ...visit, member: await isMember(db, community.id, req.userId) })
  } catch (e) {
    console.error(`[communities] visit: ${reasonOf(e)}`)
    return "unavailable"
  }
}
