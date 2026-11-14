import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { onePageActor } from "@/lib/team/onepage"
import { authUnavailableResponse, readUserForRoute } from "@/lib/auth/route-user"
import { baseFor } from "@/lib/checkout/pricing"

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
      .select("id, title, slug, thumbnail_url, price_cents, status, pay_what_you_want, pwyw_min_price_cents")
      .eq("creator_id", creator.id)
      .eq("status", "published")
      .or("price_cents.eq.0,price_cents.is.null")
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Error fetching products:", error)
      return NextResponse.json({ error: "Failed to fetch products" }, { status: 500 })
    }

    /*
      FREE THE WAY THE DOWNLOAD ROUTE DECIDES IT (app/api/onepage/email-capture,
      app/api/checkout/quick-free): a pay-what-you-want product whose lowest
      price is above nothing, or one with a paid option, is not offered here,
      because the form would refuse to hand it over.
    */
    const list = (products || []) as { id: string; price_cents?: number | null; pay_what_you_want?: boolean | null; pwyw_min_price_cents?: number | null }[]
    const ids = list.map((p) => p.id)
    const paidOptions = new Set<string>()
    if (ids.length > 0) {
      const { data: options } = await db.from("product_variants").select("product_id").in("product_id", ids).or("price_cents.gt.0,pay_what_you_want.eq.true")
      for (const o of (options || []) as { product_id: string }[]) paidOptions.add(o.product_id)
    }
    const free = list
      .filter((p) => {
        const base = baseFor(p, undefined)
        return base.ok === true && base.cents === 0 && !paidOptions.has(p.id)
      })
      .map(({ pay_what_you_want: _pwyw, pwyw_min_price_cents: _min, ...rest }) => rest)

    return NextResponse.json({ products: free })
  } catch (error) {
    console.error("Free products fetch error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
