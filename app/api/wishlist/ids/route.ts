import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createClient as createAdminClient } from "@supabase/supabase-js"
import { cookies } from "next/headers"

/**
 * GET /api/wishlist/ids
 *
 * The ids-only endpoint components/explore/wishlist-context.tsx loads once per session
 * to decide which hearts in the feed are filled.
 *
 * Exists because the alternative — GET /api/wishlist — embeds products → creators and
 * then does one `profiles` lookup per item in a for-loop. Rendering a 12-card grid does
 * not need any of that: a 40-item wishlist cost 40+ sequential queries on the critical
 * path of the homepage. This is a single `select("product_id")` with no embeds.
 *
 * Mirrors the auth/guest resolution of app/api/wishlist/route.ts exactly, so the two
 * endpoints can never disagree about whose wishlist is being read.
 *
 * Fails soft: any error returns 200 with an empty list, because an unfilled heart is a
 * far better outcome than a broken feed.
 */

const GUEST_ID_COOKIE = "materia_guest_id"

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    console.error("[Wishlist IDs] Missing Supabase config")
    return null
  }

  return createAdminClient(url, key)
}

async function getGuestIdFromCookies(): Promise<string | null> {
  try {
    const cookieStore = await cookies()
    return cookieStore.get(GUEST_ID_COOKIE)?.value || null
  } catch {
    return null
  }
}

export async function GET(request: NextRequest) {
  try {
    const adminClient = getAdminClient()
    if (!adminClient) {
      return NextResponse.json({ ids: [] })
    }

    let userId: string | null = null
    try {
      const supabase = await createClient()
      const { data } = await supabase.auth.getUser()
      userId = data?.user?.id || null
    } catch {
      // Not logged in — fall through to the guest id
    }

    // Guest id can arrive as a parsed cookie or, on some native/proxied requests, only
    // in the raw Cookie header — same two-step lookup as app/api/wishlist/route.ts.
    let guestId = await getGuestIdFromCookies()
    if (!guestId) {
      const cookieHeader = request.headers.get("cookie") || ""
      const match = cookieHeader.match(new RegExp(`${GUEST_ID_COOKIE}=([^;]+)`))
      if (match) guestId = match[1]
    }
    if (!guestId) {
      guestId = request.nextUrl.searchParams.get("guestId")
    }

    let query = adminClient.from("wishlist_items").select("product_id")

    if (userId) {
      query = query.eq("user_id", userId)
    } else if (guestId) {
      query = query.eq("guest_id", guestId)
    } else {
      // Neither logged in nor a known guest — nothing can be wishlisted yet.
      return NextResponse.json({ ids: [] })
    }

    const { data, error } = await query

    if (error) {
      console.error("[Wishlist IDs] Query error:", error)
      return NextResponse.json({ ids: [] })
    }

    const ids = (data || [])
      .map((row) => row.product_id)
      .filter((id): id is string => typeof id === "string" && id.length > 0)

    return NextResponse.json({ ids, count: ids.length })
  } catch (err) {
    console.error("[Wishlist IDs] Error:", err)
    return NextResponse.json({ ids: [] })
  }
}
