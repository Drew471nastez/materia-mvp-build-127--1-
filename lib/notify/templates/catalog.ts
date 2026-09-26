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
import type { Fact } from "./layout"

/* ── Data keys ─────────────────────────────────────────────────────────── */

/** The data keys each template reads. Workflows fill these; every one is optional. */
export const DATA_KEYS: Record<NotificationType, readonly string[]> = {
  WELCOME_TO_STORELIB: ["storeName"],
  VERIFY_EMAIL: ["userId", "email"],
  FIRST_PRODUCT_REMINDER: [],
  FIRST_PRODUCT_REMINDER_2: [],
  FINISH_PRODUCT_REMINDER: ["productTitle", "productId"],
  PUBLISH_PRODUCT_REMINDER: ["productTitle", "productId"],
  FIRST_PRODUCT_PUBLISHED: ["productTitle", "productId", "paymentsReady"],
  PAYMENT_SETUP_REMINDER: [],
  PAYMENT_SETUP_REMINDER_2: [],
  PAYMENT_SETUP_COMPLETED: [],
  PAYMENT_VERIFICATION_REQUIRED: ["reason", "dueBy"],
  PAYMENT_SETUP_FAILED: ["reason"],
  PAYOUT_METHOD_ADDED: ["bankLast4", "occurredAt"],
  PAYOUT_METHOD_CHANGED: ["bankLast4", "occurredAt"],
  PAYOUT_SCHEDULED: ["payoutId", "amountCents", "currency", "arrivalDate", "bankLast4"],
  PAYOUT_SENT: ["payoutId", "amountCents", "currency", "arrivalDate", "bankLast4"],
  PAYOUT_FAILED: ["payoutId", "amountCents", "currency", "reason", "bankLast4"],
  PAYOUT_ACTION_REQUIRED: ["reason", "dueBy"],
  PAYOUT_RESTRICTED: ["reason"],
  FIRST_SALE: ["productTitle", "productId", "amountCents", "currency", "orderId", "orderNumber", "customerName"],
  NEW_SALE: ["productTitle", "productId", "amountCents", "currency", "orderId", "orderNumber", "customerName", "occurredAt"],
  REFUND_CREATED: ["productTitle", "amountCents", "currency", "orderId", "orderNumber", "reason"],
  DISPUTE_CREATED: ["disputeId", "orderId", "orderNumber", "productTitle", "amountCents", "currency", "reason", "dueBy"],
  DISPUTE_ACTION_REQUIRED: ["disputeId", "orderId", "orderNumber", "productTitle", "amountCents", "currency", "reason", "dueBy"],
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
  order: (id: string) => (id ? `/app/orders?order=${id}` : "/app/orders"),
  help: "/help",
  receipt: (token: string) => `/receipt/${token}`,
  library: "/library",
  libraryProduct: (id: string) => `/library/products/${id}`,
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
  action?: { label: string; path: string } | null
  notice?: { title: string; text: string; link?: { label: string; path: string } | null } | null
  note?: string | null
  inApp: { title: string; body: string; actionLabel?: string | null; actionPath?: string | null }
}

type Entry = (d: Data, ctx: TemplateContext) => Message

/** Joins sentence parts, leaving out the empty ones. */
const join = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ")

const REMINDER_NOTE = "This is a reminder to help you get set up. You can turn these reminders off in your notification settings."
const LAST_REMINDER_NOTE = "This is the last reminder about this. You can turn these reminders off in your notification settings."

const NOT_YOU = {
  title: "If this was not you",
  text: "If you did not do this, secure your account right away. Change your password and check your email address and payout details in your account settings.",
  link: { label: "Secure your account", path: PATHS.security },
}

const when = (ctx: TemplateContext, d: Data): string => cleanText(ctx.when, 80) || d.date("occurredAt")
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

export const CATALOG: Record<NotificationType, Entry> = {
  WELCOME_TO_STORELIB: () => ({
    family: "base",
    audience: "creator",
    subject: "Welcome to Storelib",
    preview: "Here is where to start, in two short steps.",
    heading: "Welcome to Storelib",
    paragraphs: [
      "Thanks for signing up. Storelib is where you sell your digital products, and you can have your first one up today.",
      "Most people start by adding one product and setting up payments, so the first sale can pay out. Each takes a few minutes.",
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

  PAYMENT_SETUP_REMINDER: () => ({
    family: "lifecycle",
    audience: "creator",
    subject: "Set up payments so you can get paid",
    preview: "It takes a few minutes and you only do it once.",
    heading: "Set up payments to get paid",
    paragraphs: [
      "Before money from sales can reach you, we need a few details for your payouts. Stripe handles this part, and it takes a few minutes.",
      "Once it is done, sales go to your balance and pay out to your bank on a regular schedule.",
    ],
    action: { label: "Set up payments", path: PATHS.payments },
    note: REMINDER_NOTE,
    inApp: { title: "Set up payments", body: "Add your payout details so you can get paid for sales.", actionLabel: "Set up", actionPath: PATHS.payments },
  }),

  PAYMENT_SETUP_REMINDER_2: () => ({
    family: "lifecycle",
    audience: "creator",
    subject: "Your payments are not set up yet",
    preview: "Finish setup now so a sale does not have to wait.",
    heading: "Payments still need setting up",
    paragraphs: [
      "Without payments set up, you cannot get paid for your sales.",
      "If you started and stopped, you can pick up where you left off. Stripe keeps what you already entered.",
    ],
    action: { label: "Finish payment setup", path: PATHS.payments },
    note: LAST_REMINDER_NOTE,
    inApp: { title: "Payments are not set up", body: "Finish setup so your sales can pay out.", actionLabel: "Finish setup", actionPath: PATHS.payments },
  }),

  PAYMENT_SETUP_COMPLETED: () => ({
    family: "success",
    audience: "creator",
    subject: "Payments are set up",
    preview: "You can now get paid for your sales.",
    heading: "You are ready to get paid",
    paragraphs: [
      "Your payment details are confirmed. Money from your sales goes to your balance and pays out to your bank on your payout schedule.",
      "You can see your balance and upcoming payouts any time.",
    ],
    action: { label: "View payouts", path: PATHS.payouts },
    inApp: { title: "Payments are set up", body: "You can now get paid for your sales.", actionLabel: "View payouts", actionPath: PATHS.payouts },
  }),

  PAYMENT_VERIFICATION_REQUIRED: (d) => {
    const due = d.date("dueBy")
    return {
      family: "action_required",
      audience: "creator",
      subject: "Action needed: confirm your payout details",
      preview: "Stripe needs a bit more information to keep payouts going.",
      heading: "Stripe needs a few more details",
      paragraphs: [
        "To keep your payouts running, Stripe needs you to confirm some information about you or your business. This is a normal check.",
        due ? `Please do this by ${due} so your payouts are not paused.` : "Please do this soon so your payouts are not paused.",
      ],
      facts: [["What is needed", d.readable("reason")], ["Due by", due]],
      action: { label: "Confirm your details", path: PATHS.payments },
      inApp: { title: "Confirm your payout details", body: due ? `Stripe needs more information by ${due}.` : "Stripe needs a bit more information to keep payouts going.", actionLabel: "Confirm details", actionPath: PATHS.payments },
    }
  },

  PAYMENT_SETUP_FAILED: (d) => ({
    family: "action_required",
    audience: "creator",
    subject: "Your payment setup did not go through",
    preview: "A quick look at your details usually fixes it.",
    heading: "We could not finish your payment setup",
    paragraphs: [
      "Stripe could not verify the details you entered, so payments are not set up yet.",
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

  PAYOUT_ACTION_REQUIRED: (d) => {
    const due = d.date("dueBy")
    return {
      family: "action_required",
      audience: "creator",
      subject: "Action needed to keep your payouts going",
      preview: "Stripe needs something from you before the next payout.",
      heading: "Your payouts need your attention",
      paragraphs: [
        "Your next payout is on hold until Stripe gets a bit more information from you.",
        due ? `Please take care of it by ${due}. It usually takes a few minutes.` : "It usually takes a few minutes.",
      ],
      facts: [["What is needed", d.readable("reason")], ["Due by", due]],
      action: { label: "Review payout details", path: PATHS.payments },
      inApp: { title: "Payouts need your attention", body: "Stripe needs more information before your next payout.", actionLabel: "Review", actionPath: PATHS.payments },
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

  FIRST_SALE: (d) => {
    const title = d.text("productTitle", 60)
    const amount = d.money()
    const name = d.first("customerName")
    const path = PATHS.order(d.id("orderId"))
    const who = name || "Someone"
    return {
      family: "success",
      audience: "creator",
      subject: "You made your first sale!",
      preview: join(`${who} bought`, title || "your product", amount && `for ${amount}`) + ".",
      heading: "You made your first sale",
      paragraphs: [
        join(`${who} just bought`, title || "your product", amount && `for ${amount}`) + ".",
        "Congratulations. The first one is the hardest, and it is done.",
        "The money goes to your balance and pays out on your normal schedule.",
      ],
      facts: [["Product", title], ["Amount", amount], ["Order", d.orderLabel()]],
      action: { label: "View the order", path },
      inApp: { title: "Your first sale", body: join(`${who} bought`, title || "your product", amount && `for ${amount}`) + ".", actionLabel: "View order", actionPath: path },
    }
  },

  NEW_SALE: (d, ctx) => {
    const title = d.text("productTitle", 60)
    const short = d.text("productTitle", 28)
    const amount = d.money()
    const name = d.first("customerName")
    const path = PATHS.order(d.id("orderId"))
    const who = name || "Someone"
    return {
      family: "transaction",
      audience: "creator",
      subject: short ? join(`New sale: ${short}`, amount && `for ${amount}`) : amount ? `New sale for ${amount}` : "You made a sale",
      preview: join(`${who} bought`, title || "your product") + ".",
      heading: "You made a sale",
      paragraphs: [join(`${who} bought`, title || "your product", amount && `for ${amount}`) + "."],
      facts: [["Product", title], ["Amount", amount], ["Customer", name], ["Order", d.orderLabel()], ["Date", when(ctx, d)]],
      action: { label: "View the order", path },
      note: "You can turn off sale emails in your notification settings and still see every sale in the app.",
      inApp: { title: amount ? `New sale: ${amount}` : "New sale", body: join(`${who} bought`, title || "your product") + ".", actionLabel: "View order", actionPath: path },
    }
  },

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
    const title = d.text("productTitle", 60)
    const amount = d.money()
    const due = d.date("dueBy")
    const path = PATHS.order(d.id("orderId"))
    return {
      family: "action_required",
      audience: "creator",
      subject: amount ? `A customer disputed a payment of ${amount}` : "A customer disputed a payment",
      preview: "Here is what happens next and what you can do.",
      heading: "A payment was disputed",
      paragraphs: [
        join("A customer asked their bank to reverse a payment", amount && `of ${amount}`, title && `for ${title}`) + ".",
        "The bank holds the amount while it looks at the case. You can send evidence, like proof the customer got the files, to help win it.",
      ],
      facts: [["Amount", amount], ["Product", title], ["Order", d.orderLabel()], ["Reason", d.readable("reason", DISPUTE_REASONS)], ["Respond by", due]],
      action: { label: "View the dispute", path },
      inApp: { title: "Payment disputed", body: join("A customer disputed a payment", amount && `of ${amount}`) + ".", actionLabel: "View", actionPath: path },
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
        due ? `The deadline to respond is ${due}. After that, the bank decides without hearing your side.` : "There is a deadline to respond. After it, the bank decides without hearing your side.",
        "Good evidence is simple: the order, proof the files were delivered or downloaded, and any messages with the customer.",
      ],
      facts: [["Amount", amount], ["Product", title], ["Order", d.orderLabel()], ["Reason", d.readable("reason", DISPUTE_REASONS)], ["Respond by", due]],
      action: { label: "Respond to the dispute", path },
      inApp: { title: "A dispute needs your response", body: due ? `Respond by ${due}.` : "Send your evidence before the deadline.", actionLabel: "Respond", actionPath: path },
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
}

/** Facts with a value, as the layout takes them. */
export function factsOf(message: Message): Fact[] {
  return (message.facts ?? []).filter(([, v]) => Boolean(v && v.trim())).map(([label, value]) => ({ label, value }))
}
