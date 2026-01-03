import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { Resend } from "resend"

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

export async function POST(request: Request) {
  const supabase = await createClient()

  try {
    const { email, productId, token } = await request.json()

    if (!email || !productId || !token) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: "Invalid email address" }, { status: 400 })
    }

    const { data: product, error: productError } = await supabase
      .from("products")
      .select("id, title, slug, creator_id, type")
      .eq("id", productId)
      .eq("status", "published")
      .single()

    if (productError || !product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 })
    }

    const { data: creator } = await supabase.from("creators").select("id").eq("id", product.creator_id).single()

    if (!creator) {
      return NextResponse.json({ error: "Creator not found" }, { status: 404 })
    }

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (user) {
      const { data: existingEntitlement } = await supabase
        .from("entitlements")
        .select("id")
        .eq("buyer_id", user.id)
        .eq("product_id", product.id)
        .single()

      if (existingEntitlement) {
        // Already owns - redirect to library
        return NextResponse.json({
          success: true,
          redirectUrl: `/library?already_owned=true&highlight=${product.id}`,
        })
      }
    }

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        buyer_id: user?.id || null,
        product_id: product.id,
        amount_cents: 0,
        status: "completed",
        buyer_email: user ? null : email,
        access_token: user ? null : token,
      })
      .select()
      .single()

    if (orderError) {
      console.error("[v0] Error creating free order:", orderError)
      return NextResponse.json({ error: "Failed to create order" }, { status: 500 })
    }

    if (user) {
      const { error: entitlementError } = await supabase.from("entitlements").insert({
        buyer_id: user.id,
        creator_id: creator.id,
        product_id: product.id,
        community_access: false,
      })

      if (entitlementError) {
        console.error("[v0] Error creating entitlement:", entitlementError)
      } else {
        console.log("[v0] Entitlement created for user:", user.id, "product:", product.id)
      }
    }

    // Increment sales count
    await supabase.rpc("increment_sales_count", { product_uuid: productId })

    // Record analytics
    await supabase.from("analytics_events").insert({
      creator_id: creator.id,
      product_id: product.id,
      event_type: "purchase",
    })

    // Send access email to guest
    if (!user && resend) {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://materia.app"
      const accessLink = `${baseUrl}/access/${order.id}?token=${token}`

      try {
        await resend.emails.send({
          from: "Materia <noreply@materia.app>",
          to: email,
          subject: `Your free download: ${product.title}`,
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <h1 style="font-size: 24px; font-weight: 600; margin-bottom: 16px;">Your download is ready!</h1>
              <p style="color: #666; margin-bottom: 24px;">You've successfully claimed <strong>${product.title}</strong>.</p>
              
              <div style="background: #f5f5f5; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
                <p style="margin: 0 0 16px 0; font-weight: 500;">Access your download:</p>
                <a href="${accessLink}" style="display: inline-block; background: #000; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500;">
                  Download Now
                </a>
              </div>
              
              <p style="color: #666; font-size: 14px;">
                Want to keep all your products in one place? 
                <a href="${baseUrl}/signup" style="color: #000;">Create a free account</a> 
                to access your library anytime.
              </p>
              
              <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
              
              <p style="color: #999; font-size: 12px;">
                This link is unique to you. Please don't share it with others.
              </p>
            </div>
          `,
        })
      } catch (emailError) {
        console.error("[v0] Error sending access email:", emailError)
      }
    }

    const redirectUrl = user
      ? `/library?purchase=success&highlight=${product.id}`
      : `/access/${order.id}?token=${token}`

    return NextResponse.json({ success: true, redirectUrl })
  } catch (error) {
    console.error("[v0] Free checkout error:", error)
    return NextResponse.json({ error: "Checkout failed" }, { status: 500 })
  }
}
