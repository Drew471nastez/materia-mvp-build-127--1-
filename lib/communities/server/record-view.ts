import "server-only"

/**
 * THE PAGE'S ONE CALL to count a view (./views.ts says what a view is).
 * The request's headers and cookies are read while the page renders, which
 * is the only time they can be; the write itself is handed to after(), so it
 * runs once the response has gone and never holds the page up.
 */
import { after } from "next/server"
import { cookies, headers } from "next/headers"
import { clientIp } from "@/lib/analytics/anon-visit"
import { admin, reasonOf } from "./db"
import { recordCommunityView, visitorKey, type VisitorFacts } from "./views"

/**
 * Called from a page while it renders: reads who is looking now, records
 * the view after the response. Owners and unpublished communities are not
 * counted.
 */
export async function scheduleCommunityView(input: { communityId: string; status: string; userId: string | null; isOwner?: boolean }): Promise<void> {
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
    after(async () => {
      await recordCommunityView(admin(), input.communityId, key)
    })
  } catch (e) {
    console.error(`[communities] view: ${reasonOf(e)}`)
  }
}
