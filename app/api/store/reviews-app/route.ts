import { NextResponse } from "next/server"
import { physicalJson, readBody, shopCaller } from "@/lib/physical/auth"
import { recordActivity } from "@/lib/activity/log-server"
import { loadReviewsApp, saveReviewsApp } from "@/lib/reviews/app-server"
import { forgetReviewPages } from "@/lib/reviews/store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Settings › Integrations › Storelib Reviews (lib/reviews/app-settings.ts).
 * The store's owner only.
 *
 *   GET           the settings, whether the database has them yet, and a
 *                 few counts for the page (pending reviews, emails sent)
 *   PUT { ... }   a change, laid over what is saved and checked again
 */
export async function GET() {
  const c = await shopCaller("store", { read: true })
  if (c instanceof NextResponse) return c
  const { settings, ready } = await loadReviewsApp(c.db, c.creatorId)
  const [pending, published, asked] = await Promise.all([
    /* On the store's website (lib/reviews/app-settings websiteStatus): a verified buyer's review waits there while it is already on Storelib. */
    c.db.from("reviews").select("id", { count: "exact", head: true }).eq("creator_id", c.creatorId).neq("status", "hidden").or("status.eq.pending,site_status.eq.pending"),
    c.db.from("reviews").select("id", { count: "exact", head: true }).eq("creator_id", c.creatorId).eq("status", "published").eq("site_status", "shown"),
    c.db.from("review_requests").select("id", { count: "exact", head: true }).eq("creator_id", c.creatorId).in("status", ["sent", "reminded", "reviewed"]),
  ])
  return physicalJson({ settings, ready, counts: { pending: pending.count ?? 0, published: published.count ?? 0, asked: asked.error ? 0 : asked.count ?? 0 } })
}

export async function PUT(request: Request) {
  const c = await shopCaller()
  if (c instanceof NextResponse) return c
  const body = await readBody(request)
  if (!body) return physicalJson({ error: "Bad request." }, 400)
  const before = await loadReviewsApp(c.db, c.creatorId)
  const out = await saveReviewsApp(c.db, c.creatorId, body)
  if (!out.ok) return physicalJson({ error: out.error }, out.status)
  /* The website's review sections and star ratings follow at once. */
  forgetReviewPages({ creatorId: c.creatorId })
  if (before.settings.enabled !== out.settings.enabled) {
    await recordActivity(c.db, c, { action: out.settings.enabled ? "integration.installed" : "integration.removed", subjectType: "integration", subjectId: "storelib_reviews", subjectLabel: "Storelib Reviews" })
  }
  return physicalJson({ settings: out.settings, ready: true })
}
