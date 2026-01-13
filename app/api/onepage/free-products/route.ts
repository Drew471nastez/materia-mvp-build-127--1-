import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// GET - Fetch free products for email capture digital product selector
export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    
    // Get current user
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get user's creator record
    const { data: creator } = await supabase
      .from("creators")
      .select("id")
      .eq("user_id", user.id)
      .single()

    if (!creator) {
      return NextResponse.json({ products: [] })
    }

    // Fetch only free products (price_cents = 0 or null)
    const { data: products, error } = await supabase
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
