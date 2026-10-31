import { marketplacePricer } from "@/lib/money/marketplace-server"
import { type NextRequest, NextResponse } from "next/server"
import { isPubliclyVisible } from "@/lib/products/visibility"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { cookies } from "next/headers"

const GUEST_ID_COOKIE = "materia_guest_id"
const COOKIE_MAX_AGE = 365 * 24 * 60 * 60

type WishlistRow = {
  id: string; product_id: string; created_at: string
  products: {
    id: string; title: string; slug: string; price_cents: number | null
    compare_at_cents: number | null; thumbnail_url: string | null
    type: string; status: string; creator_id: string
    creators: { id: string; user_id: string | null; slug: string | null } | null
  } | null
}

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

  /* The shared factory: every request carries a deadline (lib/net/deadline.ts). */
  return createAdminClient()
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

    const { data, error } = await query.returns<WishlistRow[]>()

    if (error) {
      console.error("[Wishlist GET] Query error:", error)
      return NextResponse.json({ items: [], count: 0, error: error.message })
    }

    const items = data || []
    const enrichedItems = []

    /* Deleted (no row), or archived, unpublished or a draft now: not on sale, so not on the list (lib/products/visibility). */
    const shown: typeof items = []
    for (const item of items) {
      if (!item.products || !isPubliclyVisible(item.products as { status?: string | null })) continue
      /* A product that ships is sold on its store's website only, never on Storelib's marketplace pages: not on a marketplace list either. */
      if (item.products.type === "physical") continue
      shown.push(item)
    }

    /*
      THE CREATORS' NAMES IN ONE READ. This asked for one profile per saved
      item, one after another, and the site header asks for the wishlist on
      every page: a list of 40 saves was 40 round trips before the count
      showed. Now every creator's profile in a read per 200, and an item
      whose creator has no profile still gets none, as before.
    */
    type CreatorProfile = { id: string; display_name: string | null; username: string | null; avatar_url: string | null }
    const creatorUserIds = [...new Set(shown.map((item) => item.products?.creators?.user_id).filter((id): id is string => typeof id === "string" && id !== ""))]
    const profileByUser = new Map<string, CreatorProfile>()
    for (let i = 0; i < creatorUserIds.length; i += 200) {
      const { data: profileRows } = await adminClient
        .from("profiles")
        .select("id, display_name, username, avatar_url")
        .in("id", creatorUserIds.slice(i, i + 200))
      for (const p of (profileRows ?? []) as CreatorProfile[]) profileByUser.set(p.id, p)
    }

    /* Each price as the marketplace shows it: its store's currency, or dollars once switched over (lib/money/marketplace-server). */
    const priceOfRow = await marketplacePricer(adminClient, shown.map((item) => (item.products as { creator_id?: string | null } | null)?.creator_id ?? null), shown.map((item) => (item.products as { id?: string } | null)?.id ?? null))
    for (const item of shown) {
      let creatorInfo = null
      const profileData = item.products?.creators?.user_id ? profileByUser.get(item.products.creators.user_id) : undefined
      if (profileData) {
        creatorInfo = {
          display_name: profileData.display_name,
          username: profileData.username,
          avatar_url: profileData.avatar_url
        }
      }

      enrichedItems.push({
        ...item,
        products: {
          ...item.products,
          ...priceOfRow(item.products as Parameters<typeof priceOfRow>[0]),
          creator_profile: creatorInfo
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
