/**
 * ===========================================================================
 *  EVERY WORD IN AN EMAIL THAT IS FILLED IN WHEN IT IS SENT
 * ===========================================================================
 * "Sometimes in the content, automations set by people or emails sent by
 * them, it shows 'your name' or doesn't fetch correctly the profile picture
 * of that user profile, and that needs to change dynamically based on what
 * they change on their store."
 *
 * A buyer got "Best, [Your name]": an automation saved from an older preset
 * still had the preset's bracket placeholder in it, and nothing on the send
 * path knew what "[Your name]" meant. The automation engine knew nine
 * {{fields}}, the campaign sender three, the older automation path four, and
 * each filled them its own way.
 *
 * This is the one resolver all of them use, at SEND time, so a creator who
 * renames their store or changes their photo is in the very next email:
 *
 *   automations   lib/automations/merge-fields fillFields (engine prepareEmail,
 *                 the builder's preview, the test send), and a last sweep in
 *                 lib/email-automation automationEmail for the older paths
 *   campaigns     lib/email-campaigns/template personalizeHtml and
 *                 personalizeSubject (the send, the test, the preview)
 *
 * WHAT IS READ, in one pass over the text, so a value is never read again:
 *
 *   {{first_name}}          the supported tags (VARIABLES), their older and
 *   {{ your_name }}         looser spellings (ALIASES), and a creator's own
 *   {{first_name|friend}}   fallback after a bar
 *   *|FNAME|*               the handful of Mailchimp tags people paste in
 *   {first_name}            one pair of braces, only for a name we know
 *   [Your name] [Name]      the bracket placeholders AI writers and older
 *   [Store name]            presets leave in, so a saved automation is fixed
 *                           without a migration (BRACKETS, bracketKey)
 *
 * WHAT NOTHING FILLS. A word with no value is left out and the sentence is
 * tidied around it ("Thanks, {{first_name}}!" is "Thanks!"), except a
 * greeting, which reads "Hi there," and never "Hi ,". A link with no value
 * goes to the creator's page. A {{tag}} nobody knows is removed the same
 * way: a sent email never shows braces.
 *
 * Values are escaped for HTML in a body and left as text in a subject.
 *
 * Pure and browser-safe: the builder's and the composer's previews run it.
 */

export const APP_ORIGIN = (process.env.NEXT_PUBLIC_APP_URL || "https://storelib.com").replace(/\/$/, "")

export type VariableKey =
  | "first_name"
  | "last_name"
  | "name"
  | "email"
  | "creator_name"
  | "store_name"
  | "store_url"
  | "product_name"
  | "product_url"
  | "order_number"
  | "order_url"
  | "download_url"
  | "library_url"
  | "review_url"
  | "checkout_url"
  | "unsubscribe_url"
  | "current_year"

export type VariableValues = Partial<Record<VariableKey, string | null | undefined>>

export interface VariableInfo {
  key: VariableKey
  /** What an editor calls it. */
  label: string
  /** What it becomes, in the creator's words. */
  says: string
  /** A web address, for a link or a button. */
  link: boolean
}

/** The supported tags: the one list the builder, the composer and the checks read. */
export const VARIABLES: VariableInfo[] = [
  { key: "first_name", label: "First name", says: "Their first name. “Hi {{first_name}},” reads “Hi there,” when it is not known", link: false },
  { key: "last_name", label: "Last name", says: "Their last name, or nothing", link: false },
  { key: "name", label: "Full name", says: "Their full name. After a greeting, “there” when it is not known", link: false },
  { key: "email", label: "Email address", says: "Their email address", link: false },
  { key: "creator_name", label: "Your name", says: "Your name as it is on your profile now, to sign off with", link: false },
  { key: "store_name", label: "Store name", says: "Your store’s name as it is now", link: false },
  { key: "store_url", label: "Your Storelib page", says: "The address of your Storelib page", link: true },
  { key: "product_name", label: "Product name", says: "What they bought or left at checkout", link: false },
  { key: "product_url", label: "Product page", says: "The product’s page", link: true },
  { key: "order_number", label: "Order number", says: "Their order’s number, as on the receipt", link: false },
  { key: "order_url", label: "Their order", says: "Their order page, with the download", link: true },
  { key: "download_url", label: "Download link", says: "Where they download what they bought", link: true },
  { key: "library_url", label: "Their library", says: "Their Storelib library, with everything they bought", link: true },
  { key: "review_url", label: "Leave a review", says: "Their order page, open at the review form", link: true },
  { key: "checkout_url", label: "Back to checkout", says: "Checkout for the product they left", link: true },
  { key: "unsubscribe_url", label: "Unsubscribe link", says: "Their own unsubscribe page", link: true },
  { key: "current_year", label: "Year", says: "This year, as a number", link: false },
]

const KEYS = new Set<string>(VARIABLES.map((v) => v.key))
const LINKS = new Set<VariableKey>(VARIABLES.filter((v) => v.link).map((v) => v.key))

/** Older and looser spellings of the same tags. */
export const ALIASES: Record<string, VariableKey> = {
  firstname: "first_name",
  first: "first_name",
  fname: "first_name",
  customer_first_name: "first_name",
  subscriber_first_name: "first_name",
  buyer_first_name: "first_name",
  lastname: "last_name",
  lname: "last_name",
  full_name: "name",
  fullname: "name",
  customer_name: "name",
  customer: "name",
  subscriber_name: "name",
  buyer_name: "name",
  contact_name: "name",
  email_address: "email",
  subscriber_email: "email",
  your_name: "creator_name",
  yourname: "creator_name",
  creator: "creator_name",
  sender_name: "creator_name",
  from_name: "creator_name",
  author_name: "creator_name",
  signature: "creator_name",
  seller_name: "creator_name",
  brand_name: "store_name",
  shop_name: "store_name",
  business_name: "store_name",
  company_name: "store_name",
  store: "store_name",
  storename: "store_name",
  store_link: "store_url",
  shop_url: "store_url",
  shop_link: "store_url",
  website_url: "store_url",
  product: "product_name",
  product_title: "product_name",
  productname: "product_name",
  product_link: "product_url",
  order_id: "order_number",
  order_no: "order_number",
  order: "order_number",
  order_link: "order_url",
  receipt_url: "order_url",
  receipt_link: "order_url",
  download_link: "download_url",
  download: "download_url",
  library_link: "library_url",
  library: "library_url",
  review_link: "review_url",
  checkout_link: "checkout_url",
  unsubscribe_link: "unsubscribe_url",
  unsubscribe: "unsubscribe_url",
  year: "current_year",
}

/** The tag a written name stands for, or null. "First Name", "first-name" and "first_name" are the same. */
export function variableKey(raw: string): VariableKey | null {
  const k = raw.trim().toLowerCase().replace(/[\s.-]+/g, "_")
  if (KEYS.has(k)) return k as VariableKey
  return ALIASES[k] ?? null
}

/** Mailchimp's merge tags, as people paste them from an older email. */
const MAILCHIMP: Record<string, VariableKey> = {
  FNAME: "first_name",
  LNAME: "last_name",
  EMAIL: "email",
  UNSUB: "unsubscribe_url",
  CURRENT_YEAR: "current_year",
  "LIST:COMPANY": "store_name",
}

/**
 * The bracket placeholders a preset, an AI writer or a template from
 * elsewhere leaves in: "[Your name]", "[Name]", "[Store name]". Read the same
 * however they are capitalised or spaced.
 */
const BRACKET_WORDS: Record<string, VariableKey> = {
  "your name": "creator_name",
  "your full name": "creator_name",
  "your first name": "creator_name",
  "creator name": "creator_name",
  "sender name": "creator_name",
  "author name": "creator_name",
  "seller name": "creator_name",
  "your signature": "creator_name",
  signature: "creator_name",
  name: "first_name",
  "first name": "first_name",
  "firstname": "first_name",
  "customer name": "first_name",
  "customer first name": "first_name",
  "customers name": "first_name",
  "buyer name": "first_name",
  "buyers name": "first_name",
  "subscriber name": "first_name",
  "recipient name": "first_name",
  "recipients name": "first_name",
  "their name": "first_name",
  "full name": "name",
  "last name": "last_name",
  "store name": "store_name",
  "your store": "store_name",
  "your store name": "store_name",
  "shop name": "store_name",
  "your shop": "store_name",
  "your shop name": "store_name",
  "business name": "store_name",
  "your business": "store_name",
  "your business name": "store_name",
  "brand name": "store_name",
  "your brand": "store_name",
  "your brand name": "store_name",
  "company name": "store_name",
  "your company": "store_name",
  "your company name": "store_name",
  "product name": "product_name",
  "product": "product_name",
  "product title": "product_name",
  "course name": "product_name",
  "ebook name": "product_name",
  "order number": "order_number",
  "order #": "order_number",
  "order id": "order_number",
  "store link": "store_url",
  "store url": "store_url",
  "your store link": "store_url",
  "shop link": "store_url",
  "website link": "store_url",
  "your website": "store_url",
  "product link": "product_url",
  "product url": "product_url",
  "download link": "download_url",
  "link to download": "download_url",
  "download url": "download_url",
  "access link": "download_url",
  "library link": "library_url",
  "order link": "order_url",
  "receipt link": "order_url",
  "review link": "review_url",
  "checkout link": "checkout_url",
  "unsubscribe link": "unsubscribe_url",
  year: "current_year",
  "current year": "current_year",
  email: "email",
  "email address": "email",
}

/** What a bracket placeholder stands for, or null for brackets that are just brackets. */
export function bracketKey(inner: string): VariableKey | null {
  const t = inner.toLowerCase().replace(/[’']/g, "").replace(/[^a-z# ]+/g, " ").replace(/\s+/g, " ").trim()
  if (!t) return null
  if (BRACKET_WORDS[t]) return BRACKET_WORDS[t]
  /* "[Insert your name here]", "[Your company's name]", "[Customer's first name]". */
  const core = t.replace(/^(insert|add|enter|put)\s+/, "").replace(/\s+here$/, "").trim()
  if (BRACKET_WORDS[core]) return BRACKET_WORDS[core]
  if (/\bname$/.test(core) && core.split(" ").length <= 4) {
    if (/\b(store|shop|business|brand|company|website|site)\b/.test(core)) return "store_name"
    if (/\b(product|course|ebook|book|item|guide|template|preset)\b/.test(core)) return "product_name"
    if (/\b(your|my|creator|sender|author|seller)\b/.test(core)) return "creator_name"
    return "first_name"
  }
  return null
}

/* ─── The values ──────────────────────────────────────────────────────── */

function clean(v: string | null | undefined): string {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim() : ""
}

/** The first word of a name, and the rest. */
export function splitName(name: string | null | undefined): { first: string; last: string } {
  const parts = clean(name).split(" ").filter(Boolean)
  return { first: parts[0] ?? "", last: parts.slice(1).join(" ") }
}

/** The order's short number, as the receipt shows it: the first eight characters of its id. */
export function orderNumberOf(orderId: string | null | undefined): string {
  return (orderId ?? "").replace(/-/g, "").slice(0, 8).toUpperCase()
}

export function unsubscribePageFor(token: string): string {
  return `${APP_ORIGIN}/unsubscribe?token=${encodeURIComponent(token)}`
}

/**
 * Every tag's value for one email, with the chain each one falls back
 * along. Empty means nothing fills it: a word is then left out, a link goes
 * to the creator's page.
 */
export function valuesFor(v: VariableValues, now: Date = new Date()): Record<VariableKey, string> {
  const split = splitName(v.name)
  const first = clean(v.first_name) || split.first
  const last = clean(v.last_name) || split.last
  const full = clean(v.name) || [first, last].filter(Boolean).join(" ")
  const creator = clean(v.creator_name)
  const store = clean(v.store_name)
  const storeUrl = clean(v.store_url) || APP_ORIGIN
  const productUrl = clean(v.product_url) || storeUrl
  const orderUrl = clean(v.order_url)
  const library = clean(v.library_url) || `${APP_ORIGIN}/library`
  return {
    first_name: first,
    last_name: last,
    name: full,
    email: clean(v.email),
    creator_name: creator || store,
    store_name: store || creator,
    store_url: storeUrl,
    product_name: clean(v.product_name),
    product_url: productUrl,
    order_number: clean(v.order_number),
    order_url: orderUrl || productUrl,
    download_url: clean(v.download_url) || orderUrl || library,
    library_url: library,
    review_url: clean(v.review_url) || (orderUrl ? `${orderUrl}#review` : productUrl),
    checkout_url: clean(v.checkout_url) || productUrl,
    unsubscribe_url: clean(v.unsubscribe_url) || `${APP_ORIGIN}/unsubscribe`,
    current_year: clean(v.current_year) || String(now.getFullYear()),
  }
}

/** Words said when nothing else is known, and only there. */
const WORD_FALLBACK: Partial<Record<VariableKey, string>> = {
  product_name: "your order",
}

/** "Hi", "Hello", "Hey", "Dear" right before a name: the name becomes "there" (or "friend" after Dear). */
const GREETING = /\b(hi|hello|hey|hiya|howdy|dear|morning|evening|afternoon)[ \t]*(?:&nbsp;)?[ \t]*$/i

/* ─── Filling ─────────────────────────────────────────────────────────── */

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string)
}

/* One regular expression, so a filled value is never read a second time. */
const ANY = new RegExp(
  [
    /\{\{\s*([A-Za-z][\w .-]{0,40}?)\s*(?:\|\s*([^{}|]{0,60}?)\s*)?\}\}/.source, // 1 key, 2 own fallback
    /\*\|\s*([A-Z_:]{2,30})\s*\|\*/.source, // 3 Mailchimp
    /(?<!\{)\{\s*([A-Za-z][A-Za-z_]{1,30})\s*\}(?!\})/.source, // 4 one pair of braces
    /\[\s*([A-Za-z][A-Za-z '’#.-]{0,40}?)\s*\]/.source, // 5 brackets
  ].join("|"),
  "g",
)

/** A word nothing fills, marked while the pass runs and tidied away after it. */
const GAP = "\u0000"

function tidy(s: string): string {
  if (!s.includes(GAP)) return s
  return (
    s
      /* "Thanks, GAP!" is "Thanks!"; "for you GAP</p>" is "for you</p>". */
      .replace(/[ \t]*,?[ \t]*\u0000[ \t]*(?=[.!?;:)\]]|<\/|$)/gm, "")
      /* "Hi GAP, and" is "Hi, and". */
      .replace(/[ \t]*\u0000[ \t]*(?=,)/g, "")
      /* At the start of a line or a paragraph, with its comma. */
      .replace(/(^|>)[ \t]*\u0000[ \t]*,?[ \t]*/gm, "$1")
      /* Mid sentence: one space where there were two. */
      .replace(/[ \t]*\u0000[ \t]*/g, " ")
      .replace(/\u0000/g, "")
  )
}

export interface ResolveOptions {
  /** Words said when nothing fills a tag, over the defaults ("your order" for a product). */
  fallbacks?: Partial<Record<VariableKey, string>>
  /**
   * Tags this pass does not know the value of and leaves exactly as written,
   * for a later pass that does (the older automation path fills the person
   * first and the creator in automationEmail). Everything else is final.
   */
  leave?: VariableKey[]
  now?: Date
}

/**
 * Every tag, alias, pasted Mailchimp tag and bracket placeholder in
 * `content`, filled. `html` escapes each value for markup (a body); `text`
 * leaves it as it is, on one line (a subject, a preview line).
 */
export function resolveVariables(content: string, values: VariableValues, mode: "html" | "text", opts: ResolveOptions = {}): string {
  if (!content) return content ?? ""
  const v = valuesFor(values, opts.now)
  const fallbacks = { ...WORD_FALLBACK, ...(opts.fallbacks ?? {}) }
  const out = (s: string) => (mode === "text" ? s.replace(/[\r\n]+/g, " ") : escapeHtml(s))
  const before = (offset: number) => content.slice(Math.max(0, offset - 240), offset)
  const inAttribute = (offset: number) => /=\s*"[^"<>]*$|=\s*'[^'<>]*$/.test(before(offset))

  const leave = new Set(opts.leave ?? [])
  const fill = (key: VariableKey | null, own: string | undefined, offset: number, whole: string): string => {
    if (key && leave.has(key)) return whole
    if (!key) {
      /* A tag nobody knows: out of a link it goes to the creator's page, out of words it is dropped. */
      return inAttribute(offset) ? out(v.store_url) : GAP
    }
    const value = v[key]
    if (value) return out(value)
    if (own && own.trim() && !LINKS.has(key)) return out(own.trim())
    if (LINKS.has(key)) return out(v.store_url)
    if (key === "first_name" || key === "name") {
      const greeting = GREETING.exec(before(offset).replace(/<[^>]*>/g, ""))
      if (greeting) return /dear/i.test(greeting[1]) ? "friend" : "there"
    }
    const said = fallbacks[key]
    return said ? out(said) : GAP
  }

  const filled = content.replace(ANY, (whole: string, tag?: string, own?: string, mc?: string, single?: string, bracket?: string, offset?: number) => {
    const at = typeof offset === "number" ? offset : 0
    if (tag !== undefined) return fill(variableKey(tag), own, at, whole)
    if (mc !== undefined) {
      const key = MAILCHIMP[mc.toUpperCase()]
      return key ? fill(key, undefined, at, whole) : whole
    }
    if (single !== undefined) {
      const key = variableKey(single)
      return key ? fill(key, undefined, at, whole) : whole
    }
    if (bracket !== undefined) {
      /* Inside a tag's attributes, brackets are someone's markup, not a placeholder. */
      if (mode === "html" && /<[^>]*$/.test(before(at))) return whole
      const key = bracketKey(bracket)
      return key ? fill(key, undefined, at, whole) : whole
    }
    return whole
  })
  return tidy(filled)
}

/** Every placeholder in `text` this resolver would fill or remove, as written: for "is anything left?" checks. */
export function placeholdersIn(text: string): string[] {
  const found: string[] = []
  for (const m of (text || "").matchAll(ANY)) {
    if (m[1] !== undefined) found.push(m[0])
    else if (m[3] !== undefined && MAILCHIMP[m[3].toUpperCase()]) found.push(m[0])
    else if (m[4] !== undefined && variableKey(m[4])) found.push(m[0])
    else if (m[5] !== undefined && bracketKey(m[5])) found.push(m[0])
  }
  return found
}

/**
 * The reader every preview shows, so what a creator sees is what a buyer
 * gets: a real looking name, product and order, never the braces.
 */
export const SAMPLE_READER = {
  name: "Alex Rivera",
  email: "alex@example.com",
  productName: "Your product",
  orderId: "7f3a9c21-4b8e-4d2a-9f10-2c6b8e5d1a44",
} as const
