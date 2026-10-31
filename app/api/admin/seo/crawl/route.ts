import { NextResponse } from "next/server"

import { adminFailure, requireAdmin } from "@/lib/admin/gate"
import { CRAWL_MIN_GAP_MS, readCrawlReports, runCrawlCheck } from "@/lib/admin/seo/crawl"
import { rateLimit } from "@/lib/api/rate-limit"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * POST /api/admin/seo/crawl
 *
 * Check crawlability in /admin/seo: storelib.com's robots.txt and every
 * sitemap file read live once (lib/admin/seo/crawl.ts), and the report kept.
 * Admin only. A check younger than a minute is answered as it is, and the
 * route allows ten a minute and a hundred a day, so the button cannot be
 * used to fetch the site over and over.
 */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

const headers = { "Cache-Control": "no-store, private" }

export async function POST() {
  const denied = await requireAdmin()
  if (denied) return denied
  const limited = await rateLimit({
    bucket: "admin-seo-crawl",
    subjects: ["admin"],
    windows: [
      { limit: 10, seconds: 60 },
      { limit: 100, seconds: 86_400 },
    ],
    message: "That is a lot of checks in a short time. Wait a minute and try again.",
  })
  if (limited) return limited
  try {
    const admin = createAdminClient()
    const kept = await readCrawlReports(admin)
    const at = kept.robots?.checkedAt ? Date.parse(kept.robots.checkedAt) : 0
    if (!kept.missingTable && Date.now() - at < CRAWL_MIN_GAP_MS) return NextResponse.json(kept, { headers })
    return NextResponse.json(await runCrawlCheck(admin, 40_000), { headers })
  } catch (e) {
    return adminFailure("seo crawl check", e, "The crawl check did not finish.")
  }
}
