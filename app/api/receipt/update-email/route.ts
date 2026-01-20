import { type NextRequest, NextResponse } from "next/server"
import { Resend } from "resend"
import { createAdminClient } from "@/lib/supabase/admin"

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

async function resolveSellerEmail(admin: any, creatorId: string): Promise<string> {
  const { data: creator } = await admin.from("creators").select("support_email, user_id").eq("id", creatorId).single()

  if (creator?.support_email?.trim()) {
    return creator.support_email.trim()
  }

  if (creator?.user_id) {
    const { data: profile } = await admin.from("profiles").select("email").eq("id", creator.user_id).single()

    if (profile?.email?.trim()) {
      return profile.email.trim()
    }
  }

  return "support@storelib.com"
}

export async function POST(request: NextRequest) {
  try {
    const { receiptToken, orderId, newEmail } = await request.json()

    console.log("[v0] Update email request for order:", orderId)

    if (!receiptToken || !orderId || !newEmail) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(newEmail)) {
      return NextResponse.json({ error: "Invalid email address" }, { status: 400 })
    }

    if (!resend) {
      return NextResponse.json({ error: "Email service not configured" }, { status: 500 })
    }

    const admin = createAdminClient()

    const { data: order, error: orderError } = await admin
      .from("orders")
      .select("*, product:products(*, creator:creators!inner(id, user_id))")
      .eq("receipt_token", receiptToken)
      .eq("id", orderId)
      .single()

    if (orderError || !order) {
      console.log("[v0] Order not found for token:", receiptToken)
      return NextResponse.json({ error: "Order not found" }, { status: 404 })
    }

    const { data: emailChangeEvents } = await admin
      .from("security_events")
      .select("id")
      .eq("order_id", orderId)
      .eq("event_type", "email_updated")

    if (emailChangeEvents && emailChangeEvents.length > 0) {
      console.log("[v0] Email already changed for order:", orderId)
      return NextResponse.json(
        {
          error: "Email was already changed once. Contact support if you need further assistance.",
          alreadyChanged: true,
        },
        { status: 403 },
      )
    }

    const { error: updateError } = await admin.from("orders").update({ buyer_email: newEmail }).eq("id", orderId)

    if (updateError) {
      console.error("[v0] Failed to update email:", updateError)
      return NextResponse.json({ error: "Failed to update email" }, { status: 500 })
    }

    await admin.from("security_events").insert({
      order_id: orderId,
      event_type: "email_updated",
      ip: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown",
      user_agent: request.headers.get("user-agent") || "unknown",
      metadata: { old_email: order.buyer_email, new_email: newEmail },
    })

    const { data: creatorProfile } = await admin
      .from("profiles")
      .select("display_name, username")
      .eq("id", order.product.creator.user_id)
      .single()

    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "https://materia.app"
    const receiptUrl = `${baseUrl}/receipt/${receiptToken}`

    const sellerReplyTo = await resolveSellerEmail(admin, order.product.creator.id)

    console.log("[v0] Sending email to new address:", newEmail, "with Reply-To:", sellerReplyTo)

    const response = await resend.emails.send({
      from: "Materia <noreplycustomers@storelib.com>",
      to: newEmail,
      replyTo: sellerReplyTo,
      subject: `Your download is ready - ${order.product.title}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
        </head>
        <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f6f9fc;">
          <table role="presentation" style="width: 100%; padding: 40px 20px;">
            <tr>
              <td align="center">
                <table role="presentation" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.08);">
                  
                  <tr>
                    <td style="padding: 48px 40px 32px; text-align: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">
                      <h1 style="margin: 0; font-size: 32px; font-weight: 700; color: #ffffff;">
                        🎉 Your download is ready!
                      </h1>
                      <p style="margin: 12px 0 0 0; font-size: 16px; color: rgba(255,255,255,0.9);">
                        Thanks for your purchase
                      </p>
                    </td>
                  </tr>
                  
                  <tr>
                    <td style="padding: 40px;">
                      
                      <table role="presentation" style="width: 100%; background-color: #f8f9fa; border-radius: 8px; padding: 24px; margin-bottom: 32px;">
                        <tr>
                          <td>
                            <p style="margin: 0 0 8px 0; font-size: 12px; color: #6c757d; text-transform: uppercase; letter-spacing: 0.8px; font-weight: 600;">Product</p>
                            <p style="margin: 0 0 20px 0; font-size: 22px; font-weight: 700; color: #212529;">${order.product.title}</p>
                            
                            ${
                              creatorProfile?.display_name
                                ? `
                            <p style="margin: 0 0 4px 0; font-size: 12px; color: #6c757d; text-transform: uppercase; letter-spacing: 0.8px; font-weight: 600;">Seller</p>
                            <p style="margin: 0; font-size: 18px; color: #495057; font-weight: 600;">${creatorProfile.display_name}</p>
                            `
                                : ""
                            }
                          </td>
                        </tr>
                      </table>
                      
                      <table role="presentation" style="width: 100%; margin-bottom: 32px;">
                        <tr>
                          <td align="center">
                            <a href="${receiptUrl}" style="display: inline-block; background-color: #667eea; color: #ffffff; text-decoration: none; padding: 18px 56px; border-radius: 8px; font-size: 18px; font-weight: 700; box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);">
                              Download Now
                            </a>
                          </td>
                        </tr>
                      </table>
                      
                      <table role="presentation" style="width: 100%; background-color: #f8f9fa; border-radius: 8px; padding: 20px; margin-bottom: 32px;">
                        <tr>
                          <td>
                            <p style="margin: 0 0 8px 0; font-size: 13px; color: #6c757d; text-align: center;">
                              Or copy this link:
                            </p>
                            <p style="margin: 0; font-size: 12px; color: #667eea; text-align: center; word-break: break-all;">
                              <a href="${receiptUrl}" style="color: #667eea; text-decoration: underline;">${receiptUrl}</a>
                            </p>
                          </td>
                        </tr>
                      </table>
                      
                      <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;" />
                      
                      <p style="margin: 0 0 16px 0; font-size: 13px; color: #6c757d; text-align: center;">
                        🔒 This link is unique to you.
                      </p>
                      
                      <p style="margin: 0; font-size: 12px; color: #adb5bd; text-align: center;">
                        Having trouble? Reply to this email.<br/>
                        Order ID: ${order.id}
                      </p>
                      
                    </td>
                  </tr>
                  
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `,
    })

    if (response.error) {
      console.log("[v0] Email send error:", response.error)
      return NextResponse.json({ error: "Failed to send email" }, { status: 500 })
    }

    console.log("[v0] ✅ Email updated and sent to:", newEmail)
    return NextResponse.json({ success: true, messageId: response.data?.id })
  } catch (error: unknown) {
    console.log("[v0] Error updating email:", error instanceof Error ? error.message : error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 },
    )
  }
}
