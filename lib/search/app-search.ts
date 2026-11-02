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
import { withOrderCurrency } from "@/lib/store/currency-at-read"
import { groupOrders, matchesSearch, type Order, type OrderRow } from "@/lib/orders/order-view"
import { tt } from "@/lib/i18n/text"
import { appLocale } from "@/lib/i18n/format"
import { formatOrderMoney, orderCurrency } from "@/lib/orders/money"
import { SHOP_CURRENCY } from "@/lib/store/shop-money"
import { readStoreCurrency } from "@/lib/store/selling-currency-read"
import { productPriceCurrency } from "@/lib/money/product-currency"
import { CATEGORY_NAMES, visibleIntegrations } from "@/lib/integrations/catalog"
import { searchHelp } from "@/lib/help/search"
import { helpArticlePath } from "@/lib/help/articles"
import { APP_HELP_BASE, HELP_BASE } from "@/lib/help/paths"

/*
  The groups, their labels, the query rules and the result shapes live in
  lib/search/app-search-groups.ts so the header's search box can import them
  without this file's readers (and the Help Center they search). Re-exported
  here unchanged for the route and the tests.
*/
import { GROUP_LIMIT, SEARCH_GROUPS, emptyResult, isSearchable, normalizeQuery, type SearchGroupId, type SearchHit, type SearchResult } from "@/lib/search/app-search-groups"
export { GROUP_LABELS, GROUP_LIMIT, MAX_QUERY_LENGTH, SEARCH_GROUPS, emptyResult, isSearchable, normalizeQuery } from "@/lib/search/app-search-groups"
export type { SearchGroupId, SearchHit, SearchResult } from "@/lib/search/app-search-groups"

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

/* A product's price and a coupon's amount in the shop's currency (lib/store/shop-money.ts: lei, or dollars on a deployment that charges in them), in the dashboard's language; an order's total is in what it was charged (lib/orders/money). */
const shopPrice = (units: number, currency: string = SHOP_CURRENCY) => new Intl.NumberFormat(appLocale(), { style: "currency", currency }).format(units)

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
  /** A membership or community plan's price is in US dollars whatever the store sells in (lib/money/product-currency). */
  type?: string | null
}

async function readProducts(db: Db, creatorId: string): Promise<ProductIndex[]> {
  const rows = await readWithFallback(
    "products",
    (columns) => db.from("products").select(columns).eq("creator_id", creatorId),
    "id, title, status, price_cents, type",
  )
  return rows.map((p) => ({
    id: text(p.id),
    title: text(p.title) || tt("Untitled product"),
    status: text(p.status),
    price_cents: typeof p.price_cents === "number" ? p.price_cents : null,
    type: typeof p.type === "string" ? p.type : null,
  }))
}

/* ─── Orders and the people who placed them ──────────────────────────── */

const ORDER_COLUMNS =
  "id, product_id, created_at, stripe_session_id, amount_cents, tip_cents, status, buyer_email, customer_email, buyer_first_name, buyer_last_name, refund_amount_cents, currency"

/** Every order row on the creator's products, a thousand at a time, as the Orders page reads them. */
async function readOrderRows(db: Db, creatorId: string, products: ProductIndex[]): Promise<OrderRow[]> {
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
  /* The same fields, with the same fallbacks, as lib/orders/load-rows.ts: an order with no currency recorded in what the store sold in on its day (lib/store/currency-at). */
  const filled = await withOrderCurrency(db, creatorId, rows)
  const nullable = (v: unknown) => (v === undefined ? null : (v as string | null))
  return filled.map((o) => {
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
      currency: orderCurrency(o.currency),
      product: product ? { id: product.id, title: product.title } : null,
    }
    return row
  })
}

/*
  THE ORDERS, READ ONCE WHILE SOMEBODY TYPES. Numbering an order needs every
  order of the store (see the top of this file), so each pause in typing read
  all of them again: "jo", "joh", "john" was three full reads of a store's
  orders. They are kept here, on this server instance, for ORDER_INDEX_MS,
  keyed by the store, and two searches at once share one read. Never the
  query, never sent anywhere: the same rows the search was about to read.
*/
/*
  SHORT, AND FORGOTTEN ON A CHANGE (round 42, the owner: results must
  reflect recent changes without a reload). Long enough for one burst of
  typing; a search the browser asks for after something was saved says so
  (`fresh`, components/app/app-search.tsx) and reads the orders again.
*/
const ORDER_INDEX_MS = 6_000
const ORDER_INDEX_MAX = 50
const orderIndex = new Map<string, { at: number; read: Promise<Order[]> }>()

function cachedOrders(db: Db, creatorId: string, products: ProductIndex[], now = Date.now()): Promise<Order[]> {
  const hit = orderIndex.get(creatorId)
  if (hit && now - hit.at < ORDER_INDEX_MS) return hit.read
  const read = readOrderRows(db, creatorId, products).then(groupOrders)
  orderIndex.set(creatorId, { at: now, read })
  /* A failed read is not kept: the next search reads again. */
  read.catch(() => {
    if (orderIndex.get(creatorId)?.read === read) orderIndex.delete(creatorId)
  })
  /* The oldest store out first, so the map never grows past a handful. */
  while (orderIndex.size > ORDER_INDEX_MAX) orderIndex.delete(orderIndex.keys().next().value as string)
  return read
}

/** For tests: forget what was kept. With a store: forget that store's alone (a search asked for fresh). */
export function forgetOrderIndex(creatorId?: string): void {
  if (creatorId) orderIndex.delete(creatorId)
  else orderIndex.clear()
}

function orderHit(order: Order): SearchHit {
  const titles = order.lines.map((l) => l.product?.title).filter((t): t is string => !!t)
  const what = titles.length > 1 ? tt("{titles} and {value} more", { titles: titles[0], value: titles.length - 1 }) : titles[0] || ""
  const who = order.customerName || order.customerEmail || ""
  return {
    id: order.id,
    title: tt("Order #{number}", { number: order.number }),
    detail: [who, what, formatOrderMoney(order.totalCents, order.currency)].filter(Boolean).join(" · "),
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

/* ─── Collections and coupons ────────────────────────────────────────── */

async function readCollections(db: Db, creatorId: string, q: string): Promise<SearchHit[]> {
  const rows = await readWithFallback(
    "collections",
    (columns) =>
      db
        .from("product_collections")
        .select(columns)
        .eq("creator_id", creatorId)
        .ilike("title", containsPattern(q))
        .order("created_at", { ascending: false })
        .limit(GROUP_LIMIT),
    "id, title, published",
  )
  return rows.map((r) => ({
    id: text(r.id),
    title: text(r.title) || tt("Untitled collection"),
    detail: r.published === false ? tt("Hidden") : tt("Published"),
    /* The collection opens on its own page (round 41: app/app/products/collections/[id]). */
    href: `/app/products/collections/${encodeURIComponent(text(r.id))}`,
  }))
}

async function readCoupons(db: Db, creatorId: string, q: string, currency: Promise<string>): Promise<SearchHit[]> {
  const rows = await readWithFallback(
    "coupons",
    (columns) =>
      db
        .from("coupons")
        .select(columns)
        .eq("creator_id", creatorId)
        .ilike("code", containsPattern(q))
        .order("created_at", { ascending: false })
        .limit(GROUP_LIMIT),
    "id, code, discount_type, discount_value, is_active",
  )
  const inCurrency = await currency
  return rows.map((r) => {
    /* A percentage, or an amount in whole units as the coupon form keeps it (app/app/coupons/coupon-form.ts). */
    const value = typeof r.discount_value === "number" ? r.discount_value : Number(r.discount_value)
    const off = !Number.isFinite(value) ? "" : r.discount_type === "percentage" ? tt("{value}% off", { value }) : tt("{value} off", { value: shopPrice(value, inCurrency) })
    return {
      id: text(r.id),
      title: text(r.code) || tt("Coupon"),
      detail: [off, r.is_active === false ? tt("Off") : tt("On")].filter(Boolean).join(" · "),
      href: `/app/coupons/${encodeURIComponent(text(r.id))}`,
    }
  })
}

/* ─── Upsells and bundles, size charts ───────────────────────────────── */

const OFFER_KIND: Record<string, string> = { get bundle() { return tt("Bundle") }, get checkout() { return tt("Checkout upsell") }, get quantity_break() { return tt("Quantity break") } }

async function readOffers(db: Db, creatorId: string, q: string): Promise<SearchHit[]> {
  const rows = await readWithFallback(
    "offers",
    (columns) =>
      db
        .from("store_offers")
        .select(columns)
        .eq("creator_id", creatorId)
        .ilike("title", containsPattern(q))
        .order("created_at", { ascending: false })
        .limit(GROUP_LIMIT),
    "id, title, kind, active",
  )
  return rows.map((r) => ({
    id: text(r.id),
    title: text(r.title) || tt("Untitled offer"),
    detail: [OFFER_KIND[text(r.kind)] ?? "", r.active === false ? tt("Off") : tt("On")].filter(Boolean).join(" · "),
    href: `/app/offers/${encodeURIComponent(text(r.id))}`,
  }))
}

async function readSizeCharts(db: Db, creatorId: string, q: string): Promise<SearchHit[]> {
  const rows = await readWithFallback(
    "size_charts",
    (columns) =>
      db
        .from("size_charts")
        .select(columns)
        .eq("creator_id", creatorId)
        .ilike("name", containsPattern(q))
        .order("name", { ascending: true })
        .limit(GROUP_LIMIT),
    "id, name, unit",
  )
  return rows.map((r) => ({
    id: text(r.id),
    title: text(r.name) || tt("Untitled size chart"),
    detail: text(r.unit) === "in" ? tt("Inches") : text(r.unit) === "cm" ? tt("Centimetres") : tt("Size chart"),
    href: `/app/products/size-charts/${encodeURIComponent(text(r.id))}`,
  }))
}

/* ─── Communities: the person's own, by the user who owns them ───────── */

async function readCommunities(db: Db, ownerUserId: string, q: string): Promise<SearchHit[]> {
  const rows = await readWithFallback(
    "communities",
    (columns) =>
      db
        .from("communities")
        .select(columns)
        .eq("owner_user_id", ownerUserId)
        .ilike("name", containsPattern(q))
        .order("created_at", { ascending: false })
        .limit(GROUP_LIMIT),
    "id, name, status",
  )
  return rows.map((r) => ({
    id: text(r.id),
    title: text(r.name) || tt("Community"),
    detail: sentenceCase(text(r.status)) || tt("Community"),
    href: `/app/community/${encodeURIComponent(text(r.id))}`,
  }))
}

/* ─── Integrations and help: from the code, no table ─────────────────── */

/** Every integration whose name, category or line says what was typed, each opening its own page (?integration=). */
export function integrationHits(q: string, physical: boolean): SearchHit[] {
  const needle = q.trim().toLowerCase()
  if (!needle) return []
  const all = visibleIntegrations(physical)
  const scored = all
    .map((i, at) => {
      const name = i.name.toLowerCase()
      const category = (CATEGORY_NAMES[i.category] ?? "").toLowerCase()
      const score = name.startsWith(needle) ? 3 : name.includes(needle) ? 2 : category.includes(needle) || i.summary.toLowerCase().includes(needle) ? 1 : 0
      return { i, at, score }
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.at - b.at)
  return scored.slice(0, GROUP_LIMIT).map(({ i }) => ({
    id: i.id,
    title: i.name,
    detail: [CATEGORY_NAMES[i.category], i.comingSoon ? tt("Coming soon") : null].filter(Boolean).join(" · "),
    href: i.id === "storelib-reviews" ? "/app/reviews" : `/app/integrations?integration=${encodeURIComponent(i.id)}`,
  }))
}

/** The Help Center's articles, ranked as its own search ranks them, opened inside the app (/app/help). */
export function helpHits(q: string, physical: boolean): SearchHit[] {
  return searchHelp(q, GROUP_LIMIT, { physical }).map(({ article }) => {
    const path = helpArticlePath(article)
    return {
      id: `${article.category}/${article.slug}`,
      title: article.title,
      detail: article.summary,
      href: path.startsWith(HELP_BASE) ? `${APP_HELP_BASE}${path.slice(HELP_BASE.length)}` : path,
    }
  })
}

/* ─── Products ───────────────────────────────────────────────────────── */

function productHits(products: ProductIndex[], q: string, currency: string): SearchHit[] {
  const needle = q.trim().toLowerCase()
  return products
    .filter((p) => p.title.toLowerCase().includes(needle))
    .slice(0, GROUP_LIMIT)
    .map((p) => ({
      id: p.id,
      title: p.title,
      detail: [sentenceCase(p.status), p.price_cents != null ? (p.price_cents > 0 ? shopPrice(p.price_cents / 100, productPriceCurrency(p, currency)) : tt("Free")) : ""]
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
export async function searchCreator(
  db: Db,
  creatorId: string,
  rawQuery: string,
  /** `groups`: only these are read (a teammate's role, app/api/app/search); every group when left out. */
  opts: {
    groups?: ReadonlySet<SearchGroupId>
    /** The signed in owner's user id, for the communities they run (owned by a user, not a store). Left out: no communities. */
    ownerUserId?: string | null
    /** Physical commerce is on (lib/platform/physical-commerce): its integrations and help articles are found too. */
    physical?: boolean
    /** Something was saved since the last search: nothing kept is used (the orders are read again). */
    fresh?: boolean
  } = {},
): Promise<SearchResult> {
  const result = emptyResult()
  const q = normalizeQuery(rawQuery)
  if (!creatorId || !isSearchable(q)) return result
  const wants = (g: SearchGroupId) => !opts.groups || opts.groups.has(g)
  if (opts.fresh) forgetOrderIndex(creatorId)

  const failed = (group: SearchGroupId, err: unknown) => {
    if (!result.unavailable.includes(group)) result.unavailable.push(group)
    /* The group and the database's code only. Never the query. */
    const code = err instanceof GroupUnavailable ? err.code : "error"
    console.warn(`[app-search] ${group} unavailable (${code})`)
  }

  /* Prices and fixed coupons are in the store's own currency (Settings › Country & Currency). */
  const storeCurrency = readStoreCurrency(db, creatorId).then((s) => s.currency as string)
  const needOrders = wants("orders") || wants("customers")
  const productsRead =
    wants("products") || needOrders
      ? readProducts(db, creatorId).catch((err) => {
          failed("products", err)
          return null
        })
      : Promise.resolve(null)
  /* The email list is read beside the orders, not after them: it needs nothing from them. */
  const contactsRead: Promise<Contact[] | null> = wants("customers")
    ? readContacts(db, creatorId, q).catch((err) => {
        failed("customers", err)
        return null
      })
    : Promise.resolve(null)

  const ordersAndCustomers = (async () => {
    if (!needOrders) return
    const products = await productsRead
    let orders: Order[] = []
    if (products) {
      try {
        orders = await cachedOrders(db, creatorId, products)
      } catch (err) {
        failed("orders", err)
      }
    } else {
      failed("orders", new GroupUnavailable("orders", "products"))
    }
    if (wants("orders")) result.groups.orders = orders.filter((o) => matchesSearch(o, q)).slice(0, GROUP_LIMIT).map(orderHit)
    if (!wants("customers")) return

    const buyers = buyersMatching(orders, q)
    const contacts = (await contactsRead) ?? []
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

  const productsFound = productsRead.then(async (products) => {
    if (products && wants("products")) result.groups.products = productHits(products, q, await storeCurrency)
  })

  const group = (g: SearchGroupId, read: () => Promise<SearchHit[]>) =>
    wants(g)
      ? read().then(
          (hits) => void (result.groups[g] = hits),
          (err) => failed(g, err),
        )
      : Promise.resolve()

  await Promise.all([
    ordersAndCustomers,
    productsFound,
    group("collections", () => readCollections(db, creatorId, q)),
    group("coupons", () => readCoupons(db, creatorId, q, storeCurrency)),
    group("offers", () => readOffers(db, creatorId, q)),
    group("size_charts", () => (opts.physical ? readSizeCharts(db, creatorId, q) : Promise.resolve([]))),
    group("emails", () => readEmails(db, creatorId, q)),
    group("automations", () => readAutomations(db, creatorId, q)),
    group("communities", () => (opts.ownerUserId ? readCommunities(db, opts.ownerUserId, q) : Promise.resolve([]))),
  ])
  if (wants("integrations")) result.groups.integrations = integrationHits(q, !!opts.physical)
  if (wants("help")) result.groups.help = helpHits(q, !!opts.physical)
  result.unavailable.sort((a, b) => SEARCH_GROUPS.indexOf(a) - SEARCH_GROUPS.indexOf(b))
  return result
}
