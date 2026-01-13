import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

// GET - Fetch reviews for a product
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const productId = searchParams.get("productId")
  const creatorId = searchParams.get("creatorId")
  const limit = Number.parseInt(searchParams.get("limit") || "10")
  const offset = Number.parseInt(searchParams.get("offset") || "0")

  if (!productId && !creatorId) {
    return NextResponse.json({ error: "productId or creatorId required" }, { status: 400 })
  }

  const admin = createAdminClient()

  let query = admin
    .from("reviews")
    .select(`
      *,
      buyer:profiles!buyer_id(id, display_name, avatar_url)
    `)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1)

  if (productId) {
    query = query.eq("product_id", productId)
  } else if (creatorId) {
    query = query.eq("creator_id", creatorId)
  }

  const { data: reviews, error } = await query

  if (error) {
    console.error("[v0] Error fetching reviews:", error)
    return NextResponse.json({ error: "Failed to fetch reviews" }, { status: 500 })
  }

  // Get total count
  let countQuery = admin.from("reviews").select("id", { count: "exact", head: true })
  if (productId) {
    countQuery = countQuery.eq("product_id", productId)
  } else if (creatorId) {
    countQuery = countQuery.eq("creator_id", creatorId)
  }

  const { count } = await countQuery

  return NextResponse.json({
    reviews: reviews || [],
    total: count || 0,
    hasMore: offset + limit < (count || 0),
  })
}

// POST - Create a new review
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const admin = createAdminClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 })
  }

  const body = await request.json()
  const { productId, rating, content, orderId } = body

  if (!productId || !rating || !content) {
    return NextResponse.json({ error: "productId, rating, and content are required" }, { status: 400 })
  }

  if (rating < 1 || rating > 5) {
    return NextResponse.json({ error: "Rating must be between 1 and 5" }, { status: 400 })
  }

  if (content.trim().length < 10) {
    return NextResponse.json({ error: "Review must be at least 10 characters" }, { status: 400 })
  }

  // Check if user has purchased this product
  const { data: entitlement } = await admin
    .from("entitlements")
    .select("id")
    .eq("buyer_id", user.id)
    .eq("product_id", productId)
    .single()

  if (!entitlement) {
    return NextResponse.json({ error: "You must purchase this product to leave a review" }, { status: 403 })
  }

  // Check if user already reviewed this product
  const { data: existingReview } = await admin
    .from("reviews")
    .select("id")
    .eq("buyer_id", user.id)
    .eq("product_id", productId)
    .single()

  if (existingReview) {
    return NextResponse.json({ error: "You have already reviewed this product" }, { status: 409 })
  }

  // Get product to find creator_id
  const { data: product } = await admin.from("products").select("creator_id").eq("id", productId).single()

  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 })
  }

  // Create the review
  const { data: review, error } = await admin
    .from("reviews")
    .insert({
      product_id: productId,
      creator_id: product.creator_id,
      buyer_id: user.id,
      order_id: orderId || null,
      rating,
      content: content.trim(),
    })
    .select(`
      *,
      buyer:profiles!buyer_id(id, display_name, avatar_url)
    `)
    .single()

  if (error) {
    console.error("[v0] Error creating review:", error)
    return NextResponse.json({ error: "Failed to create review" }, { status: 500 })
  }

  return NextResponse.json({ review })
}
