/**
 * ===========================================================================
 *  WHAT EACH NOTIFICATION SAYS
 * ===========================================================================
 * One entry per NotificationType. An entry is a function from the job's data
 * to a Message: plain text pieces (subject, preview, heading, a few short
 * paragraphs, facts, one action) that layout.ts draws, and the in-app half.
 * Nothing here is HTML. Every value read from data goes through `Data`, which
 * cleans it and returns "" when it is missing, so a missing value leaves out a
 * sentence or a row instead of printing "undefined".
 *
 * Actions are paths on Storelib; index.ts joins them to ctx.baseUrl. Creator
 * notifications link into /app, customer ones to their receipt or library and
 * never to /app.
 *
 * Copy rules: plain and short, like a person at a small company wrote it. No
 * dashes used as punctuation, no emoji, no capitals for shouting, and an
 * exclamation mark only on the first sale and the first product.
 */
import type { NotificationType, TemplateContext, TemplateFamily } from "../types"
import { cleanText, segment } from "./escape"
import type { Fact, OrderSummary, SummaryRow } from "./layout"

/* ── Data keys ─────────────────────────────────────────────────────────── */

/**
 * The order details a sale email reads besides the basics (lib/email.tsx
 * saleEmailData fills them from the order rows). All in the smallest unit of
 * `currency`; `lines` is [{ title, variantName, quantity, amountCents }].
 */
const SALE_KEYS = [
  "lines", "variantName", "subtotalCents", "discountCents", "couponCode", "tipCents", "taxCents", "feeCents", "netCents",
  "customerEmail", "customerCountry", "paymentMethod", "cardBrand", "cardLast4",
] as const

/**
 * What a membership notice reads (lib/memberships/notify.ts fills them):
 * the membership's id for its page, its name and creator, the price in
 * cents with its interval ("month" or "year"), the dates it is about, and
 * the card's last four digits when a payment failed.
 */
const MEMBERSHIP_KEYS = [
  "membershipId", "membershipTitle", "creatorName", "amountCents", "currency", "interval", "periodEnd", "endsAt", "trialEnd", "graceEndsAt", "cardLast4",
] as const

/**
 * What a community email reads (lib/communities/server/email.ts fills them):
 * the community's id, name and address, who runs it, and per kind the
 * announcement, the event, the course or the invite it is about.
 */
const COMMUNITY_KEYS = ["communityId", "communityName", "communitySlug", "creatorName"] as const

/** The data keys each template reads. Workflows fill these; every one is optional. */
export const DATA_KEYS: Record<NotificationType, readonly string[]> = {
  WELCOME_TO_STORELIB: ["storeName"],
  VERIFY_EMAIL: ["userId", "email"],
  FIRST_PRODUCT_REMINDER: [],
  FIRST_PRODUCT_REMINDER_2: [],
  FINISH_PRODUCT_REMINDER: ["productTitle", "productId"],
  PUBLISH_PRODUCT_REMINDER: ["productTitle", "productId"],
  FIRST_PRODUCT_PUBLISHED: ["productTitle", "productId", "paymentsReady"],
  STORE_SETUP_UNFINISHED: ["stepLabel", "stepPath", "stepsDone", "stepsTotal", "stepsLeft"],
  STORE_SETUP_UNFINISHED_2: ["stepLabel", "stepPath", "stepsDone", "stepsTotal", "stepsLeft"],
  PAYMENT_SETUP_REMINDER: [],
  PAYMENT_SETUP_REMINDER_2: [],
  PAYOUT_SETUP_UNFINISHED: ["started", "productTitle"],
  PAYOUT_SETUP_UNFINISHED_2: ["started"],
  PAYOUT_SETUP_WEEKLY: ["started"],
  PAYMENT_SETUP_COMPLETED: [],
  PAYMENT_VERIFICATION_REQUIRED: ["reason", "dueBy"],
  PAYMENT_SETUP_FAILED: ["reason"],
  PAYOUT_METHOD_ADDED: ["bankLast4", "occurredAt"],
  PAYOUT_METHOD_CHANGED: ["bankLast4", "occurredAt"],
  PAYOUT_SCHEDULED: ["payoutId", "amountCents", "currency", "arrivalDate", "bankLast4"],
  PAYOUT_SENT: ["payoutId", "amountCents", "currency", "arrivalDate", "bankLast4"],
  PAYOUT_FAILED: ["payoutId", "amountCents", "currency", "reason", "bankLast4"],
  PAYOUT_ACTION_REQUIRED: ["reason", "dueBy", "needsWords"],
  PAYOUT_METHOD_PROBLEM: ["bankLast4"],
  VERIFICATION_REMINDER: ["requirements", "requirementCount", "identity", "dueBy"],
  VERIFICATION_REMINDER_2: ["requirements", "requirementCount", "identity", "dueBy"],
  PAYOUT_RESTRICTED: ["reason"],
  FIRST_SALE: ["productTitle", "productId", "amountCents", "currency", "orderId", "orderNumber", "customerName", ...SALE_KEYS],
  NEW_SALE: ["productTitle", "productId", "amountCents", "currency", "orderId", "orderNumber", "customerName", "occurredAt", ...SALE_KEYS],
  REFUND_CREATED: ["productTitle", "amountCents", "currency", "orderId", "orderNumber", "reason"],
  DISPUTE_CREATED: ["disputeId", "orderId", "orderNumber", "productTitle", "amountCents", "currency", "reason", "dueBy"],
  DISPUTE_ACTION_REQUIRED: ["disputeId", "orderId", "orderNumber", "productTitle", "amountCents", "currency", "reason", "dueBy"],
  DISPUTE_CLOSED: ["disputeId", "orderId", "orderNumber", "productTitle", "amountCents", "currency", "outcome", "restoredCents"],
  SUBSCRIPTION_CREATED: ["planName", "amountCents", "currency", "nextBillingDate"],
  SUBSCRIPTION_PAYMENT_FAILED: ["planName", "amountCents", "currency", "cardLast4"],
  SUBSCRIPTION_CANCELLED: ["planName", "endsAt"],
  DOMAIN_CONNECTED: ["domain"],
  DOMAIN_CONNECTION_FAILED: ["domain", "reason"],
  PASSWORD_CHANGED: ["occurredAt", "device", "location"],
  EMAIL_CHANGED: ["newEmailMasked", "occurredAt"],
  ACCOUNT_RESTRICTED: ["reason"],
  PURCHASE_CONFIRMATION: ["productTitle", "productId", "amountCents", "currency", "orderNumber", "storeName", "creatorName", "receiptToken", "occurredAt"],
  DIGITAL_PRODUCT_ACCESS: ["productTitle", "productId", "storeName", "creatorName", "receiptToken"],
  CUSTOMER_REFUND_PROCESSED: ["productTitle", "amountCents", "currency", "orderNumber", "storeName", "creatorName", "receiptToken"],
  REVIEW_REQUEST: ["productTitle", "productId", "productImage", "creatorName", "creatorSupportEmail", "receiptToken", "orderId"],
  REVIEW_REMINDER: ["productTitle", "productId", "productImage", "creatorName", "creatorSupportEmail", "receiptToken", "orderId"],
  MEMBERSHIP_STARTED: [...MEMBERSHIP_KEYS],
  MEMBERSHIP_RENEWED: [...MEMBERSHIP_KEYS],
  MEMBERSHIP_RENEWAL_REMINDER: [...MEMBERSHIP_KEYS],
  MEMBERSHIP_PAYMENT_FAILED: [...MEMBERSHIP_KEYS],
  MEMBERSHIP_CANCELED: [...MEMBERSHIP_KEYS],
  MEMBERSHIP_ENDED: [...MEMBERSHIP_KEYS],
  COMMUNITY_WELCOME: [...COMMUNITY_KEYS, "welcomeText"],
  COMMUNITY_JOIN_APPROVED: [...COMMUNITY_KEYS, "needsPayment", "priceLine"],
  COMMUNITY_INVITE: [...COMMUNITY_KEYS, "inviterName", "inviteCode", "tagline", "expiresAt"],
  COMMUNITY_ANNOUNCEMENT: [...COMMUNITY_KEYS, "postId", "title", "excerpt", "authorName"],
  COMMUNITY_EVENT_REMINDER: [...COMMUNITY_KEYS, "eventId", "eventTitle", "startsAt", "endsAt", "timezone", "lead", "location", "online"],
  COMMUNITY_COURSE_AVAILABLE: [...COMMUNITY_KEYS, "courseTitle", "courseProductId"],
}

/* ── Canonical paths ───────────────────────────────────────────────────── */

/**
 * The real routes, checked against app/:
 *   /app/products/new                 new product (app/app/products/new)
 *   /app/products/<id>                product editor (app/app/products/[id])
 *   /app/settings?tab=payments        Stripe Connect setup; /app/settings/payments only redirects to /app/settings
 *   /app/settings?tab=billing         what /app/settings/billing redirects to
 *   /app/settings?tab=domains         domains panel
 *   /app/settings?tab=security        password and email
 *   /app/payouts                      balance, payouts, dispute figures
 *   /app/orders?order=<id>            what /app/orders/<id> redirects to; disputes show on the order
 *   /signup/verify?userId=&email=     the email code page
 *   /receipt/<token>                  the buyer's receipt with downloads (lib/email.tsx buyer receipt)
 *   /library, /library/products/<id>  the buyer's library
 *   /help                             help center
 */
export const PATHS = {
  home: "/app",
  newProduct: "/app/products/new",
  products: "/app/products",
  product: (id: string) => (id ? `/app/products/${id}` : "/app/products"),
  payments: "/app/settings?tab=payments",
  billing: "/app/settings?tab=billing",
  domains: "/app/settings?tab=domains",
  security: "/app/settings?tab=security",
  payouts: "/app/payouts",
  /** Payouts, at its disputes list. */
  disputes: "/app/payouts#disputes",
  order: (id: string) => (id ? `/app/orders?order=${id}` : "/app/orders"),
  help: "/help",
  receipt: (token: string) => `/receipt/${token}`,
  /** The receipt, open at its review card, with the stars already chosen when `rate` is given. */
  review: (token: string, rate?: number) => `/receipt/${token}${rate ? `?rate=${rate}` : ""}#review`,
  library: "/account/library",
  libraryProduct: (id: string) => `/account/library/products/${id}`,
  /** A member's page for one membership: its posts, what it includes, and Manage. */
  memberships: "/account/library/memberships",
  membership: (id: string) => (id ? `/account/library/memberships/${id}` : "/account/library/memberships"),
  /** A member's communities, and one community's pages by its address (app/(marketing)/community/[slug]). */
  communities: "/account/communities",
  community: (slug: string, rest = "") => (slug ? `/community/${slug}${rest}` : "/account/communities"),
} as const

/* ── Reading data ──────────────────────────────────────────────────────── */

const ZERO_DECIMAL = new Set(["bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga", "pyg", "rwf", "ugx", "vnd", "vuv", "xaf", "xof", "xpf"])

/** An amount in the smallest unit (cents) as money, or "" when it is not a number. */
export function formatMoney(amount: unknown, currency: unknown): string {
  const n = typeof amount === "number" ? amount : typeof amount === "string" && /^-?\d+(\.\d+)?$/.test(amount.trim()) ? Number(amount) : NaN
  if (!Number.isFinite(n)) return ""
  const code = typeof currency === "string" && /^[a-z]{3}$/i.test(currency.trim()) ? currency.trim().toUpperCase() : "USD"
  const value = ZERO_DECIMAL.has(code.toLowerCase()) ? n : n / 100
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: code }).format(value)
  } catch {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value)
  }
}

/** A date from an ISO string or a timestamp, as "September 30, 2026" (or "Sep 30" short). "" when it is not a date. */
export function formatDate(value: unknown, short = false): string {
  let d: Date | null = null
  if (typeof value === "number" && Number.isFinite(value)) d = new Date(value > 1e12 ? value : value * 1000)
  else if (typeof value === "string" && value.trim()) d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value.trim()) ? `${value.trim()}T12:00:00Z` : value.trim())
  if (!d || Number.isNaN(d.getTime())) return ""
  return new Intl.DateTimeFormat("en-US", short ? { month: "short", day: "numeric", timeZone: "UTC" } : { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(d)
}

/** Shows only a masked address: "a***@example.com". An address that already has a mask is kept. */
export function maskEmail(value: unknown): string {
  const s = cleanText(value, 120)
  if (!s || !s.includes("@")) return ""
  if (s.includes("*")) return s
  const [local, domain] = s.split("@")
  if (!local || !domain) return ""
  return `${local[0]}***@${domain}`
}

const PAYOUT_FAILURES: Record<string, string> = {
  account_closed: "The bank account is closed",
  account_frozen: "The bank account is frozen",
  no_account: "The bank could not find the account",
  invalid_account_number: "The account number is not valid",
  bank_account_restricted: "The bank account does not accept this payout",
  invalid_currency: "The bank account does not accept this currency",
  debit_not_authorized: "The bank did not authorize the transfer",
  declined: "The bank declined the payout",
  insufficient_funds: "There was not enough balance for the payout",
  could_not_process: "The bank could not process the payout",
  incorrect_account_holder_name: "The account holder name does not match",
}

const DISPUTE_REASONS: Record<string, string> = {
  fraudulent: "The cardholder says they did not make this purchase",
  product_not_received: "The customer says they did not receive the product",
  product_unacceptable: "The customer says the product was not as described",
  duplicate: "The customer says they were charged twice",
  subscription_canceled: "The customer says they cancelled",
  credit_not_processed: "The customer says a refund was not processed",
  unrecognized: "The customer does not recognize the charge",
  general: "The customer disputed the charge",
}

/** A reason code or short sentence as a readable line. */
function readable(value: unknown, known: Record<string, string> = {}): string {
  const s = cleanText(value, 160)
  if (!s) return ""
  if (known[s]) return known[s]
  const words = /^[a-z0-9_]+$/.test(s) ? s.replace(/_/g, " ") : s
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** One job's data, read safely. Every getter returns plain text or "". */
export class Data {
  constructor(private readonly raw: Record<string, unknown>) {}
  text(key: string, max = 80): string {
    return cleanText(this.raw?.[key], max)
  }
  /** A first name only. */
  first(key: string): string {
    return this.text(key, 60).split(" ")[0] || ""
  }
  money(): string {
    return formatMoney(this.raw?.amountCents, this.raw?.currency)
  }
  /** Another amount in cents, in the same currency, or "". */
  moneyOf(key: string): string {
    return this.cents(key) === null ? "" : formatMoney(this.raw?.[key], this.raw?.currency)
  }
  /** A whole number of cents, or null when it is missing or not a number. */
  cents(key: string): number | null {
    const v = this.raw?.[key]
    return typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null
  }
  /** An amount in cents, in this data's currency. */
  format(cents: number): string {
    return formatMoney(cents, this.raw?.currency)
  }
  /** A record read the same safe way, in this data's currency. */
  child(record: Record<string, unknown>): Data {
    return new Data({ ...record, currency: this.raw?.currency })
  }
  /** A list of records (a basket's lines), each read the same safe way, in the parent's currency. */
  list(key: string, max = 50): Data[] {
    const v = this.raw?.[key]
    if (!Array.isArray(v)) return []
    return v
      .filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object" && !Array.isArray(x))
      .slice(0, max)
      .map((x) => this.child(x))
  }
  date(key: string, short = false): string {
    return formatDate(this.raw?.[key], short)
  }
  /** An id for a path, encoded. */
  id(key: string): string {
    return segment(this.raw?.[key])
  }
  /** Four digits, or "". */
  last4(key: string): string {
    const s = this.text(key, 8).replace(/\D/g, "")
    return s.length === 4 ? s : ""
  }
  /** A whole number of zero or more (a count of steps), or null when it is missing or not a number. */
  count(key: string): number | null {
    const v = this.raw?.[key]
    return typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : null
  }
  bool(key: string): boolean | null {
    const v = this.raw?.[key]
    return typeof v === "boolean" ? v : null
  }
  orderLabel(): string {
    const n = this.text("orderNumber", 24).replace(/^#/, "")
    return n ? `#${n}` : ""
  }
  store(): string {
    return this.text("storeName", 60) || this.text("creatorName", 60)
  }
  readable(key: string, known?: Record<string, string>): string {
    return readable(this.raw?.[key], known)
  }
}

/* ── Messages ──────────────────────────────────────────────────────────── */

export type Audience = "creator" | "customer"

export interface Message {
  family: TemplateFamily
  audience: Audience
  subject: string
  preview: string
  heading: string
  paragraphs: string[]
  /** Rows with an empty value are dropped. */
  facts?: [string, string][]
  /**
   * The one thing the email is about, drawn as a small card under the
   * heading: the product's picture, its name and who made it. `imageUrl` is
   * the stored address as it is; index.ts checks it and sizes it for an inbox.
   */
  media?: { title: string; subtitle?: string | null; imageUrl?: string | null } | null
  /** A sale's order summary (layout.ts OrderSummary). */
  order?: OrderSummary | null
  action?: { label: string; path: string } | null
  /** A quiet mailto line under the button, to an address from data (checked in index.ts). */
  reply?: { label: string; email: string; subject?: string } | null
  /** Five stars that each open the review form with that many chosen (a review request). */
  rate?: { label: string; paths: string[] } | null
  /** False leaves out "Hi Ana,": an order notice opens with its heading, as store platforms' do. */
  greet?: boolean
  notice?: { title: string; text: string; link?: { label: string; path: string } | null } | null
  note?: string | null
  /**
   * WHOSE NAME IS IN THE INBOX. Left out, the email comes from Storelib, as
   * every platform email does (a receipt, a security notice, a bill). A
   * review request is the seller's ask, so it names the seller: index.ts
   * hands this to the channel, which puts the name in front of Storelib's
   * own verified address and points Reply-To at the seller's support inbox.
   * The address it is sent from never changes.
   */
  sender?: { name: string; replyTo?: string | null } | null
  /** What the footer's unsubscribe link says, when it turns off one kind of email only. */
  unsubscribeLabel?: string | null
  inApp: { title: string; body: string; actionLabel?: string | null; actionPath?: string | null }
}

type Entry = (d: Data, ctx: TemplateContext) => Message

/** Joins sentence parts, leaving out the empty ones. */
const join = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ")

const REMINDER_NOTE = "This is a reminder to help you get set up. You can turn these reminders off in your notification settings."
const LAST_REMINDER_NOTE = "This is the last reminder about this. You can turn these reminders off in your notification settings."

/** "Publish your website" inside a sentence. A label that starts with a proper noun keeps its capital. */
const lower = (label: string) => (/^[A-Z][a-z]+ /.test(label) ? label.charAt(0).toLowerCase() + label.slice(1) : label)

const plural = (n: number, word: string) => (n === 1 ? word : `${word}s`)

/** The page that finishes the next setup step, checked to be a Storelib app path before it is used. */
const setupPath = (d: Data): string => {
  const path = d.text("stepPath", 120)
  return /^\/app(\/|\?|$)/.test(path) ? path : PATHS.home
}

const NOT_YOU = {
  title: "If this was not you",
  text: "If you did not do this, secure your account right away. Change your password and check your email address and payout details in your account settings.",
  link: { label: "Secure your account", path: PATHS.security },
}

const when = (ctx: TemplateContext, d: Data): string => cleanText(ctx.when, 80) || d.date("occurredAt")

/**
 * Who checks the details and holds the money: Stripe, unless the event says
 * the creator is on Storelib Payments' Airwallex rollout (lib/payments). The
 * default keeps every Stripe email word for word what it was.
 */
const processor = (d: Data): string => (d.text("provider", 20).toLowerCase() === "airwallex" ? "Airwallex" : "Stripe")
const onAirwallex = (d: Data): boolean => processor(d) === "Airwallex"
const ending = (last4: string) => (last4 ? `Ending in ${last4}` : "")

/** The receipt when there is one (it works without signing in), else the library. */
function customerAction(d: Data, label: string, preferLibrary = false): { label: string; path: string } {
  const token = d.id("receiptToken")
  const product = d.id("productId")
  if (preferLibrary && product) return { label, path: PATHS.libraryProduct(product) }
  if (token) return { label, path: PATHS.receipt(token) }
  if (product) return { label, path: PATHS.libraryProduct(product) }
  return { label: "Open your library", path: PATHS.library }
}

/* ── A sale ────────────────────────────────────────────────────────────── */

const SUBJECT_MAX = 60

/** `before` + the name + `after`, the name cut so the whole line fits in 60 characters. */
function fitSubject(before: string, name: string, after: string): string {
  const room = SUBJECT_MAX - before.length - after.length
  if (!name || room < 8) return ""
  return `${before}${cleanText(name, room)}${after}`
}

const COUNTRY_NAMES = (() => {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" })
  } catch {
    return null
  }
})()

/** "PT" as "Portugal"; a name as given. */
function countryName(value: string): string {
  if (/^[A-Z]{2}$/i.test(value) && value.toUpperCase() !== "XX") {
    try {
      return COUNTRY_NAMES?.of(value.toUpperCase()) || value.toUpperCase()
    } catch {
      return value.toUpperCase()
    }
  }
  return value
}

/** "Visa ending in 4242", "PayPal", "Card"; "" when the data says nothing. */
function paymentLabel(d: Data): string {
  const brand = d.text("cardBrand", 24).replace(/_/g, " ")
  const last4 = d.last4("cardLast4")
  const method = d.text("paymentMethod", 24).toLowerCase()
  const nice = (b: string) => (b.toLowerCase() === "amex" ? "American Express" : b.replace(/\b[a-z]/g, (c) => c.toUpperCase()))
  if (brand) return last4 ? `${nice(brand)} ending in ${last4}` : nice(brand)
  if (method === "paypal") return "PayPal"
  if (method === "link") return "Link"
  if (method && method !== "free") return nice(method.replace(/_/g, " "))
  return last4 ? `Card ending in ${last4}` : ""
}

/**
 * NEW_SALE, and FIRST_SALE for the creator's first paid one: the email a
 * store platform sends its seller for a new order. The subject names what
 * sold and for how much; the body is the order itself: each item, the
 * totals, the fee and what the seller receives, who bought it, and one
 * button to the order. Every figure comes from data; a missing one leaves
 * out its row, never prints a guess.
 *
 * A FREE PRODUCT IS STILL A SALE. The owner's rule: "'You've made a sale'
 * even if the product is for free." So a free claim gets the same email
 * with the same heading, and only the money is worded differently: the
 * amount reads "Free" rather than $0.00, and the fee and the payout rows
 * are left out because nothing was taken and nothing arrives.
 */
function saleMessage(d: Data, ctx: TemplateContext, first: boolean): Message {
  const totalCents = d.cents("amountCents")
  const total = d.money()
  const free = totalCents === 0
  const given = d.list("lines").filter((l) => l.text("title", 120))
  const lines = given.length > 0 ? given : d.text("productTitle", 120) ? [d.child({ title: d.text("productTitle", 120), variantName: d.text("variantName", 80), amountCents: totalCents })] : []
  const count = lines.length
  const title = lines[0]?.text("title", 120) || d.text("productTitle", 120)
  const name = d.text("customerName", 80)
  const firstName = d.first("customerName")
  const email = d.text("customerEmail", 200)
  const orderLabel = d.orderLabel()
  const path = PATHS.order(d.id("orderId"))

  /* What was bought, in words: "Presets Vol 2", "Presets Vol 2 and 2 more items". */
  const more = count > 1 ? ` and ${count - 1} more ${count - 1 === 1 ? "item" : "items"}` : ""
  const thing = title ? `${title}${more}` : count > 1 ? `${count} items` : "a product"
  const who = name || "A customer"

  /* The fee and what the seller receives, only when the fee is known. */
  const fee = d.cents("feeCents")
  const netGiven = d.cents("netCents")
  const net = !free && totalCents !== null ? (netGiven ?? (fee !== null ? Math.max(0, totalCents - fee) : null)) : null
  const netText = net === null ? "" : d.format(net)

  /* Subject: what sold and for how much, at most 60 characters. A free claim sold too, so it reads the same without a price. */
  const moreShort = count > 1 ? ` and ${count - 1} more` : ""
  let subject = ""
  if (first) subject = total && !free ? fitSubject("Your first sale: ", title, `${moreShort} for ${total}`) : fitSubject("Your first sale: ", title, moreShort)
  else if (free) subject = fitSubject("You sold ", title, moreShort)
  else if (total) subject = fitSubject("You sold ", title, `${moreShort} for ${total}`)
  if (!subject) subject = first ? (total && !free ? `Your first sale: ${total}` : "You made your first sale") : total && !free ? `You made a sale for ${total}` : "You made a sale"

  const buyer = firstName || "A customer"
  const preview = free
    ? `${buyer} got ${thing} for free.`
    : join(`${buyer} bought ${thing}.`, (netText || total) && `${netText || total} goes to your balance.`)

  const sentence = free ? `${who} got ${thing} from your store for free.` : `${who} bought ${thing} from your store.`
  const paragraphs = first
    ? [sentence, "Congratulations on your first sale on Storelib. Here are the details."]
    : [sentence]

  /* The order: items, totals, then what the seller receives. */
  const orderLines = lines.map((l) => {
    const qty = l.cents("quantity")
    const detail = [l.text("variantName", 80), qty !== null && qty > 1 ? `Qty ${qty}` : ""].filter(Boolean).join(" \u00b7 ")
    const amount = l.cents("amountCents") === 0 ? "Free" : l.moneyOf("amountCents")
    return { title: l.text("title", 120), detail: detail || null, amount: amount || (count === 1 ? total : "") }
  })
  const totals: SummaryRow[] = []
  const subtotal = d.moneyOf("subtotalCents")
  const discount = d.cents("discountCents")
  const tip = d.cents("tipCents")
  const tax = d.cents("taxCents")
  const code = d.text("couponCode", 40)
  const adjusted = (discount ?? 0) > 0 || (tip ?? 0) > 0 || (tax ?? 0) > 0
  if (subtotal && (adjusted || count > 1)) totals.push({ label: "Subtotal", value: subtotal })
  if (discount !== null && discount > 0) totals.push({ label: code ? `Discount (${code})` : "Discount", value: `\u2212${d.moneyOf("discountCents")}` })
  if (tip !== null && tip > 0) totals.push({ label: "Tip", value: d.moneyOf("tipCents") })
  if (tax !== null && tax > 0) totals.push({ label: "Tax", value: d.moneyOf("taxCents") })
  /* Honest money: a free claim reads "Free", never $0.00. */
  if (total) totals.push({ label: free ? "Total" : "Total paid", value: free ? "Free" : total, strong: true })
  const payout: SummaryRow[] = []
  if (net !== null && netText) {
    if (fee !== null && fee > 0) payout.push({ label: "Storelib fee", value: `\u2212${d.moneyOf("feeCents")}` })
    payout.push({ label: "You receive", value: netText, strong: true })
  }
  const country = d.text("customerCountry", 60)
  const customer: Fact[] = [
    { label: "Name", value: name },
    { label: "Email", value: email },
    { label: "Country", value: country ? countryName(country) : "" },
    { label: "Payment", value: free ? "" : paymentLabel(d) },
  ].filter((f) => f.value)

  const order: OrderSummary | null =
    orderLines.length > 0 || totals.length > 0
      ? {
          title: orderLabel ? `Order ${orderLabel}` : "Order summary",
          subtitle: when(ctx, d) || null,
          lines: orderLines.filter((l) => l.title),
          totals,
          payout,
          sections: [{ title: "Customer", rows: customer }],
        }
      : null

  const inAppBody = free ? `${who} got ${thing} for free.` : join(`${who} bought ${thing}`, total && `for ${total}`) + "."
  return {
    family: first ? "success" : "transaction",
    audience: "creator",
    subject,
    preview,
    heading: first ? "You made your first sale" : "You made a sale",
    greet: false,
    paragraphs,
    order,
    action: { label: "View order", path },
    reply: email ? { label: "Reply to the customer", email, subject: orderLabel ? `Your order ${orderLabel}` : "Your order" } : null,
    note: "You get sale emails because they are on in your notification settings. You can turn them off there and still see every order in the app.",
    inApp: first
      ? { title: "Your first sale", body: inAppBody, actionLabel: "View order", actionPath: path }
      : { title: total && !free ? `New sale: ${total}` : "New sale", body: inAppBody, actionLabel: "View order", actionPath: path },
  }
}

export const CATALOG: Record<NotificationType, Entry> = {
  WELCOME_TO_STORELIB: () => ({
    family: "base",
    audience: "creator",
    subject: "Welcome to Storelib",
    preview: "Your store is ready. Here is where to start.",
    heading: "Welcome to Storelib",
    paragraphs: [
      "Thanks for signing up. Storelib gives you one place to sell what you make: products, downloads, courses, services, memberships or anything else, with your own store, website and link in bio page.",
      "Most people start with two things: adding their first product and setting up payments, so the first sale can pay out. Each takes a few minutes.",
      "Everything else, like your website, emails and discount codes, can wait until you are ready.",
    ],
    action: { label: "Add your first product", path: PATHS.newProduct },
    inApp: { title: "Welcome to Storelib", body: "Add your first product and set up payments to start selling.", actionLabel: "Add a product", actionPath: PATHS.newProduct },
  }),

  VERIFY_EMAIL: (d) => {
    const userId = d.text("userId", 80)
    const email = d.text("email", 200)
    const query = userId ? `?userId=${encodeURIComponent(userId)}${email ? `&email=${encodeURIComponent(email)}` : ""}` : ""
    const path = userId ? `/signup/verify${query}` : "/login"
    return {
      family: "action_required",
      audience: "creator",
      subject: "Confirm your email address",
      preview: "One quick step to finish setting up your account.",
      heading: "Confirm your email address",
      paragraphs: [
        "Please confirm this is your email, so we can reach you about sales, payouts and your account.",
        "It only takes a moment. If you already did this, you can ignore this email.",
      ],
      action: { label: "Confirm your email", path },
      inApp: { title: "Confirm your email address", body: "Confirm your email so we can reach you about sales and payouts.", actionLabel: "Confirm email", actionPath: path },
    }
  },

  FIRST_PRODUCT_REMINDER: () => ({
    family: "lifecycle",
    audience: "creator",
    subject: "Ready to add your first product?",
    preview: "It takes about five minutes to get one up.",
    heading: "Your store is ready for its first product",
    paragraphs: [
      "You signed up for Storelib but have not added a product yet. A guide, a template, a preset pack or a course all work, and you can change everything later.",
      "A title, a price and the file are enough to start.",
    ],
    action: { label: "Add a product", path: PATHS.newProduct },
    note: REMINDER_NOTE,
    inApp: { title: "Add your first product", body: "It takes about five minutes, and you can edit everything later.", actionLabel: "Add a product", actionPath: PATHS.newProduct },
  }),

  FIRST_PRODUCT_REMINDER_2: () => ({
    family: "lifecycle",
    audience: "creator",
    subject: "Your first product can be small",
    preview: "One file and a price is enough to open your store.",
    heading: "Your first product can be small",
    paragraphs: [
      "A lot of creators wait until their first product feels perfect. The ones who start small usually learn more, because real buyers tell them what to make next.",
      "Pick something you already have, like a checklist, a guide or a set of files, and put it up. You can improve it any time.",
    ],
    action: { label: "Add a product", path: PATHS.newProduct },
    note: LAST_REMINDER_NOTE,
    inApp: { title: "Start with something small", body: "A checklist or a set of files you already have is a fine first product.", actionLabel: "Add a product", actionPath: PATHS.newProduct },
  }),

  FINISH_PRODUCT_REMINDER: (d) => {
    const title = d.text("productTitle", 60)
    const short = d.text("productTitle", 28)
    const path = PATHS.product(d.id("productId"))
    return {
      family: "lifecycle",
      audience: "creator",
      subject: short ? `Finish setting up ${short}` : "Finish setting up your product",
      preview: "Your draft is saved. Pick up where you left off.",
      heading: "Your draft is waiting",
      paragraphs: [
        title ? `You started ${title} but have not finished it yet. Everything you added is saved.` : "You started a product but have not finished it yet. Everything you added is saved.",
        "Open it to add what is missing. When it is ready, publish it and it goes live on your store.",
      ],
      action: { label: "Finish your product", path },
      note: REMINDER_NOTE,
      inApp: { title: "Finish your draft", body: title ? `${title} is saved as a draft.` : "Your product is saved as a draft.", actionLabel: "Open draft", actionPath: path },
    }
  },

  PUBLISH_PRODUCT_REMINDER: (d) => {
    const title = d.text("productTitle", 60)
    const short = d.text("productTitle", 28)
    const path = PATHS.product(d.id("productId"))
    return {
      family: "lifecycle",
      audience: "creator",
      subject: short ? `${short} is ready to publish` : "Your product is ready to publish",
      preview: "It looks complete. Publish it when you are ready.",
      heading: "Ready when you are",
      paragraphs: [
        title ? `${title} looks ready, but it is not published yet, so buyers cannot see it.` : "Your product looks ready, but it is not published yet, so buyers cannot see it.",
        "Give it one last look and publish it from the editor.",
      ],
      action: { label: "Review and publish", path },
      note: REMINDER_NOTE,
      inApp: { title: "Ready to publish", body: title ? `${title} looks complete but is not live yet.` : "Your product looks complete but is not live yet.", actionLabel: "Review", actionPath: path },
    }
  },

  FIRST_PRODUCT_PUBLISHED: (d) => {
    const title = d.text("productTitle", 60)
    const path = PATHS.product(d.id("productId"))
    const needsPayments = d.bool("paymentsReady") === false
    return {
      family: "success",
      audience: "creator",
      subject: "Your first product is live!",
      preview: title ? `${title} is live on your store.` : "It is live on your store and ready to sell.",
      heading: "Your first product is live",
      paragraphs: [
        title ? `${title} is now live on your store, and people can buy it.` : "Your product is now live on your store, and people can buy it.",
        "Share the link where your audience already is, like your newsletter, your bio or a post. First sales usually come from people who already know you.",
        needsPayments ? "One more thing: payments are not set up yet. Do that now so your first sale can pay out." : "",
      ].filter(Boolean),
      action: needsPayments ? { label: "Set up payments", path: PATHS.payments } : { label: "View your product", path },
      inApp: { title: "Your first product is live", body: title ? `${title} is live. Share the link to get your first sale.` : "Share the link to get your first sale.", actionLabel: "View product", actionPath: path },
    }
  },

  /*
     The steps are Home's Getting started card, read again when the email is due (conditions.ts
     store_setup_unfinished), so the count here and the count on the card are the same number, and the
     button goes to the page that finishes the next one. With no step in the data it is a plain nudge to Home.
  */
  STORE_SETUP_UNFINISHED: (d) => {
    const step = d.text("stepLabel", 60)
    const left = d.count("stepsLeft")
    const done = d.count("stepsDone")
    const total = d.count("stepsTotal")
    const path = setupPath(d)
    return {
      family: "lifecycle",
      audience: "creator",
      subject: left ? `You have ${left} ${plural(left, "step")} left to set up your store` : "Finish setting up your store",
      preview: step ? `Next: ${lower(step)}.` : "A few steps are still open.",
      heading: "Finish setting up your store",
      paragraphs: [
        done !== null && total ? `You have ${done} of ${total} steps done. The rest are what make your store ready for buyers.` : "Your store is not set up yet, and the last steps are what make it ready for buyers.",
        step ? `The next one is to ${lower(step)}.` : "",
      ],
      action: { label: step || "Open your setup", path },
      note: REMINDER_NOTE,
      inApp: { title: "Finish setting up your store", body: step ? `Next: ${lower(step)}.` : "A few setup steps are still open.", actionLabel: "Open setup", actionPath: path },
    }
  },

  STORE_SETUP_UNFINISHED_2: (d) => {
    const step = d.text("stepLabel", 60)
    const done = d.count("stepsDone")
    const total = d.count("stepsTotal")
    const path = setupPath(d)
    return {
      family: "lifecycle",
      audience: "creator",
      subject: "Your store setup is still not finished",
      preview: step ? `One step left to look at: ${lower(step)}.` : "The last steps are still open.",
      heading: "Your store is still not set up",
      paragraphs: [
        done !== null && total ? `You are ${done} of ${total} steps through setting up your store, and it has been that way for a week.` : "Your store setup has been unfinished for a week.",
        step ? `The next step is to ${lower(step)}. It takes a few minutes.` : "Finishing the last steps takes a few minutes.",
      ],
      action: { label: step || "Open your setup", path },
      note: LAST_REMINDER_NOTE,
      inApp: { title: "Your store setup is still open", body: step ? `Next: ${lower(step)}.` : "The last setup steps are still open.", actionLabel: "Open setup", actionPath: path },
    }
  },

  PAYMENT_SETUP_REMINDER: (d) => ({
    family: "lifecycle",
    audience: "creator",
    subject: "Set up payments so you can get paid",
    preview: "It takes a few minutes and you only do it once.",
    heading: "Set up payments to get paid",
    paragraphs: [
      `Before money from sales can reach you, we need a few details for your payouts. ${processor(d)} handles this part, and it takes a few minutes.`,
      onAirwallex(d) ? "Once it is done, sales go to your balance and you pay them out to your bank." : "Once it is done, sales go to your balance and pay out to your bank on a regular schedule.",
    ],
    action: { label: "Set up payments", path: PATHS.payments },
    note: REMINDER_NOTE,
    inApp: { title: "Set up payments", body: "Add your payout details so you can get paid for sales.", actionLabel: "Set up", actionPath: PATHS.payments },
  }),

  PAYMENT_SETUP_REMINDER_2: (d) => ({
    family: "lifecycle",
    audience: "creator",
    subject: "Your payments are not set up yet",
    preview: "Finish setup now so a sale does not have to wait.",
    heading: "Payments still need setting up",
    paragraphs: [
      "Without payments set up, you cannot get paid for your sales.",
      `If you started and stopped, you can pick up where you left off. ${processor(d)} keeps what you already entered.`,
    ],
    action: { label: "Finish payment setup", path: PATHS.payments },
    note: LAST_REMINDER_NOTE,
    inApp: { title: "Payments are not set up", body: "Finish setup so your sales can pay out.", actionLabel: "Finish setup", actionPath: PATHS.payments },
  }),

  /*
     Begun and left unfinished, or a product live with no way to be paid for it. Two different sentences for
     two different people; everything after them is the same, because the thing to do is the same.
  */
  PAYOUT_SETUP_UNFINISHED: (d) => {
    const started = d.bool("started") !== false
    return {
      family: "lifecycle",
      audience: "creator",
      subject: started ? "Finish setting up your Storelib payouts" : "Your product is live and payments are not on",
      preview: "You cannot be paid until this is done.",
      heading: "Finish setting up your payouts",
      paragraphs: [
        started
          ? "You started setting up payments and stopped before it was done. Until it is finished, Storelib cannot pay you for a sale."
          : "Your product is live, but payments are not set up, so a sale has nowhere to pay out to.",
        started
          ? `${processor(d)} kept what you already entered, so you carry on from where you left off. It usually takes a few minutes.`
          : `${processor(d)} handles this part and it usually takes a few minutes. You only do it once.`,
      ],
      action: { label: "Finish payout setup", path: PATHS.payments },
      note: REMINDER_NOTE,
      inApp: { title: "Finish your payout setup", body: "You cannot be paid for a sale until payments are set up.", actionLabel: "Finish setup", actionPath: PATHS.payments },
    }
  },

  PAYOUT_SETUP_UNFINISHED_2: () => ({
    family: "lifecycle",
    audience: "creator",
    subject: "Payments are still not set up",
    preview: "Your sales have nowhere to pay out to yet.",
    heading: "Your payouts are still waiting on you",
    paragraphs: [
      "Payment setup is still unfinished, so anything you sell has nowhere to pay out to.",
      "It is the one step between your store and your bank account. Finish it when you have a few minutes.",
    ],
    action: { label: "Finish payout setup", path: PATHS.payments },
    note: REMINDER_NOTE,
    inApp: { title: "Payments are still not set up", body: "Your sales cannot pay out until setup is finished.", actionLabel: "Finish setup", actionPath: PATHS.payments },
  }),

  PAYOUT_SETUP_WEEKLY: (d) => {
    const started = d.bool("started") === true
    return {
      family: "lifecycle",
      audience: "creator",
      subject: started ? "Finish setting up payouts so you can get paid" : "Set up payouts so you can get paid",
      preview: "Your country, your name as on your ID, a few details Stripe needs and your bank. About five minutes.",
      heading: started ? "Your payouts are almost ready" : "Get ready to be paid",
      paragraphs: [
        started
          ? "You started setting up payouts and it is not finished yet. Until it is, buyers cannot check out and nothing can reach your bank."
          : "You have not set up payouts yet. Until you do, buyers cannot check out and a sale has nowhere to pay out to.",
        `It takes about five minutes: your country, your name as it is on your ID, the few details ${processor(d)} needs to verify you and the bank account you want paid into.`,
      ],
      action: { label: started ? "Finish payout setup" : "Set up payouts", path: PATHS.payments },
      note: REMINDER_NOTE,
      inApp: { title: "Set up payouts to get paid", body: "Buyers cannot check out until payouts are set up.", actionLabel: "Set up", actionPath: PATHS.payments },
    }
  },

  PAYMENT_SETUP_COMPLETED: (d) =>
    onAirwallex(d)
      ? {
          /* Verified is not the whole of it on Airwallex: a sale also needs somewhere to pay out to. */
          family: "success",
          audience: "creator",
          subject: "You are verified",
          preview: "Add a payout account to start taking payments.",
          heading: "You are verified",
          paragraphs: [
            "Airwallex has confirmed your details.",
            "Add the bank account your sales are paid into. Checkout opens as soon as it is added.",
          ],
          action: { label: "Add payout account", path: PATHS.payments },
          inApp: { title: "You are verified", body: "Add a payout account to start taking payments.", actionLabel: "Add payout account", actionPath: PATHS.payments },
        }
      : {
          family: "success",
          audience: "creator",
          subject: "Your Storelib payments are ready",
          preview: "Buyers can check out, and you get paid to your bank.",
          heading: "Your payments are ready",
          paragraphs: [
            "Your details are confirmed. Buyers can check out now, and your earnings are paid to your bank.",
          ],
          action: { label: "View payouts", path: PATHS.payouts },
          inApp: { title: "Payments active", body: "Buyers can check out now.", actionLabel: "View payouts", actionPath: PATHS.payouts },
        },

  PAYMENT_VERIFICATION_REQUIRED: (d) => {
    const due = d.date("dueBy")
    return {
      family: "action_required",
      audience: "creator",
      subject: "Action needed: confirm your payout details",
      preview: `${processor(d)} needs a bit more information to keep payouts going.`,
      heading: `${processor(d)} needs a few more details`,
      paragraphs: [
        `To keep your payouts running, ${processor(d)} needs you to confirm some information about you or your business. This is a normal check.`,
        due ? `Please do this by ${due} so your payouts are not paused.` : "Please do this soon so your payouts are not paused.",
      ],
      facts: [["What is needed", d.readable("reason")], ["Due by", due]],
      action: { label: "Confirm your details", path: PATHS.payments },
      inApp: { title: "Confirm your payout details", body: due ? `${processor(d)} needs more information by ${due}.` : `${processor(d)} needs a bit more information to keep payouts going.`, actionLabel: "Confirm details", actionPath: PATHS.payments },
    }
  },

  PAYMENT_SETUP_FAILED: (d) => ({
    family: "action_required",
    audience: "creator",
    subject: "Your payment setup did not go through",
    preview: "A quick look at your details usually fixes it.",
    heading: "We could not finish your payment setup",
    paragraphs: [
      `${processor(d)} could not verify the details you entered, so payments are not set up yet.`,
      "Most of the time it is a small mismatch in a name, date of birth or address. Check your details and try again.",
    ],
    facts: [["Reason", d.readable("reason")]],
    action: { label: "Check your details", path: PATHS.payments },
    inApp: { title: "Payment setup did not go through", body: "Check your details and try again.", actionLabel: "Check details", actionPath: PATHS.payments },
  }),

  PAYOUT_METHOD_ADDED: (d, ctx) => {
    const last4 = d.last4("bankLast4")
    return {
      family: "success",
      audience: "creator",
      subject: "A payout account was added",
      preview: "Your payouts will go to this account from now on.",
      heading: "Payout account added",
      paragraphs: [last4 ? `Your payouts will now go to the bank account ending in ${last4}.` : "Your payouts will now go to the bank account you added."],
      facts: [["Account", ending(last4)], ["When", when(ctx, d)]],
      notice: NOT_YOU,
      action: { label: "View payout settings", path: PATHS.payments },
      inApp: { title: "Payout account added", body: last4 ? `Payouts will go to the account ending in ${last4}.` : "Payouts will go to your new bank account.", actionLabel: "View", actionPath: PATHS.payments },
    }
  },

  PAYOUT_METHOD_CHANGED: (d, ctx) => {
    const last4 = d.last4("bankLast4")
    return {
      family: "security",
      audience: "creator",
      subject: "Your payout account was changed",
      preview: "If you made this change, there is nothing to do.",
      heading: "Your payout account was changed",
      paragraphs: [
        last4 ? `The bank account your payouts go to was changed. It now ends in ${last4}.` : "The bank account your payouts go to was changed.",
        "If you made this change, you do not need to do anything.",
      ],
      facts: [["New account", ending(last4)], ["When", when(ctx, d)]],
      notice: NOT_YOU,
      action: { label: "Review payout settings", path: PATHS.payments },
      inApp: { title: "Payout account changed", body: "If this was not you, secure your account now.", actionLabel: "Review", actionPath: PATHS.payments },
    }
  },

  PAYOUT_SCHEDULED: (d) => {
    const amount = d.money()
    const arrival = d.date("arrivalDate")
    return {
      family: "transaction",
      audience: "creator",
      subject: amount ? `Payout of ${amount} scheduled` : "Your payout is scheduled",
      preview: arrival ? `It should reach your bank by ${arrival}.` : "We will let you know when it is sent.",
      heading: "Your payout is scheduled",
      paragraphs: [amount ? `A payout of ${amount} is scheduled to your bank account.` : "A payout is scheduled to your bank account."],
      facts: [["Amount", amount], ["Expected arrival", arrival], ["Bank account", ending(d.last4("bankLast4"))]],
      action: { label: "View payouts", path: PATHS.payouts },
      inApp: { title: "Payout scheduled", body: join(amount ? `${amount} is scheduled.` : "A payout is scheduled.", arrival && `Expected by ${arrival}.`), actionLabel: "View payouts", actionPath: PATHS.payouts },
    }
  },

  PAYOUT_SENT: (d) => {
    const amount = d.money()
    const arrival = d.date("arrivalDate")
    return {
      family: "success",
      audience: "creator",
      subject: amount ? `Your payout of ${amount} is on its way` : "Your payout is on its way",
      preview: arrival ? `It should reach your bank by ${arrival}.` : "It should reach your bank in a few business days.",
      heading: "Your payout is on its way",
      paragraphs: [
        amount ? `We sent ${amount} to your bank account.` : "We sent a payout to your bank account.",
        "Banks can take a few business days to show it. If it has not arrived after the expected date, check with your bank first.",
      ],
      facts: [["Amount", amount], ["Expected arrival", arrival], ["Bank account", ending(d.last4("bankLast4"))], ["Reference", d.text("payoutId", 40)]],
      action: { label: "View payouts", path: PATHS.payouts },
      inApp: { title: "Payout sent", body: join(amount ? `${amount} is on its way to your bank.` : "A payout is on its way to your bank.", arrival && `Expected by ${arrival}.`), actionLabel: "View payouts", actionPath: PATHS.payouts },
    }
  },

  PAYOUT_FAILED: (d) => {
    const amount = d.money()
    return {
      family: "action_required",
      audience: "creator",
      subject: amount ? `Your payout of ${amount} did not go through` : "Your payout did not go through",
      preview: "Your money is safe. Update your bank details to receive it.",
      heading: "Your payout did not go through",
      paragraphs: [
        amount ? `We tried to send ${amount} to your bank, but the bank sent it back.` : "We tried to send a payout to your bank, but the bank sent it back.",
        "Your money is safe and goes back to your balance. Update your bank details and it will be sent again with your next payout.",
      ],
      facts: [["Amount", amount], ["Reason", d.readable("reason", PAYOUT_FAILURES)], ["Bank account", ending(d.last4("bankLast4"))]],
      action: { label: "Update bank details", path: PATHS.payments },
      inApp: { title: "Payout did not go through", body: join(amount && `${amount} came back from your bank.`, "Update your bank details to receive it."), actionLabel: "Update details", actionPath: PATHS.payments },
    }
  },

  /*
     Two emails, one template. Stripe asking for something while payouts still run ("requirements_due") is
     "Action needed for your Storelib payouts"; payouts actually switched off ("payouts_paused") is the higher
     one, "Action needed to continue receiving payouts". Both name what is wanted in words and go straight to
     Payouts, where the same setup form opens with only that.
  */
  PAYOUT_ACTION_REQUIRED: (d) => {
    const due = d.date("dueBy")
    /* What Stripe is asking for, in words. Falls back to its reason when the webhook sent no list. */
    const needs = d.text("needsWords", 120)
    const paused = d.text("reason", 40) === "payouts_paused"
    return {
      family: "action_required",
      audience: "creator",
      subject: paused ? "Action needed to continue receiving payouts" : "Action needed for your Storelib payouts",
      preview: paused ? "Your payouts are paused until this is done." : "Storelib needs a little more information to keep paying you.",
      heading: paused ? "Your payouts are paused" : "We need a little more information",
      paragraphs: [
        paused
          ? needs
            ? `Your payouts are on hold until we have ${needs.toLowerCase()}.`
            : "Your payouts are on hold until the requested verification is complete."
          : needs
            ? `To keep paying you, we need ${needs.toLowerCase()}.`
            : "To keep paying you, we need some additional verification information.",
        due ? `Please complete it by ${due}. It usually takes a few minutes.` : "It usually takes a few minutes.",
      ],
      facts: [["What is needed", needs || d.readable("reason")], ["Due by", due]],
      action: { label: "Complete verification", path: PATHS.payments },
      inApp: {
        title: paused ? "Payouts are temporarily paused" : "More information needed",
        body: needs ? `We need ${needs.toLowerCase()}.` : paused ? "Complete the requested verification to resume payouts." : "Update your payout details to keep your account active.",
        actionLabel: paused ? "Fix now" : "Complete verification",
        actionPath: PATHS.payments,
      },
    }
  },

  /* A bank account Stripe could not verify, or one it marked errored: before any payout bounces off it. */
  PAYOUT_METHOD_PROBLEM: (d) => {
    const last4 = d.last4("bankLast4")
    return {
      family: "action_required",
      audience: "creator",
      subject: "Update your payout account",
      preview: "We couldn't verify your bank account.",
      heading: "Update your payout account",
      paragraphs: [
        last4 ? `We couldn't verify the bank account ending in ${last4}.` : "We couldn't verify your bank account.",
        "Check the account details or add another payout account so your earnings can reach you.",
      ],
      facts: [["Bank account", ending(last4)]],
      action: { label: "Update payout account", path: PATHS.payments },
      inApp: { title: "Update your payout account", body: "We couldn't verify your bank account.", actionLabel: "Update", actionPath: PATHS.payments },
    }
  },

  /*
     Stripe asked for details and is still waiting. What it asks for is read again from the account when each of
     these is due (conditions.ts verification_still_needed), so the email names what is outstanding today, not
     what was outstanding when the webhook arrived. No unsubscribe line: payouts pause when this is not answered.
  */
  VERIFICATION_REMINDER: (d) => {
    const due = d.date("dueBy")
    const identity = d.bool("identity") === true
    return {
      family: "action_required",
      audience: "creator",
      subject: identity ? "Stripe still needs to confirm your identity" : "Stripe still needs a few of your details",
      preview: due ? `Payouts pause if this is not done by ${due}.` : "Payouts can pause until this is done.",
      heading: identity ? "Confirm your identity to keep payouts going" : "Stripe is still waiting on your details",
      paragraphs: [
        "Stripe asked for more information about you or your business, and it has not had it yet. This is a normal check on every account that takes money.",
        identity ? "You will need a photo of your ID. The name and date of birth on it have to match what you entered." : "",
        due ? `If it is not done by ${due}, your payouts are paused.` : "Until it is done, your payouts can be paused.",
      ],
      facts: [["What is needed", d.text("requirements", 120)], ["Due by", due]],
      action: { label: "Confirm your details", path: PATHS.payments },
      inApp: { title: identity ? "Confirm your identity" : "Stripe needs a few details", body: due ? `Stripe is still waiting. The date it gave is ${due}.` : "Stripe is still waiting for the details it asked for.", actionLabel: "Confirm details", actionPath: PATHS.payments },
    }
  },

  VERIFICATION_REMINDER_2: (d) => {
    const due = d.date("dueBy")
    const identity = d.bool("identity") === true
    return {
      family: "action_required",
      audience: "creator",
      subject: "Last reminder: Stripe needs your details",
      preview: "Your payouts can be held until it has them.",
      heading: "Stripe is still waiting on you",
      paragraphs: [
        "A week ago Stripe asked for more information about your account, and it still has not had it. Payouts can be held at any time until it does.",
        identity ? "It needs a photo of your ID, and the details on it to match what you entered." : "Everything it needs is listed on your payments page.",
      ],
      facts: [["What is needed", d.text("requirements", 120)], ["Due by", due]],
      action: { label: "Confirm your details", path: PATHS.payments },
      note: "This is the last reminder about this check. Your payments page always shows what is still needed.",
      inApp: { title: "Payouts are about to be held", body: "Stripe has still not had the details it asked for.", actionLabel: "Confirm details", actionPath: PATHS.payments },
    }
  },

  PAYOUT_RESTRICTED: (d) => ({
    family: "action_required",
    audience: "creator",
    subject: "Your payouts are paused",
    preview: "Here is what is needed to start them again.",
    heading: "Your payouts are paused",
    paragraphs: [
      "Stripe has paused payouts on your account. Your balance is kept safe while they are paused.",
      "To start payouts again, open your payment settings and complete what Stripe asks for.",
    ],
    facts: [["Reason", d.readable("reason")]],
    action: { label: "Open payment settings", path: PATHS.payments },
    inApp: { title: "Payouts are paused", body: "Complete what Stripe asks for to start payouts again.", actionLabel: "Open settings", actionPath: PATHS.payments },
  }),

  FIRST_SALE: (d, ctx) => saleMessage(d, ctx, true),

  NEW_SALE: (d, ctx) => saleMessage(d, ctx, false),

  REFUND_CREATED: (d) => {
    const title = d.text("productTitle", 60)
    const amount = d.money()
    const path = PATHS.order(d.id("orderId"))
    return {
      family: "transaction",
      audience: "creator",
      subject: amount ? `Refund of ${amount} issued` : "A refund was issued",
      preview: "The refunded amount comes out of your balance.",
      heading: "A refund was issued",
      paragraphs: [
        join("A refund", amount && `of ${amount}`, "was issued", title && `for ${title}`) + ".",
        "The refunded amount comes out of your Storelib balance. If your balance is lower, it comes out of your next payout.",
      ],
      facts: [["Product", title], ["Amount", amount], ["Order", d.orderLabel()], ["Reason", d.readable("reason")]],
      action: { label: "View the order", path },
      inApp: { title: "Refund issued", body: join("A refund", amount && `of ${amount}`, "was issued", title && `for ${title}`) + ".", actionLabel: "View order", actionPath: path },
    }
  },

  DISPUTE_CREATED: (d) => {
    const inquiry = d.bool("inquiry") === true
    const title = d.text("productTitle", 60)
    const amount = d.money()
    const due = d.date("dueBy")
    const path = PATHS.order(d.id("orderId"))
    return {
      family: "action_required",
      audience: "creator",
      subject: inquiry ? "A customer's bank asked about a payment" : amount ? `A customer disputed a payment of ${amount}` : "A customer disputed a payment",
      preview: inquiry ? "No money has been taken. Here is what happens next." : "Here is what happens next and how to help win it.",
      heading: inquiry ? "A bank asked about a payment" : "A payment was disputed",
      paragraphs: inquiry
        ? [
            join("A customer's bank asked questions about a payment", amount && `of ${amount}`, title && `for ${title}`) + ". No money has been taken.",
            "Storelib answers the bank for you. If you have proof the customer got what they paid for, add it on Payouts so it goes with the answer.",
          ]
        : [
            join("A customer asked their bank to reverse a payment", amount && `of ${amount}`, title && `for ${title}`) + ".",
            "Your share of this sale is held while the bank looks at the case. Storelib answers the bank for you, and if the bank decides for you, the money comes back to your balance.",
            "Add anything that proves the sale on Payouts, like proof the files were delivered and any messages with the customer.",
          ],
      facts: [["Amount", amount], ["Product", title], ["Order", d.orderLabel()], ["Reason", d.readable("reason", DISPUTE_REASONS)], ["Respond by", due]],
      action: { label: "Add evidence on Payouts", path: PATHS.disputes },
      inApp: { title: inquiry ? "A bank asked about a payment" : "Payment disputed", body: inquiry ? "No money has been taken. Storelib answers it for you." : join("A customer disputed a payment", amount && `of ${amount}`) + ".", actionLabel: "View", actionPath: PATHS.disputes },
    }
  },

  DISPUTE_ACTION_REQUIRED: (d) => {
    const title = d.text("productTitle", 60)
    const amount = d.money()
    const due = d.date("dueBy")
    const dueShort = d.date("dueBy", true)
    const path = PATHS.order(d.id("orderId"))
    return {
      family: "action_required",
      audience: "creator",
      subject: dueShort ? `Respond to a dispute by ${dueShort}` : "A dispute needs your response",
      preview: "Sending evidence gives you the best chance to win it.",
      heading: "A dispute needs your response",
      paragraphs: [
        due ? `Storelib answers the bank by ${due}. Add your evidence on Payouts before then so it goes with the answer.` : "Storelib answers the bank before its deadline. Add your evidence on Payouts so it goes with the answer.",
        "Good evidence is simple: proof the files were delivered or downloaded, and any messages with the customer.",
      ],
      facts: [["Amount", amount], ["Product", title], ["Order", d.orderLabel()], ["Reason", d.readable("reason", DISPUTE_REASONS)], ["Respond by", due]],
      action: { label: "Add evidence on Payouts", path: PATHS.disputes },
      inApp: { title: "A dispute needs your response", body: due ? `Respond by ${due}.` : "Send your evidence before the deadline.", actionLabel: "Respond", actionPath: PATHS.disputes },
    }
  },

  DISPUTE_CLOSED: (d) => {
    const title = d.text("productTitle", 60)
    const amount = d.money()
    const outcome = d.text("outcome", 20)
    const won = outcome === "won"
    const inquiry = outcome === "warning_closed" || outcome === "inquiry_closed"
    return {
      family: won ? "success" : "base",
      audience: "creator",
      subject: won ? "You won a dispute" : inquiry ? "A bank closed its question about a payment" : "A dispute was decided for the customer",
      preview: won ? "The money went back to your balance." : inquiry ? "No dispute was opened and nothing was taken." : "Here is what it means for your balance.",
      heading: won ? "You won the dispute" : inquiry ? "The bank's question is closed" : "The dispute is closed",
      paragraphs: won
        ? [join("The customer's bank decided for you", title && `on ${title}`) + ".", "Your share of the sale went back to your balance."]
        : inquiry
          ? ["The customer's bank closed its question without opening a dispute. Nothing was taken from your balance."]
          : [join("The customer's bank decided for the customer", title && `on ${title}`) + ".", "The amount held for this sale stays with the customer. Selling to people who know what they are buying, with a clear description, keeps disputes rare."],
      facts: [["Amount", amount], ["Product", title], ["Order", d.orderLabel()]],
      action: { label: "View Payouts", path: PATHS.disputes },
      inApp: { title: won ? "You won a dispute" : inquiry ? "A bank's question is closed" : "A dispute is closed", body: won ? "The money went back to your balance." : inquiry ? "Nothing was taken." : "The bank decided for the customer.", actionLabel: "View", actionPath: PATHS.disputes },
    }
  },

  SUBSCRIPTION_CREATED: (d) => {
    const plan = d.text("planName", 40)
    const amount = d.money()
    return {
      family: "success",
      audience: "creator",
      subject: plan ? `You are on the ${plan} plan` : "Your Storelib plan is active",
      preview: "Thanks for subscribing. Here are the details.",
      heading: "Your plan is active",
      paragraphs: [plan ? `Thanks for subscribing to ${plan}. Everything in your plan is ready to use now.` : "Thanks for subscribing. Everything in your plan is ready to use now."],
      facts: [["Plan", plan], ["Price", amount], ["Next billing date", d.date("nextBillingDate")]],
      action: { label: "View billing", path: PATHS.billing },
      inApp: { title: "Your plan is active", body: plan ? `You are on the ${plan} plan.` : "Thanks for subscribing.", actionLabel: "View billing", actionPath: PATHS.billing },
    }
  },

  SUBSCRIPTION_PAYMENT_FAILED: (d) => {
    const plan = d.text("planName", 40)
    const amount = d.money()
    const last4 = d.last4("cardLast4")
    return {
      family: "action_required",
      audience: "creator",
      subject: "Your Storelib plan payment did not go through",
      preview: "Update your payment method to keep your plan.",
      heading: "We could not charge your card",
      paragraphs: [
        join("We tried to charge", amount || "your card", plan ? `for your ${plan} plan,` : "for your plan,", "but the payment did not go through."),
        "Please update your payment method to keep your plan. We will try the payment again automatically.",
      ],
      facts: [["Plan", plan], ["Amount", amount], ["Card", ending(last4)]],
      action: { label: "Update payment method", path: PATHS.billing },
      inApp: { title: "Plan payment did not go through", body: "Update your payment method to keep your plan.", actionLabel: "Update", actionPath: PATHS.billing },
    }
  },

  SUBSCRIPTION_CANCELLED: (d) => {
    const plan = d.text("planName", 40)
    const ends = d.date("endsAt")
    return {
      family: "base",
      audience: "creator",
      subject: plan ? `Your ${plan} plan was cancelled` : "Your Storelib plan was cancelled",
      preview: ends ? `You keep your plan until ${ends}.` : "Here is what changes for your account.",
      heading: "Your plan was cancelled",
      paragraphs: [
        ends ? `You keep everything in ${plan || "your plan"} until ${ends}. After that, the features in this plan turn off.` : `The features in ${plan || "your plan"} are no longer active.`,
        "Your products and store stay as they are. You can pick a plan again any time from billing.",
      ],
      facts: [["Plan", plan], ["Active until", ends]],
      action: { label: "View billing", path: PATHS.billing },
      inApp: { title: "Plan cancelled", body: ends ? `Your plan stays active until ${ends}.` : "Your plan was cancelled.", actionLabel: "View billing", actionPath: PATHS.billing },
    }
  },

  DOMAIN_CONNECTED: (d) => {
    const domain = d.text("domain", 60).toLowerCase()
    const shortDomain = d.text("domain", 36).toLowerCase()
    return {
      family: "success",
      audience: "creator",
      subject: shortDomain ? `${shortDomain} is connected` : "Your domain is connected",
      preview: "Your store now opens at your own address.",
      heading: "Your domain is connected",
      paragraphs: [
        domain ? `${domain} now points to your Storelib store. Visitors can use it right away.` : "Your domain now points to your Storelib store. Visitors can use it right away.",
        "Some networks take a little while to catch up, so if it does not open for someone yet, it usually does within a few hours.",
      ],
      action: { label: "View domain settings", path: PATHS.domains },
      inApp: { title: "Domain connected", body: domain ? `${domain} now opens your store.` : "Your domain now opens your store.", actionLabel: "View", actionPath: PATHS.domains },
    }
  },

  DOMAIN_CONNECTION_FAILED: (d) => {
    const domain = d.text("domain", 60).toLowerCase()
    const shortDomain = d.text("domain", 30).toLowerCase()
    return {
      family: "action_required",
      audience: "creator",
      subject: shortDomain ? `We could not connect ${shortDomain}` : "We could not connect your domain",
      preview: "Usually one DNS record needs a small fix.",
      heading: "Your domain is not connected yet",
      paragraphs: [
        domain ? `We checked ${domain}, but its DNS records do not point to Storelib yet.` : "We checked your domain, but its DNS records do not point to Storelib yet.",
        "Domain settings show the exact records to add at your domain provider. DNS changes can take up to a day to show up, so if you just made them, give it a little time.",
      ],
      facts: [["Domain", domain], ["What we found", d.readable("reason")]],
      action: { label: "Check DNS settings", path: PATHS.domains },
      inApp: { title: "Domain not connected", body: domain ? `The DNS records for ${domain} need a fix.` : "Your domain's DNS records need a fix.", actionLabel: "Check DNS", actionPath: PATHS.domains },
    }
  },

  PASSWORD_CHANGED: (d, ctx) => ({
    family: "security",
    audience: "creator",
    subject: "Your Storelib password was changed",
    preview: "If this was you, there is nothing to do.",
    heading: "Your password was changed",
    paragraphs: ["The password for your Storelib account was just changed.", "If you made this change, you do not need to do anything."],
    facts: [["When", when(ctx, d)], ["Device", d.text("device", 60)], ["Location", d.text("location", 60)]],
    notice: { ...NOT_YOU, link: null },
    action: { label: "Review account security", path: PATHS.security },
    inApp: { title: "Password changed", body: "If this was not you, secure your account now.", actionLabel: "Review", actionPath: PATHS.security },
  }),

  EMAIL_CHANGED: (d, ctx) => {
    const masked = maskEmail(d.text("newEmailMasked", 120))
    return {
      family: "security",
      audience: "creator",
      subject: "Your Storelib email address was changed",
      preview: "If this was you, there is nothing to do.",
      heading: "Your email address was changed",
      paragraphs: [
        masked ? `The email address on your Storelib account was changed to ${masked}.` : "The email address on your Storelib account was changed.",
        "From now on, account emails go to the new address. If you made this change, you do not need to do anything.",
      ],
      facts: [["New address", masked], ["When", when(ctx, d)]],
      notice: {
        title: "If this was not you",
        text: "If you did not do this, secure your account right away. Sign in and change your password, or contact support if you can no longer sign in.",
        link: { label: "Contact support", path: PATHS.help },
      },
      action: { label: "Review account security", path: PATHS.security },
      inApp: { title: "Email address changed", body: "If this was not you, secure your account now.", actionLabel: "Review", actionPath: PATHS.security },
    }
  },

  ACCOUNT_RESTRICTED: (d) => ({
    family: "action_required",
    audience: "creator",
    subject: "Your Storelib account is restricted",
    preview: "Here is what that means and what you can do.",
    heading: "Your account is restricted",
    paragraphs: [
      "We have restricted your Storelib account. While it is restricted, some things, like selling or payouts, may be paused. Your products and data are kept safe.",
      "If you think this is a mistake, contact support and a person will look at it.",
    ],
    facts: [["Reason", d.readable("reason")]],
    action: { label: "Contact support", path: PATHS.help },
    inApp: { title: "Your account is restricted", body: "Some features may be paused. Contact support if you think this is a mistake.", actionLabel: "Get help", actionPath: PATHS.help },
  }),

  PURCHASE_CONFIRMATION: (d, ctx) => {
    const title = d.text("productTitle", 60)
    const store = d.store()
    const shortStore = cleanText(store, 30)
    const amount = d.money()
    const action = customerAction(d, "Get your files")
    return {
      family: "receipt",
      audience: "customer",
      subject: shortStore ? `Your order from ${shortStore}` : "Your Storelib receipt",
      preview: title ? `${title} is ready to download.` : "Your files are ready to download.",
      heading: "Thanks for your purchase",
      paragraphs: [
        join(title ? `Thanks for buying ${title}` : "Thanks for your order", store && `from ${store}`) + ". Your files are ready.",
        "Keep this email. The button below opens your receipt and downloads on any device.",
      ],
      facts: [["Product", title], ["Amount paid", amount], ["Order", d.orderLabel()], ["Date", when(ctx, d)], ["Sold by", store]],
      action,
      inApp: { title: "Thanks for your purchase", body: title ? `${title} is ready to download.` : "Your files are ready to download.", actionLabel: action.label, actionPath: action.path },
    }
  },

  DIGITAL_PRODUCT_ACCESS: (d) => {
    const title = d.text("productTitle", 60)
    const short = d.text("productTitle", 34)
    const store = d.store()
    const action = customerAction(d, "Open your download", true)
    return {
      family: "transaction",
      audience: "customer",
      subject: short ? `Your access to ${short}` : "Your download is ready",
      preview: "Open it any time from your library.",
      heading: "Your download is ready",
      paragraphs: [
        title ? join(`You now have access to ${title}`, store && `from ${store}`) + "." : "You now have access to your purchase.",
        "You can open it any time from your Storelib library, using the email address you bought with.",
      ],
      facts: [["Product", title], ["Sold by", store]],
      action,
      inApp: { title: "Your download is ready", body: title ? `${title} is in your library.` : "Your purchase is in your library.", actionLabel: action.label, actionPath: action.path },
    }
  },

  CUSTOMER_REFUND_PROCESSED: (d) => {
    const title = d.text("productTitle", 60)
    const store = d.store()
    const amount = d.money()
    const token = d.id("receiptToken")
    const action = token ? { label: "View your receipt", path: PATHS.receipt(token) } : null
    return {
      family: "transaction",
      audience: "customer",
      subject: amount ? `Your refund of ${amount} is on its way` : "Your refund is on its way",
      preview: "Banks usually take 5 to 10 business days to show it.",
      heading: "Your refund is on its way",
      paragraphs: [
        join(store || "The seller", "refunded", amount || "your payment", title && `for ${title}`) + ".",
        "It goes back to the card or account you paid with. Banks usually take 5 to 10 business days to show it.",
      ],
      facts: [["Product", title], ["Refund", amount], ["Order", d.orderLabel()], ["Sold by", store]],
      action,
      inApp: { title: "Refund on its way", body: amount ? `${amount} is on its way back to you.` : "Your refund is on its way back to you.", actionLabel: action?.label ?? null, actionPath: action?.path ?? null },
    }
  },

  REVIEW_REQUEST: (d) => reviewAsk(d, false),
  REVIEW_REMINDER: (d) => reviewAsk(d, true),

  /* ── A buyer's membership ───────────────────────────────────────────── */
  MEMBERSHIP_STARTED: (d) => {
    const m = membershipOf(d)
    const trial = d.date("trialEnd")
    return {
      family: "receipt",
      audience: "customer",
      subject: fitSubject("You are a member of ", m.title, "") || "Your membership has started",
      preview: trial ? `Your free trial runs until ${trial}.` : "Here is what you pay and when.",
      heading: m.title ? `Welcome to ${m.title}` : "Welcome, you are a member",
      paragraphs: [
        trial
          ? join("Your free trial runs until", `${trial}.`, m.price ? `After that it is ${m.price}, and you can cancel before then at no cost.` : "You can cancel before then at no cost.")
          : join("Thanks for joining.", m.price ? `You pay ${m.price}, and it renews by itself until you cancel.` : "It renews by itself until you cancel."),
        join("Posts from", m.creator || "the creator", "and everything the membership includes are on your membership page."),
      ],
      facts: [["Membership", m.title], ["By", m.creator], ["Price", m.price], [trial ? "First payment" : "Next payment", trial || m.next]],
      action: { label: "Open your membership", path: m.path },
      note: "You can cancel any time from your membership page. You keep access until the end of the period you paid for.",
      inApp: { title: "You are a member", body: m.title ? `Welcome to ${m.title}.` : "Your membership has started.", actionLabel: "Open", actionPath: m.path },
    }
  },

  MEMBERSHIP_RENEWED: (d) => {
    const m = membershipOf(d)
    const paid = d.money()
    return {
      family: "receipt",
      audience: "customer",
      subject: paid ? fitSubject(`${paid} for `, m.title, "") || "Your membership renewed" : "Your membership renewed",
      preview: m.next ? `Next payment ${m.next}.` : "Thanks for staying a member.",
      heading: "Your membership renewed",
      paragraphs: [join("We charged", paid || "your card", m.title ? `for ${m.title}` : "for your membership", m.creator ? `by ${m.creator}.` : "."), m.next ? `Your next payment is on ${m.next}.` : ""].filter(Boolean),
      facts: [["Membership", m.title], ["Amount", paid], ["Card", ending(d.last4("cardLast4"))], ["Next payment", m.next]],
      action: { label: "Open your membership", path: m.path },
      inApp: { title: "Membership renewed", body: paid ? `${paid} for ${m.title || "your membership"}.` : "Your membership renewed.", actionLabel: "Open", actionPath: m.path },
    }
  },

  MEMBERSHIP_RENEWAL_REMINDER: (d) => {
    const m = membershipOf(d)
    return {
      family: "transaction",
      audience: "customer",
      subject: m.next ? fitSubject("", m.title, ` renews on ${d.date("periodEnd", true)}`) || "Your membership renews soon" : "Your membership renews soon",
      preview: m.price ? `${m.price}, to the card you saved.` : "To the card you saved.",
      heading: m.next ? `Your membership renews on ${m.next}` : "Your membership renews soon",
      paragraphs: [
        join(m.title || "Your membership", m.creator ? `by ${m.creator}` : "", "renews", m.next ? `on ${m.next}` : "soon", m.price ? `for ${m.price}.` : "."),
        "Nothing to do if you want to stay. To stop it, cancel before then from your membership page and you keep access until that date.",
      ],
      facts: [["Membership", m.title], ["Price", m.price], ["Renews on", m.next]],
      action: { label: "Manage your membership", path: m.path },
      inApp: { title: "Renews soon", body: m.next ? `${m.title || "Your membership"} renews on ${m.next}.` : "Your membership renews soon.", actionLabel: "Manage", actionPath: m.path },
    }
  },

  MEMBERSHIP_PAYMENT_FAILED: (d) => {
    const m = membershipOf(d)
    const amount = d.money()
    const grace = d.date("graceEndsAt")
    const last4 = d.last4("cardLast4")
    return {
      family: "action_required",
      audience: "customer",
      subject: fitSubject("Your payment for ", m.title, " did not go through") || "Your membership payment did not go through",
      preview: grace ? `Update your card by ${grace} to keep access.` : "Update your card to keep access.",
      heading: "Your payment did not go through",
      paragraphs: [
        join("We tried to charge", amount || "your card", last4 ? `to the card ending in ${last4}` : "", m.title ? `for ${m.title},` : "for your membership,", "and the bank declined it."),
        grace ? `You keep access until ${grace}. Update your card before then and we will try again right away.` : "Update your card and we will try again right away.",
      ],
      facts: [["Membership", m.title], ["Amount", amount], ["Card", ending(last4)]],
      action: { label: "Update your card", path: `${m.path}?fix=card` },
      inApp: { title: "Membership payment failed", body: "Update your card to keep access.", actionLabel: "Update", actionPath: `${m.path}?fix=card` },
    }
  },

  MEMBERSHIP_CANCELED: (d) => {
    const m = membershipOf(d)
    const ends = d.date("endsAt") || m.next
    return {
      family: "transaction",
      audience: "customer",
      subject: fitSubject("", m.title, " is cancelled") || "Your membership is cancelled",
      preview: ends ? `You keep access until ${ends}.` : "You will not be charged again.",
      heading: "Your membership is cancelled",
      paragraphs: [
        join("You will not be charged again", m.title ? `for ${m.title}.` : "."),
        ends ? `You keep access to everything until ${ends}. Changed your mind? Resume it from your membership page before then.` : "Changed your mind? Resume it from your membership page.",
      ],
      facts: [["Membership", m.title], ["Access until", ends]],
      action: { label: "Open your membership", path: m.path },
      inApp: { title: "Membership cancelled", body: ends ? `Access until ${ends}.` : "You will not be charged again.", actionLabel: "Open", actionPath: m.path },
    }
  },

  MEMBERSHIP_ENDED: (d) => {
    const m = membershipOf(d)
    return {
      family: "base",
      audience: "customer",
      subject: fitSubject("Your membership of ", m.title, " has ended") || "Your membership has ended",
      preview: "You can join again whenever you like.",
      heading: "Your membership has ended",
      paragraphs: [
        join(m.title ? `Your membership of ${m.title}` : "Your membership", "has ended and you will not be charged again."),
        "Your receipts stay in your library, and you can join again whenever you like.",
      ],
      facts: [["Membership", m.title], ["By", m.creator]],
      action: { label: "See your memberships", path: PATHS.memberships },
      inApp: { title: "Membership ended", body: m.title ? `${m.title} has ended.` : "Your membership has ended.", actionLabel: "Open", actionPath: PATHS.memberships },
    }
  },

  /* ── A member of a community ────────────────────────────────────────── */
  COMMUNITY_WELCOME: (d, ctx) => COMMUNITY_ENTRIES.COMMUNITY_WELCOME(d, ctx),
  COMMUNITY_JOIN_APPROVED: (d, ctx) => COMMUNITY_ENTRIES.COMMUNITY_JOIN_APPROVED(d, ctx),
  COMMUNITY_INVITE: (d, ctx) => COMMUNITY_ENTRIES.COMMUNITY_INVITE(d, ctx),
  COMMUNITY_ANNOUNCEMENT: (d, ctx) => COMMUNITY_ENTRIES.COMMUNITY_ANNOUNCEMENT(d, ctx),
  COMMUNITY_EVENT_REMINDER: (d, ctx) => COMMUNITY_ENTRIES.COMMUNITY_EVENT_REMINDER(d, ctx),
  COMMUNITY_COURSE_AVAILABLE: (d, ctx) => COMMUNITY_ENTRIES.COMMUNITY_COURSE_AVAILABLE(d, ctx),
}

/** What every community email says the same way: its name, who runs it, and its address. */
function communityOf(d: Data): { name: string; creator: string; slug: string; home: string } {
  const slug = d.id("communitySlug")
  return { name: d.text("communityName", 60), creator: d.text("creatorName", 40), slug, home: PATHS.community(slug) }
}

/** Why an optional community email came, and where to turn that kind off. */
function memberNote(c: { name: string }, what: string): string {
  return join(`You get ${what} because you are a member${c.name ? ` of ${c.name}` : ""}.`, "You can turn them off in the community's notification settings.")
}

/** An event's time, in the zone the event was set in: "Tue, Mar 4, 6:00 PM GMT+1". */
function eventWhen(d: Data): string {
  const starts = d.text("startsAt", 40)
  const t = Date.parse(starts)
  if (!starts || !Number.isFinite(t)) return ""
  const zone = d.text("timezone", 60)
  const opts = (timeZone?: string): Intl.DateTimeFormatOptions => ({ weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short", ...(timeZone ? { timeZone } : { timeZone: "UTC" }) })
  let text: string
  try {
    text = new Intl.DateTimeFormat("en-US", opts(zone || undefined)).format(t)
  } catch {
    text = new Intl.DateTimeFormat("en-US", opts()).format(t)
  }
  return text.replace(/[\u202f\u00a0]/g, " ")
}

/* ── A member of a community ──────────────────────────────────────────── */

const COMMUNITY_ENTRIES: Record<
  "COMMUNITY_WELCOME" | "COMMUNITY_JOIN_APPROVED" | "COMMUNITY_INVITE" | "COMMUNITY_ANNOUNCEMENT" | "COMMUNITY_EVENT_REMINDER" | "COMMUNITY_COURSE_AVAILABLE",
  Entry
> = {
  COMMUNITY_WELCOME: (d) => {
    const c = communityOf(d)
    const welcome = d.text("welcomeText", 400)
    return {
      family: "base",
      audience: "customer",
      subject: fitSubject("Welcome to ", c.name, "") || "Welcome to the community",
      preview: c.creator ? `You are in. ${c.creator} runs it.` : "You are in.",
      heading: c.name ? `Welcome to ${c.name}` : "Welcome to the community",
      paragraphs: [
        welcome || join("You are a member now.", "Say hello in the feed, read the rules, and see what is coming up."),
        "Your communities are always in your Storelib library, under Communities.",
      ],
      facts: [["Community", c.name], ["Run by", c.creator]],
      action: { label: "Open the community", path: c.home },
      inApp: { title: "You are a member", body: c.name ? `Welcome to ${c.name}.` : "Welcome to the community.", actionLabel: "Open", actionPath: c.home },
    }
  },

  COMMUNITY_JOIN_APPROVED: (d) => {
    const c = communityOf(d)
    const pay = d.bool("needsPayment") === true
    const price = d.text("priceLine", 40)
    return {
      family: "success",
      audience: "customer",
      subject: fitSubject("You can join ", c.name, " now") || "Your request to join was approved",
      preview: pay ? "Finish joining when you are ready." : "You are a member now.",
      heading: "Your request was approved",
      paragraphs: [
        join(c.creator ? `${c.creator} approved your request` : "Your request was approved", c.name ? `to join ${c.name}.` : "."),
        pay ? join("To finish joining, open the community and complete the payment", price ? `(${price}).` : ".") : "You are a member now, so the feed, the events and everything else for members are open to you.",
      ],
      facts: [["Community", c.name], ["Price", pay ? price : ""]],
      action: { label: pay ? "Finish joining" : "Open the community", path: c.home },
      inApp: { title: "Request approved", body: c.name ? `You can join ${c.name} now.` : "You can join the community now.", actionLabel: "Open", actionPath: c.home },
    }
  },

  COMMUNITY_INVITE: (d) => {
    const c = communityOf(d)
    const inviter = d.text("inviterName", 40) || c.creator
    const code = d.id("inviteCode")
    const path = code && c.slug ? PATHS.community(c.slug, `/join?invite=${code}`) : c.home
    const until = d.date("expiresAt")
    return {
      family: "base",
      audience: "customer",
      subject: fitSubject("You are invited to ", c.name, "") || "You are invited to a community",
      preview: inviter ? `${inviter} invited you to join.` : "You have an invite to join.",
      heading: c.name ? `Join ${c.name}` : "You are invited",
      paragraphs: [
        join(inviter ? `${inviter} invited you to join` : "You are invited to join", c.name ? `${c.name} on Storelib.` : "a community on Storelib."),
        d.text("tagline", 160),
        until ? `The invite works until ${until}.` : "",
      ].filter(Boolean),
      facts: [["Community", c.name], ["Run by", c.creator]],
      action: { label: "Accept the invite", path },
      note: "If you were not expecting this, you can ignore it. Nothing happens unless you accept.",
      greet: false,
      inApp: { title: "You are invited", body: c.name ? `Join ${c.name}.` : "You have an invite to a community.", actionLabel: "Open", actionPath: path },
    }
  },

  COMMUNITY_ANNOUNCEMENT: (d) => {
    const c = communityOf(d)
    const title = d.text("title", 120)
    const excerpt = d.text("excerpt", 400)
    const author = d.text("authorName", 40)
    const post = d.id("postId")
    const path = post && c.slug ? PATHS.community(c.slug, `/post/${post}`) : c.home
    const subject = title ? fitSubject("", title, c.name ? ` in ${c.name}` : "") || fitSubject("", title, "") : fitSubject("New announcement in ", c.name, "")
    return {
      family: "base",
      audience: "customer",
      subject: subject || "A new announcement in your community",
      preview: excerpt ? excerpt.slice(0, 120) : author ? `From ${author}.` : "A new announcement for members.",
      heading: title || "A new announcement",
      paragraphs: [excerpt, join(author ? `Posted by ${author}` : "Posted", c.name ? `in ${c.name}.` : "in your community.")].filter(Boolean),
      action: { label: "Read it in the community", path },
      note: memberNote(c, "announcement emails"),
      greet: false,
      unsubscribeLabel: null,
      inApp: { title: title || "New announcement", body: c.name ? `In ${c.name}.` : "In your community.", actionLabel: "Read", actionPath: path },
    }
  },

  COMMUNITY_EVENT_REMINDER: (d) => {
    const c = communityOf(d)
    const title = d.text("eventTitle", 120)
    const when = eventWhen(d)
    const lead = d.text("lead", 8)
    const soon = lead === "1h" ? "in an hour" : lead === "24h" ? "tomorrow" : "soon"
    const event = d.id("eventId")
    const path = event && c.slug ? PATHS.community(c.slug, `/events/${event}`) : c.home
    const where = d.bool("online") === true ? "Online. The link is on the event page from 15 minutes before it starts." : d.text("location", 120)
    return {
      family: "transaction",
      audience: "customer",
      subject: fitSubject("", title, ` starts ${soon}`) || `Your event starts ${soon}`,
      preview: when || `It starts ${soon}.`,
      heading: title ? `${title} starts ${soon}` : `Your event starts ${soon}`,
      paragraphs: [join("A reminder for an event you said you are going to", c.name ? `in ${c.name}.` : "."), when ? `It starts ${when}.` : ""].filter(Boolean),
      facts: [["Event", title], ["When", when], ["Place", where], ["Community", c.name]],
      action: { label: "Open the event", path },
      note: memberNote(c, "event reminders"),
      greet: false,
      inApp: { title: title ? `${title} starts ${soon}` : `An event starts ${soon}`, body: when || (c.name ? `In ${c.name}.` : "In your community."), actionLabel: "Open", actionPath: path },
    }
  },

  COMMUNITY_COURSE_AVAILABLE: (d) => {
    const c = communityOf(d)
    const course = d.text("courseTitle", 80)
    const id = d.id("courseProductId")
    const path = id && c.slug ? PATHS.community(c.slug, `/classroom/${id}`) : c.slug ? PATHS.community(c.slug, "/classroom") : c.home
    return {
      family: "base",
      audience: "customer",
      subject: fitSubject("", course, " is open in your classroom") || fitSubject("A new course in ", c.name, "") || "A new course is open to you",
      preview: c.name ? `In the ${c.name} classroom.` : "In your community's classroom.",
      heading: course ? `${course} is open to you` : "A new course is open to you",
      paragraphs: [join(course ? `${course} is` : "A course is", "now open to you", c.name ? `in the ${c.name} classroom.` : "in your community's classroom."), "Your progress is saved as you go, so you can stop and pick it up any time."],
      facts: [["Course", course], ["Community", c.name]],
      action: { label: "Start the course", path },
      note: memberNote(c, "classroom emails"),
      greet: false,
      inApp: { title: "New course", body: course ? `${course} is open to you.` : "A new course is open to you.", actionLabel: "Start", actionPath: path },
    }
  },
}

/** What every membership notice says the same way: its name, who by, the price with its interval, the next date and its page. */
function membershipOf(d: Data): { title: string; creator: string; price: string; next: string; path: string } {
  const amount = d.money()
  const interval = d.text("interval", 8) === "year" ? "year" : "month"
  return {
    title: d.text("membershipTitle", 60),
    creator: d.text("creatorName", 40),
    price: amount ? `${amount} a ${interval}` : "",
    next: d.date("periodEnd"),
    path: PATHS.membership(d.id("membershipId")),
  }
}

/* ── Asking for a review ───────────────────────────────────────────────── */

/**
 * The buyer, a week after buying on Storelib and once more a week later
 * (lib/reviews/request-rules). Short, and it asks rather than assumes: it
 * cannot know whether they liked it.
 *
 * What it shows: the product by its picture, its name and who made it; five
 * stars that each open the review card on their receipt with that many
 * chosen; one button to write it. No sign in either way, the receipt link is
 * the proof of purchase. It carries nothing about the order but the product,
 * so it can say nothing about any other buyer.
 *
 * It comes from the seller by name, not from Storelib: see Message.sender.
 */
function reviewAsk(d: Data, reminder: boolean): Message {
  const title = d.text("productTitle", 60)
  const creator = d.text("creatorName", 40)
  const token = d.id("receiptToken")
  const product = d.id("productId")
  const action = token ? { label: "Write a review", path: PATHS.review(token) } : product ? { label: "Write a review", path: PATHS.libraryProduct(product) } : null
  const rate = token ? { label: "Tap a star to start", paths: [1, 2, 3, 4, 5].map((n) => PATHS.review(token, n)) } : null
  const what = title || "your purchase"
  const from = creator ? ` from ${creator}` : ""
  return {
    family: "lifecycle",
    audience: "customer",
    subject: reminder
      ? fitSubject("A quick review of ", title, "?") || "A quick review of your purchase?"
      : fitSubject("How is ", title, "?") || "How is your purchase?",
    preview: reminder ? "One line and a rating is plenty." : "A few honest words help other buyers decide.",
    heading: reminder ? `Would you review ${what}?` : `How is ${what}?`,
    /* The product itself, so the reader knows which purchase this is before reading a word. */
    media: title ? { title, subtitle: creator ? `by ${creator}` : null, imageUrl: d.text("productImage", 500) } : null,
    paragraphs: reminder
      ? [
          `Two weeks ago you bought ${what}${title ? "" : from}. If you have used it, a rating and a line or two is all it takes.`,
          "Good or bad, an honest review helps the next buyer.",
        ]
      : [
          `You bought ${what}${title ? "" : from} a week ago. If you have had a chance to use it, how was it?`,
          `Your review helps other buyers decide, and tells ${creator || "the seller"} what works.`,
        ],
    rate,
    action,
    note: reminder
      ? "This is the last email about reviewing this purchase."
      : "If something is not working, your receipt has the seller's contact details. We will ask once more next week if you have not reviewed it.",
    /* The ask is the seller's, so their name is what the inbox shows. */
    sender: creator ? { name: creator, replyTo: d.text("creatorSupportEmail", 200) } : null,
    unsubscribeLabel: "Turn off review emails",
    greet: false,
    inApp: { title: reminder ? "Review your purchase" : "How was your purchase?", body: title ? `Tell other buyers about ${title}.` : "Tell other buyers about it.", actionLabel: action?.label ?? null, actionPath: action?.path ?? null },
  }
}

/** Facts with a value, as the layout takes them. */
export function factsOf(message: Message): Fact[] {
  return (message.facts ?? []).filter(([, v]) => Boolean(v && v.trim())).map(([label, value]) => ({ label, value }))
}
