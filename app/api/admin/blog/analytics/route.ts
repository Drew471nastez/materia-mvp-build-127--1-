import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { isAdminAuthenticated } from "@/lib/admin-blog-auth"

function aggregate(rows: Record<string, string | null>[], key: string, top = 10) {
  const counts: Record<string, number> = {}
  for (const row of rows) {
    const val = (row[key] as string) || "Unknown"
    counts[val] = (counts[val] || 0) + 1
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, top)
    .map(([name, count]) => ({ name, count }))
}

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = createAdminClient()

  const { data: views } = await supabase
    .from("blog_post_views")
    .select("country, device, browser, referrer")
    .order("viewed_at", { ascending: false })
    .limit(5000)

  const rows = views || []

  return NextResponse.json({
    countries: aggregate(rows, "country"),
    devices: aggregate(rows, "device"),
    browsers: aggregate(rows, "browser"),
    referrers: aggregate(rows, "referrer"),
    totalViews: rows.length,
  })
}
