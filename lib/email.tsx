import { Resend } from "resend"

/**
 * Email sending via Resend
 * ✅ Stable links (SITE_URL / APP_URL)
 * ✅ Safe URL building (no double slashes)
 * ✅ Plain-text fallback (deliverability)
 * ✅ From name = creator/store name (dynamic)
 * ✅ Reply-To priority: creator support_email → creator profile email → platform support
 * ✅ Keeps old export resolveSellerEmail for backwards compatibility (fixes your build error)
 */

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

// MUST be a real mailbox on your verified domain in Resend
const FROM_EMAIL = "noreplycustomers@materiabuilder.store"

// Platform fallback support
const DEFAULT_SUPPORT = "support@materiabuilder.store"
const PLATFORM_BRAND_NAME = "Materia Builder"

// -------------------------
// URL + safety helpers
// -------------------------
function getStableBaseUrl(fallback?: string) {
  const envUrl =
    process.env.SITE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    ""

  const raw = (envUrl || fallback || "").trim()
  if (!raw) return "https://materiabuilder.store"

  const withScheme = raw.startsWith("http://") || raw.startsWith("https://") ? raw : `https://${raw}`
  return withScheme.replace(/\/+$/, "")
}

function buildUrl(path: string, baseUrl?: string) {
  const base = getStableBaseUrl(baseUrl)
  return new URL(path.startsWith("/") ? path : `/${path}`, base).toString()
}

function normalizeEmail(email: string) {
  return (email || "").toLowerCase().trim()
}

function safeText(s: string) {
  return (s || "").toString().replace(/\s+/g, " ").trim()
}

function safeName(name?: string) {
  return safeText(name || "").replace(/[<>]/g, "")
}

function buildFromHeader(displayName?: string) {
  const name = safeName(displayName) || PLATFORM_BRAND_NAME
  return `${name} <${FROM_EMAIL}>`
}

// -------------------------
// Types
// -------------------------
export interface EmailLogData {
  orderId: string
  emailType: "buyer_download" | "seller_notification" | "receipt_resend"
  recipientEmail: string
  status: "pending" | "sent" | "failed" | "retrying"
  attempt: number
  errorMessage?: string
}

export interface SendBuyerEmailParams {
  orderId: string
  creatorId?: string
  buyerEmail: string
  buyerFirstName: string
  productTitle: string
  receiptToken: string
  sellerReplyTo?: string
  baseUrl?: string
}

export interface SendSellerEmailParams {
  orderId: string
  creatorId?: string
  sellerEmail: string
  productTitle: string
  buyerFirstName: string
  buyerLastName: string
  buyerEmail: string
  amountCents: number
  feeCents: number
  baseUrl?: string
}

// -------------------------
// DB helpers (logging)
// -------------------------
export async function logEmailAttempt(admin: any, data: EmailLogData): Promise<string | null> {
  try {
    const { data: log, error } = await admin
      .from("email_logs")
      .insert({
        order_id: data.orderId,
        email_type: data.emailType,
        recipient_email: data.recipientEmail,
        status: data.status,
        attempt: data.attempt,
        error_message: data.errorMessage || null,
        provider: "resend",
      })
      .select("id")
      .single()

    if (error) {
      console.error("[email] Failed to log email attempt:", error)
      return null
    }
    return log?.id || null
  } catch (err) {
    console.error("[email] Error logging email:", err)
    return null
  }
}

export async function updateEmailLog(
  admin: any,
  logId: string,
  status: "sent" | "failed" | "retrying",
  errorMessage?: string,
): Promise<void> {
  try {
    await admin
      .from("email_logs")
      .update({
        status,
        error_message: errorMessage || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", logId)
  } catch (err) {
    console.error("[email] Error updating email log:", err)
  }
}

export async function wasEmailAlreadySent(admin: any, orderId: string, emailType: string): Promise<boolean> {
  try {
    const { data } = await admin
      .from("email_logs")
      .select("id")
      .eq("order_id", orderId)
      .eq("email_type", emailType)
      .eq("status", "sent")
      .maybeSingle()

    return !!data
  } catch (err) {
    console.error("[email] Error checking email status:", err)
    return false
  }
}

export async function updateOrderEmailStatus(
  admin: any,
  orderId: string,
  type: "buyer" | "seller",
  success: boolean,
  errorMessage?: string,
): Promise<void> {
  try {
    const updates: Record<string, any> = {}

    if (type === "buyer") {
      updates.buyer_notified_at = success ? new Date().toISOString() : null
      if (!success && errorMessage) updates.buyer_email_last_error = errorMessage.substring(0, 500)
    } else {
      updates.seller_notified_at = success ? new Date().toISOString() : null
      if (!success && errorMessage) updates.seller_email_last_error = errorMessage.substring(0, 500)
    }

    await admin.from("orders").update(updates).eq("id", orderId)
  } catch (err) {
    console.error("[email] Error updating order email status:", err)
  }
}

// -------------------------
// Creator identity resolution
// (matches YOUR schema: creators.headline + creators.slug + creators.support_email + creators.user_id)
// profiles: email + display_name + username
// -------------------------
export async function resolveCreatorIdentity(
  admin: any,
  creatorId: string,
): Promise<{ fromName: string; replyTo: string; sellerEmail: string }> {
  try {
    console.log("[email] Resolving creator identity for:", creatorId)

    const { data: creator, error: creatorError } = await admin
      .from("creators")
      .select("headline, slug, support_email, user_id")
      .eq("id", creatorId)
      .single()

    if (creatorError) {
      console.error("[email] Error fetching creator:", creatorError)
    }

    let fromName = ""
    let replyTo = ""
    let sellerEmail = ""

    // reply-to: prefer creator support email
    if (creator?.support_email?.trim()) {
      replyTo = creator.support_email.trim()
      sellerEmail = replyTo
      console.log("[email] Found creator support_email:", sellerEmail)
    }

    // from name: prefer PROFILE DISPLAY NAME first (what you want)
    if (creator?.user_id) {
      const { data: profile, error: profileError } = await admin
        .from("profiles")
        .select("email, display_name, username")
        .eq("id", creator.user_id)
        .single()

      if (profileError) {
        console.error("[email] Error fetching profile:", profileError)
      }

      // ✅ FROM NAME priority: display_name → username
      if (profile?.display_name?.trim()) fromName = profile.display_name.trim()
      else if (profile?.username?.trim()) fromName = profile.username.trim()

      // fallback reply-to and seller email from profile email
      if (!replyTo && profile?.email?.trim()) {
        replyTo = profile.email.trim()
        console.log("[email] Using profile email as replyTo:", replyTo)
      }

      // Seller email should be the profile email if we don't have support_email
      if (!sellerEmail && profile?.email?.trim()) {
        sellerEmail = profile.email.trim()
        console.log("[email] Using profile email as seller email:", sellerEmail)
      }
    }

    // Also try to get the user's auth email if we still don't have a seller email
    if (!sellerEmail && creator?.user_id) {
      try {
        // Try auth.users if available via admin
        const { data: authUser } = await admin.auth.admin.getUserById(creator.user_id)
        if (authUser?.user?.email) {
          sellerEmail = authUser.user.email.trim()
          if (!replyTo) replyTo = sellerEmail
          console.log("[email] Using auth email as seller email:", sellerEmail)
        }
      } catch (authErr) {
        // This might fail if auth admin is not available, which is fine
        console.log("[email] Could not fetch auth user email (this is fine):", authErr)
      }
    }

    // last fallback for name (only if no profile display_name/username)
    if (!fromName) {
      if (creator?.headline?.trim()) fromName = creator.headline.trim()
      else if (creator?.slug?.trim()) fromName = creator.slug.trim()
    }

    const result = {
      fromName: safeName(fromName) || PLATFORM_BRAND_NAME,
      replyTo: normalizeEmail(replyTo) || DEFAULT_SUPPORT,
      sellerEmail: normalizeEmail(sellerEmail) || DEFAULT_SUPPORT,
    }

    console.log("[email] Resolved creator identity:", {
      creatorId,
      fromName: result.fromName,
      replyTo: result.replyTo,
      sellerEmail: result.sellerEmail,
    })

    return result
  } catch (err) {
    console.error("[email] Error resolving creator identity:", err)
    return {
      fromName: PLATFORM_BRAND_NAME,
      replyTo: DEFAULT_SUPPORT,
      sellerEmail: DEFAULT_SUPPORT,
    }
  }
}

/**
 * ✅ BACKWARDS COMPAT (THIS FIXES YOUR BUILD):
 * Your routes import resolveSellerEmail(admin, creatorId)
 * Keep this export forever so old imports never break.
 */
export async function resolveSellerEmail(admin: any, creatorId: string): Promise<string> {
  if (!creatorId) {
    console.warn("[email] resolveSellerEmail called without creatorId")
    return DEFAULT_SUPPORT
  }
  const { sellerEmail } = await resolveCreatorIdentity(admin, creatorId)
  console.log("[email] resolveSellerEmail result:", sellerEmail)
  return sellerEmail || DEFAULT_SUPPORT
}

// -------------------------
// Email templates
// -------------------------
function buyerEmailHtml(params: {
  buyerFirstName: string
  productTitle: string
  receiptLink: string
  supportEmail: string
  footerBrand: string
}) {
  const firstName = safeName(params.buyerFirstName) || "there"
  const productTitle = safeText(params.productTitle)
  const receiptLink = params.receiptLink
  const supportEmail = params.supportEmail
  const footerBrand = safeText(params.footerBrand)

  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
  <title>Your download is ready</title>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;background-color:#f6f9fc;">
  <table role="presentation" style="width:100%;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" style="max-width:600px;width:100%;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 6px 18px rgba(0,0,0,0.08);">
          <tr>
            <td style="padding:44px 36px 30px;text-align:center;background:#111827;">
              <h1 style="margin:0;font-size:28px;font-weight:800;color:#fff;">Your download is ready</h1>
              <p style="margin:10px 0 0 0;font-size:15px;color:rgba(255,255,255,0.85);">Thanks for your purchase</p>
            </td>
          </tr>

          <tr>
            <td style="padding:34px 34px 12px;">
              <p style="margin:0 0 16px 0;font-size:16px;color:#111827;">Hi ${firstName},</p>
              <p style="margin:0 0 18px 0;font-size:15px;color:#374151;line-height:1.55;">
                Thanks for getting <strong>${productTitle}</strong>. Your download is ready.
              </p>

              <table role="presentation" style="width:100%;background:#f3f4f6;border-radius:10px;padding:18px;margin:0 0 22px 0;">
                <tr>
                  <td>
                    <p style="margin:0 0 6px 0;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.9px;font-weight:700;">Product</p>
                    <p style="margin:0;font-size:18px;font-weight:800;color:#111827;">${productTitle}</p>
                  </td>
                </tr>
              </table>

              <table role="presentation" style="width:100%;margin:0 0 18px 0;">
                <tr>
                  <td align="center">
                    <a href="${receiptLink}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:14px 26px;border-radius:10px;font-size:15px;font-weight:800;">
                      Download now
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 8px 0;font-size:13px;color:#6b7280;">If the button doesn’t work, copy this link:</p>
              <p style="margin:0 0 24px 0;font-size:12px;color:#4f46e5;word-break:break-all;">${receiptLink}</p>

              <hr style="border:none;border-top:1px solid #e5e7eb;margin:22px 0;" />

              <p style="margin:0;font-size:12px;color:#6b7280;text-align:center;line-height:1.5;">
                Need help? Reply to this email or contact <a href="mailto:${supportEmail}" style="color:#4f46e5;text-decoration:none;">${supportEmail}</a>
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:16px 22px;text-align:center;background:#f9fafb;color:#9ca3af;font-size:11px;">
              © ${new Date().getFullYear()} ${footerBrand}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

function buyerEmailText(params: { buyerFirstName: string; productTitle: string; receiptLink: string }) {
  const firstName = safeName(params.buyerFirstName) || "there"
  const productTitle = safeText(params.productTitle)
  const receiptLink = params.receiptLink

  return `Hi ${firstName},

Thanks for getting "${productTitle}". Your download is ready.

Download: ${receiptLink}

If you need help, reply to this email.`
}

function sellerEmailHtml(params: {
  productTitle: string
  buyerFirstName: string
  buyerLastName: string
  buyerEmail: string
  amountCents: number
  feeCents: number
  ordersLink: string
  footerBrand: string
}) {
  const productTitle = safeText(params.productTitle)
  const buyerFirstName = safeName(params.buyerFirstName)
  const buyerLastName = safeName(params.buyerLastName)
  const buyerEmail = safeText(params.buyerEmail)
  const ordersLink = params.ordersLink
  const isFree = params.amountCents === 0
  const earnings = params.amountCents - params.feeCents
  const footerBrand = safeText(params.footerBrand)

  const formatUSD = (cents: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100)

  const dateStr = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  })

  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
  <title>New sale</title>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;background-color:#f6f9fc;">
  <table role="presentation" style="width:100%;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" style="max-width:600px;width:100%;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 6px 18px rgba(0,0,0,0.08);">
          <tr>
            <td style="padding:44px 36px 30px;text-align:center;background:#065f46;">
              <h1 style="margin:0;font-size:28px;font-weight:800;color:#fff;">New sale</h1>
              <p style="margin:10px 0 0 0;font-size:15px;color:rgba(255,255,255,0.9);">You sold ${productTitle}</p>
            </td>
          </tr>

          <tr>
            <td style="padding:34px 34px 12px;">
              <table role="presentation" style="width:100%;background:#f3f4f6;border-radius:10px;padding:18px;margin:0 0 18px 0;">
                <tr>
                  <td>
                    <p style="margin:0 0 6px 0;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.9px;font-weight:700;">Customer</p>
                    <p style="margin:0 0 4px 0;font-size:15px;color:#111827;">${buyerFirstName} ${buyerLastName}</p>
                    <p style="margin:0 0 14px 0;font-size:13px;color:#6b7280;">${buyerEmail}</p>

                    <p style="margin:0 0 6px 0;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.9px;font-weight:700;">Date</p>
                    <p style="margin:0 0 14px 0;font-size:13px;color:#374151;">${dateStr}</p>

                    <p style="margin:0 0 6px 0;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.9px;font-weight:700;">Total</p>
                    <p style="margin:0 0 12px 0;font-size:20px;font-weight:900;color:#065f46;">${isFree ? "Free" : formatUSD(params.amountCents)}</p>

                    ${
                      !isFree
                        ? `<p style="margin:0 0 6px 0;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.9px;font-weight:700;">Your earnings (after fees)</p>
                           <p style="margin:0;font-size:16px;font-weight:800;color:#047857;">${formatUSD(earnings)}</p>`
                        : ""
                    }
                  </td>
                </tr>
              </table>

              <table role="presentation" style="width:100%;margin:0 0 8px 0;">
                <tr>
                  <td align="center">
                    <a href="${ordersLink}" style="display:inline-block;background:#10b981;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-size:14px;font-weight:800;">
                      View orders
                    </a>
                  </td>
                </tr>
              </table>

              <hr style="border:none;border-top:1px solid #e5e7eb;margin:18px 0;" />
              <p style="margin:0;font-size:12px;color:#6b7280;text-align:center;line-height:1.5;">
                This is a transactional email for your store.
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:16px 22px;text-align:center;background:#f9fafb;color:#9ca3af;font-size:11px;">
              © ${new Date().getFullYear()} ${footerBrand}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

function sellerEmailText(params: {
  productTitle: string
  buyerFirstName: string
  buyerLastName: string
  buyerEmail: string
  amountCents: number
  feeCents: number
  ordersLink: string
}) {
  const isFree = params.amountCents === 0
  const earnings = params.amountCents - params.feeCents
  const formatUSD = (cents: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100)

  return `New sale: ${safeText(params.productTitle)}

Customer: ${safeName(params.buyerFirstName)} ${safeName(params.buyerLastName)} (${safeText(params.buyerEmail)})
Total: ${isFree ? "Free" : formatUSD(params.amountCents)}
${isFree ? "" : `Earnings (after fees): ${formatUSD(earnings)}`}

View orders: ${params.ordersLink}`
}

// -------------------------
// Public send functions
// -------------------------
export async function sendBuyerDownloadEmail(
  admin: any,
  params: SendBuyerEmailParams,
  attempt = 1,
): Promise<{ success: boolean; error?: string; logId?: string }> {
  const { orderId, creatorId, buyerEmail, buyerFirstName, productTitle, receiptToken, sellerReplyTo, baseUrl } = params

  const alreadySent = await wasEmailAlreadySent(admin, orderId, "buyer_download")
  if (alreadySent) return { success: true }

  const logId = await logEmailAttempt(admin, {
    orderId,
    emailType: "buyer_download",
    recipientEmail: buyerEmail,
    status: "pending",
    attempt,
  })

  if (!resend) {
    const error = "Email service not configured (RESEND_API_KEY missing)"
    if (logId) await updateEmailLog(admin, logId, "failed", error)
    await updateOrderEmailStatus(admin, orderId, "buyer", false, error)
    return { success: false, error, logId: logId || undefined }
  }

  const identity = creatorId ? await resolveCreatorIdentity(admin, creatorId) : null
  const fromName = identity?.fromName || PLATFORM_BRAND_NAME

  // Reply-To priority:
  // 1) sellerReplyTo param
  // 2) creator support_email / profile email
  // 3) platform support
  const replyTo = normalizeEmail(sellerReplyTo || "") || identity?.replyTo || DEFAULT_SUPPORT

  const receiptLink = buildUrl(`/receipt/${encodeURIComponent(receiptToken)}`, baseUrl)
  const customerEmail = normalizeEmail(buyerEmail)
  const subject = `Your download is ready - ${safeText(productTitle)}`

  try {
    const response = await resend.emails.send({
      from: buildFromHeader(fromName),
      to: customerEmail,
      replyTo,
      subject,
      html: buyerEmailHtml({
        buyerFirstName,
        productTitle,
        receiptLink,
        supportEmail: replyTo,
        footerBrand: fromName,
      }),
      text: buyerEmailText({ buyerFirstName, productTitle, receiptLink }),
    })

    if ((response as any)?.error) throw new Error((response as any).error.message || "Resend API error")

    if (logId) await updateEmailLog(admin, logId, "sent")
    await updateOrderEmailStatus(admin, orderId, "buyer", true)
    return { success: true, logId: logId || undefined }
  } catch (err: any) {
    const errorMessage = err?.message || "Unknown error sending email"
    if (logId) await updateEmailLog(admin, logId, "failed", errorMessage)
    await updateOrderEmailStatus(admin, orderId, "buyer", false, errorMessage)
    return { success: false, error: errorMessage, logId: logId || undefined }
  }
}

export async function sendSellerNotificationEmail(
  admin: any,
  params: SendSellerEmailParams,
  attempt = 1,
): Promise<{ success: boolean; error?: string; logId?: string }> {
  const {
    orderId,
    creatorId,
    sellerEmail,
    productTitle,
    buyerFirstName,
    buyerLastName,
    buyerEmail,
    amountCents,
    feeCents,
    baseUrl,
  } = params

  console.log("[email] 🔔 Sending seller notification email:", {
    orderId,
    creatorId,
    sellerEmail,
    productTitle,
    buyerEmail,
    amountCents,
  })

  const alreadySent = await wasEmailAlreadySent(admin, orderId, "seller_notification")
  if (alreadySent) {
    console.log("[email] Seller notification already sent for order:", orderId)
    return { success: true }
  }

  const logId = await logEmailAttempt(admin, {
    orderId,
    emailType: "seller_notification",
    recipientEmail: sellerEmail,
    status: "pending",
    attempt,
  })

  if (!resend) {
    const error = "Email service not configured (RESEND_API_KEY missing)"
    console.error("[email] ❌ Seller notification failed:", error)
    if (logId) await updateEmailLog(admin, logId, "failed", error)
    await updateOrderEmailStatus(admin, orderId, "seller", false, error)
    return { success: false, error, logId: logId || undefined }
  }

  const identity = creatorId ? await resolveCreatorIdentity(admin, creatorId) : null
  const fromName = identity?.fromName || PLATFORM_BRAND_NAME
  const replyTo = identity?.replyTo || DEFAULT_SUPPORT

  // Use resolved seller email if provided email is fallback
  let finalSellerEmail = normalizeEmail(sellerEmail)
  if (finalSellerEmail === DEFAULT_SUPPORT && identity?.sellerEmail && identity.sellerEmail !== DEFAULT_SUPPORT) {
    finalSellerEmail = identity.sellerEmail
    console.log("[email] Using resolved seller email instead of fallback:", finalSellerEmail)
  }

  const ordersLink = buildUrl("/app/orders", baseUrl)
  const subject = `New sale: ${safeText(productTitle)}`

  console.log("[email] Sending seller notification to:", finalSellerEmail, "Subject:", subject)

  try {
    const response = await resend.emails.send({
      from: buildFromHeader(fromName),
      to: finalSellerEmail,
      replyTo,
      subject,
      html: sellerEmailHtml({
        productTitle,
        buyerFirstName,
        buyerLastName,
        buyerEmail,
        amountCents,
        feeCents,
        ordersLink,
        footerBrand: fromName,
      }),
      text: sellerEmailText({
        productTitle,
        buyerFirstName,
        buyerLastName,
        buyerEmail,
        amountCents,
        feeCents,
        ordersLink,
      }),
    })

    if ((response as any)?.error) throw new Error((response as any).error.message || "Resend API error")

    console.log("[email] ✅ Seller notification sent successfully to:", finalSellerEmail)
    if (logId) await updateEmailLog(admin, logId, "sent")
    await updateOrderEmailStatus(admin, orderId, "seller", true)
    return { success: true, logId: logId || undefined }
  } catch (err: any) {
    const errorMessage = err?.message || "Unknown error sending email"
    console.error("[email] ❌ Seller notification failed:", errorMessage)
    if (logId) await updateEmailLog(admin, logId, "failed", errorMessage)
    await updateOrderEmailStatus(admin, orderId, "seller", false, errorMessage)
    return { success: false, error: errorMessage, logId: logId || undefined }
  }
}

export async function sendOrderEmails(
  admin: any,
  params: {
    orderId: string
    creatorId: string
    buyerEmail: string
    buyerFirstName: string
    buyerLastName: string
    productTitle: string
    receiptToken: string
    amountCents: number
    feeCents: number
    baseUrl?: string
  },
): Promise<{ buyerSuccess: boolean; sellerSuccess: boolean }> {
  try {
    const {
      orderId,
      creatorId,
      buyerEmail,
      buyerFirstName,
      buyerLastName,
      productTitle,
      receiptToken,
      amountCents,
      feeCents,
      baseUrl,
    } = params

    console.log("[sendOrderEmails] 📧 Processing order emails:", {
      orderId,
      creatorId,
      buyerEmail,
      productTitle,
      amountCents,
    })

    // Send buyer email
    const buyerResult = await sendBuyerDownloadEmail(admin, {
      orderId,
      creatorId,
      buyerEmail,
      buyerFirstName,
      productTitle,
      receiptToken,
      baseUrl,
    })

    console.log("[sendOrderEmails] Buyer email result:", buyerResult.success ? "✅ sent" : "❌ failed", buyerResult.error || "")

    // Get seller email - resolve from creator
    const sellerEmail = await resolveSellerEmail(admin, creatorId)
    console.log("[sendOrderEmails] Resolved seller email:", sellerEmail)

    // Send seller notification email IMMEDIATELY
    const sellerResult = await sendSellerNotificationEmail(admin, {
      orderId,
      creatorId,
      sellerEmail,
      productTitle,
      buyerFirstName,
      buyerLastName,
      buyerEmail,
      amountCents,
      feeCents,
      baseUrl,
    })

    console.log("[sendOrderEmails] Seller email result:", sellerResult.success ? "✅ sent" : "❌ failed", sellerResult.error || "")
    console.log("[sendOrderEmails] 📧 Order emails complete:", {
      orderId,
      buyerSuccess: buyerResult.success,
      sellerSuccess: sellerResult.success,
    })

    return {
      buyerSuccess: buyerResult.success,
      sellerSuccess: sellerResult.success,
    }
  } catch (err: any) {
    console.error("[sendOrderEmails] ❌ Error:", err)
    return { buyerSuccess: false, sellerSuccess: false }
  }
}
