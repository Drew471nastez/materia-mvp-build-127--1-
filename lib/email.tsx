/**
 * Email sending via Amazon SES SMTP (nodemailer)
 * ✅ Stable links (SITE_URL / APP_URL)
 * ✅ Safe URL building (no double slashes)
 * ✅ Plain-text fallback (deliverability)
 * ✅ From name = creator/store name (dynamic)
 * ✅ Reply-To for purchase emails = seller's email (so buyers can contact sellers)
 * ✅ Reply-To priority: seller email (for purchases) → creator support_email → creator profile email → platform support
 */

import { loadBrand } from "@/lib/email-campaigns/brand-server"
import { emailImageSrc, senderPicture } from "@/lib/email-campaigns/sender"
import { buyerReceiptEmailHtml, buyerReceiptEmailText, type ReceiptEmailModel } from "@/lib/receipts/email"
import { sendEmail, buildFromHeader, isSmtpConfigured, EMAIL_FROM, EMAIL_REPLY_TO } from "./mail"
import { creatorTimeZone, formatForCreator } from "@/lib/account/time-zone"
import type { MailAttachment } from "./mailgun"
import { automationEmail, personalize, personalizeText, standingOf } from "@/lib/email-automation"
import { enrollInFlows } from "@/lib/automations/run"
import { normalizeSteps as normalizeFlowSteps, waitMs as flowWaitMs } from "@/lib/automations/flow-model"
import type { ContactSource } from "@/lib/contacts/contact-source"
import { maskEmail } from "@/lib/privacy/mask-email"
import { ignoreError } from "@/lib/supabase/ignore-error"
import { ownerAddress } from "@/lib/businesses/email-alias"
import { STORELIB_EMAIL_LOGO, STORELIB_LOGO_SHADOW, storelibAssetUrl } from "@/lib/brand/logo"
import { emailButton } from "@/lib/mail-document"

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
  /** Sent with the email: a business buyer's invoice, as a PDF. */
  attachments?: MailAttachment[]
  /** Only used if the order cannot be read back for the receipt. */
  amountCents?: number | null
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
  /** What the checkout knew beyond the order rows: a code, a basket's quantities. */
  sale?: SaleExtras
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
        provider: "mailgun",
      })
      .select("id")
      .single()

    if (error) {
      /* Code and message only: the details repeat the whole row, the
         recipient's address included, and that does not belong in a log. */
      console.error("[email] Failed to log email attempt:", error.code, error.message)
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
      console.error("[email] Error fetching creator:", creatorError.code, creatorError.message)
    }

    let fromName = ""
    let replyTo = ""
    let sellerEmail = ""

    // reply-to: prefer creator support email
    if (creator?.support_email?.trim()) {
      replyTo = creator.support_email.trim()
      sellerEmail = replyTo
      console.log("[email] Found creator support_email:", maskEmail(sellerEmail))
    }

    // from name: prefer PROFILE DISPLAY NAME first (what you want)
    if (creator?.user_id) {
      const { data: profile, error: profileError } = await admin
        .from("profiles")
        .select("email, display_name, username")
        .eq("id", creator.user_id)
        .single()

      if (profileError) {
        console.error("[email] Error fetching profile:", profileError.code, profileError.message)
      }

      // ✅ FROM NAME priority: display_name → username
      if (profile?.display_name?.trim()) fromName = profile.display_name.trim()
      else if (profile?.username?.trim()) fromName = profile.username.trim()

      // fallback reply-to and seller email from profile email
      if (!replyTo && profile?.email?.trim()) {
        replyTo = profile.email.trim()
        console.log("[email] Using profile email as replyTo:", maskEmail(replyTo))
      }

      // Seller email should be the profile email if we don't have support_email
      if (!sellerEmail && profile?.email?.trim()) {
        sellerEmail = profile.email.trim()
        console.log("[email] Using profile email as seller email:", maskEmail(sellerEmail))
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
          console.log("[email] Using auth email as seller email:", maskEmail(sellerEmail))
        }
      } catch (authErr) {
        // This might fail if auth admin is not available, which is fine
        console.log("[email] Could not fetch auth user email (this is fine):", authErr instanceof Error ? authErr.message : "unknown")
      }
    }

    // last fallback for name (only if no profile display_name/username)
    if (!fromName) {
      if (creator?.headline?.trim()) fromName = creator.headline.trim()
      else if (creator?.slug?.trim()) fromName = creator.slug.trim()
    }

    /* A second business's address is the owner's with a tag (lib/businesses/email-alias):
       the seller's mail and a buyer's reply go to the owner's real inbox. */
    const result = {
      fromName: safeName(fromName) || PLATFORM_BRAND_NAME,
      replyTo: normalizeEmail(ownerAddress(replyTo) ?? "") || DEFAULT_SUPPORT,
      sellerEmail: normalizeEmail(ownerAddress(sellerEmail) ?? "") || DEFAULT_SUPPORT,
    }

    /* Masked: the seller's own address does not belong in a log. */
    console.log("[email] Resolved creator identity:", {
      creatorId,
      replyTo: maskEmail(result.replyTo),
      sellerEmail: maskEmail(result.sellerEmail),
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

  return sellerEmail || DEFAULT_SUPPORT
}

// -------------------------
// Email templates
// -------------------------
/**
 * Everything in these templates that came from a person (a product title, a
 * variant, a first name, a store name) goes through escapeHtml. A title of
 * `<a href=...>` must arrive as text, not as a link in the seller's name.
 */
export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

/* The receipt email itself is drawn in lib/receipts/email.ts, pure, so a test and a probe draw exactly what is sent. */
export { buyerReceiptEmailHtml, buyerReceiptEmailText }
export type { ReceiptEmailModel }

/**
 * The email model, from the same loader as the receipt page, so the two show
 * the same items and totals. `fallback` covers an order the loader cannot
 * read (it should not happen, and an email with less detail beats none).
 */
async function receiptEmailModel(
  admin: any,
  params: {
    receiptToken: string
    receiptLink: string
    buyerFirstName: string
    sellerName: string
    supportEmail: string
    /** The seller, for their one picture as every email of theirs carries it (lib/email-campaigns/sender). */
    creatorId?: string | null
    fallback: { productTitle: string; variantName?: string | null; amountCents?: number | null; orderId: string }
  },
): Promise<ReceiptEmailModel> {
  const { loadReceiptByToken } = await import("@/lib/receipts/load")
  /* The creator's photo and logo as their campaigns read them, so the receipt shows the same one picture. */
  const brand = params.creatorId ? await loadBrand(admin, params.creatorId).catch(() => null) : null
  const { formatMoney, orderNumberOf } = await import("@/lib/receipts/rules")
  const dateOf = (iso: string) => {
    try {
      return new Intl.DateTimeFormat("en-US", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(iso))
    } catch {
      return ""
    }
  }

  let loaded: Awaited<ReturnType<typeof loadReceiptByToken>> = null
  try {
    loaded = await loadReceiptByToken(admin, params.receiptToken)
  } catch (err) {
    console.error("[email] receipt read for email failed:", err instanceof Error ? err.message : err)
  }

  if (loaded) {
    const v = loaded.view
    const money = (c: number) => (c === 0 ? "Free" : formatMoney(c, v.currency, "en-US"))
    const notes: Record<string, string | null> = {
      open: null,
      pending: "Waiting for payment",
      refunded: "Refunded",
      failed: "Payment failed",
      held: "On hold",
    }
    const hasFiles = v.items.some((i) => i.files.length > 0)
    return {
      firstName: v.buyer.firstName || params.buyerFirstName,
      sellerName: v.seller.name || params.sellerName,
      /* Both read profiles.avatar_url; the loader's is the one to hand when the brand could not be read. */
      sellerPicture: senderPicture({ photoUrl: brand?.avatarUrl ?? v.seller.avatarUrl, logoUrl: brand?.logoUrl }),
      orderNumber: v.number,
      dateText: dateOf(v.createdAt),
      items: v.items.map((i) => ({
        title: i.title,
        variantName: i.variantName,
        amountText: money(i.subtotalCents),
        note: notes[i.state] ?? null,
        thumbnailUrl: i.thumbnailUrl,
      })),
      subtotalText: v.tipCents > 0 || v.items.length > 1 ? money(v.subtotalCents) : null,
      tipText: v.tipCents > 0 ? money(v.tipCents) : null,
      totalText: money(v.totalCents),
      refundedText: v.refundedCents > 0 ? formatMoney(v.refundedCents, v.currency, "en-US") : null,
      link: params.receiptLink,
      buttonLabel: v.state === "open" && hasFiles ? "Download your files" : "View your receipt",
      supportEmail: params.supportEmail,
      orderIds: v.items.map((i) => i.orderId),
    }
  }

  const amount = Number(params.fallback.amountCents) || 0
  const amountText = amount === 0 ? "Free" : formatMoney(amount, "USD", "en-US")
  return {
    firstName: params.buyerFirstName,
    sellerName: params.sellerName,
    sellerPicture: senderPicture({ photoUrl: brand?.avatarUrl, logoUrl: brand?.logoUrl }),
    orderNumber: orderNumberOf(params.fallback.orderId),
    dateText: dateOf(new Date().toISOString()),
    items: [{ title: params.fallback.productTitle, variantName: params.fallback.variantName ?? null, amountText, note: null }],
    subtotalText: null,
    tipText: null,
    totalText: amountText,
    refundedText: null,
    link: params.receiptLink,
    buttonLabel: "View your receipt",
    supportEmail: params.supportEmail,
  }
}

/* ─── The seller's sale email: its data ──────────────────────────────── */

/**
 * What a checkout knows that the order rows do not keep: the code and what it
 * took off, and each basket line's quantity and share of the discount. All
 * optional; without them the email lists what the rows say.
 */
export interface SaleExtras {
  couponCode?: string | null
  /** What a code took off a single-product order, in cents. */
  discountCents?: number | null
  /** A basket's lines, by order row: the quantity and what a code took off that line. */
  lines?: Array<{ orderId: string; quantity?: number | null; discountCents?: number | null }>
  currency?: string | null
  country?: string | null
}

/** The data renderEmail("NEW_SALE" | "FIRST_SALE") reads, with what the sender needs around it. */
export interface SaleEmailData {
  data: Record<string, unknown>
  /** Every order row the email describes: one, or each line of a basket. */
  orderIds: string[]
  first: boolean
  occurredAt: string
}

type SaleRow = {
  id: string
  created_at?: string | null
  product_id?: string | null
  amount_cents?: number | null
  tip_cents?: number | null
  fee_cents?: number | null
  application_fee_cents?: number | null
  currency?: string | null
  buyer_email?: string | null
  buyer_first_name?: string | null
  buyer_last_name?: string | null
  buyer_country?: string | null
  buyer_country_code?: string | null
  payment_method?: string | null
  card_brand?: string | null
  card_last4?: string | null
  variant_name?: string | null
  stripe_session_id?: string | null
  status?: string | null
}

const whole = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null)

/**
 * The order behind a sale email, read back from the rows as written, so the
 * email says what the Orders page says: the basket's every line (rows that
 * share the session and the buyer's address), the totals, the fee, the
 * customer and the order's number (#1001 onwards, counted as the Orders page
 * counts them). A row that cannot be read leaves the caller's own figures;
 * anything unknown is left out, never guessed.
 */
export async function saleEmailData(admin: any, params: SendSellerEmailParams): Promise<SaleEmailData> {
  const sale = params.sale ?? {}
  let rows: SaleRow[] = []
  try {
    const { data: row } = await admin.from("orders").select("*").eq("id", params.orderId).maybeSingle()
    if (row) {
      rows = [row as SaleRow]
      const session = typeof row.stripe_session_id === "string" ? row.stripe_session_id : ""
      if (session) {
        const { data: siblings } = await admin.from("orders").select("*").eq("stripe_session_id", session).limit(50)
        const email = (row.buyer_email ?? "").toString().trim().toLowerCase()
        const same = ((siblings ?? []) as SaleRow[]).filter((r) => (r.buyer_email ?? "").toString().trim().toLowerCase() === email)
        if (same.some((r) => r.id === row.id)) rows = same
      }
    }
  } catch (e) {
    console.error("[email] sale email: order not read:", e instanceof Error ? e.message : e)
  }
  rows.sort((a, b) => String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")) || a.id.localeCompare(b.id))

  const titles = new Map<string, string>()
  const productIds = [...new Set(rows.map((r) => r.product_id).filter((id): id is string => typeof id === "string" && id.length > 0))]
  if (productIds.length > 0) {
    try {
      const { data: products } = await admin.from("products").select("id, title").in("id", productIds)
      for (const p of (products ?? []) as Array<{ id: string; title: string | null }>) if (p.title) titles.set(p.id, p.title)
    } catch {
      /* The caller's title stands in. */
    }
  }

  const first = rows[0] ?? null
  const currency = (first?.currency || sale.currency || "usd").toString().toLowerCase()
  const extraFor = (id: string) => sale.lines?.find((l) => l.orderId === id)
  const single = rows.length <= 1

  let lines: Array<{ title: string; variantName: string | null; quantity: number | null; amountCents: number }> = []
  let subtotal = 0
  let discount = 0
  let tip = 0
  let total = 0
  let fee: number | null = null
  if (rows.length > 0) {
    let feeKnown = true
    let feeSum = 0
    for (const r of rows) {
      const amount = Math.max(0, whole(r.amount_cents) ?? 0)
      const rowTip = Math.max(0, whole(r.tip_cents) ?? 0)
      const extra = extraFor(r.id)
      const rowDiscount = Math.max(0, whole(extra?.discountCents) ?? (single ? whole(sale.discountCents) ?? 0 : 0))
      const before = amount - rowTip + rowDiscount
      lines.push({
        title: titles.get(r.product_id ?? "") || (r.id === params.orderId ? safeText(params.productTitle) : "") || "Product",
        variantName: safeText(r.variant_name ?? (r.id === params.orderId ? params.variantName ?? "" : "")) || null,
        quantity: whole(extra?.quantity),
        amountCents: before,
      })
      subtotal += before
      discount += rowDiscount
      tip += rowTip
      total += amount
      const rowFee = whole(r.fee_cents) ?? whole(r.application_fee_cents)
      if (rowFee === null) feeKnown = false
      else feeSum += rowFee
    }
    fee = feeKnown ? feeSum : null
  } else {
    total = Math.max(0, whole(params.amountCents) ?? 0)
    discount = Math.max(0, whole(sale.discountCents) ?? 0)
    subtotal = total + discount
    lines = [{ title: safeText(params.productTitle) || "Product", variantName: safeText(params.variantName ?? "") || null, quantity: null, amountCents: subtotal }]
    fee = whole(params.feeCents) && (params.feeCents as number) > 0 ? (params.feeCents as number) : null
  }
  /* The figures must add up, or the breakdown is left out and the total stands alone. */
  const adds = subtotal - discount + tip === total
  const orderIds = rows.length > 0 ? rows.map((r) => r.id) : [params.orderId]
  const occurredAt = first?.created_at ? String(first.created_at) : new Date().toISOString()

  const [number, isFirst] = await Promise.all([
    first && params.creatorId ? orderNumberFor(admin, params.creatorId, first).catch(() => null) : Promise.resolve(null),
    total > 0 && params.creatorId ? isFirstPaidSale(admin, params.creatorId, orderIds).catch(() => false) : Promise.resolve(false),
  ])

  const nameOf = (a?: string | null, b?: string | null) => [safeName(a ?? ""), safeName(b ?? "")].filter(Boolean).join(" ")
  const customerName = nameOf(first?.buyer_first_name, first?.buyer_last_name) || nameOf(params.buyerFirstName, params.buyerLastName)
  const customerEmail = normalizeEmail(first?.buyer_email || params.buyerEmail || "")
  const country = safeText(first?.buyer_country || first?.buyer_country_code || sale.country || "")
  const data: Record<string, unknown> = {
    orderId: rows[0]?.id ?? params.orderId,
    orderNumber: number ? String(number) : "",
    productTitle: lines[0]?.title ?? safeText(params.productTitle),
    productId: first?.product_id ?? "",
    variantName: lines.length === 1 ? lines[0].variantName ?? "" : "",
    amountCents: total,
    currency,
    lines,
    subtotalCents: adds ? subtotal : null,
    discountCents: adds && discount > 0 ? discount : null,
    couponCode: adds && discount > 0 ? safeText(sale.couponCode ?? "").slice(0, 40) : "",
    tipCents: adds && tip > 0 ? tip : null,
    feeCents: total > 0 ? fee : null,
    customerName,
    customerEmail,
    customerCountry: country,
    paymentMethod: first?.payment_method ?? "",
    cardBrand: first?.card_brand ?? "",
    cardLast4: first?.card_last4 ?? "",
    occurredAt,
  }
  return { data, orderIds, first: isFirst, occurredAt }
}

/**
 * The order's number as the Orders page gives it (lib/orders/order-view
 * groupOrders): the creator's orders oldest first, a basket counted once,
 * from #1001. Counted from the orders before this one; null when there are
 * too many to count here, and the email then names the order by its date.
 */
async function orderNumberFor(admin: any, creatorId: string, first: SaleRow): Promise<number | null> {
  if (!first.created_at) return null
  const { FIRST_ORDER_NUMBER } = await import("@/lib/orders/order-view")
  const { data: products, error: productError } = await admin.from("products").select("id").eq("creator_id", creatorId).limit(2000)
  if (productError || !products?.length) return null
  const ids = (products as Array<{ id: string }>).map((p) => p.id)
  const own = first.stripe_session_id ? `s:${first.stripe_session_id}` : `o:${first.id}`
  const groups = new Set<string>()
  const at = String(first.created_at)
  for (let from = 0; from < 20_000; from += 1000) {
    const { data, error } = await admin
      .from("orders")
      .select("id, stripe_session_id, created_at")
      .in("product_id", ids)
      .lte("created_at", at)
      .order("created_at", { ascending: true })
      .range(from, from + 999)
    if (error) return null
    const page = (data ?? []) as SaleRow[]
    for (const r of page) {
      const when = String(r.created_at ?? "")
      if (when > at || (when === at && r.id >= first.id)) continue
      const key = r.stripe_session_id ? `s:${r.stripe_session_id}` : `o:${r.id}`
      if (key !== own) groups.add(key)
    }
    if (page.length < 1000) return FIRST_ORDER_NUMBER + groups.size
  }
  return null
}

/**
 * The creator's first paid sale: no other paid order on their products
 * (completed, refunded or disputed, above zero) but the rows of this one.
 * The rule lib/orders/sale-events isFirstSale uses, without its flag, which
 * that function may already have set for this very order.
 */
async function isFirstPaidSale(admin: any, creatorId: string, these: string[]): Promise<boolean> {
  const { data: products, error: productError } = await admin.from("products").select("id").eq("creator_id", creatorId).limit(2000)
  if (productError || !products?.length) return false
  let others = admin
    .from("orders")
    .select("id", { count: "exact", head: true })
    .in("product_id", (products as Array<{ id: string }>).map((p) => p.id))
    .in("status", ["completed", "refunded", "disputed"])
    .gt("amount_cents", 0)
  if (these.length > 0) others = others.not("id", "in", `(${these.join(",")})`)
  const { count, error } = await others
  return !error && count === 0
}

// -------------------------
// Public send functions
// -------------------------
export async function sendBuyerDownloadEmail(
  admin: any,
  params: SendBuyerEmailParams,
  attempt = 1,
): Promise<{ success: boolean; error?: string; logId?: string }> {
  const { orderId, creatorId, buyerEmail, buyerFirstName, productTitle, receiptToken, sellerReplyTo, baseUrl, variantName, attachments } = params

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

  /* One email per payment: a basket's lines are read together and listed in
     it, with the same totals the receipt page shows. */
  const model = await receiptEmailModel(admin, {
    receiptToken,
    receiptLink,
    buyerFirstName,
    sellerName: fromName,
    supportEmail: replyTo,
    creatorId,
    fallback: { productTitle, variantName, amountCents: params.amountCents, orderId },
  })
  /* The PDF this email carries (lib/checkout/invoice.ts names it Invoice-… or Receipt-…). */
  const pdf = attachments?.find((a) => a.contentType === "application/pdf")
  if (pdf) {
    model.document = {
      kind: /^Invoice-/.test(pdf.filename) ? "invoice" : "receipt",
      link: buildUrl(`/api/checkout/invoice?token=${encodeURIComponent(receiptToken)}`, baseUrl),
    }
  }
  const firstTitle = model.items[0]?.title ?? productTitle
  const subject =
    model.items.length > 1
      ? `Your receipt from ${safeText(model.sellerName)}: ${model.items.length} items`
      : `Your receipt for ${safeText(firstTitle)}`

  try {
    const result = await withRetry(
      async () => {
        const response = await sendEmail({
          from: buildFromHeaderLocal(fromName),
          to: customerEmail,
          replyTo,
          subject,
          html: buyerReceiptEmailHtml(model),
          text: buyerReceiptEmailText(model),
          attachments,
        })

        if (!response.success) {
          throw new Error(response.error || "Failed to send email")
        }

        return response
      },
      MAX_RETRIES,
      `buyer email for order ${orderId}`,
    )

    console.log("[email] receipt sent for order", orderId, "to", maskEmail(customerEmail), "id:", result.messageId)
    if (logId) await updateEmailLog(admin, logId, "sent")
    /* Every line the email covered is marked, so no line of a basket reads
       as "not emailed" to the seller or on the receipt. */
    for (const id of new Set([orderId, ...(model.orderIds ?? [])])) {
      await updateOrderEmailStatus(admin, id, "buyer", true)
    }
    return { success: true, logId: logId || undefined }
  } catch (err: any) {
    const errorMessage = err?.message || err?.error?.message || "Unknown error sending email"
    console.error("[email] receipt to", maskEmail(customerEmail), "failed after retries:", errorMessage)
    if (logId) await updateEmailLog(admin, logId, "failed", errorMessage)
    await updateOrderEmailStatus(admin, orderId, "buyer", false, errorMessage)
    return { success: false, error: errorMessage, logId: logId || undefined }
  }
}

/**
 * A COPY OF THE RECEIPT TO ANOTHER ADDRESS, from the receipt page's "Send a
 * copy to another email" (app/api/receipt/send-copy). The same email as the
 * receipt, built the same way, and nothing else: no email_logs row, no
 * "already sent" check and no mark on the order, because the order's own
 * address and its delivery status have not changed. A copy that fails does
 * not make the receipt read "We could not email" either.
 */
export async function sendReceiptCopyEmail(
  admin: any,
  params: Omit<SendBuyerEmailParams, "attachments">,
): Promise<{ success: boolean; error?: string }> {
  if (!isSmtpConfigured()) return { success: false, error: "Email service not configured" }
  const identity = params.creatorId ? await resolveCreatorIdentity(admin, params.creatorId) : null
  const fromName = identity?.fromName || PLATFORM_BRAND_NAME
  const replyTo = normalizeEmail(params.sellerReplyTo || "") || identity?.sellerEmail || identity?.replyTo || DEFAULT_SUPPORT
  const model = await receiptEmailModel(admin, {
    receiptToken: params.receiptToken,
    receiptLink: buildUrl(`/receipt/${encodeURIComponent(params.receiptToken)}`, params.baseUrl),
    buyerFirstName: params.buyerFirstName,
    sellerName: fromName,
    supportEmail: replyTo,
    creatorId: params.creatorId,
    fallback: { productTitle: params.productTitle, variantName: params.variantName, amountCents: params.amountCents, orderId: params.orderId },
  })
  const firstTitle = model.items[0]?.title ?? params.productTitle
  const subject =
    model.items.length > 1
      ? `Your receipt from ${safeText(model.sellerName)}: ${model.items.length} items`
      : `Your receipt for ${safeText(firstTitle)}`
  try {
    const sent = await sendEmail({
      from: buildFromHeaderLocal(fromName),
      to: normalizeEmail(params.buyerEmail),
      replyTo,
      subject,
      html: buyerReceiptEmailHtml(model),
      text: buyerReceiptEmailText(model),
    })
    if (!sent.success) console.error("[email] receipt copy for order", params.orderId, "failed:", sent.error)
    return sent.success ? { success: true } : { success: false, error: sent.error || "Failed to send email" }
  } catch (err: any) {
    console.error("[email] receipt copy for order", params.orderId, "failed:", err?.message || err)
    return { success: false, error: err?.message || "Failed to send email" }
  }
}

/**
 * A BUYER'S MESSAGE TO THE SELLER, from the receipt's Contact seller form
 * (app/api/receipt/contact). To the seller's own inbox, as resolveSellerEmail
 * finds it; Reply-To the buyer's address on the order, so the seller answers
 * with Reply. The words and markup are lib/receipts/contact.ts.
 */
export async function sendSellerMessageEmail(
  _admin: any,
  params: { to: string; message: import("@/lib/receipts/contact").SellerMessage },
): Promise<{ success: boolean; error?: string }> {
  if (!isSmtpConfigured()) return { success: false, error: "Email service not configured" }
  const { sellerMessageEmail } = await import("@/lib/receipts/contact")
  const mail = sellerMessageEmail(params.message)
  try {
    const sent = await sendEmail({
      from: buildFromHeaderLocal(mail.fromName),
      to: normalizeEmail(params.to),
      replyTo: normalizeEmail(params.message.buyerEmail),
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
    })
    if (!sent.success) console.error("[email] buyer message failed:", sent.error)
    return sent.success ? { success: true } : { success: false, error: sent.error || "Failed to send email" }
  } catch (err: any) {
    console.error("[email] buyer message failed:", err?.message || err)
    return { success: false, error: err?.message || "Failed to send email" }
  }
}

/**
 * Whether the creator still wants a sale by email, from the engine's
 * preferences (lib/notify/preferences.ts). Read fresh each time; anything
 * that cannot be read sends, as the email always did.
 */
async function sellerWantsSaleEmail(admin: any, creatorId: string | null | undefined): Promise<boolean> {
  if (!creatorId) return true
  try {
    const { data: creator } = await admin.from("creators").select("user_id").eq("id", creatorId).maybeSingle()
    if (!creator?.user_id) return true
    const [{ allowed }, { entryFor }] = await Promise.all([import("@/lib/notify/preferences"), import("@/lib/notify/registry")])
    return await allowed(admin, creator.user_id, entryFor("NEW_SALE"), "email")
  } catch (e) {
    console.error("[email] sale email preference not read; sending:", e instanceof Error ? e.message : e)
    return true
  }
}

/**
 * THE SELLER'S "YOU HAVE A NEW ORDER" EMAIL, once per order.
 *
 *   once        email_logs: an order that already has a "sent" seller email
 *               is not sent again (a basket's email marks each of its lines)
 *   wanted      the creator's Sales by email setting (lib/notify preferences),
 *               read after the once check
 *   to          the creator's address; a second business's goes to the
 *               owner's own inbox (ownerAddress, lib/businesses/email-alias)
 *   drawn in    Storelib's notification layout (lib/notify/templates):
 *               renderEmail("NEW_SALE"), or "FIRST_SALE" for the creator's
 *               first paid order. The engine records the bell for both and
 *               sends neither email itself (emailSentElsewhere in
 *               lib/notify/registry), so the first sale is one email, this
 *               one, with the order in it.
 *   from        "Storelib <...>", Reply-To Storelib support (the creator
 *               replying to their own sale notice should reach a person,
 *               not themselves); the buyer is one click away in the body
 *   headers     the one-click opt-out for sales emails (RFC 8058), a new_sale tag
 */
export async function sendSellerNotificationEmail(
  admin: any,
  params: SendSellerEmailParams,
  attempt = 1,
): Promise<{ success: boolean; error?: string; logId?: string; skipped?: boolean }> {
  const { orderId, creatorId, sellerEmail, baseUrl } = params

  const alreadySent = await wasEmailAlreadySent(admin, orderId, "seller_notification")
  if (alreadySent) {
    console.log("[email] Seller notification already sent for order:", orderId)
    return { success: true }
  }

  /* The seller's own choice (Settings, Notifications, Sales by email). The
     notification engine records the in-app half of the sale and leaves this
     email to this sender (NEW_SALE is emailSentElsewhere in lib/notify/registry). */
  if (!(await sellerWantsSaleEmail(admin, creatorId))) {
    console.log("[email] Seller turned sale emails off; not sent for order:", orderId)
    return { success: true, skipped: true }
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
    console.error("[email] Seller notification failed:", error)
    if (logId) await updateEmailLog(admin, logId, "failed", error)
    await updateOrderEmailStatus(admin, orderId, "seller", false, error)
    return { success: false, error, logId: logId || undefined }
  }

  const [identity, creatorZone, userId] = creatorId
    ? await Promise.all([resolveCreatorIdentity(admin, creatorId), creatorTimeZone(admin, creatorId), creatorUserId(admin, creatorId)])
    : [null, null, null]

  // Use resolved seller email if provided email is fallback
  let finalSellerEmail = normalizeEmail(sellerEmail)
  if (finalSellerEmail === DEFAULT_SUPPORT && identity?.sellerEmail && identity.sellerEmail !== DEFAULT_SUPPORT) {
    finalSellerEmail = identity.sellerEmail
    console.log("[email] Using resolved seller email instead of fallback:", maskEmail(finalSellerEmail))
  }
  /* A second business's tagged address reaches the owner's own inbox. */
  finalSellerEmail = normalizeEmail(ownerAddress(finalSellerEmail) ?? "") || finalSellerEmail

  let rendered: { subject: string; html: string; text: string }
  let covered: string[] = [orderId]
  let first = false
  let headers: Record<string, string> | undefined
  try {
    const sale = await saleEmailData(admin, params)
    covered = sale.orderIds.includes(orderId) ? sale.orderIds : [orderId, ...sale.orderIds]
    first = sale.first
    /* In the creator's own time zone, with its name, not the server's clock. */
    const { date, time } = formatForCreator(sale.occurredAt, creatorZone ?? null)
    const [{ renderEmail }, { unsubscribeUrl, preferencesUrl }] = await Promise.all([import("@/lib/notify/templates"), import("@/lib/notify/unsubscribe")])
    const unsubscribe = userId ? unsubscribeUrl(userId, "sales") : null
    rendered = renderEmail(first ? "FIRST_SALE" : "NEW_SALE", sale.data, {
      baseUrl: getStableBaseUrl(baseUrl),
      recipientName: identity?.fromName ?? null,
      unsubscribeUrl: unsubscribe,
      preferencesUrl: preferencesUrl(),
      when: time ? `${date} at ${time}` : date,
    })
    if (unsubscribe) headers = { "List-Unsubscribe": `<${unsubscribe}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }
  } catch (err: any) {
    const errorMessage = err?.message || "The sale email could not be drawn"
    console.error("[email] Seller notification not drawn:", errorMessage)
    if (logId) await updateEmailLog(admin, logId, "failed", errorMessage)
    await updateOrderEmailStatus(admin, orderId, "seller", false, errorMessage)
    return { success: false, error: errorMessage, logId: logId || undefined }
  }

  try {
    const result = await withRetry(
      async () => {
        const response = await sendEmail({
          // Seller notification emails are always from Storelib
          from: buildFromHeaderLocal(PLATFORM_BRAND_NAME),
          to: finalSellerEmail,
          replyTo: DEFAULT_SUPPORT,
          subject: rendered.subject,
          html: rendered.html,
          text: rendered.text,
          headers: { ...headers, "X-Storelib-Notification": first ? "FIRST_SALE" : "NEW_SALE" },
          tags: first ? [{ name: "new_sale", value: "1" }, { name: "first_sale", value: "1" }] : [{ name: "new_sale", value: "1" }],
        })

        if (!response.success) {
          throw new Error(response.error || "Failed to send email")
        }

        return response
      },
      MAX_RETRIES,
      `seller notification for order ${orderId}`,
    )

    console.log("[email] Seller notification sent for order", orderId, "to", maskEmail(finalSellerEmail), "id:", result.messageId)
    if (logId) await updateEmailLog(admin, logId, "sent")
    await updateOrderEmailStatus(admin, orderId, "seller", true)
    /* A basket is one order and one email: its other lines are marked as
       told, so the per-line calls for them (fulfil-cart-session) and a later
       retry find them sent and do not mail the same order again. */
    for (const other of covered) {
      if (other === orderId) continue
      if (await wasEmailAlreadySent(admin, other, "seller_notification")) continue
      await logEmailAttempt(admin, { orderId: other, emailType: "seller_notification", recipientEmail: finalSellerEmail, status: "sent", attempt })
      await updateOrderEmailStatus(admin, other, "seller", true)
    }
    return { success: true, logId: logId || undefined }
  } catch (err: any) {
    const errorMessage = err?.message || err?.error?.message || "Unknown error sending email"
    console.error("[email] Seller notification failed after retries:", errorMessage)
    if (logId) await updateEmailLog(admin, logId, "failed", errorMessage)
    await updateOrderEmailStatus(admin, orderId, "seller", false, errorMessage)
    return { success: false, error: errorMessage, logId: logId || undefined }
  }
}

/** The creator's login, for the unsubscribe link; null when it cannot be read. */
async function creatorUserId(admin: any, creatorId: string): Promise<string | null> {
  try {
    const { data } = await admin.from("creators").select("user_id").eq("id", creatorId).maybeSingle()
    return typeof data?.user_id === "string" ? data.user_id : null
  } catch {
    return null
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
    /** For the buyer's email only. */
    attachments?: MailAttachment[]
    /** For the seller's email: the code and what it took off. */
    sale?: SaleExtras
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
    attachments,
    sale,
  } = params

  console.log("[sendOrderEmails] order", orderId, "to", maskEmail(buyerEmail), "smtp:", isSmtpConfigured())

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
      attachments,
      amountCents,
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
      sale,
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
                    ${emailButton({ href: downloadLink, label: "Download now", fill: "#7c3aed", padding: "14px 26px", radius: 10, text: "font-size:15px;font-weight:800;", align: "center" })}
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
    recipientEmail: maskEmail(recipientEmail),
    hasFile: !!productFileUrl,
    creatorId,
    smtpConfigured: isSmtpConfigured(),
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
    to: maskEmail(customerEmail),
    replyTo: maskEmail(replyTo),
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

    console.log("[email] ✅ Lead magnet email sent successfully to:", maskEmail(customerEmail), "ID:", result.messageId)
    return { success: true }
  } catch (err: any) {
    const errorMessage = err?.message || err?.error?.message || "Unknown error sending email"
    console.error("[email] ❌ Lead magnet email failed after retries:", errorMessage, err)
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
  /** The review, so the button opens it in the seller's Reviews list, where they can answer it. */
  reviewId?: string
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
                    ${emailButton({ href: productLink, label: "Read and reply", fill: "#1a1a2e", padding: "14px 28px", radius: 10, text: "font-size:15px;font-weight:700;", align: "center" })}
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
              © ${new Date().getFullYear()} Storelib
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

Read and reply: ${params.productLink}

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
    sellerEmail: maskEmail(sellerEmail),
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
    console.log("[email] Using resolved seller email instead of fallback:", maskEmail(finalSellerEmail))
  }

  /* The review in the seller's Reviews list, where they can answer or report it; the product page for an older caller. */
  const productLink = params.reviewId
    ? buildUrl(`/app/reviews?review=${encodeURIComponent(params.reviewId)}`, baseUrl)
    : buildUrl(`/p/${encodeURIComponent(productSlug)}#testimonials`, baseUrl)
  const subject = `New ${reviewRating} star review on "${safeText(productTitle)}"`
  const fromHeader = buildFromHeaderLocal(PLATFORM_BRAND_NAME)

  console.log("[email] 📧 Attempting to send review notification:", {
    to: maskEmail(finalSellerEmail),
    replyTo: maskEmail(replyTo),
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

    console.log("[email] ✅ Review notification sent successfully to:", maskEmail(finalSellerEmail), "ID:", result.messageId)
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
  /** A basket: every product in it. */
  productIds?: string[]
  orderId?: string
  /** Where the person came from (lib/contacts/contact-source), kept on the run for its history. */
  source?: ContactSource | null
}

interface EmailFlow {
  id: string
  name: string
  trigger_type: string
  status: string
  steps: unknown
}

/**
 * A trigger happened: enter the creator's active flows for it.
 *
 * The engine (lib/automations) does this with a unique run per entry, one
 * job per step and a send record before every email, so the same trigger
 * twice (a webhook delivered again, the browser and the webhook reporting
 * one order) sends nothing twice. Before its SQL has run it reports itself
 * unavailable, and the older path below does what it always did.
 */
export async function triggerEmailFlows(
  admin: any,
  params: TriggerEmailFlowParams
): Promise<{ triggered: number; errors: string[] }> {
  try {
    const result = await enrollInFlows({
      triggerType: params.triggerType,
      creatorId: params.creatorId,
      email: params.recipientEmail,
      name: params.recipientName ?? null,
      productId: params.productId ?? null,
      productIds: params.productIds ?? null,
      productTitle: params.productTitle ?? null,
      orderId: params.orderId ?? null,
      source: params.source ?? null,
    })
    if (result.available) return { triggered: result.enrolled, errors: [] }
  } catch (err: any) {
    /* The engine is there and failed: not a reason to send through the
       older path as well, which has no way to tell it would be a second copy. */
    console.error("[email-flows] Could not enter the flows:", err?.message)
    return { triggered: 0, errors: ["Could not enter the flows"] }
  }
  return legacyTriggerEmailFlows(admin, params)
}

/**
 * THE OLDER PATH, for a database without the engine's tables: the first
 * email now, later ones into scheduled_flow_emails for the cron. It reads
 * today's steps (a wait before an email is that email's delay) and will not
 * run a flow with a check in it, because it cannot check anything: sending
 * a win-back to somebody who bought yesterday is worse than not sending.
 */
export async function legacyTriggerEmailFlows(
  admin: any,
  params: TriggerEmailFlowParams
): Promise<{ triggered: number; errors: string[] }> {
  const { triggerType, creatorId, recipientEmail, recipientName, productTitle, productId, orderId } = params
  const errors: string[] = []
  let triggered = 0
  const who = maskEmail(recipientEmail)
  let liveBrand: Awaited<ReturnType<typeof loadBrand>> | null = null

  console.log("[email-flows] Triggering flows for:", { triggerType, creatorId, recipient: who })

  try {
    /**
     * NOBODY WHO HAS LEFT GETS ANOTHER ONE. This was not checked at all: an
     * automation fired on the sign-up and again, days later, out of the
     * queue, whether or not the person had unsubscribed in between. The
     * token comes back from the same read, so the email below can carry the
     * way out that the law and every inbox provider require.
     */
    const standing = await standingOf(admin, creatorId, recipientEmail)
    if (standing.suppressed) {
      console.log("[email-flows] Skipped: this address is not on the creator's list:", who)
      return { triggered: 0, errors: [] }
    }

    // Find active flows with matching trigger type
    const { data: flows, error: flowsError } = await admin
      .from("email_flows")
      .select("*")
      .eq("creator_id", creatorId)
      .eq("trigger_type", triggerType)
      .eq("status", "active")

    if (flowsError) {
      console.error("[email-flows] Error fetching flows:", flowsError.code)
      return { triggered: 0, errors: ["Could not read the flows"] }
    }

    if (!flows || flows.length === 0) {
      console.log("[email-flows] No active flows found for trigger:", triggerType)
      return { triggered: 0, errors: [] }
    }

    // Get creator identity for sending
    const identity = await resolveCreatorIdentity(admin, creatorId)
    const fromName = identity?.fromName || PLATFORM_BRAND_NAME
    const replyTo = identity?.replyTo || DEFAULT_SUPPORT

    for (const flow of flows as EmailFlow[]) {
      try {
        const steps = normalizeFlowSteps(flow.steps)
        if (steps.some((s) => s.type === "condition")) {
          console.log("[email-flows] Skipped a flow with a check: the engine's SQL has not run")
          continue
        }
        const products = Array.isArray((flow as any).trigger_config?.product_ids) ? (flow as any).trigger_config.product_ids : []
        const bought = [...(params.productIds ?? []), ...(productId ? [productId] : [])]
        if (triggerType === "purchase" && products.length > 0 && !bought.some((p: string) => products.includes(p))) continue

        let delayMs = 0
        for (const step of steps) {
          if (step.type === "wait") {
            delayMs += flowWaitMs(step)
            continue
          }
          if (step.type !== "email") continue
          const values = { name: recipientName, product: productTitle }
          const subject = personalizeText(step.config.subject || "A message from " + fromName, values)
          const body = personalize(step.config.body || "", values)

          if (delayMs === 0) {
            try {
              /* The creator's name, logo and photo as they are now, read once per call, like every other automation send. */
              liveBrand ??= await loadBrand(admin, creatorId).catch(() => null)
              const mail = automationEmail({ body, fromName, unsubscribeToken: standing.unsubscribeToken, brand: liveBrand ?? undefined, avatarUrl: liveBrand?.avatarUrl ?? null })
              const result = await sendEmail({
                from: buildFromHeaderLocal(fromName),
                to: normalizeEmail(recipientEmail),
                replyTo,
                subject,
                html: mail.html,
                text: mail.text,
                headers: mail.headers,
              })

              if (result.success) {
                console.log("[email-flows] Sent:", flow.name, "to:", who)
                triggered++
                await ignoreError(
                  /* Same columns as every other writer since the 20260203
                     rebuild: creator_id and email, with flow_id in metadata. */
                  admin.from("email_events").insert({
                    creator_id: creatorId,
                    email: recipientEmail,
                    event_type: "sent",
                    metadata: { flow_id: flow.id, step_id: step.id, subject },
                  }),
                )
              } else {
                console.error("[email-flows] Failed to send:", result.error)
                errors.push(`Flow ${flow.name}: ${result.error || "Send failed"}`)
              }
            } catch (emailErr: any) {
              console.error("[email-flows] Email send error:", emailErr?.message)
              errors.push(`Flow ${flow.name}: send failed`)
            }
          } else {
            /* Queued for the cron, which checks the flow AND the person again
               before it sends: see app/api/cron/process-scheduled-emails. */
            const scheduledTime = new Date(Date.now() + delayMs)
            try {
              const { error: scheduleError } = await admin.from("scheduled_flow_emails").insert({
                flow_id: flow.id,
                step_id: step.id,
                recipient_email: recipientEmail,
                recipient_name: recipientName || null,
                subject,
                body,
                scheduled_for: scheduledTime.toISOString(),
                status: "pending",
                creator_id: creatorId,
                order_id: orderId || null,
                product_id: productId || null,
              })

              if (scheduleError) {
                console.error("[email-flows] Failed to schedule:", scheduleError.code)
                errors.push(`Flow ${flow.name}: could not schedule`)
              } else {
                console.log("[email-flows] Scheduled for:", scheduledTime.toISOString())
                triggered++
              }
            } catch (err: any) {
              console.error("[email-flows] Schedule error:", err?.message)
              errors.push(`Flow ${flow.name}: could not schedule`)
            }
          }
        }
      } catch (flowErr: any) {
        errors.push(`Flow ${flow.name}: ${flowErr?.message}`)
      }
    }

    console.log("[email-flows] Completed:", { triggered, errors: errors.length })
    return { triggered, errors }
  } catch (err: any) {
    console.error("[email-flows] Error triggering flows:", err?.message)
    return { triggered: 0, errors: ["Could not run the flows"] }
  }
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

  /* The seller's one picture (lib/email-campaigns/sender senderPicture, read by the caller), https only
     and sized for the inbox; the initials when there is none, never a broken image. */
  const sellerAvatarSrc = emailImageSrc(sellerAvatarUrl, 32)
  const sellerAvatarHtml = sellerAvatarSrc
    ? `<td style="width:32px;height:32px;border-radius:8px;overflow:hidden;"><img src="${escapeHtml(sellerAvatarSrc)}" alt="${escapeHtml(escapedStoreName)}" width="32" height="32" style="width:32px;height:32px;border-radius:8px;object-fit:cover;display:block;border:0;" /></td>`
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
            subject: `Your ${formattedAmount} refund for ${escapedProduct} has been processed`,
            html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Refund Confirmation</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f7;font-family:-apple-system,'Segoe UI',Helvetica,sans-serif;color:#1a1a1a;-webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f7;padding:40px 16px;">
    <tr>
      <td align="center">
        <!-- Email Card -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.04),0 8px 30px rgba(0,0,0,0.06);">

          <!-- Header -->
          <tr>
            <td style="padding:36px 36px 28px;border-bottom:1px solid #eeedea;text-align:center;">
              <!-- Seller Avatar + Name (centered) -->
              <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin-bottom:24px;">
                <tr>
                  ${sellerAvatarHtml}
                  <td style="padding-left:10px;vertical-align:middle;">
                    <span style="font-size:13.5px;font-weight:600;color:#1a1a1a;letter-spacing:-0.2px;">${escapedStoreName}</span>
                  </td>
                </tr>
              </table>
              <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;letter-spacing:-0.5px;color:#1a1a1a;line-height:1.3;">Your refund has been processed</h1>
              <p style="margin:0;font-size:14.5px;color:#6b6b6b;line-height:1.55;">We've issued a full refund for your recent purchase. No further action is needed on your end.</p>
            </td>
          </tr>

          <!-- Refund Amount Hero -->
          <tr>
            <td style="padding:32px 36px;text-align:center;background:#fafaf8;border-bottom:1px solid #eeedea;">
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
            <td style="padding:28px 36px;border-bottom:1px solid #eeedea;">
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
            <td style="padding:24px 36px;border-bottom:1px solid #eeedea;">
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
                  <td bgcolor="#1a1a1a" style="background:#1a1a1a;border-radius:10px;mso-padding-alt:12px 30px;">
                    <a href="mailto:${contactEmail}" style="display:inline-block;color:#ffffff;font-size:13.5px;font-weight:600;padding:12px 30px;text-decoration:none;letter-spacing:-0.1px;">Contact ${escapedStoreName}</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#fafaf8;padding:28px 36px;text-align:center;border-top:1px solid #eeedea;">
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
      console.log("[email] ✅ Buyer refund email sent to:", maskEmail(buyerEmail))
    } catch (err) {
      console.error("[email] ❌ Failed to send buyer refund email:", err instanceof Error ? err.message : "unknown")
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
            subject: `Refund issued: ${formattedAmount} for ${escapedProduct}`,
            html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>Refund Issued</title>
  <style>
    :root { color-scheme: light only; }
    u + .body .storelib-logo { /* Gmail dark mode */ }
    [data-ogsc] .storelib-logo, [data-ogsb] .storelib-logo {
      filter: none !important;
      -webkit-filter: none !important;
    }
    @media (prefers-color-scheme: dark) {
      .storelib-logo {
        filter: none !important;
        -webkit-filter: none !important;
      }
    }
  </style>
</head>
<body class="body" style="margin:0;padding:0;background-color:#f5f5f7;font-family:-apple-system,'Segoe UI',Helvetica,sans-serif;color:#1a1a1a;-webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f7;padding:40px 16px;">
    <tr>
      <td align="center">
        <!-- Email Card -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.04),0 8px 30px rgba(0,0,0,0.06);">

          <!-- Header -->
          <tr>
            <td style="padding:36px 36px 28px;border-bottom:1px solid #eeedea;">
              <!-- Storelib Logo -->
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                <tr>
                  <td style="vertical-align:middle;"><img src="${storelibAssetUrl(STORELIB_EMAIL_LOGO)}" alt="${PLATFORM_BRAND_NAME}" width="32" height="32" style="display:block;width:32px;height:32px;border:0;outline:none;border-radius:7px;box-shadow:${STORELIB_LOGO_SHADOW};" class="storelib-logo" /></td>
                  <td style="padding-left:14px;vertical-align:middle;">
                    <span style="font-size:18px;font-weight:600;color:#1a1a1a;letter-spacing:-0.2px;">${PLATFORM_BRAND_NAME}</span>
                  </td>
                </tr>
              </table>
              <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;letter-spacing:-0.5px;color:#1a1a1a;line-height:1.3;">A refund has been issued</h1>
              <p style="margin:0;font-size:14.5px;color:#6b6b6b;line-height:1.55;">A refund was processed for one of your orders. This amount will be deducted from your next payout.</p>
            </td>
          </tr>

          <!-- Refund Amount Hero -->
          <tr>
            <td style="padding:32px 36px;text-align:center;background:#fef8f8;border-bottom:1px solid #eeedea;">
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
            <td style="padding:28px 36px;border-bottom:1px solid #eeedea;">
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
            <td style="padding:24px 36px;border-bottom:1px solid #eeedea;">
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
                  <td bgcolor="#1a1a1a" style="background:#1a1a1a;border-radius:10px;mso-padding-alt:12px 30px;">
                    <a href="${baseUrl}/dashboard/payouts" style="display:inline-block;color:#ffffff;font-size:13.5px;font-weight:600;padding:12px 30px;text-decoration:none;letter-spacing:-0.1px;">View Payouts</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#fafaf8;padding:28px 36px;text-align:center;border-top:1px solid #eeedea;">
              <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin-bottom:12px;">
                <tr>
                  <td><img src="${storelibAssetUrl(STORELIB_EMAIL_LOGO)}" alt="${PLATFORM_BRAND_NAME}" width="20" height="20" style="display:block;width:20px;height:20px;border:0;outline:none;border-radius:7px;box-shadow:${STORELIB_LOGO_SHADOW};" class="storelib-logo" /></td>
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
      console.log("[email] ✅ Seller refund notification sent to:", maskEmail(sellerEmail))
    } catch (err) {
      console.error("[email] ❌ Failed to send seller refund notification:", err instanceof Error ? err.message : "unknown")
    }
  }
}
