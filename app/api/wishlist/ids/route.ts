import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createClient as createAdminClient } from "@supabase/supabase-js"
import { cookies } from "next/headers"

/**
 * GET /api/wishlist/ids → { ids: string[] }
 *
 * The one thing the feed actually needs, and until now the one thing it could
 * not ask for.
 *
 * Every card on the grid reads a shared store, and that store fetches this
 * route first — but it did not exist. So the first request of every session
 * 404'd, the store fell back to /api/wishlist, and /api/wishlist returns the
 * whole wishlist: each row joined to its product, its creator, its creator's
 * profile, thumbnails and prices, all of it thrown away by a caller that wanted
 * a list of ids. A round trip to a 404 plus a heavy join is the second you can
 * watch pass with every heart on the screen sitting empty.
 *
 * This is one indexed select of one column. It answers the question that was
 * being asked.
 *
 * Signed in or not: a guest's saves live under the same cookie the rest of the
 * wishlist uses, so the two paths differ only in which column is filtered.
 * Unlike POST, nothing here mints a guest id — reading is not the moment to
 * start following someone around, and a visitor with no cookie has saved
 * nothing by definition.
 */

const GUEST_ID_COOKIE = "materia_guest_id"

export const dynamic = "force-dynamic"

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createAdminClient(url, key)
}

export async function GET(request: NextRequest) {
  // An empty list is the honest answer to every failure here. A heart that is
  // not filled is wrong for a fraction of a second; a 500 would leave the store
  // permanently unloaded and every heart on the site inert.
  try {
    const admin = getAdminClient()
    if (!admin) return NextResponse.json({ ids: [] })

    let userId: string | null = null
    try {
      const supabase = await createClient()
      const { data } = await supabase.auth.getUser()
      userId = data?.user?.id || null
    } catch {
      /* signed out */
    }

    let guestId: string | null = null
    if (!userId) {
      try {
        guestId = (await cookies()).get(GUEST_ID_COOKIE)?.value || null
      } catch {
        guestId = null
      }
      if (!guestId) {
        const match = (request.headers.get("cookie") || "").match(
          new RegExp(`${GUEST_ID_COOKIE}=([^;]+)`),
        )
        if (match) guestId = match[1]
      }
    }

    if (!userId && !guestId) return NextResponse.json({ ids: [] })

    const query = admin.from("wishlist_items").select("product_id").limit(2000)
    const { data, error } = userId
      ? await query.eq("user_id", userId)
      : await query.eq("guest_id", guestId as string)
    if (error) return NextResponse.json({ ids: [] })

    const ids = (data ?? [])
      .map((row: { product_id: string | null }) => row.product_id)
      .filter((id): id is string => !!id)

    return NextResponse.json(
      { ids },
      // Personal, and it changes the instant someone taps a heart. Nothing may
      // hold on to this.
      { headers: { "Cache-Control": "private, no-store" } },
    )
  } catch {
    return NextResponse.json({ ids: [] })
  }
}
