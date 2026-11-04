import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { cookies } from "next/headers"

const GUEST_ID_COOKIE = "materia_guest_id"

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    return null
  }

  /* The shared factory: every request carries a deadline (lib/net/deadline.ts). */
  return createAdminClient()
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const productId = searchParams.get("productId")

    if (!productId) {
      return NextResponse.json({ isWishlisted: false, isLoggedIn: false })
    }

    const adminClient = getAdminClient()
    
    if (!adminClient) {
      return NextResponse.json({ isWishlisted: false, isLoggedIn: false })
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
      const { data } = await adminClient
        .from("wishlist_items")
        .select("id")
        .eq("user_id", userId)
        .eq("product_id", productId)
        .maybeSingle()

      return NextResponse.json({ isWishlisted: !!data, isLoggedIn: true })
    }

    // Guest user
    let guestId: string | null = null
    try {
      const cookieStore = await cookies()
      guestId = cookieStore.get(GUEST_ID_COOKIE)?.value || null
    } catch {
      // No cookies
    }

    if (!guestId) {
      return NextResponse.json({ isWishlisted: false, isLoggedIn: false })
    }

    const { data } = await adminClient
      .from("wishlist_items")
      .select("id")
      .eq("guest_id", guestId)
      .eq("product_id", productId)
      .is("user_id", null)
      .maybeSingle()

    return NextResponse.json({ isWishlisted: !!data, isLoggedIn: false })
  } catch (err) {
    console.error("Wishlist check error:", err)
    return NextResponse.json({ isWishlisted: false, isLoggedIn: false })
  }
}
