import "server-only"

/**
 * ===========================================================================
 *  STORELIB'S OWN CHECKOUT REMINDER
 * ===========================================================================
 * Settings › Checkout › Abandoned checkouts says "Send a checkout reminder:
 * one email an hour later with a link back to what they chose". A store that
 * has built its own reminder automation (Emails › Automations, "Leaves
 * checkout") gets that; a store that has not used to get nothing at all,
 * because the hourly sweep only entered automations. This is the one email
 * for them, sent by the sweep (lib/automations/abandoned.ts sweepAbandoned,
 * `remind`) after it has decided the start is due:
 *
 *   not bought   no order from this address since the checkout started
 *   asked        they ticked the news box, or are on the store's list
 *   way out      their own unsubscribe link, always (no link, no email)
 *
 * The words are the store's from Settings › Customer emails › Checkout
 * reminder (lib/emails/customer-custom.ts), the look the order emails'
 * (lib/physical/email-templates.ts checkoutReminderEmail). "Finish checkout"
 * goes back to the cart's own checkout with the same items, or to the
 * single product checkout.
 */
import { sendEmail, buildFromHeader } from "@/lib/mail"
import { resolveCreatorIdentity } from "@/lib/email"
import { storeIdentity } from "@/lib/store/identity-server"
import { unsubscribePageFor } from "@/lib/email-variables"
import { APP_URL } from "@/lib/email-automation"
import { decodeItems } from "@/lib/physical/cart-link"
import { checkoutReminderEmail, type EmailLine } from "@/lib/physical/email-templates"
import { loadCustomerEmailCopy } from "@/lib/emails/customer-copy-server"
import { itemsText, resolveCopy } from "@/lib/emails/customer-custom"
import { cleanReturnPath, type CheckoutStart } from "./abandoned"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

/** The lines and the way back, from the start alone: a cart's items from its path, else the one product. */
async function whatWasLeft(db: Db, s: CheckoutStart): Promise<{ lines: EmailLine[]; checkoutUrl: string } | null> {
  const back = cleanReturnPath(s.return_path)
  if (back) {
    const items = decodeItems(new URLSearchParams(back.split("?")[1] ?? "").get("items"))
    if (items.length === 0) return null
    const { data } = await db.from("products").select("id, title, thumbnail_url").eq("creator_id", s.creator_id).in("id", [...new Set(items.map((i) => i.productId))])
    const byId = new Map(((data ?? []) as { id: string; title: string; thumbnail_url: string | null }[]).map((p) => [p.id, p]))
    const lines = items.filter((i) => byId.has(i.productId)).map((i) => ({ title: byId.get(i.productId)!.title, variantName: null, quantity: i.quantity, cents: 0, imageUrl: byId.get(i.productId)!.thumbnail_url }))
    return lines.length ? { lines, checkoutUrl: `${APP_URL}${back}` } : null
  }
  if (!s.product_id) return null
  const { data: product } = await db.from("products").select("id, title, thumbnail_url, type, status").eq("id", s.product_id).eq("creator_id", s.creator_id).maybeSingle()
  if (!product || product.status !== "published" || product.type === "physical") return null
  return {
    lines: [{ title: product.title || s.product_title || "Your order", variantName: null, quantity: 1, cents: 0, imageUrl: product.thumbnail_url ?? null }],
    checkoutUrl: `${APP_URL}/checkout?productId=${encodeURIComponent(product.id)}${s.variant_id ? `&variantId=${encodeURIComponent(s.variant_id)}` : ""}`,
  }
}

export async function sendCheckoutReminder(db: Db, s: CheckoutStart, unsubscribeToken: string): Promise<boolean> {
  if (!unsubscribeToken) return false
  const left = await whatWasLeft(db, s)
  if (!left) return false
  const [identity, store, saved] = await Promise.all([
    resolveCreatorIdentity(db, s.creator_id).catch(() => ({ fromName: "", replyTo: "", sellerEmail: "" })),
    storeIdentity(db, s.creator_id).catch(() => null),
    loadCustomerEmailCopy(db, s.creator_id),
  ])
  const shopName = store?.name || identity.fromName || "Storelib"
  const unsubscribeUrl = unsubscribePageFor(unsubscribeToken)
  const copy = resolveCopy(saved.checkout_reminder, { customer_name: s.first_name, shop_name: shopName, items: itemsText(left.lines.map((l) => l.title)) })
  const mail = checkoutReminderEmail({
    shopName,
    buyerFirstName: s.first_name,
    lines: left.lines,
    checkoutUrl: left.checkoutUrl,
    unsubscribeUrl,
    brand: { logoUrl: store?.logoUrl ?? null, email: store?.email ?? null, phone: store?.phone ?? null, websiteUrl: store?.websiteUrl ?? null },
    copy,
  })
  const sent = await sendEmail({
    from: buildFromHeader(shopName),
    to: s.email,
    replyTo: identity.replyTo || store?.email || identity.sellerEmail || undefined,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
    headers: { "List-Unsubscribe": `<${unsubscribeUrl}>` },
  })
  return sent.success === true
}
