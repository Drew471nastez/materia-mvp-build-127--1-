import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import crypto from "crypto"

export async function POST(req: NextRequest) {
  try {
    const { postId } = await req.json()
    if (!postId) return NextResponse.json({ ok: false })

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
