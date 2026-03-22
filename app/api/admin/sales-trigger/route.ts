import { NextResponse } from "next/server"
import { isAdminAuthenticated } from "@/lib/admin-blog-auth"
import { createAdminClient } from "@/lib/supabase/admin"
import { generateReceiptToken } from "@/lib/security"
// Email sending is intentionally skipped in simulation mode
import { notifySale } from "@/lib/push/notifications"
import { v4 as uuidv4 } from "uuid"

export const runtime = "nodejs"

// GET: search products and users for the admin UI
export async function GET(request: Request) {
  const authed = await isAdminAuthenticated()
  if (!authed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const type = searchParams.get("type") // "products" | "users"
  const q = searchParams.get("q") || ""
  const admin = createAdminClient()

  if (type === "products") {
    let query = admin
      .from("products")
      .select("id, title, price_cents, slug, creator:creators!inner(id, user_id, slug, display_name)")
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(50)

    if (q.trim()) {
      query = query.ilike("title", `%${q.trim()}%`)
    }

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ products: data || [] })
  }

  if (type === "users") {
    // Search creators by display_name or slug
    let query = admin
      .from("creators")
      .select("id, user_id, slug, display_name, avatar_url")
      .order("created_at", { ascending: false })
      .limit(50)

    if (q.trim()) {
      query = query.or(`display_name.ilike.%${q.trim()}%,slug.ilike.%${q.trim()}%`)
    }

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ users: data || [] })
  }

  return NextResponse.json({ error: "Invalid type" }, { status: 400 })
}

// POST: trigger a sale (create order, send emails, push notification)
export async function POST(request: Request) {
  const authed = await isAdminAuthenticated()
  if (!authed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const admin = createAdminClient()
    const body = await request.json()
    const { product_id, buyer_user_id } = body

    if (!product_id) {
      return NextResponse.json({ error: "product_id is required" }, { status: 400 })
    }

    // Fetch product with creator info
    const { data: product, error: productError } = await admin
      .from("products")
      .select("id, title, price_cents, slug, includes_community, creator:creators!inner(id, user_id, slug, display_name)")
      .eq("id", product_id)
      .single()

    if (productError || !product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 })
    }

    const creator = product.creator as any

    // Resolve buyer info
    let buyerEmail = "admin-trigger@storelib.com"
    let buyerFirstName = "Admin"
    let buyerLastName = "Trigger"
    let buyerId: string | null = null

    if (buyer_user_id) {
      // Look up the user's auth record
      const { data: userData } = await admin.auth.admin.getUserById(buyer_user_id)
      if (userData?.user) {
        buyerId = userData.user.id
        buyerEmail = userData.user.email || buyerEmail

        // Try to get profile info from creators table
        const { data: creatorProfile } = await admin
          .from("creators")
          .select("display_name, slug")
          .eq("user_id", buyer_user_id)
          .maybeSingle()

        if (creatorProfile) {
          const nameParts = (creatorProfile.display_name || creatorProfile.slug || "").split(" ")
          buyerFirstName = nameParts[0] || "User"
          buyerLastName = nameParts.slice(1).join(" ") || ""
        }
      }
    }

    const receiptToken = generateReceiptToken()

    // Create the order (amount = 0, admin-triggered)
    const orderData: Record<string, any> = {
      buyer_id: buyerId,
      buyer_first_name: buyerFirstName,
      buyer_last_name: buyerLastName,
      buyer_email: buyerEmail,
      product_id: product.id,
      amount_cents: 0,
      tip_cents: 0,
      currency: "usd",
      status: "completed",
      provider: "free",
      fee_cents: 0,
      receipt_token: receiptToken,
    }

    const { data: order, error: orderError } = await admin
      .from("orders")
      .insert(orderData)
      .select()
      .single()

    if (orderError || !order) {
      // Fallback: minimal insert
      const { data: order2, error: orderError2 } = await admin
        .from("orders")
        .insert({
          product_id: product.id,
          amount_cents: 0,
          status: "completed",
          receipt_token: receiptToken,
          buyer_email: buyerEmail,
          buyer_id: buyerId,
        })
        .select()
        .single()

      if (orderError2 || !order2) {
        return NextResponse.json({ error: "Failed to create order", details: (orderError2 || orderError)?.message }, { status: 500 })
      }

      // Continue with minimal order
      return await processPostOrder(admin, order2, product, creator, buyerId, buyerEmail, buyerFirstName, buyerLastName, receiptToken)
    }

    return await processPostOrder(admin, order, product, creator, buyerId, buyerEmail, buyerFirstName, buyerLastName, receiptToken)
  } catch (error) {
    console.error("[sales-trigger] Error:", error)
    return NextResponse.json({ error: "Failed", details: error instanceof Error ? error.message : "Unknown" }, { status: 500 })
  }
}

async function processPostOrder(
  admin: any,
  order: any,
  product: any,
  creator: any,
  buyerId: string | null,
  buyerEmail: string,
  buyerFirstName: string,
  buyerLastName: string,
  receiptToken: string,
) {
  const results: string[] = [`Order ${order.id} created`]

  // 1. Upsert customer
  try {
    await admin.rpc("upsert_customer", {
      p_creator_id: creator.id,
      p_email: buyerEmail,
      p_first_name: buyerFirstName,
      p_last_name: buyerLastName,
      p_order_amount_cents: 0,
    })
    results.push("Customer upserted")
  } catch (e) {
    results.push(`Customer upsert failed: ${e}`)
  }

  // 2. Add to subscribers
  try {
    const normalizedEmail = buyerEmail.toLowerCase().trim()
    const { data: existingSub } = await admin
      .from("subscribers")
      .select("id, status")
      .eq("creator_id", creator.id)
      .eq("email", normalizedEmail)
      .maybeSingle()

    if (!existingSub) {
      await admin.from("subscribers").insert({
        email: normalizedEmail,
        name: `${buyerFirstName} ${buyerLastName}`.trim() || null,
        source: "checkout",
        source_id: order.id,
        creator_id: creator.id,
        status: "subscribed",
        is_active: true,
        subscribed_at: new Date().toISOString(),
        consent_text: "Admin-triggered sale",
        consent_timestamp: new Date().toISOString(),
        unsubscribe_token: uuidv4(),
      })
      results.push("Subscriber added")
    } else {
      results.push("Already subscribed")
    }
  } catch (e) {
    results.push(`Subscriber failed: ${e}`)
  }

  // 3. Create entitlement for authenticated buyer
  if (buyerId) {
    try {
      await admin.from("entitlements").upsert({
        buyer_id: buyerId,
        creator_id: creator.id,
        product_id: product.id,
        community_access: product.includes_community || false,
      }, { onConflict: "buyer_id,product_id" })
      results.push("Entitlement created")
    } catch (e) {
      results.push(`Entitlement failed: ${e}`)
    }
  }

  // 4. Increment product sales count + analytics
  try {
    await admin.rpc("increment_product_sales", { p_product_id: product.id })
    await admin.from("analytics_events").insert({
      creator_id: creator.id,
      product_id: product.id,
      event_type: "purchase",
    })
    results.push("Sales count incremented")
  } catch (e) {
    results.push(`Sales increment failed: ${e}`)
  }

  // 5. Emails — intentionally skipped in admin simulation mode
  // Real order emails are sent by the normal checkout flow, not here
  results.push("Emails skipped (simulation mode)")

  // 6. Push notification to seller
  try {
    await notifySale(creator.user_id, {
      productName: product.title,
      amountCents: 0,
      orderId: order.id,
      productId: product.id,
    })
    results.push("Push notification sent")
  } catch (e) {
    results.push(`Push failed: ${e}`)
  }

  return NextResponse.json({
    success: true,
    order_id: order.id,
    product: product.title,
    results,
  })
}
