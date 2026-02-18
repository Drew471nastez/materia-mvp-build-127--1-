/**
 * Email sending via Amazon SES SMTP (nodemailer)
 * ✅ Stable links (SITE_URL / APP_URL)
 * ✅ Safe URL building (no double slashes)
 * ✅ Plain-text fallback (deliverability)
 * ✅ From name = creator/store name (dynamic)
 * ✅ Reply-To for purchase emails = seller's email (so buyers can contact sellers)
 * ✅ Reply-To priority: seller email (for purchases) → creator support_email → creator profile email → platform support
 */

import { sendEmail, buildFromHeader, isSmtpConfigured, EMAIL_FROM, EMAIL_REPLY_TO } from "./mail"

// MUST be a real mailbox on your verified domain in Amazon SES
const FROM_EMAIL = EMAIL_FROM

// Platform fallback support
const DEFAULT_SUPPORT = EMAIL_REPLY_TO
const PLATFORM_BRAND_NAME = "Storelib"

// Retry configuration
const MAX_RETRIES = 3
const RETRY_DELAYS = [1000, 2000, 4000] // 1s, 2s, 4s exponential backoff

// -------------------------
// Retry helper with exponential backoff
// -------------------------
async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = MAX_RETRIES,
  context: string = "operation",
): Promise<T> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await fn()
      return result
    } catch (err: any) {
      lastError = err
      const errorMessage = err?.message || err?.error?.message || JSON.stringify(err)
      console.error(`[email] ${context} attempt ${attempt + 1}/${maxRetries + 1} failed:`, errorMessage)

      // Don't retry on certain errors (invalid email, etc.)
      if (errorMessage?.includes("invalid") || errorMessage?.includes("not verified")) {
        throw err
      }

      // Don't retry on the last attempt
      if (attempt < maxRetries) {
        const delay = RETRY_DELAYS[attempt] || RETRY_DELAYS[RETRY_DELAYS.length - 1]
        console.log(`[email] Retrying ${context} in ${delay}ms...`)
        await sleep(delay)
      }
    }
  }

  throw lastError || new Error(`${context} failed after ${maxRetries + 1} attempts`)
}

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
  if (!raw) return "https://storelib.com"

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

function buildFromHeaderLocal(displayName?: string) {
  const name = safeName(displayName) || PLATFORM_BRAND_NAME
  // Extract just the email address from FROM_EMAIL if it contains angle brackets
  const emailMatch = FROM_EMAIL.match(/<(.+)>/)
  const email = emailMatch ? emailMatch[1] : FROM_EMAIL
  return `${name} <${email}>`
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
  variantName?: string | null
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
  variantName?: string | null
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
        provider: "ses",
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
  sellerName?: string
  variantName?: string | null
}) {
  const firstName = safeName(params.buyerFirstName) || "there"
  const productTitle = safeText(params.productTitle)
  const variantName = params.variantName ? safeText(params.variantName) : null
  const displayTitle = variantName ? `${productTitle} (${variantName})` : productTitle
  const receiptLink = params.receiptLink
  const supportEmail = params.supportEmail
  const footerBrand = safeText(params.footerBrand)
  const sellerName = safeName(params.sellerName) || footerBrand
  const sellerInitial = sellerName.charAt(0).toUpperCase()

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
              <!-- Seller Avatar Letter -->
              <div style="width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);display:inline-block;text-align:center;line-height:56px;font-size:24px;font-weight:700;color:#fff;margin-bottom:16px;">${sellerInitial}</div>
              <h1 style="margin:0;font-size:28px;font-weight:800;color:#fff;">Your download is ready</h1>
              <p style="margin:10px 0 0 0;font-size:15px;color:rgba(255,255,255,0.85);">Thanks for your purchase from ${sellerName}</p>
            </td>
          </tr>

          <tr>
            <td style="padding:34px 34px 12px;">
              <p style="margin:0 0 16px 0;font-size:16px;color:#111827;">Hi ${firstName},</p>
              <p style="margin:0 0 18px 0;font-size:15px;color:#374151;line-height:1.55;">
                Thanks for getting <strong>${displayTitle}</strong>. Your download is ready.
              </p>

              <table role="presentation" style="width:100%;background:#f3f4f6;border-radius:10px;padding:18px;margin:0 0 22px 0;">
                <tr>
                  <td>
                    <p style="margin:0 0 6px 0;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.9px;font-weight:700;">Product</p>
                    <p style="margin:0;font-size:18px;font-weight:800;color:#111827;">${productTitle}</p>
                    ${variantName ? `<p style="margin:4px 0 0 0;font-size:14px;font-weight:600;color:#7c3aed;">${variantName}</p>` : ''}
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

              <p style="margin:0 0 8px 0;font-size:13px;color:#6b7280;">If the button doesn't work, copy this link:</p>
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

function buyerEmailText(params: { buyerFirstName: string; productTitle: string; receiptLink: string; variantName?: string | null }) {
  const firstName = safeName(params.buyerFirstName) || "there"
  const productTitle = safeText(params.productTitle)
  const variantName = params.variantName ? safeText(params.variantName) : null
  const displayTitle = variantName ? `${productTitle} (${variantName})` : productTitle
  const receiptLink = params.receiptLink

  return `Hi ${firstName},

Thanks for getting "${displayTitle}". Your download is ready.

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
  variantName?: string | null
}) {
  const productTitle = safeText(params.productTitle)
  const variantName = params.variantName ? safeText(params.variantName) : null
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

  const timeStr = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })

  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
  <title>Cha-Ching! You made a sale</title>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;background-color:#f6f9fc;">
  <table role="presentation" style="width:100%;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" style="max-width:600px;width:100%;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 6px 18px rgba(0,0,0,0.08);">
          <tr>
            <td style="padding:44px 36px 30px;text-align:center;background:linear-gradient(135deg, #059669 0%, #047857 100%);">
              <div style="font-size:48px;margin-bottom:12px;">💰</div>
              <h1 style="margin:0;font-size:32px;font-weight:800;color:#fff;">Cha-Ching!</h1>
              <p style="margin:12px 0 0 0;font-size:17px;color:rgba(255,255,255,0.95);font-weight:500;">You just made a sale!</p>
            </td>
          </tr>

          <tr>
            <td style="padding:34px 34px 12px;">
              <!-- Sale Amount Highlight -->
              <table role="presentation" style="width:100%;background:linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%);border-radius:12px;padding:24px;margin:0 0 24px 0;text-align:center;">
                <tr>
                  <td>
                    <p style="margin:0 0 8px 0;font-size:14px;color:#047857;text-transform:uppercase;letter-spacing:1px;font-weight:700;">${isFree ? "New Customer" : "You Earned"}</p>
                    <p style="margin:0;font-size:${isFree ? "24px" : "36px"};font-weight:900;color:#065f46;">${isFree ? "Free Download" : formatUSD(earnings)}</p>
                    ${!isFree ? `<p style="margin:8px 0 0 0;font-size:13px;color:#6b7280;">from ${formatUSD(params.amountCents)} sale</p>` : ""}
                  </td>
                </tr>
              </table>

              <!-- Product Info -->
              <table role="presentation" style="width:100%;background:#f9fafb;border-radius:10px;padding:20px;margin:0 0 20px 0;">
                <tr>
                  <td>
                    <p style="margin:0 0 6px 0;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.8px;font-weight:700;">Product Sold</p>
                    <p style="margin:0;font-size:18px;font-weight:700;color:#111827;">${productTitle}</p>
                    ${variantName ? `<p style="margin:4px 0 0 0;font-size:14px;font-weight:600;color:#7c3aed;">${variantName}</p>` : ''}
                  </td>
                </tr>
              </table>

              <!-- Customer & Order Details -->
              <table role="presentation" style="width:100%;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;margin:0 0 24px 0;">
                <tr>
                  <td style="padding:16px 20px;border-bottom:1px solid #e5e7eb;">
                    <table role="presentation" style="width:100%;">
                      <tr>
                        <td style="width:50%;">
                          <p style="margin:0 0 4px 0;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.6px;font-weight:600;">Customer</p>
                          <p style="margin:0;font-size:15px;color:#111827;font-weight:600;">${buyerFirstName} ${buyerLastName}</p>
                        </td>
                        <td style="width:50%;text-align:right;">
                          <p style="margin:0 0 4px 0;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.6px;font-weight:600;">Email</p>
                          <p style="margin:0;font-size:14px;color:#4f46e5;">${buyerEmail}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:16px 20px;background:#fafafa;">
                    <table role="presentation" style="width:100%;">
                      <tr>
                        <td style="width:50%;">
                          <p style="margin:0 0 4px 0;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.6px;font-weight:600;">Date</p>
                          <p style="margin:0;font-size:14px;color:#374151;">${dateStr}</p>
                        </td>
                        <td style="width:50%;text-align:right;">
                          <p style="margin:0 0 4px 0;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.6px;font-weight:600;">Time</p>
                          <p style="margin:0;font-size:14px;color:#374151;">${timeStr}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <table role="presentation" style="width:100%;margin:0 0 8px 0;">
                <tr>
                  <td align="center">
                    <a href="${ordersLink}" style="display:inline-block;background:linear-gradient(135deg, #10b981 0%, #059669 100%);color:#fff;text-decoration:none;padding:14px 28px;border-radius:10px;font-size:15px;font-weight:700;box-shadow:0 4px 14px rgba(16, 185, 129, 0.4);">
                      View All Orders
                    </a>
                  </td>
                </tr>
              </table>

              <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0 18px 0;" />
              <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;line-height:1.5;">
                Keep up the great work! Your digital products are making an impact.
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:18px 22px;text-align:center;background:#f9fafb;color:#9ca3af;font-size:11px;">
              © ${new Date().getFullYear()} Storelib · Helping creators sell digital products
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
  variantName?: string | null
}) {
  const isFree = params.amountCents === 0
  const earnings = params.amountCents - params.feeCents
  const formatUSD = (cents: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100)
  const variantName = params.variantName ? safeText(params.variantName) : null
  const productLine = variantName
    ? `Product: ${safeText(params.productTitle)} (${variantName})`
    : `Product: ${safeText(params.productTitle)}`

  return `Cha-Ching! You just made a sale!

${productLine}
Customer: ${safeName(params.buyerFirstName)} ${safeName(params.buyerLastName)} (${safeText(params.buyerEmail)})
${isFree ? "Type: Free Download" : `Amount: ${formatUSD(params.amountCents)}\nYour Earnings: ${formatUSD(earnings)}`}

View all orders: ${params.ordersLink}

Keep up the great work!
- Storelib`
}

// -------------------------
// Public send functions
// -------------------------
export async function sendBuyerDownloadEmail(
  admin: any,
  params: SendBuyerEmailParams,
  attempt = 1,
): Promise<{ success: boolean; error?: string; logId?: string }> {
  const { orderId, creatorId, buyerEmail, buyerFirstName, productTitle, receiptToken, sellerReplyTo, baseUrl, variantName } = params

  const alreadySent = await wasEmailAlreadySent(admin, orderId, "buyer_download")
  if (alreadySent) return { success: true }

  const logId = await logEmailAttempt(admin, {
    orderId,
    emailType: "buyer_download",
    recipientEmail: buyerEmail,
    status: "pending",
    attempt,
  })

  if (!isSmtpConfigured()) {
    const error = "Email service not configured (SMTP credentials missing)"
    if (logId) await updateEmailLog(admin, logId, "failed", error)
    await updateOrderEmailStatus(admin, orderId, "buyer", false, error)
    return { success: false, error, logId: logId || undefined }
  }

  const identity = creatorId ? await resolveCreatorIdentity(admin, creatorId) : null
  const fromName = identity?.fromName || PLATFORM_BRAND_NAME

  // Reply-To priority for buyer emails (purchases):
  // 1) sellerReplyTo param (explicitly passed seller email)
  // 2) identity.sellerEmail (resolved from creator)
  // 3) identity.replyTo (support email)
  // 4) platform support
  // This ensures buyers can reply directly to the seller!
  const replyTo = normalizeEmail(sellerReplyTo || "") || identity?.sellerEmail || identity?.replyTo || DEFAULT_SUPPORT

  const receiptLink = buildUrl(`/receipt/${encodeURIComponent(receiptToken)}`, baseUrl)
  const customerEmail = normalizeEmail(buyerEmail)
  const displayTitle = variantName ? `${safeText(productTitle)} (${safeText(variantName)})` : safeText(productTitle)
  const subject = `Your download is ready - ${displayTitle}`

  try {
    console.log("[email] 📧 Attempting to send buyer email:", {
      from: buildFromHeaderLocal(fromName),
      to: customerEmail,
      replyTo,
      subject,
    })

    const result = await withRetry(
      async () => {
        const response = await sendEmail({
          from: buildFromHeaderLocal(fromName),
          to: customerEmail,
          replyTo,
          subject,
          html: buyerEmailHtml({
            buyerFirstName,
            productTitle,
            receiptLink,
            supportEmail: replyTo,
            footerBrand: fromName,
            sellerName: fromName,
            variantName,
          }),
          text: buyerEmailText({ buyerFirstName, productTitle, receiptLink, variantName }),
        })

        if (!response.success) {
          throw new Error(response.error || "Failed to send email")
        }

        return response
      },
      MAX_RETRIES,
      `buyer email to ${customerEmail}`,
    )

    console.log("[email] ✅ Buyer email sent successfully to:", customerEmail, "ID:", result.messageId)
    if (logId) await updateEmailLog(admin, logId, "sent")
    await updateOrderEmailStatus(admin, orderId, "buyer", true)
    return { success: true, logId: logId || undefined }
  } catch (err: any) {
    const errorMessage = err?.message || err?.error?.message || "Unknown error sending email"
    console.error("[email] ❌ Buyer email failed after retries:", errorMessage, err)
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
    variantName,
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

  if (!isSmtpConfigured()) {
    const error = "Email service not configured (SMTP credentials missing)"
    console.error("[email] ❌ Seller notification failed:", error)
    if (logId) await updateEmailLog(admin, logId, "failed", error)
    await updateOrderEmailStatus(admin, orderId, "seller", false, error)
    return { success: false, error, logId: logId || undefined }
  }

  const identity = creatorId ? await resolveCreatorIdentity(admin, creatorId) : null
  const replyTo = identity?.replyTo || DEFAULT_SUPPORT

  // Use resolved seller email if provided email is fallback
  let finalSellerEmail = normalizeEmail(sellerEmail)
  if (finalSellerEmail === DEFAULT_SUPPORT && identity?.sellerEmail && identity.sellerEmail !== DEFAULT_SUPPORT) {
    finalSellerEmail = identity.sellerEmail
    console.log("[email] Using resolved seller email instead of fallback:", finalSellerEmail)
  }

  const ordersLink = buildUrl("/app/orders", baseUrl)
  // Seller notification emails are always from Storelib
  const subject = `Cha-Ching! You sold ${safeText(productTitle)}`

  console.log("[email] 📧 Attempting to send seller notification:", {
    from: buildFromHeaderLocal(PLATFORM_BRAND_NAME),
    to: finalSellerEmail,
    replyTo,
    subject,
  })

  try {
    const result = await withRetry(
      async () => {
        const response = await sendEmail({
          from: buildFromHeaderLocal(PLATFORM_BRAND_NAME),
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
            footerBrand: PLATFORM_BRAND_NAME,
            variantName,
          }),
          text: sellerEmailText({
            productTitle,
            buyerFirstName,
            buyerLastName,
            buyerEmail,
            amountCents,
            feeCents,
            ordersLink,
            variantName,
          }),
        })

        if (!response.success) {
          throw new Error(response.error || "Failed to send email")
        }

        return response
      },
      MAX_RETRIES,
      `seller notification to ${finalSellerEmail}`,
    )

    console.log("[email] ✅ Seller notification sent successfully to:", finalSellerEmail, "ID:", result.messageId)
    if (logId) await updateEmailLog(admin, logId, "sent")
    await updateOrderEmailStatus(admin, orderId, "seller", true)
    return { success: true, logId: logId || undefined }
  } catch (err: any) {
    const errorMessage = err?.message || err?.error?.message || "Unknown error sending email"
    console.error("[email] ❌ Seller notification failed after retries:", errorMessage, err)
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
    variantName?: string | null
  },
): Promise<{ buyerSuccess: boolean; sellerSuccess: boolean }> {
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
    variantName,
  } = params

  console.log("[sendOrderEmails] 📧 Processing order emails:", {
    orderId,
    creatorId,
    buyerEmail,
    productTitle,
    amountCents,
    smtpConfigured: isSmtpConfigured(),
  })

  // Check if SMTP is configured
  if (!isSmtpConfigured()) {
    const error = "Email service not configured (SMTP credentials missing)"
    console.error("[sendOrderEmails] ❌", error)
    await updateOrderEmailStatus(admin, orderId, "buyer", false, error)
    await updateOrderEmailStatus(admin, orderId, "seller", false, error)
    return { buyerSuccess: false, sellerSuccess: false }
  }

  let buyerResult: { success: boolean; error?: string } = { success: false, error: "Not attempted" }
  let sellerResult: { success: boolean; error?: string } = { success: false, error: "Not attempted" }

  // Get seller email first so we can use it as reply-to for buyer email
  const sellerEmail = await resolveSellerEmail(admin, creatorId)
  console.log("[sendOrderEmails] Resolved seller email for reply-to:", sellerEmail)

  // Send buyer email first (with seller email as reply-to so buyer can contact seller)
  try {
    buyerResult = await sendBuyerDownloadEmail(admin, {
      orderId,
      creatorId,
      buyerEmail,
      buyerFirstName,
      productTitle,
      receiptToken,
      sellerReplyTo: sellerEmail, // Buyer can reply to seller!
      baseUrl,
      variantName,
    })
    console.log("[sendOrderEmails] Buyer email result:", buyerResult.success ? "✅ sent" : "❌ failed", buyerResult.error || "")
  } catch (buyerErr: any) {
    console.error("[sendOrderEmails] ❌ Buyer email error (caught):", buyerErr)
    buyerResult = { success: false, error: buyerErr?.message || "Unknown error" }
    await updateOrderEmailStatus(admin, orderId, "buyer", false, buyerResult.error)
  }

  // ALWAYS try to send seller email, regardless of buyer email result
  try {
    // Send seller notification email
    sellerResult = await sendSellerNotificationEmail(admin, {
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
      variantName,
    })
    console.log("[sendOrderEmails] Seller email result:", sellerResult.success ? "✅ sent" : "❌ failed", sellerResult.error || "")
  } catch (sellerErr: any) {
    console.error("[sendOrderEmails] ❌ Seller email error (caught):", sellerErr)
    sellerResult = { success: false, error: sellerErr?.message || "Unknown error" }
    await updateOrderEmailStatus(admin, orderId, "seller", false, sellerResult.error)
  }

  console.log("[sendOrderEmails] 📧 Order emails complete:", {
    orderId,
    buyerSuccess: buyerResult.success,
    sellerSuccess: sellerResult.success,
    buyerError: buyerResult.error,
    sellerError: sellerResult.error,
  })

  return {
    buyerSuccess: buyerResult.success,
    sellerSuccess: sellerResult.success,
  }
}

// -------------------------
// Lead Magnet / Free Digital Product Email
// -------------------------
export interface SendLeadMagnetEmailParams {
  recipientEmail: string
  productTitle: string
  productFileUrl: string
  creatorId?: string
  onepageId?: string
  baseUrl?: string
  // Custom email content
  customSubject?: string
  customHeading?: string
  customBody?: string
}

export interface SendWelcomeEmailParams {
  recipientEmail: string
  creatorId?: string
  onepageId?: string
  baseUrl?: string
  customSubject?: string
  customHeading?: string
  customBody?: string
}

function leadMagnetEmailHtml(params: {
  productTitle: string
  downloadLink: string
  supportEmail: string
  footerBrand: string
  customHeading?: string
  customBody?: string
  sellerName?: string
}) {
  const productTitle = safeText(params.productTitle)
  const downloadLink = params.downloadLink
  const supportEmail = params.supportEmail
  const footerBrand = safeText(params.footerBrand)
  const heading = params.customHeading ? safeText(params.customHeading) : "Thank you for joining!"
  const bodyText = params.customBody ? safeText(params.customBody) : `Thanks for subscribing! As promised, here's your free digital download: <strong>${productTitle}</strong>`
  const sellerName = safeName(params.sellerName) || footerBrand
  const sellerInitial = sellerName.charAt(0).toUpperCase()

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
            <td style="padding:44px 36px 30px;text-align:center;background:#7c3aed;">
              <!-- Seller Avatar Letter -->
              <div style="width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg, #a78bfa 0%, #8b5cf6 100%);display:inline-block;text-align:center;line-height:56px;font-size:24px;font-weight:700;color:#fff;margin-bottom:16px;">${sellerInitial}</div>
              <h1 style="margin:0;font-size:28px;font-weight:800;color:#fff;">${heading}</h1>
              <p style="margin:10px 0 0 0;font-size:15px;color:rgba(255,255,255,0.9);">Here's your free download from ${sellerName}</p>
            </td>
          </tr>

          <tr>
            <td style="padding:34px 34px 12px;">
              <p style="margin:0 0 18px 0;font-size:15px;color:#374151;line-height:1.55;">
                ${bodyText}
              </p>

              <table role="presentation" style="width:100%;background:#f3f4f6;border-radius:10px;padding:18px;margin:0 0 22px 0;">
                <tr>
                  <td>
                    <p style="margin:0 0 6px 0;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.9px;font-weight:700;">Your Download</p>
                    <p style="margin:0;font-size:18px;font-weight:800;color:#111827;">${productTitle}</p>
                  </td>
                </tr>
              </table>

              <table role="presentation" style="width:100%;margin:0 0 18px 0;">
                <tr>
                  <td align="center">
                    <a href="${downloadLink}" style="display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;padding:14px 26px;border-radius:10px;font-size:15px;font-weight:800;">
                      Download now
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 8px 0;font-size:13px;color:#6b7280;">If the button doesn't work, copy this link:</p>
              <p style="margin:0 0 24px 0;font-size:12px;color:#7c3aed;word-break:break-all;">${downloadLink}</p>

              <hr style="border:none;border-top:1px solid #e5e7eb;margin:22px 0;" />

              <p style="margin:0;font-size:12px;color:#6b7280;text-align:center;line-height:1.5;">
                Need help? Contact <a href="mailto:${supportEmail}" style="color:#7c3aed;text-decoration:none;">${supportEmail}</a>
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

function leadMagnetEmailText(params: { productTitle: string; downloadLink: string }) {
  const productTitle = safeText(params.productTitle)
  const downloadLink = params.downloadLink

  return `Thank you for joining!

Thanks for subscribing! As promised, here's your free digital download: "${productTitle}"

Download: ${downloadLink}

If you need help, reply to this email.`
}

export async function sendLeadMagnetEmail(
  admin: any,
  params: SendLeadMagnetEmailParams,
): Promise<{ success: boolean; error?: string }> {
  const { recipientEmail, productTitle, productFileUrl, creatorId, customSubject, customHeading, customBody } = params

  console.log("[email] 🔍 sendLeadMagnetEmail called with:", {
    recipientEmail,
    productTitle,
    productFileUrl: productFileUrl ? productFileUrl.substring(0, 50) + "..." : "none",
    creatorId,
    smtpConfigured: isSmtpConfigured(),
    customSubject,
    customHeading,
  })

  if (!isSmtpConfigured()) {
    const error = "Email service not configured (SMTP credentials missing)"
    console.error("[email] ❌ Lead magnet email failed:", error)
    return { success: false, error }
  }

  const identity = creatorId ? await resolveCreatorIdentity(admin, creatorId) : null
  const fromName = identity?.fromName || PLATFORM_BRAND_NAME
  const replyTo = identity?.replyTo || DEFAULT_SUPPORT

  const customerEmail = normalizeEmail(recipientEmail)
  const subject = customSubject || `Your download is ready - ${safeText(productTitle)}`
  const fromHeader = buildFromHeaderLocal(fromName)

  console.log("[email] 📧 Sending lead magnet email:", {
    from: fromHeader,
    to: customerEmail,
    replyTo,
    subject,
    productTitle,
    downloadLink: productFileUrl,
  })

  try {
    const result = await withRetry(
      async () => {
        const response = await sendEmail({
          from: fromHeader,
          to: customerEmail,
          replyTo,
          subject,
          html: leadMagnetEmailHtml({
            productTitle,
            downloadLink: productFileUrl,
            supportEmail: replyTo,
            footerBrand: fromName,
            customHeading,
            customBody,
            sellerName: fromName,
          }),
          text: leadMagnetEmailText({ productTitle, downloadLink: productFileUrl }),
        })

        if (!response.success) {
          throw new Error(response.error || "Failed to send email")
        }

        return response
      },
      MAX_RETRIES,
      `lead magnet email to ${customerEmail}`,
    )

    console.log("[email] ✅ Lead magnet email sent successfully to:", customerEmail, "ID:", result.messageId)
    return { success: true }
  } catch (err: any) {
    const errorMessage = err?.message || err?.error?.message || "Unknown error sending email"
    console.error("[email] ❌ Lead magnet email failed after retries:", errorMessage, err)
    return { success: false, error: errorMessage }
  }
}

// -------------------------
// Welcome Email (no download)
// -------------------------
function welcomeEmailHtml(params: {
  heading: string
  bodyText: string
  supportEmail: string
  footerBrand: string
}) {
  const heading = safeText(params.heading)
  const bodyText = safeText(params.bodyText)
  const supportEmail = params.supportEmail
  const footerBrand = safeText(params.footerBrand)

  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
  <title>${heading}</title>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;background-color:#f6f9fc;">
  <table role="presentation" style="width:100%;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" style="max-width:600px;width:100%;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 6px 18px rgba(0,0,0,0.08);">
          <tr>
            <td style="padding:44px 36px 30px;text-align:center;background:#7c3aed;">
              <h1 style="margin:0;font-size:28px;font-weight:800;color:#fff;">${heading}</h1>
            </td>
          </tr>

          <tr>
            <td style="padding:34px 34px 12px;">
              <p style="margin:0 0 24px 0;font-size:15px;color:#374151;line-height:1.55;">
                ${bodyText}
              </p>

              <hr style="border:none;border-top:1px solid #e5e7eb;margin:22px 0;" />

              <p style="margin:0;font-size:12px;color:#6b7280;text-align:center;line-height:1.5;">
                Need help? Contact <a href="mailto:${supportEmail}" style="color:#7c3aed;text-decoration:none;">${supportEmail}</a>
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

function welcomeEmailText(params: { heading: string; bodyText: string }) {
  return `${params.heading}

${params.bodyText}

If you need help, reply to this email.`
}

export async function sendWelcomeEmail(
  admin: any,
  params: SendWelcomeEmailParams,
): Promise<{ success: boolean; error?: string }> {
  const { recipientEmail, creatorId, customSubject, customHeading, customBody } = params

  console.log("[email] 🔍 sendWelcomeEmail called with:", {
    recipientEmail,
    creatorId,
    smtpConfigured: isSmtpConfigured(),
    customSubject,
    customHeading,
  })

  if (!isSmtpConfigured()) {
    const error = "Email service not configured (SMTP credentials missing)"
    console.error("[email] ❌ Welcome email failed:", error)
    return { success: false, error }
  }

  const identity = creatorId ? await resolveCreatorIdentity(admin, creatorId) : null
  const fromName = identity?.fromName || PLATFORM_BRAND_NAME
  const replyTo = identity?.replyTo || DEFAULT_SUPPORT

  const customerEmail = normalizeEmail(recipientEmail)
  const subject = customSubject || "Thanks for subscribing!"
  const heading = customHeading || "Welcome!"
  const bodyText = customBody || "Thanks for joining our newsletter. We're excited to have you!"
  const fromHeader = buildFromHeaderLocal(fromName)

  console.log("[email] 📧 Sending welcome email:", {
    from: fromHeader,
    to: customerEmail,
    replyTo,
    subject,
    heading,
  })

  try {
    const result = await withRetry(
      async () => {
        const response = await sendEmail({
          from: fromHeader,
          to: customerEmail,
          replyTo,
          subject,
          html: welcomeEmailHtml({
            heading,
            bodyText,
            supportEmail: replyTo,
            footerBrand: fromName,
          }),
          text: welcomeEmailText({ heading, bodyText }),
        })

        if (!response.success) {
          throw new Error(response.error || "Failed to send email")
        }

        return response
      },
      MAX_RETRIES,
      `welcome email to ${customerEmail}`,
    )

    console.log("[email] ✅ Welcome email sent successfully to:", customerEmail, "ID:", result.messageId)
    return { success: true }
  } catch (err: any) {
    const errorMessage = err?.message || err?.error?.message || "Unknown error sending email"
    console.error("[email] ❌ Welcome email failed after retries:", errorMessage, err)
    return { success: false, error: errorMessage }
  }
}

// -------------------------
// New Review Notification Email
// -------------------------
export interface SendReviewNotificationParams {
  sellerEmail: string
  creatorId: string
  productTitle: string
  productSlug: string
  reviewerName: string
  reviewRating: number
  reviewContent: string
  baseUrl?: string
}

function reviewNotificationEmailHtml(params: {
  productTitle: string
  reviewerName: string
  reviewRating: number
  reviewContent: string
  productLink: string
  footerBrand: string
}) {
  const productTitle = safeText(params.productTitle)
  const reviewerName = safeName(params.reviewerName) || "A customer"
  const reviewRating = params.reviewRating
  const reviewContent = safeText(params.reviewContent)
  const productLink = params.productLink
  const footerBrand = safeText(params.footerBrand)

  // Generate star rating display
  const stars = "★".repeat(reviewRating) + "☆".repeat(5 - reviewRating)

  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
  <title>New Review on ${productTitle}</title>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;background-color:#f6f9fc;">
  <table role="presentation" style="width:100%;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" style="max-width:600px;width:100%;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 6px 18px rgba(0,0,0,0.08);">
          <tr>
            <td style="padding:44px 36px 30px;text-align:center;background:linear-gradient(135deg, #f59e0b 0%, #d97706 100%);">
              <div style="font-size:48px;margin-bottom:12px;">⭐</div>
              <h1 style="margin:0;font-size:28px;font-weight:800;color:#fff;">New Review!</h1>
              <p style="margin:12px 0 0 0;font-size:17px;color:rgba(255,255,255,0.95);font-weight:500;">Someone left a review on your product</p>
            </td>
          </tr>

          <tr>
            <td style="padding:34px 34px 12px;">
              <!-- Product Info -->
              <table role="presentation" style="width:100%;background:#f9fafb;border-radius:10px;padding:20px;margin:0 0 20px 0;">
                <tr>
                  <td>
                    <p style="margin:0 0 6px 0;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.8px;font-weight:700;">Product</p>
                    <p style="margin:0;font-size:18px;font-weight:700;color:#111827;">${productTitle}</p>
                  </td>
                </tr>
              </table>

              <!-- Review Card -->
              <table role="presentation" style="width:100%;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;margin:0 0 24px 0;">
                <tr>
                  <td style="padding:20px;">
                    <!-- Rating -->
                    <div style="margin-bottom:12px;">
                      <span style="font-size:24px;color:#f59e0b;letter-spacing:2px;">${stars}</span>
                      <span style="margin-left:8px;font-size:14px;color:#6b7280;">(${reviewRating}/5)</span>
                    </div>

                    <!-- Reviewer -->
                    <p style="margin:0 0 12px 0;font-size:14px;color:#6b7280;">
                      <strong style="color:#111827;">${reviewerName}</strong> wrote:
                    </p>

                    <!-- Review Content -->
                    <div style="background:#f9fafb;border-left:4px solid #f59e0b;padding:16px;border-radius:0 8px 8px 0;">
                      <p style="margin:0;font-size:15px;color:#374151;line-height:1.6;font-style:italic;">
                        "${reviewContent}"
                      </p>
                    </div>
                  </td>
                </tr>
              </table>

              <table role="presentation" style="width:100%;margin:0 0 8px 0;">
                <tr>
                  <td align="center">
                    <a href="${productLink}" style="display:inline-block;background:linear-gradient(135deg, #f59e0b 0%, #d97706 100%);color:#fff;text-decoration:none;padding:14px 28px;border-radius:10px;font-size:15px;font-weight:700;box-shadow:0 4px 14px rgba(245, 158, 11, 0.4);">
                      View Product Page
                    </a>
                  </td>
                </tr>
              </table>

              <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0 18px 0;" />
              <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;line-height:1.5;">
                Great reviews help build trust with potential customers!
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:18px 22px;text-align:center;background:#f9fafb;color:#9ca3af;font-size:11px;">
              © ${new Date().getFullYear()} Storelib · Helping creators sell digital products
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

function reviewNotificationEmailText(params: {
  productTitle: string
  reviewerName: string
  reviewRating: number
  reviewContent: string
  productLink: string
}) {
  const stars = "★".repeat(params.reviewRating) + "☆".repeat(5 - params.reviewRating)

  return `New Review on "${safeText(params.productTitle)}"!

${stars} (${params.reviewRating}/5)

${safeName(params.reviewerName) || "A customer"} wrote:

"${safeText(params.reviewContent)}"

View your product page: ${params.productLink}

Great reviews help build trust with potential customers!
- Storelib`
}

export async function sendReviewNotificationEmail(
  admin: any,
  params: SendReviewNotificationParams,
): Promise<{ success: boolean; error?: string }> {
  const {
    sellerEmail,
    creatorId,
    productTitle,
    productSlug,
    reviewerName,
    reviewRating,
    reviewContent,
    baseUrl,
  } = params

  console.log("[email] 📧 Sending review notification email:", {
    sellerEmail,
    creatorId,
    productTitle,
    reviewRating,
    smtpConfigured: isSmtpConfigured(),
  })

  if (!isSmtpConfigured()) {
    const error = "Email service not configured (SMTP credentials missing)"
    console.error("[email] ❌ Review notification email failed:", error)
    return { success: false, error }
  }

  const identity = creatorId ? await resolveCreatorIdentity(admin, creatorId) : null
  const replyTo = identity?.replyTo || DEFAULT_SUPPORT

  // Use resolved seller email if provided email is fallback
  let finalSellerEmail = normalizeEmail(sellerEmail)
  if (finalSellerEmail === DEFAULT_SUPPORT && identity?.sellerEmail && identity.sellerEmail !== DEFAULT_SUPPORT) {
    finalSellerEmail = identity.sellerEmail
    console.log("[email] Using resolved seller email instead of fallback:", finalSellerEmail)
  }

  const productLink = buildUrl(`/p/${encodeURIComponent(productSlug)}#testimonials`, baseUrl)
  const subject = `⭐ New ${reviewRating}-star review on "${safeText(productTitle)}"`
  const fromHeader = buildFromHeaderLocal(PLATFORM_BRAND_NAME)

  console.log("[email] 📧 Attempting to send review notification:", {
    from: fromHeader,
    to: finalSellerEmail,
    replyTo,
    subject,
  })

  try {
    const result = await withRetry(
      async () => {
        const response = await sendEmail({
          from: fromHeader,
          to: finalSellerEmail,
          replyTo,
          subject,
          html: reviewNotificationEmailHtml({
            productTitle,
            reviewerName,
            reviewRating,
            reviewContent,
            productLink,
            footerBrand: PLATFORM_BRAND_NAME,
          }),
          text: reviewNotificationEmailText({
            productTitle,
            reviewerName,
            reviewRating,
            reviewContent,
            productLink,
          }),
        })

        if (!response.success) {
          throw new Error(response.error || "Failed to send email")
        }

        return response
      },
      MAX_RETRIES,
      `review notification to ${finalSellerEmail}`,
    )

    console.log("[email] ✅ Review notification sent successfully to:", finalSellerEmail, "ID:", result.messageId)
    return { success: true }
  } catch (err: any) {
    const errorMessage = err?.message || err?.error?.message || "Unknown error sending email"
    console.error("[email] ❌ Review notification failed after retries:", errorMessage, err)
    return { success: false, error: errorMessage }
  }
}

// -------------------------
// Email Flow Trigger System
// -------------------------
export interface TriggerEmailFlowParams {
  triggerType: "purchase" | "new_subscriber"
  creatorId: string
  recipientEmail: string
  recipientName?: string
  productTitle?: string
  productId?: string
  orderId?: string
}

interface FlowStep {
  id: string
  type: "email" | "delay" | "condition"
  order: number
  config: {
    subject?: string
    body?: string
    preview_text?: string
    delay_value?: number
    delay_unit?: "minutes" | "hours" | "days"
  }
}

interface EmailFlow {
  id: string
  name: string
  trigger_type: string
  status: string
  steps: FlowStep[]
}

export async function triggerEmailFlows(
  admin: any,
  params: TriggerEmailFlowParams
): Promise<{ triggered: number; errors: string[] }> {
  const { triggerType, creatorId, recipientEmail, recipientName, productTitle, productId, orderId } = params
  const errors: string[] = []
  let triggered = 0

  console.log("[email-flows] 🔄 Triggering flows for:", { triggerType, creatorId, recipientEmail })

  try {
    // Find active flows with matching trigger type
    const { data: flows, error: flowsError } = await admin
      .from("email_flows")
      .select("*")
      .eq("creator_id", creatorId)
      .eq("trigger_type", triggerType)
      .eq("status", "active")

    if (flowsError) {
      console.error("[email-flows] ❌ Error fetching flows:", flowsError)
      return { triggered: 0, errors: [flowsError.message] }
    }

    if (!flows || flows.length === 0) {
      console.log("[email-flows] No active flows found for trigger:", triggerType)
      return { triggered: 0, errors: [] }
    }

    console.log("[email-flows] Found", flows.length, "active flow(s)")

    // Get creator identity for sending
    const identity = await resolveCreatorIdentity(admin, creatorId)
    const fromName = identity?.fromName || PLATFORM_BRAND_NAME
    const replyTo = identity?.replyTo || DEFAULT_SUPPORT

    // Process each flow
    for (const flow of flows as EmailFlow[]) {
      try {
        const steps = flow.steps || []
        const emailSteps = steps.filter(s => s.type === "email")

        if (emailSteps.length === 0) {
          console.log("[email-flows] Flow has no email steps:", flow.name)
          continue
        }

        // For now, we'll send the first email immediately and queue the rest
        // In a production system, you'd want a proper job queue for delayed emails
        for (let i = 0; i < emailSteps.length; i++) {
          const step = emailSteps[i]
          const delayMs = calculateDelayMs(step.config.delay_value || 0, step.config.delay_unit || "minutes")

          // Replace personalization tokens
          const personalizedSubject = personalizeContent(step.config.subject || "Update from your purchase", {
            customer_name: recipientName || "there",
            product_name: productTitle || "your product",
          })
          const personalizedBody = personalizeContent(step.config.body || "", {
            customer_name: recipientName || "there",
            product_name: productTitle || "your product",
          })

          // If delay is 0, send immediately; otherwise schedule for later
          if (delayMs === 0) {
            // Send email immediately (no delay)
            try {
              console.log("[email-flows] 📧 Sending flow email immediately to:", recipientEmail)
              const result = await sendEmail({
                from: buildFromHeaderLocal(fromName),
                to: normalizeEmail(recipientEmail),
                replyTo,
                subject: personalizedSubject,
                html: wrapFlowEmailHtml(personalizedBody, fromName),
                text: stripHtml(personalizedBody),
              })

              if (result.success) {
                console.log("[email-flows] ✅ Sent flow email immediately:", flow.name, "to:", recipientEmail)
                triggered++

                // Log the email event (ignore errors if table doesn't exist)
                await admin.from("email_events").insert({
                  flow_id: flow.id,
                  recipient_email: recipientEmail,
                  event_type: "sent",
                  metadata: { step_id: step.id, subject: personalizedSubject },
                }).catch(() => {})
              } else {
                console.error("[email-flows] ❌ Failed to send flow email:", result.error)
                errors.push(`Flow ${flow.name}: ${result.error || "Send failed"}`)
              }
            } catch (emailErr: any) {
              console.error("[email-flows] ❌ Email send error:", emailErr)
              errors.push(`Flow ${flow.name}: ${emailErr.message}`)
            }
          } else {
            // Schedule email for later - store in scheduled_flow_emails table
            const scheduledTime = new Date(Date.now() + delayMs)
            console.log("[email-flows] 📅 Scheduling email for:", scheduledTime.toISOString(), "to:", recipientEmail)

            try {
              const { error: scheduleError } = await admin.from("scheduled_flow_emails").insert({
                flow_id: flow.id,
                step_id: step.id,
                recipient_email: recipientEmail,
                recipient_name: recipientName || null,
                subject: personalizedSubject,
                body: personalizedBody,
                scheduled_for: scheduledTime.toISOString(),
                status: "pending",
                creator_id: creatorId,
                order_id: orderId || null,
                product_id: productId || null,
              })

              if (scheduleError) {
                console.error("[email-flows] ❌ Failed to schedule email:", scheduleError)
                errors.push(`Flow ${flow.name}: Failed to schedule - ${scheduleError.message}`)
              } else {
                console.log("[email-flows] ✅ Email scheduled for:", scheduledTime.toISOString())
                triggered++
              }
            } catch (err: any) {
              console.error("[email-flows] ❌ Schedule error:", err)
              errors.push(`Flow ${flow.name}: ${err.message}`)
            }
          }
        }
      } catch (flowErr: any) {
        errors.push(`Flow ${flow.name}: ${flowErr.message}`)
      }
    }

    console.log("[email-flows] ✅ Completed triggering flows:", { triggered, errors })
    return { triggered, errors }
  } catch (err: any) {
    console.error("[email-flows] ❌ Error triggering flows:", err)
    return { triggered: 0, errors: [err.message] }
  }
}

function calculateDelayMs(value: number, unit: "minutes" | "hours" | "days"): number {
  const multipliers = {
    minutes: 60 * 1000,
    hours: 60 * 60 * 1000,
    days: 24 * 60 * 60 * 1000,
  }
  return value * (multipliers[unit] || multipliers.minutes)
}

function personalizeContent(content: string, tokens: Record<string, string>): string {
  let result = content
  for (const [key, value] of Object.entries(tokens)) {
    const patterns = [
      new RegExp(`{{\\s*${key}\\s*}}`, "gi"),
      new RegExp(`\\{${key}\\}`, "gi"),
      new RegExp(`Customer Name`, "gi"),
      new RegExp(`Product Name`, "gi"),
    ]

    if (key === "customer_name") {
      result = result.replace(/\{\{\s*customer_name\s*\}\}/gi, value)
      result = result.replace(/Customer Name/g, value)
    } else if (key === "product_name") {
      result = result.replace(/\{\{\s*product_name\s*\}\}/gi, value)
      result = result.replace(/Product Name/g, value)
    }
  }
  return result
}

// -------------------------
// Refund Confirmation Emails (Transactional)
// -------------------------
interface SendRefundEmailsParams {
  buyerEmail?: string
  sellerEmail?: string
  sellerContactEmail?: string
  productTitle: string
  refundAmount: number
  currency: string
  orderId: string
  reason: string
  storeName: string
  orderDate?: string
  sellerAvatarUrl?: string
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

export async function sendRefundEmails(params: SendRefundEmailsParams): Promise<void> {
  const { buyerEmail, sellerEmail, sellerContactEmail, productTitle, refundAmount, currency, orderId, reason, storeName, orderDate, sellerAvatarUrl } = params

  const formattedAmount = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
  }).format(refundAmount / 100)

  const refundDateFormatted = new Date().toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })

  const orderDateFormatted = orderDate
    ? new Date(orderDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "N/A"

  const sellerInitials = getInitials(storeName || "ST")
  const escapedStoreName = safeText(storeName || "Store")
  const escapedProduct = safeText(productTitle)
  const shortOrderId = `#${orderId.slice(0, 8).toUpperCase()}`
  const contactEmail = sellerContactEmail || sellerEmail || DEFAULT_SUPPORT
  const baseUrl = getStableBaseUrl()

  // Build seller avatar cell: actual image if available, initials fallback
  const sellerAvatarHtml = sellerAvatarUrl
    ? `<td style="width:32px;height:32px;border-radius:8px;overflow:hidden;"><img src="${sellerAvatarUrl}" alt="${sellerInitials}" width="32" height="32" style="width:32px;height:32px;border-radius:8px;object-fit:cover;display:block;" /></td>`
    : `<td style="width:32px;height:32px;background:#e8e5e0;border-radius:8px;text-align:center;vertical-align:middle;font-weight:700;font-size:13px;color:#888;">${sellerInitials}</td>`

  // Send buyer refund confirmation
  if (buyerEmail) {
    try {
      await withRetry(
        () =>
          sendEmail({
            to: buyerEmail,
            from: buildFromHeader(escapedStoreName),
            replyTo: contactEmail,
            subject: `Your ${formattedAmount} refund has been processed — ${escapedProduct}`,
            html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Refund Confirmation</title>
</head>
<body style="margin:0;padding:0;background-color:#f0eeeb;font-family:-apple-system,'Segoe UI',Helvetica,sans-serif;color:#1a1a1a;-webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0eeeb;padding:40px 16px;">
    <tr>
      <td align="center">
        <!-- Email Card -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.04),0 8px 30px rgba(0,0,0,0.06);">

          <!-- Header -->
          <tr>
            <td style="padding:36px 36px 28px;border-bottom:1px solid #f0eeeb;">
              <!-- Seller Info Badge -->
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                <tr>
                  <td style="background:#fafaf8;border:1px solid #eeedea;border-radius:10px;padding:10px 14px;">
                    <table role="presentation" cellpadding="0" cellspacing="0">
                      <tr>
                        ${sellerAvatarHtml}
                        <td style="padding-left:10px;">
                          <span style="font-size:13.5px;font-weight:600;color:#1a1a1a;letter-spacing:-0.2px;">${escapedStoreName}</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;letter-spacing:-0.5px;color:#1a1a1a;line-height:1.3;">Your refund has been processed</h1>
              <p style="margin:0;font-size:14.5px;color:#6b6b6b;line-height:1.55;">We've issued a full refund for your recent purchase. No further action is needed on your end.</p>
            </td>
          </tr>

          <!-- Refund Amount Hero -->
          <tr>
            <td style="padding:32px 36px;text-align:center;background:#fafaf8;border-bottom:1px solid #f0eeeb;">
              <p style="margin:0 0 8px;font-size:11.5px;font-weight:600;text-transform:uppercase;letter-spacing:1.2px;color:#16a34a;">Refund Amount</p>
              <p style="margin:0 0 12px;font-size:44px;font-weight:800;letter-spacing:-2px;color:#1a1a1a;line-height:1;">${formattedAmount}</p>
              <table role="presentation" cellpadding="0" cellspacing="0" align="center">
                <tr>
                  <td style="background:#dcfce7;color:#15803d;font-size:12.5px;font-weight:600;padding:6px 16px;border-radius:100px;letter-spacing:0.1px;">
                    &#10003; Processed
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Refund Details -->
          <tr>
            <td style="padding:28px 36px;border-bottom:1px solid #f0eeeb;">
              <p style="margin:0 0 12px;font-size:11.5px;font-weight:600;text-transform:uppercase;letter-spacing:1px;color:#aaa;">Refund Details</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fafaf8;border:1px solid #eeedea;border-radius:12px;overflow:hidden;">
                <tr>
                  <td style="padding:13px 18px;border-bottom:1px solid #eeedea;font-size:13px;color:#888;font-weight:500;">Product</td>
                  <td style="padding:13px 18px;border-bottom:1px solid #eeedea;font-size:13.5px;color:#1a1a1a;font-weight:600;text-align:right;">${escapedProduct}</td>
                </tr>
                <tr>
                  <td style="padding:13px 18px;border-bottom:1px solid #eeedea;font-size:13px;color:#888;font-weight:500;">Order date</td>
                  <td style="padding:13px 18px;border-bottom:1px solid #eeedea;font-size:13.5px;color:#1a1a1a;font-weight:600;text-align:right;">${orderDateFormatted}</td>
                </tr>
                <tr>
                  <td style="padding:13px 18px;border-bottom:1px solid #eeedea;font-size:13px;color:#888;font-weight:500;">Refund date</td>
                  <td style="padding:13px 18px;border-bottom:1px solid #eeedea;font-size:13.5px;color:#1a1a1a;font-weight:600;text-align:right;">${refundDateFormatted}</td>
                </tr>
                <tr>
                  <td style="padding:13px 18px;border-bottom:1px solid #eeedea;font-size:13px;color:#888;font-weight:500;">Reason</td>
                  <td style="padding:13px 18px;border-bottom:1px solid #eeedea;font-size:13.5px;color:#1a1a1a;font-weight:600;text-align:right;">${safeText(reason)}</td>
                </tr>
                <tr>
                  <td style="padding:13px 18px;font-size:13px;color:#888;font-weight:500;">Order ID</td>
                  <td style="padding:13px 18px;font-size:13.5px;color:#1a1a1a;font-weight:600;text-align:right;font-family:monospace;">${shortOrderId}</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Notices -->
          <tr>
            <td style="padding:24px 36px;border-bottom:1px solid #f0eeeb;">
              <!-- Timeline notice -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fffbeb;border:1px solid #fde68a;border-radius:12px;margin-bottom:10px;">
                <tr>
                  <td style="padding:14px 16px;vertical-align:top;width:30px;">
                    <span style="font-size:16px;color:#d97706;">&#9200;</span>
                  </td>
                  <td style="padding:14px 16px 14px 0;font-size:13.5px;line-height:1.5;color:#92400e;">
                    Please allow <strong style="color:#78350f;">5–10 business days</strong> for the refund to appear on your statement. Timing depends on your bank or card issuer.
                  </td>
                </tr>
              </table>
              <!-- Access notice -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fafaf8;border:1px solid #eeedea;border-radius:12px;">
                <tr>
                  <td style="padding:14px 16px;vertical-align:top;width:30px;">
                    <span style="font-size:16px;color:#999;">&#9432;</span>
                  </td>
                  <td style="padding:14px 16px 14px 0;font-size:13.5px;line-height:1.5;color:#6b6b6b;">
                    Access to this product's download links has been revoked as part of this refund.
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Support CTA -->
          <tr>
            <td style="padding:28px 36px;text-align:center;">
              <p style="margin:0 0 16px;font-size:13.5px;color:#888;line-height:1.6;">Have questions about this refund?</p>
              <table role="presentation" cellpadding="0" cellspacing="0" align="center">
                <tr>
                  <td style="background:#1a1a1a;border-radius:10px;">
                    <a href="mailto:${contactEmail}" style="display:inline-block;color:#ffffff;font-size:13.5px;font-weight:600;padding:12px 30px;text-decoration:none;letter-spacing:-0.1px;">Contact ${escapedStoreName}</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#fafaf8;padding:28px 36px;text-align:center;border-top:1px solid #f0eeeb;">
              <p style="margin:0 0 14px;font-size:11.5px;color:#bbb;line-height:1.65;">
                This email was sent by ${PLATFORM_BRAND_NAME} on behalf of ${escapedStoreName}.<br>
                You received this because you made a purchase on storelib.com.
              </p>
              <p style="margin:0;font-size:11.5px;color:#aaa;">
                <a href="${baseUrl}" style="color:#aaa;text-decoration:none;">Storelib.com</a>
                <span style="color:#ddd;font-size:8px;">&nbsp;&middot;&nbsp;</span>
                <a href="${baseUrl}/help" style="color:#aaa;text-decoration:none;">Help Center</a>
                <span style="color:#ddd;font-size:8px;">&nbsp;&middot;&nbsp;</span>
                <a href="${baseUrl}/terms" style="color:#aaa;text-decoration:none;">Terms</a>
                <span style="color:#ddd;font-size:8px;">&nbsp;&middot;&nbsp;</span>
                <a href="${baseUrl}/privacy" style="color:#aaa;text-decoration:none;">Privacy</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
            text: `Your refund has been processed\n\nWe've issued a full refund for your recent purchase from ${escapedStoreName}.\n\nRefund Amount: ${formattedAmount} (Processed)\n\nRefund Details:\n- Product: ${escapedProduct}\n- Order date: ${orderDateFormatted}\n- Refund date: ${refundDateFormatted}\n- Reason: ${reason}\n- Order ID: ${shortOrderId}\n\nPlease allow 5-10 business days for the refund to appear on your statement.\n\nHave questions? Contact ${escapedStoreName} at ${contactEmail}\n\nThis email was sent by ${PLATFORM_BRAND_NAME} on behalf of ${escapedStoreName}.`,
          }),
        MAX_RETRIES,
        "buyer refund email"
      )
      console.log("[email] ✅ Buyer refund email sent to:", buyerEmail)
    } catch (err) {
      console.error("[email] ❌ Failed to send buyer refund email:", err)
    }
  }

  // Send seller refund notification
  if (sellerEmail) {
    try {
      await withRetry(
        () =>
          sendEmail({
            to: sellerEmail,
            from: buildFromHeader(PLATFORM_BRAND_NAME),
            replyTo: DEFAULT_SUPPORT,
            subject: `Refund Issued — ${formattedAmount} for ${escapedProduct}`,
            html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Refund Issued</title>
</head>
<body style="margin:0;padding:0;background-color:#f0eeeb;font-family:-apple-system,'Segoe UI',Helvetica,sans-serif;color:#1a1a1a;-webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0eeeb;padding:40px 16px;">
    <tr>
      <td align="center">
        <!-- Email Card -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.04),0 8px 30px rgba(0,0,0,0.06);">

          <!-- Header -->
          <tr>
            <td style="padding:36px 36px 28px;border-bottom:1px solid #f0eeeb;">
              <!-- Storelib Badge -->
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                <tr>
                  <td style="background:#fafaf8;border:1px solid #eeedea;border-radius:10px;padding:10px 14px;">
                    <table role="presentation" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="vertical-align:middle;width:24px;height:24px;background-color:#8B56FA;border-radius:6px;text-align:center;"><img src="https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/logostorelib_pixian_ai.png" alt="Storelib" width="18" height="18" style="display:block;width:18px;height:18px;border:0;outline:none;margin:3px auto;" /></td>
                        <td style="padding-left:10px;vertical-align:middle;">
                          <span style="font-size:13.5px;font-weight:600;color:#1a1a1a;letter-spacing:-0.2px;">${PLATFORM_BRAND_NAME}</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;letter-spacing:-0.5px;color:#1a1a1a;line-height:1.3;">A refund has been issued</h1>
              <p style="margin:0;font-size:14.5px;color:#6b6b6b;line-height:1.55;">A refund was processed for one of your orders. This amount will be deducted from your next payout.</p>
            </td>
          </tr>

          <!-- Refund Amount Hero -->
          <tr>
            <td style="padding:32px 36px;text-align:center;background:#fef8f8;border-bottom:1px solid #f0eeeb;">
              <p style="margin:0 0 8px;font-size:11.5px;font-weight:600;text-transform:uppercase;letter-spacing:1.2px;color:#dc2626;">Refund Amount</p>
              <p style="margin:0 0 12px;font-size:44px;font-weight:800;letter-spacing:-2px;color:#dc2626;line-height:1;">-${formattedAmount}</p>
              <table role="presentation" cellpadding="0" cellspacing="0" align="center">
                <tr>
                  <td style="background:#fee2e2;color:#b91c1c;font-size:12.5px;font-weight:600;padding:6px 16px;border-radius:100px;letter-spacing:0.1px;">
                    Deducted from payout
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Refund Details -->
          <tr>
            <td style="padding:28px 36px;border-bottom:1px solid #f0eeeb;">
              <p style="margin:0 0 12px;font-size:11.5px;font-weight:600;text-transform:uppercase;letter-spacing:1px;color:#aaa;">Refund Details</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fafaf8;border:1px solid #eeedea;border-radius:12px;overflow:hidden;">
                <tr>
                  <td style="padding:13px 18px;border-bottom:1px solid #eeedea;font-size:13px;color:#888;font-weight:500;">Product</td>
                  <td style="padding:13px 18px;border-bottom:1px solid #eeedea;font-size:13.5px;color:#1a1a1a;font-weight:600;text-align:right;">${escapedProduct}</td>
                </tr>
                <tr>
                  <td style="padding:13px 18px;border-bottom:1px solid #eeedea;font-size:13px;color:#888;font-weight:500;">Customer</td>
                  <td style="padding:13px 18px;border-bottom:1px solid #eeedea;font-size:13.5px;color:#1a1a1a;font-weight:600;text-align:right;">${buyerEmail || "N/A"}</td>
                </tr>
                <tr>
                  <td style="padding:13px 18px;border-bottom:1px solid #eeedea;font-size:13px;color:#888;font-weight:500;">Order date</td>
                  <td style="padding:13px 18px;border-bottom:1px solid #eeedea;font-size:13.5px;color:#1a1a1a;font-weight:600;text-align:right;">${orderDateFormatted}</td>
                </tr>
                <tr>
                  <td style="padding:13px 18px;border-bottom:1px solid #eeedea;font-size:13px;color:#888;font-weight:500;">Refund date</td>
                  <td style="padding:13px 18px;border-bottom:1px solid #eeedea;font-size:13.5px;color:#1a1a1a;font-weight:600;text-align:right;">${refundDateFormatted}</td>
                </tr>
                <tr>
                  <td style="padding:13px 18px;border-bottom:1px solid #eeedea;font-size:13px;color:#888;font-weight:500;">Reason</td>
                  <td style="padding:13px 18px;border-bottom:1px solid #eeedea;font-size:13.5px;color:#1a1a1a;font-weight:600;text-align:right;">${safeText(reason)}</td>
                </tr>
                <tr>
                  <td style="padding:13px 18px;font-size:13px;color:#888;font-weight:500;">Order ID</td>
                  <td style="padding:13px 18px;font-size:13.5px;color:#1a1a1a;font-weight:600;text-align:right;font-family:monospace;">${shortOrderId}</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Notices -->
          <tr>
            <td style="padding:24px 36px;border-bottom:1px solid #f0eeeb;">
              <!-- Payout notice -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fef8f8;border:1px solid #fecaca;border-radius:12px;margin-bottom:10px;">
                <tr>
                  <td style="padding:14px 16px;vertical-align:top;width:30px;">
                    <span style="font-size:16px;color:#dc2626;">&#9888;</span>
                  </td>
                  <td style="padding:14px 16px 14px 0;font-size:13.5px;line-height:1.5;color:#991b1b;">
                    <strong style="color:#7f1d1d;">${formattedAmount}</strong> will be deducted from your next payout. If no future payout covers the amount, it may be debited from your bank account.
                  </td>
                </tr>
              </table>
              <!-- Dashboard notice -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fafaf8;border:1px solid #eeedea;border-radius:12px;">
                <tr>
                  <td style="padding:14px 16px;vertical-align:top;width:30px;">
                    <span style="font-size:16px;color:#999;">&#9432;</span>
                  </td>
                  <td style="padding:14px 16px 14px 0;font-size:13.5px;line-height:1.5;color:#6b6b6b;">
                    You can view full refund details and payout impact in your Payouts dashboard.
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Dashboard CTA -->
          <tr>
            <td style="padding:28px 36px;text-align:center;">
              <p style="margin:0 0 16px;font-size:13.5px;color:#888;line-height:1.6;">Review this refund in your dashboard</p>
              <table role="presentation" cellpadding="0" cellspacing="0" align="center">
                <tr>
                  <td style="background:#1a1a1a;border-radius:10px;">
                    <a href="${baseUrl}/dashboard/payouts" style="display:inline-block;color:#ffffff;font-size:13.5px;font-weight:600;padding:12px 30px;text-decoration:none;letter-spacing:-0.1px;">View Payouts</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#fafaf8;padding:28px 36px;text-align:center;border-top:1px solid #f0eeeb;">
              <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin-bottom:12px;">
                <tr>
                  <td style="width:20px;height:20px;background-color:#8B56FA;border-radius:5px;text-align:center;opacity:0.5;"><img src="https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/logostorelib_pixian_ai.png" alt="Storelib" width="14" height="14" style="display:block;width:14px;height:14px;border:0;outline:none;margin:3px auto;" /></td>
                </tr>
              </table>
              <p style="margin:0 0 14px;font-size:11.5px;color:#bbb;line-height:1.65;">
                This is an automated notification from ${PLATFORM_BRAND_NAME}.<br>
                You received this because a refund was issued on your store.
              </p>
              <p style="margin:0;font-size:11.5px;color:#aaa;">
                <a href="${baseUrl}" style="color:#aaa;text-decoration:none;">Storelib.com</a>
                <span style="color:#ddd;font-size:8px;">&nbsp;&middot;&nbsp;</span>
                <a href="${baseUrl}/help" style="color:#aaa;text-decoration:none;">Help Center</a>
                <span style="color:#ddd;font-size:8px;">&nbsp;&middot;&nbsp;</span>
                <a href="${baseUrl}/terms" style="color:#aaa;text-decoration:none;">Terms</a>
                <span style="color:#ddd;font-size:8px;">&nbsp;&middot;&nbsp;</span>
                <a href="${baseUrl}/privacy" style="color:#aaa;text-decoration:none;">Privacy</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
            text: `Refund Issued\n\nA refund of ${formattedAmount} has been issued for "${escapedProduct}".\n\nRefund Details:\n- Product: ${escapedProduct}\n- Customer: ${buyerEmail || "N/A"}\n- Order date: ${orderDateFormatted}\n- Refund date: ${refundDateFormatted}\n- Reason: ${reason}\n- Order ID: ${shortOrderId}\n\n${formattedAmount} will be deducted from your next payout.\n\nView details: ${baseUrl}/dashboard/payouts\n\n${PLATFORM_BRAND_NAME}`,
          }),
        MAX_RETRIES,
        "seller refund email"
      )
      console.log("[email] ✅ Seller refund notification sent to:", sellerEmail)
    } catch (err) {
      console.error("[email] ❌ Failed to send seller refund notification:", err)
    }
  }
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim()
}

function wrapFlowEmailHtml(bodyContent: string, fromName: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;background-color:#f6f9fc;">
  <table role="presentation" style="width:100%;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" style="max-width:600px;width:100%;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 6px 18px rgba(0,0,0,0.08);">
          <tr>
            <td style="padding:34px;">
              <div style="font-size:15px;color:#374151;line-height:1.6;">
                ${bodyContent}
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 22px;text-align:center;background:#f9fafb;color:#9ca3af;font-size:11px;">
              © ${new Date().getFullYear()} ${safeText(fromName)}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}
