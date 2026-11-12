import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { onePageActor } from "@/lib/team/onepage"
import { authUnavailableResponse, readUserForRoute } from "@/lib/auth/route-user"

// GET - Fetch free products for email capture digital product selector
export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    
    // Get current user
    const { data: { user }, unavailable } = await readUserForRoute()
    if (unavailable) return authUnavailableResponse()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    /* The page owner's store (lib/team/onepage): their own, or for a team member with OnePage the store they work in. */
    const actor = await onePageActor(supabase, user.id)
    if (actor instanceof NextResponse) return actor
    const db = actor.db

    // Get user's creator record
    const { data: creator } = await db
      .from("creators")
      .select("id")
      .eq("user_id", actor.pageOwnerId)
      .single()

    if (!creator) {
      return NextResponse.json({ products: [] })
    }

    // Fetch only free products (price_cents = 0 or null)
    const { data: products, error } = await db
      .from("products")
      .select("id, title, slug, thumbnail_url, price_cents, status")
      .eq("creator_id", creator.id)
      .eq("status", "published")
      .or("price_cents.eq.0,price_cents.is.null")
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Error fetching products:", error)
      return NextResponse.json({ error: "Failed to fetch products" }, { status: 500 })
    }

    return NextResponse.json({ products: products || [] })
  } catch (error) {
    console.error("Free products fetch error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
