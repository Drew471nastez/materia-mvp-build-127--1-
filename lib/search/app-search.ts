/**
 * ===========================================================================
 *  ONE SEARCH ACROSS A CREATOR'S OWN THINGS
 * ===========================================================================
 * The search in the /app header used to know about pages only. Typing a
 * buyer's name, an order number or a product found "Orders" at best. This is
 * the server half of the search that finds the thing itself: orders,
 * customers, products, emails and automations, five of each at most.
 *
 * SCOPED TWICE. The route hands this the signed in person's own Supabase
 * client, so row level security already limits every table to their rows,
 * and every query here ALSO names the creator: `creator_id` on the tables that
 * carry it, and the creator's own product ids on `orders`, which does not.
 * The creator id comes from the session on the server, never from the
 * request. tests/app-search.test.ts runs every query against two creators'
 * rows and fails if one row of the other creator comes back.
 *
 * ORDERS ARE FOUND THE WAY THE ORDERS PAGE FINDS THEM. An order's number is
 * not stored: it is its place among every order the creator has, oldest
 * first (lib/orders/order-view.ts, groupOrders). So the orders are read the
 * way that page reads them, a thousand rows at a time, only the columns a
 * search needs, then grouped, numbered and matched with the page's own
 * `matchesSearch`. "#1042" here is #1042 there, and a name that finds an
 * order there finds it here.
 *
 * TEXT IS ESCAPED BEFORE IT IS A PATTERN. `%` and `_` are wildcards to
 * `ilike`, so a search for "50%" matched every subject with a 50 in it, and a
 * search for "_" matched everything. They are escaped, and so is the escape
 * character itself.
 *
 * A MISSING TABLE IS AN EMPTY GROUP. The emails and automations tables arrive
 * by migration; before one has run, its query fails. That group comes back
 * empty and is named in `unavailable`, and the others are answered.
 *
 * NOTHING HERE LOGS THE QUERY. It can be somebody's email address.
 */
import { groupOrders, matchesSearch, type Order, type OrderRow } from "@/lib/orders/order-view"
import { tt } from "@/lib/i18n/text"
import { appLocale } from "@/lib/i18n/format"

export type SearchGroupId = "orders" | "customers" | "products" | "emails" | "automations"

export const SEARCH_GROUPS: readonly SearchGroupId[] = ["orders", "customers", "products", "emails", "automations"]

export const GROUP_LABELS: Record<SearchGroupId, string> = {
  get orders() { return tt("Orders") },
  get customers() { return tt("Customers") },
  get products() { return tt("Products") },
  get emails() { return tt("Emails") },
  get automations() { return tt("Automations") },
}

/** At most this many of each kind. A search is for finding one thing, not a list. */
export const GROUP_LIMIT = 5

/** Longer than any name, email or subject anybody types. */
export const MAX_QUERY_LENGTH = 100

export interface SearchHit {
  id: string
  title: string
  /** One line under the title: who, what, how much, or where it stands. */
  detail: string
  href: string
}

export interface SearchResult {
  groups: Record<SearchGroupId, SearchHit[]>
  /** Groups whose table could not be read (not migrated yet, or failing). */
  unavailable: SearchGroupId[]
}

export function emptyResult(): SearchResult {
  return { groups: { orders: [], customers: [], products: [], emails: [], automations: [] }, unavailable: [] }
}

/** Trimmed, one space between words, and no longer than MAX_QUERY_LENGTH. */
export function normalizeQuery(raw: unknown): string {
  if (typeof raw !== "string") return ""
  return raw.replace(/\s+/g, " ").trim().slice(0, MAX_QUERY_LENGTH)
}

/**
 * Worth asking the server: two characters, or an order number of any length
 * ("#7", "7"). One letter matches half of everything and tells nobody anything.
 */
export function isSearchable(q: string): boolean {
  const t = q.trim()
  return t.length >= 2 || /^#?\d+$/.test(t)
}

/**
 * `%`, `_` and `\` taken literally by `ilike`. Postgres's default escape
 * character for LIKE is the backslash, so each is preceded by one.
 */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`)
}

/** "contains", as an ilike pattern, with the text taken literally. */
export function containsPattern(q: string): string {
  return `%${escapeLike(q)}%`
}

/* ─── Reading ─────────────────────────────────────────────────────────── */

/**
 * Loosely typed on purpose: the real client is Supabase's, and the tests
 * hand in a small in-memory one that answers the same chain.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

interface ReadError {
  code?: string
  message?: string
}

class GroupUnavailable extends Error {
  constructor(readonly group: SearchGroupId, readonly code: string) {
    super(`${group}: ${code}`)
  }
}

/**
 * A query with a named column list, and `*` if the list is refused: a column
 * named here that a database has not been migrated to have makes PostgREST
 * answer with an error instead of the columns it does have.
 */
async function readWithFallback(group: SearchGroupId, run: (columns: string) => PromiseLike<{ data: unknown; error: ReadError | null }>, columns: string) {
  const first = await run(columns)
  if (!first.error) return (first.data as Record<string, unknown>[] | null) ?? []
  const second = await run("*")
  if (!second.error) return (second.data as Record<string, unknown>[] | null) ?? []
  throw new GroupUnavailable(group, second.error.code || "error")
}

const text = (v: unknown): string => (typeof v === "string" ? v : "")

const usd = new Intl.NumberFormat(appLocale(), { style: "currency", currency: "USD" })

function sentenceCase(v: string): string {
  const t = v.replace(/_/g, " ").trim()
  return t ? t[0].toUpperCase() + t.slice(1) : ""
}

/* ─── The creator's products, which orders are scoped by ─────────────── */

interface ProductIndex {
  id: string
  title: string
  status: string
  price_cents: number | null
}

async function readProducts(db: Db, creatorId: string): Promise<ProductIndex[]> {
  const rows = await readWithFallback(
    "products",
    (columns) => db.from("products").select(columns).eq("creator_id", creatorId),
    "id, title, status, price_cents",
  )
  return rows.map((p) => ({
    id: text(p.id),
    title: text(p.title) || tt("Untitled product"),
    status: text(p.status),
    price_cents: typeof p.price_cents === "number" ? p.price_cents : null,
  }))
}

/* ─── Orders and the people who placed them ──────────────────────────── */

const ORDER_COLUMNS =
  "id, product_id, created_at, stripe_session_id, amount_cents, tip_cents, status, buyer_email, customer_email, buyer_first_name, buyer_last_name, refund_amount_cents"

/** Every order row on the creator's products, a thousand at a time, as the Orders page reads them. */
async function readOrderRows(db: Db, products: ProductIndex[]): Promise<OrderRow[]> {
  if (products.length === 0) return []
  const productIds = products.map((p) => p.id)
  const byId = new Map(products.map((p) => [p.id, p]))
  let columns = ORDER_COLUMNS
  const rows: Record<string, unknown>[] = []
  for (let from = 0; from < 100_000; from += 1000) {
    const page = (cols: string) =>
      db.from("orders").select(cols).in("product_id", productIds).order("created_at", { ascending: false }).range(from, from + 999)
    let { data, error } = await page(columns)
    if (error && columns !== "*") {
      columns = "*"
      ;({ data, error } = await page(columns))
    }
    if (error) throw new GroupUnavailable("orders", error.code || "error")
    const list = (data ?? []) as Record<string, unknown>[]
    rows.push(...list)
    if (list.length < 1000) break
  }
  /* The same fields, with the same fallbacks, as lib/orders/load-rows.ts. */
  const nullable = (v: unknown) => (v === undefined ? null : (v as string | null))
  return rows.map((o) => {
    const product = byId.get(text(o.product_id))
    const row: OrderRow = {
      id: text(o.id),
      product_id: text(o.product_id),
      amount_cents: typeof o.amount_cents === "number" ? o.amount_cents : 0,
      tip_cents: typeof o.tip_cents === "number" ? o.tip_cents : null,
      status: text(o.status) || "pending",
      created_at: text(o.created_at),
      buyer_email: nullable(o.buyer_email) ?? nullable(o.customer_email) ?? null,
      buyer_first_name: nullable(o.buyer_first_name),
      buyer_last_name: nullable(o.buyer_last_name),
      stripe_session_id: nullable(o.stripe_session_id),
      refund_amount_cents: typeof o.refund_amount_cents === "number" ? o.refund_amount_cents : null,
      product: product ? { id: product.id, title: product.title } : null,
    }
    return row
  })
}

function orderHit(order: Order): SearchHit {
  const titles = order.lines.map((l) => l.product?.title).filter((t): t is string => !!t)
  const what = titles.length > 1 ? tt("{titles} and {value} more", { titles: titles[0], value: titles.length - 1 }) : titles[0] || ""
  const who = order.customerName || order.customerEmail || ""
  return {
    id: order.id,
    title: tt("Order #{number}", { number: order.number }),
    detail: [who, what, usd.format(order.totalCents / 100)].filter(Boolean).join(" · "),
    href: `/app/orders?order=${encodeURIComponent(order.id)}`,
  }
}

/** One person's orders, over all time, on the Orders page: the closest thing to a customer page. */
export function customerHref(emailOrName: string): string {
  return `/app/orders?range=all_time&q=${encodeURIComponent(emailOrName)}`
}

interface Buyer {
  key: string
  name: string | null
  email: string | null
  orders: number
}

function buyersMatching(orders: Order[], q: string): Buyer[] {
  const needle = q.trim().toLowerCase()
  const byKey = new Map<string, Buyer>()
  /* Newest first, so the name kept is the one they gave last, and every
     order of theirs is counted, not only the ones that matched. */
  for (const order of orders) {
    const key = (order.customerEmail || order.customerName || "").toLowerCase()
    if (!key) continue
    const known = byKey.get(key)
    if (known) known.orders++
    else byKey.set(key, { key, name: order.customerName, email: order.customerEmail, orders: 1 })
  }
  return [...byKey.values()].filter(
    (b) => (b.email || "").toLowerCase().includes(needle) || (b.name || "").toLowerCase().includes(needle),
  )
}

/* ─── Contacts, from the email list ──────────────────────────────────── */

interface Contact {
  email: string
  name: string | null
}

async function readContacts(db: Db, creatorId: string, q: string): Promise<Contact[]> {
  const pattern = containsPattern(q)
  const byEmail = await db
    .from("subscribers")
    .select("id, email")
    .eq("creator_id", creatorId)
    .ilike("email", pattern)
    .order("subscribed_at", { ascending: false })
    .limit(GROUP_LIMIT)
  if (byEmail.error) throw new GroupUnavailable("customers", byEmail.error.code || "error")
  const found: Contact[] = ((byEmail.data ?? []) as Record<string, unknown>[]).map((r) => ({ email: text(r.email), name: null }))

  /* `name` came in a later migration. Without it, contacts are found by email. */
  const byName = await db
    .from("subscribers")
    .select("id, email, name")
    .eq("creator_id", creatorId)
    .ilike("name", pattern)
    .order("subscribed_at", { ascending: false })
    .limit(GROUP_LIMIT)
  if (!byName.error) {
    for (const r of (byName.data ?? []) as Record<string, unknown>[]) {
      const email = text(r.email)
      const known = found.find((c) => c.email.toLowerCase() === email.toLowerCase())
      if (known) known.name = text(r.name) || null
      else found.push({ email, name: text(r.name) || null })
    }
  }
  return found.filter((c) => c.email)
}

/* ─── Emails and automations ─────────────────────────────────────────── */

async function readEmails(db: Db, creatorId: string, q: string): Promise<SearchHit[]> {
  const rows = await readWithFallback(
    "emails",
    (columns) =>
      db
        .from("email_campaigns")
        .select(columns)
        .eq("creator_id", creatorId)
        .ilike("subject", containsPattern(q))
        .order("created_at", { ascending: false })
        .limit(GROUP_LIMIT),
    "id, subject, status",
  )
  return rows.map((r) => ({
    id: text(r.id),
    title: text(r.subject) || tt("No subject"),
    detail: sentenceCase(text(r.status)) || tt("Email"),
    href: emailHref(text(r.id), text(r.status)),
  }))
}

/**
 * Where an email opens: a draft in the composer, anything scheduled or sent
 * on its own page over the list it belongs to (app/app/emails/emails-client.tsx),
 * the way a row on the Emails page opens it.
 */
export function emailHref(id: string, status: string): string {
  const key = encodeURIComponent(id)
  if (status === "draft" || status === "") return `/app/emails/edit/${key}`
  return `/app/emails?tab=${status === "scheduled" ? "scheduled" : "published"}&email=${key}`
}

const FLOW_STATE: Record<string, string> = { get active() { return tt("On") }, get paused() { return tt("Paused") }, get draft() { return tt("Draft") } }

async function readAutomations(db: Db, creatorId: string, q: string): Promise<SearchHit[]> {
  const rows = await readWithFallback(
    "automations",
    (columns) =>
      db
        .from("email_flows")
        .select(columns)
        .eq("creator_id", creatorId)
        .ilike("name", containsPattern(q))
        .order("created_at", { ascending: false })
        .limit(GROUP_LIMIT),
    "id, name, status",
  )
  return rows.map((r) => ({
    id: text(r.id),
    title: text(r.name) || tt("Untitled automation"),
    detail: FLOW_STATE[text(r.status)] ?? (sentenceCase(text(r.status)) || tt("Automation")),
    href: `/app/emails/flow/${encodeURIComponent(text(r.id))}`,
  }))
}

/* ─── Products ───────────────────────────────────────────────────────── */

function productHits(products: ProductIndex[], q: string): SearchHit[] {
  const needle = q.trim().toLowerCase()
  return products
    .filter((p) => p.title.toLowerCase().includes(needle))
    .slice(0, GROUP_LIMIT)
    .map((p) => ({
      id: p.id,
      title: p.title,
      detail: [sentenceCase(p.status), p.price_cents != null ? (p.price_cents > 0 ? usd.format(p.price_cents / 100) : "Free") : ""]
        .filter(Boolean)
        .join(" · "),
      href: `/app/products/${encodeURIComponent(p.id)}`,
    }))
}

/* ─── All of it ──────────────────────────────────────────────────────── */

/**
 * The five groups for one query, for one creator. `creatorId` must be the
 * signed in person's own, read on the server: nothing from the request.
 */
export async function searchCreator(db: Db, creatorId: string, rawQuery: string): Promise<SearchResult> {
  const result = emptyResult()
  const q = normalizeQuery(rawQuery)
  if (!creatorId || !isSearchable(q)) return result

  const failed = (group: SearchGroupId, err: unknown) => {
    if (!result.unavailable.includes(group)) result.unavailable.push(group)
    /* The group and the database's code only. Never the query. */
    const code = err instanceof GroupUnavailable ? err.code : "error"
    console.warn(`[app-search] ${group} unavailable (${code})`)
  }

  const productsRead = readProducts(db, creatorId).catch((err) => {
    failed("products", err)
    return null
  })

  const ordersAndCustomers = (async () => {
    const products = await productsRead
    let orders: Order[] = []
    if (products) {
      try {
        orders = groupOrders(await readOrderRows(db, products))
      } catch (err) {
        failed("orders", err)
      }
    } else {
      failed("orders", new GroupUnavailable("orders", "products"))
    }
    result.groups.orders = orders.filter((o) => matchesSearch(o, q)).slice(0, GROUP_LIMIT).map(orderHit)

    const buyers = buyersMatching(orders, q)
    let contacts: Contact[] = []
    try {
      contacts = await readContacts(db, creatorId, q)
    } catch (err) {
      failed("customers", err)
    }
    const seen = new Set(buyers.map((b) => b.key))
    const people: SearchHit[] = buyers.map((b) => ({
      id: `buyer:${b.key}`,
      title: b.name || b.email || tt("Customer"),
      detail: [b.name ? b.email : null, tt("{n, plural, one {# order} other {# orders}}", { n: b.orders })].filter(Boolean).join(" · "),
      href: customerHref(b.email || b.name || ""),
    }))
    for (const c of contacts) {
      const key = c.email.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      people.push({
        id: `contact:${key}`,
        title: c.name || c.email,
        detail: [c.name ? c.email : null, tt("On your email list")].filter(Boolean).join(" · "),
        href: "/app/emails",
      })
    }
    result.groups.customers = people.slice(0, GROUP_LIMIT)
  })()

  const productsFound = productsRead.then((products) => {
    if (products) result.groups.products = productHits(products, q)
  })

  const emails = readEmails(db, creatorId, q).then(
    (hits) => void (result.groups.emails = hits),
    (err) => failed("emails", err),
  )
  const automations = readAutomations(db, creatorId, q).then(
    (hits) => void (result.groups.automations = hits),
    (err) => failed("automations", err),
  )

  await Promise.all([ordersAndCustomers, productsFound, emails, automations])
  result.unavailable.sort((a, b) => SEARCH_GROUPS.indexOf(a) - SEARCH_GROUPS.indexOf(b))
  return result
}
