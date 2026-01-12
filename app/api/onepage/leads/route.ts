import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { Resend } from "resend"

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null
const FROM_EMAIL = "noreplycustomers@materiabuilder.store"

function getStableBaseUrl() {
  const envUrl =
    process.env.SITE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    ""

  const raw = envUrl.trim()
  if (!raw) return "https://materiabuilder.store"

  const withScheme = raw.startsWith("http://") || raw.startsWith("https://") ? raw : `https://${raw}`
  return withScheme.replace(/\/+$/, "")
}

// POST - Submit a lead (public, no auth required)
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const admin = createAdminClient()

    const body = await request.json()
    const { onepage_id, email, name, block_id, referrer, utm_source, utm_medium, utm_campaign, product_id, enable_digital_product } = body

    if (!onepage_id || !email) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: "Invalid email format" }, { status: 400 })
    }

    // Verify the onepage exists and is published
    const { data: onepage, error: onepageError } = await admin
      .from("onepages")
      .select("id, status, owner_id")
      .eq("id", onepage_id)
      .eq("status", "published")
      .single()

    if (onepageError || !onepage) {
      return NextResponse.json({ error: "OnePage not found" }, { status: 404 })
    }

    // Check if email already submitted for this page
    const { data: existingLead } = await admin
      .from("onepage_leads")
      .select("id")
      .eq("onepage_id", onepage_id)
      .eq("email", email.toLowerCase().trim())
      .single()

    if (existingLead) {
      // Return success even if already exists (good UX)
      return NextResponse.json({ success: true, message: "Already subscribed" })
    }

    const deliveryStatus = enable_digital_product && product_id ? "pending" : "not_applicable"

    // Insert lead
    const { data: lead, error: insertError } = await admin
      .from("onepage_leads")
      .insert({
        onepage_id,
        email: email.toLowerCase().trim(),
        name: name || null,
        block_id: block_id || null,
        referrer: referrer || null,
        utm_source: utm_source || null,
        utm_medium: utm_medium || null,
        utm_campaign: utm_campaign || null,
        delivery_status: deliveryStatus,
      })
      .select()
      .single()

    if (insertError) {
      // Handle unique constraint violation gracefully
      if (insertError.code === "23505") {
        return NextResponse.json({ success: true, message: "Already subscribed" })
      }
      console.error("Lead insert error:", insertError)
      return NextResponse.json({ error: "Failed to save" }, { status: 500 })
    }

    let downloadUrl: string | null = null
    let fileName: string | null = null

    // Handle digital product delivery
    if (enable_digital_product && product_id) {
      try {
        // Get product and its digital assets
        const { data: product, error: productError } = await admin
          .from("products")
          .select("id, title, creator_id")
          .eq("id", product_id)
          .single()

        if (productError || !product) {
          console.error("Product not found:", productError)
        } else {
          // Get digital assets for the product
          const { data: assets, error: assetsError } = await admin
            .from("digital_assets")
            .select("id, file_path, file_name")
            .eq("product_id", product_id)
            .limit(1)

          if (assetsError || !assets || assets.length === 0) {
            console.error("No digital assets found:", assetsError)
          } else {
            const asset = assets[0]

            // Generate signed URL for download
            let storagePath = asset.file_path

            if (storagePath.includes("/storage/v1/object/")) {
              const match = storagePath.match(/\/storage\/v1\/object\/(?:public|sign)\/[^/]+\/(.+?)(?:\?|$)/)
              if (match) {
                storagePath = decodeURIComponent(match[1])
              }
            }

            let signedUrlResult = await admin.storage
              .from("product-files")
              .createSignedUrl(storagePath, 3600, { download: true })

            if (signedUrlResult.error) {
              signedUrlResult = await admin.storage
                .from("digital-assets")
                .createSignedUrl(storagePath, 3600, { download: true })
            }

            if (signedUrlResult.data) {
              downloadUrl = signedUrlResult.data.signedUrl
              fileName = asset.file_name

              // Get creator info for email
              const { data: creator } = await admin
                .from("creators")
                .select("headline, user_id")
                .eq("id", product.creator_id)
                .single()

              let sellerName = "Creator"
              if (creator) {
                const { data: profile } = await admin
                  .from("profiles")
                  .select("display_name, username")
                  .eq("id", creator.user_id)
                  .single()

                sellerName = profile?.display_name || profile?.username || creator.headline || "Creator"
              }

              // Send email with download link
              if (resend && downloadUrl) {
                try {
                  await resend.emails.send({
                    from: `${sellerName} <${FROM_EMAIL}>`,
                    to: email.toLowerCase().trim(),
                    subject: `Thank you for joining! Here's your ${product.title}`,
                    html: `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>Your digital download</title>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;background-color:#f6f9fc;">
  <table role="presentation" style="width:100%;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" style="max-width:600px;width:100%;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 6px 18px rgba(0,0,0,0.08);">
          <tr>
            <td style="padding:44px 36px 30px;text-align:center;background:#111827;">
              <h1 style="margin:0;font-size:28px;font-weight:800;color:#fff;">Thank you for joining!</h1>
              <p style="margin:10px 0 0 0;font-size:15px;color:rgba(255,255,255,0.85);">Here's your digital download</p>
            </td>
          </tr>
          <tr>
            <td style="padding:34px 34px 12px;">
              <p style="margin:0 0 16px 0;font-size:16px;color:#111827;">Hey there,</p>
              <p style="margin:0 0 18px 0;font-size:15px;color:#374151;line-height:1.55;">
                Thank you for joining! As promised, here's your free digital download: <strong>${product.title}</strong>
              </p>
              <table role="presentation" style="width:100%;background:#f3f4f6;border-radius:10px;padding:18px;margin:0 0 22px 0;">
                <tr>
                  <td>
                    <p style="margin:0 0 6px 0;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.9px;font-weight:700;">Your Download</p>
                    <p style="margin:0;font-size:18px;font-weight:800;color:#111827;">${product.title}</p>
                  </td>
                </tr>
              </table>
              <table role="presentation" style="width:100%;margin:0 0 18px 0;">
                <tr>
                  <td align="center">
                    <a href="${downloadUrl}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:14px 26px;border-radius:10px;font-size:15px;font-weight:800;">
                      Download now
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 8px 0;font-size:13px;color:#6b7280;">If the button doesn't work, copy this link:</p>
              <p style="margin:0 0 24px 0;font-size:12px;color:#4f46e5;word-break:break-all;">${downloadUrl}</p>
              <hr style="border:none;border-top:1px solid #e5e7eb;margin:22px 0;" />
              <p style="margin:0;font-size:12px;color:#6b7280;text-align:center;line-height:1.5;">
                Sent from ${sellerName}
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 22px;text-align:center;background:#f9fafb;color:#9ca3af;font-size:11px;">
              © ${new Date().getFullYear()} ${sellerName}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
                    text: `Hey there,

Thank you for joining! Here's your free digital download: ${product.title}

Download: ${downloadUrl}

Sent from ${sellerName}`,
                  })

                  // Update delivery status
                  await admin
                    .from("onepage_leads")
                    .update({ delivery_status: "sent", delivered_at: new Date().toISOString() })
                    .eq("id", lead.id)
                } catch (emailError) {
                  console.error("Email send error:", emailError)
                  // Update to failed status
                  await admin
                    .from("onepage_leads")
                    .update({ delivery_status: "failed" })
                    .eq("id", lead.id)
                }
              }
            }
          }
        }
      } catch (error) {
        console.error("Digital product delivery error:", error)
      }
    }

    return NextResponse.json({
      success: true,
      lead_id: lead.id,
      download_url: downloadUrl,
      file_name: fileName
    })
  } catch (error) {
    console.error("Lead submission error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// GET - Fetch leads for owner (authenticated)
export async function GET(request: Request) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get user's onepage
    const { data: onepage } = await supabase
      .from("onepages")
      .select("id")
      .eq("owner_id", user.id)
      .single()

    if (!onepage) {
      return NextResponse.json({ leads: [] })
    }

    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get("limit") || "50")
    const offset = parseInt(searchParams.get("offset") || "0")

    const { data: leads, error, count } = await supabase
      .from("onepage_leads")
      .select("*", { count: "exact" })
      .eq("onepage_id", onepage.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      console.error("Leads fetch error:", error)
      return NextResponse.json({ error: "Failed to fetch leads" }, { status: 500 })
    }

    return NextResponse.json({ leads, total: count })
  } catch (error) {
    console.error("Leads GET error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
