import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { LIMITS, addressSubject, rateLimit } from "@/lib/api/rate-limit"
import { isBotAgent } from "@/lib/analytics/user-agent"
import crypto from "crypto"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * A blog post read: a row in blog_post_views and one more on the post's
 * count. Three writes and reads a call, and nothing checked who called: a
 * crawler counted as a reader, and a loop could add a thousand views a
 * minute to any post. Now a robot (lib/analytics/user-agent, the same list
 * Analytics refuses) and an id that is not a post's shape are answered
 * without the database, and an address is held to the tracker's own limit,
 * counted in memory first (lib/api/rate-limit memoryFirst).
 */
export async function POST(req: NextRequest) {
  try {
    const { postId } = await req.json()
    if (typeof postId !== "string" || !UUID.test(postId)) return NextResponse.json({ ok: false })
    if (isBotAgent(req.headers.get("user-agent"))) return NextResponse.json({ ok: true })
    const limited = await rateLimit({ bucket: "blog-track", subjects: [addressSubject(req)], windows: LIMITS.track, memoryFirst: true })
    if (limited) return NextResponse.json({ ok: true })

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown"
    const ipHash = crypto.createHash("sha256").update(ip).digest("hex").slice(0, 16)
    const country = req.headers.get("x-vercel-ip-country") || null
    const city = req.headers.get("x-vercel-ip-city") || null
    const ua = req.headers.get("user-agent") || ""

    const device = /mobile/i.test(ua) ? "mobile" : /tablet/i.test(ua) ? "tablet" : "desktop"
    const browser = /edg/i.test(ua)
      ? "Edge"
      : /chrome/i.test(ua)
        ? "Chrome"
        : /safari/i.test(ua)
          ? "Safari"
          : /firefox/i.test(ua)
            ? "Firefox"
            : "Other"
    const referrer = req.headers.get("referer") || null

    const supabase = createAdminClient()

    await supabase.from("blog_post_views").insert([{
      post_id: postId,
      country,
      city,
      device,
      browser,
      referrer,
      ip_hash: ipHash,
    }])

    const { data: post } = await supabase
      .from("blog_posts")
      .select("views")
      .eq("id", postId)
      .single()

    if (post) {
      await supabase
        .from("blog_posts")
        .update({ views: (post.views || 0) + 1 })
        .eq("id", postId)
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false })
  }
}
