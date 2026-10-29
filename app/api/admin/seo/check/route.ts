import { NextResponse } from "next/server"

import { adminFailure, requireAdmin } from "@/lib/admin/gate"
import { checkNow } from "@/lib/admin/seo/run"
import { rateLimit } from "@/lib/api/rate-limit"

/**
 * POST /api/admin/seo/check  { url }
 *
 * Check now, for one address /admin/seo lists: Google asked once (from the
 * day's inspection quota, which the database counts) and the page fetched
 * and scored live. Admin only, and limited to a person's pace: twenty a
 * minute, three hundred a day, so a stuck button cannot spend the day's
 * quota on its own.
 */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

const headers = { "Cache-Control": "no-store, private" }

export async function POST(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied
  const limited = await rateLimit({
    bucket: "admin-seo-check",
    subjects: ["admin"],
    windows: [
      { limit: 20, seconds: 60 },
      { limit: 300, seconds: 86_400 },
    ],
    message: "That is a lot of checks in a short time. Wait a minute and try again.",
  })
  if (limited) return limited
  let url = ""
  try {
    const body = (await request.json()) as { url?: unknown }
    url = typeof body.url === "string" ? body.url.trim() : ""
  } catch {
    /* answered below */
  }
  if (!/^https?:\/\//.test(url) || url.length > 2048) return NextResponse.json({ error: "Send the address to check." }, { status: 400, headers })
  try {
    const result = await checkNow(url)
    if (!result) return NextResponse.json({ error: "That address is not in the inventory." }, { status: 404, headers })
    return NextResponse.json(result, { headers })
  } catch (e) {
    return adminFailure("seo check", e, "The check did not finish. Try again.")
  }
}
