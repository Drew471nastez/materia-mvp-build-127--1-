import "server-only"

/**
 * ===========================================================================
 *  "BOUGHT THIS BEFORE? EMAIL ME MY LINK"
 * ===========================================================================
 * A guest who bought a download and comes back is not signed in, and the
 * checkout cannot tell them "you already own this" from the email they type:
 * that would tell anybody typing an address what its owner bought. So the
 * checkout offers this instead, the way Gumroad and Shopify's order lookup
 * do: the receipts of this shop's orders placed with that address (each
 * receipt is the order's download page) are emailed TO that address.
 *
 *   the answer      always ACCESS_SENT, the same words and status whether
 *                   the address bought anything or not
 *   the timing      the orders are read and the email sent after the answer
 *                   has gone (the route's after()), so a slow "yes" cannot
 *                   be told from a quick "no"
 *   the limits      per caller and per address (accessLinkLimited): a person
 *                   asks once or twice; a script walking a list is stopped
 *   where it goes   only to the address on the orders, never to another one
 *   the links       on the website's own address when asked from a website
 *                   (the receipt is served there), storelib.com otherwise
 *
 * Downloads only: an order that shipped has its own order page and emails.
 */

import { rateLimit, addressSubject, emailSubject } from "@/lib/api/rate-limit"
import { ACCESS_STATUSES, isOwnableType } from "./owned"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any }

/** What every request is told, whatever the address. */
export const ACCESS_SENT = "If you bought it with this email, we sent you a link. Check your inbox."

/** Receipts emailed per request at most: the newest, and the ones with the cart's products first. */
export const MAX_RECEIPTS = 3

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Two a quarter of an hour and six a day per address; ten an hour from one caller. */
export async function accessLinkLimited(request: Request, email: string) {
  return rateLimit({
    bucket: "access-link",
    subjects: [addressSubject(request), emailSubject(email)],
    windows: [{ limit: 2, seconds: 900 }, { limit: 6, seconds: 86400 }],
    message: "We just sent that. Check your inbox, then try again in a few minutes.",
  }).then(async (byEmail) =>
    byEmail ??
    rateLimit({
      bucket: "access-link-caller",
      subjects: [addressSubject(request)],
      windows: [{ limit: 10, seconds: 3600 }],
      message: "That is a lot of requests. Try again later.",
    }),
  )
}

interface OrderRow {
  id: string
  product_id: string | null
  buyer_email: string | null
  buyer_first_name?: string | null
  receipt_token: string | null
  created_at?: string | null
  variant_name?: string | null
  amount_cents?: number | null
  status?: string | null
}

function likeExact(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`)
}

/**
 * The receipts to send: this shop's orders placed with this address that
 * still give access, one per payment, downloads only, the cart's products
 * first, newest first, at most MAX_RECEIPTS.
 */
export async function receiptsFor(db: Db, input: { creatorId: string; email: string; productIds: string[] }): Promise<OrderRow[]> {
  const email = input.email.trim().toLowerCase()
  if (!UUID.test(input.creatorId) || !email.includes("@")) return []
  const { data: mine } = await db.from("products").select("id, type").eq("creator_id", input.creatorId).limit(2000)
  const ownable = new Set(((mine ?? []) as { id: string; type: string }[]).filter((p) => isOwnableType(p.type)).map((p) => p.id))
  if (ownable.size === 0) return []
  const { data, error } = await db
    .from("orders")
    .select("id, product_id, buyer_email, buyer_first_name, receipt_token, created_at, variant_name, amount_cents, status")
    .in("product_id", [...ownable].slice(0, 1000))
    .ilike("buyer_email", likeExact(email))
    .in("status", [...ACCESS_STATUSES])
    .order("created_at", { ascending: false })
    .limit(100)
  if (error) return []
  const rows = ((data ?? []) as OrderRow[]).filter((r) => r.receipt_token && r.product_id && ownable.has(r.product_id) && (r.buyer_email ?? "").trim().toLowerCase() === email)
  const wanted = new Set(input.productIds)
  const ordered = [...rows.filter((r) => wanted.has(r.product_id as string)), ...rows.filter((r) => !wanted.has(r.product_id as string))]
  const seen = new Set<string>()
  const out: OrderRow[] = []
  for (const r of ordered) {
    if (seen.has(r.receipt_token as string)) continue
    seen.add(r.receipt_token as string)
    out.push(r)
    if (out.length >= MAX_RECEIPTS) break
  }
  return out
}

/** Sends the receipts. Called after the answer has gone; says nothing back. */
export async function sendAccessLinks(db: Db, input: { creatorId: string; email: string; productIds: string[]; receiptBase: string | null }): Promise<number> {
  const rows = await receiptsFor(db, input)
  if (rows.length === 0) return 0
  const { sendReceiptCopyEmail, resolveSellerEmail } = await import("@/lib/email")
  const sellerReplyTo = await resolveSellerEmail(db, input.creatorId).catch(() => undefined)
  const { data: products } = await db.from("products").select("id, title").in("id", [...new Set(rows.map((r) => r.product_id as string))])
  const titleOf = new Map(((products ?? []) as { id: string; title: string | null }[]).map((p) => [p.id, p.title ?? "Your purchase"]))
  let sent = 0
  for (const r of rows) {
    const done = await sendReceiptCopyEmail(db, {
      orderId: r.id,
      creatorId: input.creatorId,
      /* The order's own address: the one that bought it. */
      buyerEmail: (r.buyer_email as string).trim().toLowerCase(),
      buyerFirstName: r.buyer_first_name ?? "",
      productTitle: titleOf.get(r.product_id as string) ?? "Your purchase",
      receiptToken: r.receipt_token as string,
      sellerReplyTo: sellerReplyTo || undefined,
      variantName: r.variant_name ?? null,
      amountCents: r.amount_cents ?? null,
      receiptBaseUrl: input.receiptBase && input.receiptBase.startsWith("https://") ? input.receiptBase : null,
    }).catch(() => ({ success: false }))
    if (done.success) sent++
  }
  return sent
}
