/**
 * ===========================================================================
 *  A STORE'S OWN WORDS IN ITS CUSTOMER EMAILS
 * ===========================================================================
 * Settings › Customer emails lets a store change four parts of each email
 * a buyer gets, the way Shopify's notification editor does without the
 * code: the subject, the heading, the opening text and the button's label.
 * Everything else (the items, the totals, the tracking, the address, the
 * links) stays the template's own, so an order email can never lose the
 * order.
 *
 *   saved      store_settings.customer_emails (SQL part 129), one object
 *              per email id, only the parts that differ from the default
 *   used by    lib/physical/jobs-server.ts (order, shipping, pickup,
 *              returns, cancelled, refund), lib/email.tsx (the receipt and
 *              a download's refund), lib/automations/abandoned-reminder.ts
 *              (the checkout reminder) and lib/memberships/sync.ts (the
 *              emails of a membership sold on its own, drawn by
 *              lib/notify/templates)
 *   preview    lib/emails/customer-catalog.ts, drawn in the browser
 *
 * SAFE BY CONSTRUCTION. What a store types is plain text: tags are taken
 * out when it is saved, and every character is escaped when it is drawn,
 * placeholders included, so nothing typed here can put HTML in an email.
 * A placeholder is one of that email's own (placeholdersFor) in double
 * braces; anything else in braces is refused on save, so a typo never
 * reaches a buyer as "{{ordr_number}}".
 *
 * Pure: the browser, the senders and the tests share it.
 */

export interface EmailCopy {
  subject?: string
  heading?: string
  body?: string
  button?: string
}

export type CopyField = keyof EmailCopy
export const COPY_FIELDS: CopyField[] = ["subject", "heading", "body", "button"]

export type CustomerEmailsCopy = Record<string, EmailCopy>

export const COPY_LIMITS: Record<CopyField, number> = { subject: 150, heading: 120, body: 2000, button: 40 }

/** The four every order email fills in. */
export const PLACEHOLDERS = [
  { key: "customer_name", label: "Customer's first name" },
  { key: "order_number", label: "Order number" },
  { key: "shop_name", label: "Store name" },
  { key: "items", label: "What they bought" },
] as const

/** Every value any email can fill in, as the editor names it. */
export const PLACEHOLDER_LABELS: Record<string, string> = {
  customer_name: "Customer's first name",
  order_number: "Order number",
  shop_name: "Store name",
  items: "What they bought",
  amount: "Amount",
  plan_name: "Membership name",
  price: "Price",
  next_payment: "Next payment date",
  access_until: "Access until",
}

export type PlaceholderKey = string
export type CopyVars = Partial<Record<string, string | null | undefined>>

const ORDER_KEYS: string[] = PLACEHOLDERS.map((p) => p.key)

/**
 * WHAT EACH EMAIL CAN FILL IN. An order email knows the order; a membership
 * email knows the membership, its price and its dates, and has no order
 * number. An email not named here fills in the four order values.
 */
const PLACEHOLDERS_BY_EMAIL: Record<string, string[]> = {
  digital_refund: ["shop_name", "items", "amount", "order_number"],
  membership_started: ["customer_name", "plan_name", "shop_name", "price", "next_payment"],
  membership_renewed: ["customer_name", "plan_name", "shop_name", "amount", "next_payment"],
  membership_renewal_reminder: ["customer_name", "plan_name", "shop_name", "price", "next_payment"],
  membership_payment_failed: ["customer_name", "plan_name", "shop_name", "amount"],
  membership_canceled: ["customer_name", "plan_name", "shop_name", "access_until"],
  membership_plan_changed: ["customer_name", "plan_name", "shop_name", "price", "next_payment"],
  membership_ended: ["customer_name", "plan_name", "shop_name"],
}

/** The values one email fills in, in the order the editor offers them. */
export function placeholdersFor(id: string | null | undefined): Array<{ key: string; label: string }> {
  const keys = (id && PLACEHOLDERS_BY_EMAIL[id]) || ORDER_KEYS
  return keys.map((key) => ({ key, label: PLACEHOLDER_LABELS[key] ?? key }))
}

const ALL_KNOWN = new Set<string>(Object.keys(PLACEHOLDER_LABELS))
const knownFor = (id?: string | null) => (id ? new Set(placeholdersFor(id).map((p) => p.key)) : ALL_KNOWN)
const BRACES = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g

/**
 * The words each email goes out with when the store has changed nothing,
 * written with placeholders. The templates draw these same words for the
 * usual case; a few say more on their own when the order calls for it (a
 * part shipment, a pickup), which is why only what the store changes is
 * saved and used.
 */
export const DEFAULT_COPY: Record<string, Required<EmailCopy>> = {
  receipt: { subject: "Your receipt for {{items}}", heading: "Thanks for your order, {{customer_name}}", body: "", button: "View your receipt" },
  order_confirmation: { subject: "Order {{order_number}} confirmed", heading: "Thank you for your purchase!", body: "Hi {{customer_name}}, we're getting your order ready to be shipped. We'll let you know when it's on its way.", button: "View your order" },
  shipping_confirmation: { subject: "Order {{order_number}} is on the way", heading: "Your order is on the way", body: "Good news, {{customer_name}}. Your order has shipped. Track it any time with the link below.", button: "Track your package" },
  tracking_changed: { subject: "New tracking number for order {{order_number}}", heading: "Your tracking number changed", body: "The carrier gave your package a new tracking number. Use this one to follow it from now on.", button: "Track your package" },
  out_for_delivery: { subject: "Order {{order_number}} is out for delivery", heading: "Your order is out for delivery", body: "{{customer_name}}, your package is with the driver and should arrive today.", button: "Track your package" },
  delivered: { subject: "Order {{order_number}} was delivered", heading: "Your order was delivered", body: "{{customer_name}}, your package was delivered. If you can't find it, check around your door and with neighbours, then tell us and we'll sort it out.", button: "View your order" },
  ready_for_pickup: { subject: "Order {{order_number}} is ready to pick up", heading: "Your order is ready to pick up", body: "Good news, {{customer_name}}. Your order is waiting for you. Bring your order number, {{order_number}}, and we'll hand it over.", button: "Get directions" },
  picked_up: { subject: "Order {{order_number}} was picked up", heading: "Your order was picked up", body: "Thanks, {{customer_name}}. Your order was collected. We hope you love it.", button: "View your order" },
  order_updated: { subject: "Order {{order_number}} was updated", heading: "Your order was updated", body: "{{customer_name}}, the shipping address on your order was changed. It will be sent to the address below. If that doesn't look right, reply to this email before it ships.", button: "View your order" },
  payment_failed: { subject: "Your payment to {{shop_name}} didn't go through", heading: "Your payment didn't go through", body: "Hi {{customer_name}}, your bank declined the payment, so nothing was charged and your order wasn't placed. Your cart is saved: try again with the same card or another one.", button: "Try again" },
  delivery_issue: { subject: "A problem delivering order {{order_number}}", heading: "There's a problem with your delivery", body: "{{customer_name}}, the carrier couldn't deliver your package. We're looking into it and will email you as soon as we know more. Nothing is needed from you yet; if you have a question, reply to this email.", button: "Track your package" },
  order_cancelled: { subject: "Order {{order_number}} was cancelled", heading: "Your order was cancelled", body: "{{customer_name}}, your order was cancelled and won't be shipped.", button: "View your order" },
  refund: { subject: "Refund for order {{order_number}}", heading: "Your order was refunded", body: "{{customer_name}}, we sent you a refund to your original payment method. Banks usually take 5 to 10 business days to show it.", button: "View your order" },
  return_requested: { subject: "We got your return request (order {{order_number}})", heading: "We got your return request", body: "The store will look at your request and email you what happens next. Please don't send anything back until it's approved.", button: "View your order" },
  return_approved: { subject: "Your return was approved (order {{order_number}})", heading: "Your return was approved", body: "Pack the items securely and send them back to the address below. Keep the shipping receipt until your refund arrives.", button: "View your order" },
  return_received: { subject: "We received your return (order {{order_number}})", heading: "We received your return", body: "Your items arrived back at the store. They'll check them and send your refund.", button: "View your order" },
  return_declined: { subject: "About your return (order {{order_number}})", heading: "About your return", body: "The store couldn't accept this return. Their note says why. If you think it's a mistake, reply to this email.", button: "View your order" },
  return_completed: { subject: "Your return is complete (order {{order_number}})", heading: "Your return is complete", body: "Your return is closed.", button: "View your order" },
  /* Storelib Reviews' ask and its reminder (lib/reviews/request-email.ts), edited under Requests on the app's own page, not in the Customer emails list. {{items}} is the product. */
  review_request: { subject: "How is {{items}}?", heading: "How is {{items}}?", body: "If you have had a chance to use it, how was it? Your review helps other buyers decide, and tells {{shop_name}} what works.", button: "Write a review" },
  review_reminder: { subject: "A quick review of {{items}}?", heading: "Would you review {{items}}?", body: "If you have had a chance to use it, a rating and a line or two is all it takes. Good or bad, an honest review helps the next buyer.", button: "Write a review" },
  checkout_reminder: { subject: "You left {{items}} at checkout", heading: "Still thinking it over?", body: "Hi {{customer_name}}, you got as far as checkout and stopped there. If the payment failed or something looked off, you can pick up where you left off.", button: "Finish checkout" },
  /* A download's refund (lib/emails/notices.ts buyerRefundEmail). The facts, the bank's days and the contact address stay. */
  digital_refund: { subject: "Your {{amount}} refund for {{items}} has been processed", heading: "Your refund is on its way", body: "{{shop_name}} refunded {{amount}} for {{items}}. You don't need to do anything.", button: "Contact {{shop_name}}" },
  /* A membership sold on its own (lib/notify/templates/catalog.ts MEMBERSHIP_*): the price, the dates and the card stay in the facts. */
  membership_started: { subject: "You are a member of {{plan_name}}", heading: "Welcome to {{plan_name}}", body: "Thanks for joining. You pay {{price}}, and it renews by itself until you cancel.", button: "Open your membership" },
  membership_renewed: { subject: "{{amount}} for {{plan_name}}", heading: "Your membership renewed", body: "We charged {{amount}} for {{plan_name}}. Your next payment is on {{next_payment}}.", button: "Open your membership" },
  membership_renewal_reminder: { subject: "{{plan_name}} renews on {{next_payment}}", heading: "Your membership renews on {{next_payment}}", body: "{{plan_name}} renews on {{next_payment}} for {{price}}. Nothing to do if you want to stay.", button: "Manage your membership" },
  membership_payment_failed: { subject: "Your payment for {{plan_name}} did not go through", heading: "Your payment did not go through", body: "We tried to charge {{amount}} for {{plan_name}}, and the bank declined it.", button: "Update your card" },
  membership_canceled: { subject: "{{plan_name}} ends on {{access_until}}", heading: "Your membership ends on {{access_until}}", body: "Your membership of {{plan_name}} ends on {{access_until}}. No further charges.", button: "Open your membership" },
  membership_plan_changed: { subject: "You're now on {{plan_name}}", heading: "You're now on {{plan_name}}", body: "Your plan has changed. It started straight away.", button: "Open your membership" },
  membership_ended: { subject: "Your membership of {{plan_name}} has ended", heading: "Your membership has ended", body: "Your membership of {{plan_name}} has ended and you will not be charged again.", button: "See your memberships" },
}

export const isCustomizable = (id: unknown): id is string => typeof id === "string" && Object.prototype.hasOwnProperty.call(DEFAULT_COPY, id)

/** Plain text, as typed: no tags, no control characters, newlines kept only where they mean something. */
export function cleanCopyText(value: unknown, field: CopyField): string {
  if (typeof value !== "string") return ""
  let t = value.replace(/\r\n?/g, "\n").replace(/<[^>]*>/g, "").replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "")
  if (field === "body") t = t.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n")
  else t = t.replace(/\s+/g, " ")
  return t.trim().slice(0, COPY_LIMITS[field])
}

/** Placeholders in a text that the email (any email, without an id) cannot fill in. */
export function unknownPlaceholders(text: string, id?: string | null): string[] {
  const known = knownFor(id)
  const out = new Set<string>()
  for (const m of text.matchAll(BRACES)) if (!known.has(m[1])) out.add(m[1])
  return [...out]
}

/**
 * What a form sent for one email, checked: only the parts that differ from
 * the default are kept (null when nothing does). An unknown placeholder is
 * refused with the ones allowed.
 */
export function readCopy(id: string, input: unknown): { ok: true; copy: EmailCopy | null } | { ok: false; error: string } {
  if (!isCustomizable(id)) return { ok: false, error: "That email can't be changed." }
  const body = (input && typeof input === "object" ? input : {}) as Record<string, unknown>
  const def = DEFAULT_COPY[id]
  const copy: EmailCopy = {}
  for (const f of COPY_FIELDS) {
    if (!(f in body)) continue
    const text = cleanCopyText(body[f], f)
    const bad = unknownPlaceholders(text, id)
    if (bad.length) return { ok: false, error: `{{${bad[0]}}} isn't a placeholder. Use ${placeholdersFor(id).map((p) => `{{${p.key}}}`).join(", ")}.` }
    if (f !== "body" && !text) continue
    if (text === def[f]) continue
    copy[f] = text
  }
  return { ok: true, copy: Object.keys(copy).length ? copy : null }
}

/** Saved copy as read back from the database, cleaned again, for every email id it names. */
export function readSavedCopy(raw: unknown): CustomerEmailsCopy {
  const out: CustomerEmailsCopy = {}
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!isCustomizable(id) || !value || typeof value !== "object") continue
    const copy: EmailCopy = {}
    for (const f of COPY_FIELDS) {
      const v = (value as Record<string, unknown>)[f]
      if (typeof v !== "string") continue
      const text = cleanCopyText(v, f)
      if ((text || f === "body") && unknownPlaceholders(text, id).length === 0) copy[f] = text
    }
    if (Object.keys(copy).length) out[id] = copy
  }
  return out
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;")
}

/** A placeholder's value, plain text. A missing first name reads "there", so "Hi {{customer_name}}," still reads. */
function valueOf(key: string, vars: CopyVars): string {
  const v = (vars[key] ?? "").toString().replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim()
  if (key === "customer_name") return v || "there"
  return v
}

/** A text with its placeholders filled in, still plain text. Nothing in double braces is ever left for a buyer to read. */
export function fillPlaceholders(text: string, vars: CopyVars): string {
  return text.replace(BRACES, (_m, key: string) => (ALL_KNOWN.has(key) ? valueOf(key, vars) : ""))
}

/** The opening text as HTML: escaped, a blank line a paragraph break, a newline a line break. */
export function copyBodyHtml(text: string, vars: CopyVars): string {
  return escapeHtml(fillPlaceholders(text, vars)).replace(/\n\n/g, "<br><br>").replace(/\n/g, "<br>")
}

/** What a template is handed: only the parts the store changed, ready to draw. */
export interface ResolvedCopy {
  subject?: string
  /** Plain text; the template escapes it like its own heading. */
  heading?: string
  /** Escaped HTML for the opening paragraph. */
  introHtml?: string
  /** Plain text for the email's text part. */
  introText?: string
  /** Plain text; the template escapes it like its own label. */
  button?: string
}

export function resolveCopy(copy: EmailCopy | null | undefined, vars: CopyVars): ResolvedCopy | undefined {
  if (!copy) return undefined
  const out: ResolvedCopy = {}
  if (copy.subject) out.subject = fillPlaceholders(copy.subject, vars).replace(/\s+/g, " ").trim().slice(0, 200) || undefined
  if (copy.heading) out.heading = fillPlaceholders(copy.heading, vars).trim() || undefined
  if (typeof copy.body === "string") {
    out.introHtml = copyBodyHtml(copy.body, vars)
    out.introText = fillPlaceholders(copy.body, vars)
  }
  if (copy.button) out.button = fillPlaceholders(copy.button, vars).trim().slice(0, 60) || undefined
  return Object.keys(out).length ? out : undefined
}

/** Item titles for {{items}}: "Wildflower honey and Linen apron", "Mug and 2 more". */
export function itemsText(titles: readonly (string | null | undefined)[]): string {
  const list = titles.map((t) => (t ?? "").toString().replace(/\s+/g, " ").trim()).filter(Boolean)
  if (list.length === 0) return "your order"
  if (list.length === 1) return list[0].slice(0, 120)
  if (list.length === 2) return `${list[0]} and ${list[1]}`.slice(0, 160)
  return `${list[0].slice(0, 120)} and ${list.length - 1} more`
}

/** Which saved email a physical order's job sends (lib/physical/jobs-server.ts). */
export function emailIdForJob(template: string, kind?: string | null, status?: string | null, pickup?: boolean): string | null {
  if (template === "confirmation") return "order_confirmation"
  if (template === "cancelled") return "order_cancelled"
  if (template === "refund") return "refund"
  if (template === "return")
    return status === "requested"
      ? "return_requested"
      : status === "approved"
        ? "return_approved"
        : status === "rejected"
          ? "return_declined"
          : status === "received"
            ? "return_received"
            : status === "completed"
              ? "return_completed"
              : null
  if (template === "order_updated") return "order_updated"
  if (template === "payment_failed") return "payment_failed"
  if (template === "shipment") {
    if (pickup) return kind === "delivered" ? "picked_up" : "ready_for_pickup"
    return kind === "delivered" ? "delivered" : kind === "out_for_delivery" ? "out_for_delivery" : kind === "tracking" ? "tracking_changed" : kind === "issue" ? "delivery_issue" : "shipping_confirmation"
  }
  return null
}
