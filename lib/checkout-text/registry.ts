/**
 * ===========================================================================
 *  WHICH CHECKOUT WORDS A STORE MAY REWORD, AND WHICH IT MAY NOT
 * ===========================================================================
 * Settings › Checkout › Checkout text lets a store put its own words on its
 * checkout, per language: a button, a heading, a label, a friendly message.
 * Only the sentences listed in EDITABLE_TEXTS, each under a stable id so an
 * override survives the English being reworded later. Everything else is
 * locked: legal and consent text, amounts and what they mean (tax included,
 * the currency note, fees), what a payment did or did not do ("Nothing was
 * charged"), the payment provider's and Storelib's own marks, refund
 * policies. Rewording those could mislead a buyer, so they always read as
 * written (PROTECTED_TEXTS names the main ones and why, for the editor).
 *
 * An override is checked before it is kept (validateOverride): the same
 * {placeholders} as the English, no HTML, no links, no amounts typed in,
 * one line, within the entry's length.
 *
 * Pure: the editor, the API route and the checkout read the same lists.
 */

export type TextGroupId = "header" | "contact" | "delivery" | "payment" | "buttons" | "summary" | "messages"

export const TEXT_GROUPS: { id: TextGroupId; title: string }[] = [
  { id: "header", title: "Header" },
  { id: "contact", title: "Contact" },
  { id: "delivery", title: "Delivery" },
  { id: "payment", title: "Payment" },
  { id: "buttons", title: "Buttons" },
  { id: "summary", title: "Order summary" },
  { id: "messages", title: "Messages" },
]

export interface EditableText {
  /** Stable: what an override is stored under, whatever the English becomes. */
  id: string
  /** The English sentence the checkout draws through ct("…"). */
  source: string
  group: TextGroupId
  /** What it is and where it shows, for the merchant and for a translator ("Pay" is a verb here). */
  note: string
  /** Longest override kept, in characters. */
  max: number
}

const label = 40
const button = 32
const line = 120

export const EDITABLE_TEXTS: readonly EditableText[] = [
  { id: "header.pay_shop", source: "Pay {shop}", group: "header", note: "Above the total at the top. A verb: pay this store.", max: label },
  { id: "header.secure", source: "Secure checkout", group: "header", note: "Next to the lock in the top bar.", max: label },
  { id: "header.back_to", source: "Back to {site}", group: "header", note: "The link back to your website.", max: label },
  { id: "header.details", source: "Details", group: "header", note: "Phone only: opens the order details.", max: 24 },
  { id: "header.hide_details", source: "Hide details", group: "header", note: "Phone only: closes the order details.", max: 24 },

  { id: "contact.heading", source: "Contact information", group: "contact", note: "Heading above the email field.", max: label },
  { id: "contact.email", source: "Email", group: "contact", note: "The email field's label.", max: 24 },
  { id: "contact.phone", source: "Phone", group: "contact", note: "The phone field's label.", max: 24 },
  { id: "contact.phone_optional", source: "Phone (optional)", group: "contact", note: "The phone field's label when it's optional.", max: label },
  { id: "contact.sign_in", source: "Sign in", group: "contact", note: "Link for customers with an account.", max: 24 },

  { id: "delivery.heading", source: "Delivery", group: "delivery", note: "Heading above the address.", max: label },
  { id: "delivery.or_pickup", source: "Delivery or pickup", group: "delivery", note: "Heading when pickup is offered too.", max: label },
  { id: "delivery.ship", source: "Ship", group: "delivery", note: "Choice: have it delivered. A verb.", max: 24 },
  { id: "delivery.pick_up", source: "Pick up", group: "delivery", note: "Choice: collect it yourself. A verb.", max: 24 },
  { id: "delivery.method", source: "Shipping method", group: "delivery", note: "Heading above the delivery options.", max: label },
  { id: "delivery.note", source: "Add a note for the shop", group: "delivery", note: "Opens the order note field.", max: label },
  { id: "delivery.note_hint", source: "Gift wrap, delivery instructions...", group: "delivery", note: "Placeholder inside the order note field.", max: 60 },

  { id: "payment.heading", source: "Payment method", group: "payment", note: "Heading above the payment form.", max: label },
  { id: "payment.express", source: "Express checkout", group: "payment", note: "Above the Apple Pay and Google Pay buttons.", max: label },
  { id: "payment.how", source: "How to pay", group: "payment", note: "Heading when card and cash on delivery are both offered.", max: label },
  { id: "payment.cod", source: "Cash on delivery", group: "payment", note: "The cash on delivery choice.", max: label },

  { id: "buttons.pay_amount", source: "Pay {amount}", group: "buttons", note: "The main button. {amount} is filled in by checkout and must stay.", max: button },
  { id: "buttons.place_order", source: "Place order", group: "buttons", note: "The main button for cash on delivery.", max: button },
  { id: "buttons.get_free", source: "Get it free", group: "buttons", note: "The main button when the order is free.", max: button },
  { id: "buttons.apply", source: "Apply", group: "buttons", note: "Applies a discount code. A verb.", max: 16 },
  { id: "buttons.add_code", source: "Add promotion code", group: "buttons", note: "Opens the discount code field.", max: label },
  { id: "buttons.continue", source: "Continue shopping", group: "buttons", note: "Back to the website after an empty cart.", max: label },
  { id: "buttons.edit", source: "Edit", group: "buttons", note: "Changes a line's size or option. A verb.", max: 16 },
  { id: "buttons.remove", source: "Remove", group: "buttons", note: "Takes a line out of the order. A verb.", max: 16 },

  { id: "summary.subtotal", source: "Subtotal", group: "summary", note: "Items before shipping and discounts.", max: 24 },
  { id: "summary.shipping", source: "Shipping", group: "summary", note: "The shipping row in the summary.", max: 24 },
  { id: "summary.discount", source: "Discount", group: "summary", note: "The discount row in the summary.", max: 24 },
  { id: "summary.discount_code", source: "Discount code", group: "summary", note: "The discount code field's label.", max: label },
  { id: "summary.enter_code", source: "Enter discount code", group: "summary", note: "Placeholder inside the discount code field.", max: label },
  { id: "summary.total", source: "Total due", group: "summary", note: "The last row: what the buyer pays.", max: 24 },
  { id: "summary.tip", source: "Add a tip", group: "summary", note: "Heading above the tip choices.", max: label },
  { id: "summary.free", source: "Free", group: "summary", note: "Shown instead of a price of zero (free shipping).", max: 16 },

  { id: "messages.thanks_name", source: "Thank you, {name}!", group: "messages", note: "Heading after the order, with the buyer's name.", max: 60 },
  { id: "messages.thanks", source: "Thank you!", group: "messages", note: "Heading after the order, without a name.", max: 60 },
  { id: "messages.confirmed", source: "Your order is confirmed", group: "messages", note: "Under the thank you heading.", max: 80 },
  { id: "messages.placed", source: "Order placed", group: "messages", note: "After a cash on delivery order.", max: 60 },
  { id: "messages.empty_cart", source: "Your cart is empty.", group: "messages", note: "When nothing is left to pay for.", max: 80 },
  { id: "messages.email_invalid", source: "Enter a valid email address.", group: "messages", note: "Under the email field when it's not an email.", max: line },
  { id: "messages.name_missing", source: "Enter your name.", group: "messages", note: "Under the name field when it's empty.", max: line },
  { id: "messages.street_missing", source: "Enter the street address.", group: "messages", note: "Under the address field when it's empty.", max: line },
  { id: "messages.city_missing", source: "Enter the city.", group: "messages", note: "Under the city field when it's empty.", max: line },
  { id: "messages.phone_check", source: "Check the phone number.", group: "messages", note: "Under the phone field when it doesn't look right.", max: line },
]

/** The main locked sentences and why, so the editor can say it rather than just leave them out. */
export const PROTECTED_TEXTS: readonly { source: string; reason: string }[] = [
  { source: "I agree to the [Terms and Conditions] and the [Refund policy]", reason: "Legal consent" },
  { source: "Tick the box to agree to the Terms and Conditions.", reason: "Legal consent" },
  { source: "Email me with news and offers", reason: "Marketing consent" },
  { source: "Prices in {display} are for reference. You'll pay in {charge}; your bank converts it.", reason: "What the buyer pays" },
  { source: "Includes {amount} tax", reason: "Tax disclosure" },
  { source: "Cash on delivery adds a fee of {amount}.", reason: "Fee disclosure" },
  { source: "The payment did not go through. Nothing was charged.", reason: "Payment status" },
  { source: "Your payment went through.", reason: "Payment status" },
  { source: "Refunds: {policy}.", reason: "Refund policy" },
  { source: "Powered by", reason: "Payment provider" },
]

const BY_ID = new Map(EDITABLE_TEXTS.map((e) => [e.id, e]))
const BY_SOURCE = new Map(EDITABLE_TEXTS.map((e) => [e.source, e]))
const PROTECTED = new Set(PROTECTED_TEXTS.map((p) => p.source))

export const editableById = (id: string): EditableText | undefined => BY_ID.get(id)
export const editableBySource = (source: string): EditableText | undefined => BY_SOURCE.get(source)
/** Locked: anything not listed as editable, the protected list included. */
export const isProtected = (source: string): boolean => PROTECTED.has(source) || !BY_SOURCE.has(source)

/** The {placeholders} of a sentence, in order of first use. */
export function placeholdersOf(text: string): string[] {
  return [...new Set([...String(text ?? "").matchAll(/\{([A-Za-z_][\w]*)\}/g)].map((m) => m[1]))]
}

export type OverrideCheck = { ok: true; text: string | null } | { ok: false; error: string }

/**
 * A store's words for one entry, checked. Empty means "use the default"
 * (null). Refused with a plain reason when it drops or adds a placeholder,
 * holds markup, a link or a typed amount, spans lines, or is too long.
 */
export function validateOverride(entry: EditableText, raw: unknown): OverrideCheck {
  if (raw === null || raw === undefined) return { ok: true, text: null }
  if (typeof raw !== "string") return { ok: false, error: "That isn't text." }
  const text = raw.replace(/\s+/g, " ").trim()
  if (!text) return { ok: true, text: null }
  if (/[\r\n]/.test(raw)) return { ok: false, error: "Keep it on one line." }
  if (text.length > entry.max) return { ok: false, error: `Keep it under ${entry.max + 1} characters.` }
  if (/[<>]/.test(text)) return { ok: false, error: "No HTML here, just words." }
  if (/\bhttps?:\/\/|\bwww\.|\b[a-z0-9-]+\.(com|net|org|io|ro|de|fr|shop|store)\b/i.test(text)) return { ok: false, error: "No links here." }
  if (/[$€£¥₹₽₺₩₪₫฿]|\d+[.,]\d{2}\b|\b(lei|RON|EUR|USD|GBP)\b/i.test(text)) return { ok: false, error: "Leave amounts out. Checkout fills them in." }
  const want = placeholdersOf(entry.source)
  const got = placeholdersOf(text)
  /* Braces that aren't a placeholder ("{", "{ amount }") would show as typed. */
  if ((text.match(/[{}]/g) ?? []).length !== got.length * 2 || text.match(/\{[^}]*\{/)) return { ok: false, error: "Braces are only for placeholders like {amount}." }
  const missing = want.filter((p) => !got.includes(p))
  if (missing.length) return { ok: false, error: `Keep ${missing.map((p) => `{${p}}`).join(" and ")} in it.` }
  const extra = got.filter((p) => !want.includes(p))
  if (extra.length) return { ok: false, error: `${extra.map((p) => `{${p}}`).join(" and ")} can't be used here.` }
  return { ok: true, text }
}
