import "server-only"

/**
 * THE PAGE'S ONE CALL to count a view (./views.ts says what a view is).
 * The request's headers and cookies are read while the page renders, which
 * is the only time they can be; the write itself is handed to after(), so it
 * runs once the response has gone and never holds the page up.
 *
 * HOW THE VISITOR ARRIVED goes with it (SQL part 184): the source and the
 * site that sent them from the Referer and the address's utm tags
 * (lib/communities/visit-source.ts; the address with its query is the
 * proxy's COMMUNITY_PATH_HEADER), the kind of device from the browser's
 * signature, the country from the edge's header, and, after the response,
 * whether a signed in visitor is already a member. Nothing in them says who
 * the visitor is, and the nightly count turns them into counts.
 */
import { after } from "next/server"
import { cookies, headers } from "next/headers"
import { clientIp } from "@/lib/analytics/anon-visit"
import { getMainDomain } from "@/lib/url-helpers"
import { COMMUNITY_PATH_HEADER } from "@/lib/communities/slug-move"
import { visitCountry, visitDevice, visitSource } from "@/lib/communities/visit-source"
import { admin, reasonOf, type Db } from "./db"
import { recordCommunityView, visitorKey, type VisitFacts, type VisitorFacts } from "./views"

/** Whether a signed in visitor is an active member of the community, read after the response. Null when it cannot be told. */
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

/**
 * Called from a page while it renders: reads who is looking now, records
 * the view after the response. Owners and unpublished communities are not
 * counted.
 */
export async function scheduleCommunityView(input: { communityId: string; status: string; userId: string | null; isOwner?: boolean; slug?: string }): Promise<void> {
  if (input.status !== "published" || input.isOwner) return
  try {
    const [h, c] = await Promise.all([headers(), cookies()])
    const facts: VisitorFacts = {
      userId: input.userId,
      browserId: c.get("materia_visitor")?.value ?? c.get("visitor_id")?.value ?? null,
      ip: clientIp(h),
      userAgent: h.get("user-agent"),
    }
    const key = visitorKey(facts, input.communityId)
    if (!key) return
    const path = h.get(COMMUNITY_PATH_HEADER)
    const slug = input.slug ?? (path?.match(/^\/community\/([^/?#]+)/)?.[1] ?? "")
    const from = visitSource({ referer: h.get("referer"), path, slug, mainDomain: getMainDomain(), userAgent: facts.userAgent })
    const visit: Omit<VisitFacts, "member"> = { source: from.source, referrer: from.referrer, device: visitDevice(facts.userAgent), country: visitCountry(h) }
    after(async () => {
      await recordCommunityView(admin(), input.communityId, key, { ...visit, member: await isMember(admin(), input.communityId, input.userId) })
    })
  } catch (e) {
    console.error(`[communities] view: ${reasonOf(e)}`)
  }
}
