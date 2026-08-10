import { after, type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createClient as createAdminClient } from "@supabase/supabase-js"
import { cookies } from "next/headers"
import { recordListingLike } from "@/lib/push/activity-db"
import { PUBLIC_FEED } from "@/lib/marketplace/listing-status"
import { isOwnProduct, SELF_ACTION_CODE, SELF_ACTION_MESSAGE } from "@/lib/marketplace/self-action"

const GUEST_ID_COOKIE = "materia_guest_id"
const COOKIE_MAX_AGE = 365 * 24 * 60 * 60

function generateGuestId(): string {
  return `guest_${crypto.randomUUID()}`
}

async function getGuestIdFromCookies(): Promise<string | null> {
  try {
    const cookieStore = await cookies()
    return cookieStore.get(GUEST_ID_COOKIE)?.value || null
  } catch {
    return null
  }
}

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    console.error("[Wishlist] Missing Supabase config")
    return null
  }

  return createAdminClient(url, key)
}

// GET: Fetch wishlist items
export async function GET(request: NextRequest) {
  try {
    const adminClient = getAdminClient()
    if (!adminClient) {
      return NextResponse.json({ items: [], count: 0, error: "No admin client" })
    }

    // Try to get authenticated user
    let userId: string | null = null
    try {
      const supabase = await createClient()
      const { data } = await supabase.auth.getUser()
      userId = data?.user?.id || null
    } catch {
      // Not logged in
    }

    // Get guest ID from cookies or header
    let guestId = await getGuestIdFromCookies()
    if (!guestId) {
      const cookieHeader = request.headers.get("cookie") || ""
      const match = cookieHeader.match(new RegExp(`${GUEST_ID_COOKIE}=([^;]+)`))
      if (match) guestId = match[1]
    }

    // Build query based on user/guest
    let query = adminClient
      .from("wishlist_items")
      .select(`
        id,
        product_id,
        created_at,
        products (
          id,
          title,
          slug,
          price_cents,
          compare_at_cents,
          thumbnail_url,
          type,
          status,
          creator_id,
          creators (
            id,
            user_id,
            slug
          )
        )
      `)
      .order("created_at", { ascending: false })

    if (userId) {
      query = query.eq("user_id", userId)
    } else if (guestId) {
      query = query.eq("guest_id", guestId)
    } else {
      return NextResponse.json({ items: [], count: 0 })
    }

    const { data, error } = await query

    if (error) {
      console.error("[Wishlist GET] Query error:", error)
      return NextResponse.json({ items: [], count: 0, error: error.message })
    }

    // Total saves per product across all users → read-only count pill on cards.
    const savesByProduct = new Map<string, number>()
    try {
      const savedIds = (data || []).map((it: any) => it.product_id).filter(Boolean)
      if (savedIds.length > 0) {
        const { data: saveRows } = await adminClient
          .from("wishlist_items")
          .select("product_id")
          .in("product_id", savedIds)
          .limit(50000)
        for (const row of saveRows || []) {
          const pid = (row as any).product_id
          if (pid) savesByProduct.set(pid, (savesByProduct.get(pid) || 0) + 1)
        }
      }
    } catch {
      /* counts optional */
    }

    // Now fetch profile info for each creator
    const items = data || []
    const enrichedItems = []

    for (const item of items) {
      if (!item.products) continue
      /**
       * A SAVED LISTING THAT IS NO LONGER FOR SALE IS NOT A CARD.
       *
       * The embed neither filtered nor selected `status`, so a wishlist kept
       * drawing ordinary buyable cards for listings that had since been sold,
       * archived, reserved or reverted to a draft — and the client could not
       * tell, because the field never reached it. Tapping one led to a 404 or
       * a checkout that refuses.
       *
       * Filtered here rather than in the query: PostgREST cannot filter on an
       * embedded table without turning the join into an inner one, which would
       * silently drop rows for a different reason. The saved ROW stays either
       * way — un-archiving puts the card back.
       */
      if (!PUBLIC_FEED.includes((item.products as any).status)) continue

      let creatorInfo = null
      if (item.products.creators?.user_id) {
        const { data: profileData } = await adminClient
          .from("profiles")
          .select("display_name, username, avatar_url")
          .eq("id", item.products.creators.user_id)
          .single()

        if (profileData) {
          creatorInfo = {
            display_name: profileData.display_name,
            username: profileData.username,
            avatar_url: profileData.avatar_url
          }
        }
      }

      enrichedItems.push({
        ...item,
        products: {
          ...item.products,
          creator_profile: creatorInfo,
          saves_count: savesByProduct.get(item.products.id) || 0
        }
      })
    }

    return NextResponse.json({ items: enrichedItems, count: enrichedItems.length })
  } catch (err) {
    console.error("[Wishlist GET] Error:", err)
    return NextResponse.json({ items: [], count: 0, error: String(err) })
  }
}

// POST: Add item to wishlist
export async function POST(request: NextRequest) {
  try {
    let body
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
    }

    const { productId } = body

    if (!productId) {
      return NextResponse.json({ error: "Product ID required" }, { status: 400 })
    }

    const adminClient = getAdminClient()
    if (!adminClient) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 })
    }

    // Try to get authenticated user
    let userId: string | null = null
    try {
      const supabase = await createClient()
      const { data } = await supabase.auth.getUser()
      userId = data?.user?.id || null
    } catch {
      // Not authenticated
    }

    // Saving your own listing inflates the one number a buyer uses to judge
    // whether an item is worth acting on. Refused here, not just hidden in the
    // interface — anything reachable by a request has to be refused by the code
    // that handles the request. See lib/marketplace/self-action.ts.
    if (userId && (await isOwnProduct(adminClient, userId, productId))) {
      return NextResponse.json(
        { error: SELF_ACTION_MESSAGE.save, code: SELF_ACTION_CODE },
        { status: 400 },
      )
    }

    if (userId) {
      // Logged in user flow
      const { data: existing } = await adminClient
        .from("wishlist_items")
        .select("id")
        .eq("user_id", userId)
        .eq("product_id", productId)
        .maybeSingle()

      if (existing) {
        const { count } = await adminClient
          .from("wishlist_items")
          .select("*", { count: "exact", head: true })
          .eq("user_id", userId)

        return NextResponse.json({ success: true, alreadyExists: true, count: count || 0 })
      }

      const { error } = await adminClient
        .from("wishlist_items")
        .insert({ user_id: userId, product_id: productId })

      if (error) {
        console.error("[Wishlist POST] Insert error:", error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      const { count } = await adminClient
        .from("wishlist_items")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)

      /**
       * The heart on a product card IS the wishlist, so this is the "someone
       * liked your listing" event and there is no second one.
       *
       * Only on the branch that actually INSERTED — the `alreadyExists` return
       * above never reaches here, so re-saving something you already saved is
       * silent. And only for signed-in savers: a guest has no identity to
       * deduplicate against, which would make the guest path the one way to
       * generate unlimited events. Guests still save; they just do not notify.
       *
       * Queued rather than sent, and on `after()` so the heart animates at the
       * speed of the tap. See lib/push/activity-notification.ts.
       */
      after(() => {
        void recordListingLike(productId, userId!).catch((e) =>
          console.error("[push:activity] like enqueue failed:", e?.message ?? e),
        )
      })

      return NextResponse.json({ success: true, count: count || 0 })
    }

    // Guest user flow
    let guestId = await getGuestIdFromCookies()
    
    // Also try reading from request directly
    if (!guestId) {
      const cookieHeader = request.headers.get("cookie") || ""
      const match = cookieHeader.match(new RegExp(`${GUEST_ID_COOKIE}=([^;]+)`))
      if (match) guestId = match[1]
    }
    
    if (!guestId) {
      guestId = generateGuestId()
    }

    // Check if already exists
    const { data: existing } = await adminClient
      .from("wishlist_items")
      .select("id")
      .eq("guest_id", guestId)
      .eq("product_id", productId)
      .maybeSingle()

    if (existing) {
      const { count } = await adminClient
        .from("wishlist_items")
        .select("*", { count: "exact", head: true })
        .eq("guest_id", guestId)

      const response = NextResponse.json({ success: true, alreadyExists: true, count: count || 0, guestId })
      response.cookies.set(GUEST_ID_COOKIE, guestId, {
        maxAge: COOKIE_MAX_AGE,
        httpOnly: false,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
      })
      return response
    }

    // Insert new guest item
    const { error } = await adminClient
      .from("wishlist_items")
      .insert({ guest_id: guestId, product_id: productId })

    if (error) {
      console.error("[Wishlist POST] Guest insert error:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const { count } = await adminClient
      .from("wishlist_items")
      .select("*", { count: "exact", head: true })
      .eq("guest_id", guestId)

    const response = NextResponse.json({ success: true, count: count || 0, guestId })
    response.cookies.set(GUEST_ID_COOKIE, guestId, {
      maxAge: COOKIE_MAX_AGE,
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    })
    return response
  } catch (err) {
    console.error("[Wishlist POST] Error:", err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// DELETE: Remove item from wishlist
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const productId = searchParams.get("productId")

    if (!productId) {
      return NextResponse.json({ error: "Product ID required" }, { status: 400 })
    }

    const adminClient = getAdminClient()
    if (!adminClient) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 })
    }

    // Try to get authenticated user
    let userId: string | null = null
    try {
      const supabase = await createClient()
      const { data } = await supabase.auth.getUser()
      userId = data?.user?.id || null
    } catch {
      // Not authenticated
    }

    if (userId) {
      await adminClient
        .from("wishlist_items")
        .delete()
        .eq("user_id", userId)
        .eq("product_id", productId)

      const { count } = await adminClient
        .from("wishlist_items")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)

      return NextResponse.json({ success: true, count: count || 0 })
    }

    // Guest user
    let guestId = await getGuestIdFromCookies()
    if (!guestId) {
      const cookieHeader = request.headers.get("cookie") || ""
      const match = cookieHeader.match(new RegExp(`${GUEST_ID_COOKIE}=([^;]+)`))
      if (match) guestId = match[1]
    }

    if (!guestId) {
      return NextResponse.json({ success: true, count: 0 })
    }

    await adminClient
      .from("wishlist_items")
      .delete()
      .eq("guest_id", guestId)
      .eq("product_id", productId)

    const { count } = await adminClient
      .from("wishlist_items")
      .select("*", { count: "exact", head: true })
      .eq("guest_id", guestId)

    return NextResponse.json({ success: true, count: count || 0 })
  } catch (err) {
    console.error("[Wishlist DELETE] Error:", err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
