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
 *              returns, cancelled, refund), lib/email.tsx (the receipt) and
 *              lib/automations/abandoned-reminder.ts (the checkout reminder)
 *   preview    lib/emails/customer-catalog.ts, drawn in the browser
 *
 * SAFE BY CONSTRUCTION. What a store types is plain text: tags are taken
 * out when it is saved, and every character is escaped when it is drawn,
 * placeholders included, so nothing typed here can put HTML in an email.
 * A placeholder is one of PLACEHOLDERS in double braces; anything else in
 * braces is refused on save, so a typo never reaches a buyer as
 * "{{ordr_number}}".
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

export const PLACEHOLDERS = [
  { key: "customer_name", label: "Customer's first name" },
  { key: "order_number", label: "Order number" },
  { key: "shop_name", label: "Store name" },
  { key: "items", label: "What they bought" },
] as const

export type PlaceholderKey = (typeof PLACEHOLDERS)[number]["key"]
export type CopyVars = Partial<Record<PlaceholderKey, string | null | undefined>>

const KNOWN = new Set<string>(PLACEHOLDERS.map((p) => p.key))
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
  order_cancelled: { subject: "Order {{order_number}} was cancelled", heading: "Your order was cancelled", body: "{{customer_name}}, your order was cancelled and won't be shipped.", button: "View your order" },
  refund: { subject: "Refund for order {{order_number}}", heading: "Your order was refunded", body: "{{customer_name}}, we sent you a refund to your original payment method. Banks usually take 5 to 10 business days to show it.", button: "View your order" },
  return_approved: { subject: "Your return was approved (order {{order_number}})", heading: "Your return was approved", body: "Pack the items securely and send them back to the address below. Keep the shipping receipt until your refund arrives.", button: "View your order" },
  return_received: { subject: "We received your return (order {{order_number}})", heading: "We received your return", body: "Your items arrived back at the store. They'll check them and send your refund.", button: "View your order" },
  return_completed: { subject: "Your return is complete (order {{order_number}})", heading: "Your return is complete", body: "Your return is closed.", button: "View your order" },
  checkout_reminder: { subject: "You left {{items}} at checkout", heading: "Still thinking it over?", body: "Hi {{customer_name}}, you got as far as checkout and stopped there. If the payment failed or something looked off, you can pick up where you left off.", button: "Finish checkout" },
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

/** Placeholders in a text that are not one of PLACEHOLDERS. */
export function unknownPlaceholders(text: string): string[] {
  const out = new Set<string>()
  for (const m of text.matchAll(BRACES)) if (!KNOWN.has(m[1])) out.add(m[1])
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
    const bad = unknownPlaceholders(text)
    if (bad.length) return { ok: false, error: `{{${bad[0]}}} isn't a placeholder. Use ${PLACEHOLDERS.map((p) => `{{${p.key}}}`).join(", ")}.` }
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
      if ((text || f === "body") && unknownPlaceholders(text).length === 0) copy[f] = text
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
  const v = (vars[key as PlaceholderKey] ?? "").toString().replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim()
  if (key === "customer_name") return v || "there"
  return v
}

/** A text with its placeholders filled in, still plain text. */
export function fillPlaceholders(text: string, vars: CopyVars): string {
  return text.replace(BRACES, (_m, key: string) => (KNOWN.has(key) ? valueOf(key, vars) : ""))
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
  if (template === "return") return status === "approved" ? "return_approved" : status === "received" ? "return_received" : status === "completed" ? "return_completed" : null
  if (template === "shipment") {
    if (pickup) return kind === "delivered" ? "picked_up" : "ready_for_pickup"
    return kind === "delivered" ? "delivered" : kind === "out_for_delivery" ? "out_for_delivery" : kind === "tracking" ? "tracking_changed" : "shipping_confirmation"
  }
  return null
}
