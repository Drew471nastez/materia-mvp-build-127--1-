/**
 * ===========================================================================
 *  REVIEW IMPORT: A TABLE AND A MAPPING AS REVIEWS TO WRITE
 * ===========================================================================
 * What the mapping step previews and what the browser sends, in chunks, to
 * /api/app/reviews/import. The server reads every row again with
 * checkImportRow and writes only what passes, for the signed in store's
 * own products: this is a plan, not a permission.
 *
 *   THE PRODUCT   found by the store's own products: the handle (the
 *                 product's address, or its title as an address, which is
 *                 how Shopify makes handles), a product link, a SKU of any
 *                 of its variants, its Storelib id, or its exact title.
 *                 Rows that match none are grouped by what they name, and
 *                 the creator picks a product for each group or skips it.
 *   A REPLY ROW   WooCommerce and WordPress keep the store's answer as a
 *                 comment under the review (comment_parent): it becomes the
 *                 review's reply, never a review of its own.
 *   ONE REVIEW    from two rows (the same file twice, or two apps' exports
 *                 of the same review) is imported once: the app's id when
 *                 the file has one, and the review's content either way.
 *
 * Pure: no database, no server modules.
 */
import { MAX_AUTHOR_CHARS, MAX_BODY_CHARS, MAX_PHOTOS, MAX_TITLE_CHARS, cleanEmail, publicName } from "../app-settings"
import { MAX_REPLY_CHARS } from "../rules"
import { contentHash, dayFirstColumn, externalKey, mediaUrls, normalizeBool, normalizeDate, normalizeRating, normalizeStatus, plainLine, plainText, ratingScale, type ImportStatus } from "./normalize"
import { FIELDS, PLATFORM_BY_ID, type FieldId, type ImportMapping, type PlatformId } from "./platforms"
import type { ImportTable } from "./parse"

export const MAX_VIDEOS = 2
/** Rows per request to the import route; fewer while photos are being copied. */
export const IMPORT_CHUNK_ROWS = 200
export const IMPORT_CHUNK_ROWS_WITH_PHOTOS = 10

export interface CatalogProduct {
  id: string
  title: string | null
  slug: string | null
  skus?: string[]
}

/** One review, normalised, as the browser sends it and the server checks it. */
export interface ImportRow {
  /** The row's line in the file (the header is line 1), for errors. */
  line: number
  productId: string
  rating: number
  title: string
  body: string
  /** As the file had it; the review shows publicName of it. */
  author: string | null
  /** Kept privately (review_authors), never shown. */
  email: string | null
  date: string | null
  verified: boolean
  photos: string[]
  videos: string[]
  reply: string
  replyDate: string | null
  status: ImportStatus
  externalId: string | null
}

export interface RowError {
  line: number
  error: string
}

export interface UnmatchedGroup {
  /** What the rows name, lower case: the assignment's key. */
  key: string
  /** What they name, as the file wrote it. */
  label: string
  count: number
  /** The first rows of the group, for errors after it is skipped. */
  lines: number[]
}

/** A group of unmatched rows: a product of the store's, or "skip". */
export type Assignments = Record<string, string>

export interface ImportPlan {
  rows: ImportRow[]
  errors: RowError[]
  /** Rows whose product is not the store's, by what they name, until each group is assigned or skipped. */
  unmatched: UnmatchedGroup[]
  /** Rows of groups the creator chose to skip. */
  skipped: number
  /** Duplicate rows inside this file. */
  duplicates: number
  /** Reply rows attached to their review. */
  replies: number
}

/** The key a group of rows without any product column is assigned under. */
export const NO_PRODUCT_KEY = "__none__"

/** "Linen Apron, Natural!" → "linen-apron-natural", as Shopify makes a handle from a title. */
export function slugify(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

/** The handle in a product link: /products/<handle>, /p/<handle>, /product/<handle>, else the last part of the path. */
export function handleFromUrl(raw: string): string {
  const v = raw.trim()
  if (!v) return ""
  let path = v
  try {
    path = new URL(v, "https://x.invalid").pathname
  } catch {
    /* read as a path */
  }
  const parts = path.split("/").filter(Boolean)
  const at = parts.findIndex((p) => ["products", "product", "p", "listing", "item", "shop"].includes(p.toLowerCase()))
  const h = at >= 0 && parts[at + 1] ? parts[at + 1] : parts[parts.length - 1] ?? ""
  try {
    return decodeURIComponent(h).toLowerCase()
  } catch {
    return h.toLowerCase()
  }
}

export type ProductMatcher = (r: { handle?: string; url?: string; sku?: string; id?: string; title?: string }) => string | null

export function productMatcher(products: readonly CatalogProduct[]): ProductMatcher {
  const bySlug = new Map<string, string>()
  const byTitleSlug = new Map<string, string>()
  const byTitle = new Map<string, string>()
  const bySku = new Map<string, string>()
  const byId = new Map<string, string>()
  for (const p of products) {
    byId.set(p.id.toLowerCase(), p.id)
    if (p.slug) bySlug.set(p.slug.toLowerCase(), p.id)
    if (p.title) {
      const t = p.title.trim().toLowerCase()
      if (!byTitle.has(t)) byTitle.set(t, p.id)
      const s = slugify(p.title)
      if (s && !byTitleSlug.has(s)) byTitleSlug.set(s, p.id)
    }
    for (const sku of p.skus ?? []) if (sku && !bySku.has(sku.trim().toLowerCase())) bySku.set(sku.trim().toLowerCase(), p.id)
  }
  const handle = (h: string) => (h ? (bySlug.get(h) ?? byTitleSlug.get(h) ?? bySlug.get(slugify(h)) ?? byTitleSlug.get(slugify(h)) ?? null) : null)
  return (r) => {
    /* A handle column holding a link ("https://shop.example/products/linen-apron") is read for the handle in it. */
    const h0 = (r.handle ?? "").trim().toLowerCase()
    const h = h0.includes("/") ? handleFromUrl(h0) : h0
    const u = r.url ? handleFromUrl(r.url) : ""
    const sku = (r.sku ?? "").trim().toLowerCase()
    const id = (r.id ?? "").trim().toLowerCase()
    const title = (r.title ?? "").trim().toLowerCase()
    return (
      handle(h) ??
      handle(u) ??
      (sku ? (bySku.get(sku) ?? null) : null) ??
      (id ? (byId.get(id) ?? bySlug.get(id) ?? null) : null) ??
      (title ? (byTitle.get(title) ?? byTitleSlug.get(slugify(title)) ?? null) : null)
    )
  }
}

const cell = (row: readonly string[], i: number) => (i >= 0 ? String(row[i] ?? "") : "")

/** What an unmatched row names, for its group. */
function productKey(row: readonly string[], m: ImportMapping): { key: string; label: string } {
  for (const f of ["product_title", "product_handle", "product_url", "product_sku", "product_id"] as FieldId[]) {
    const v = cell(row, m[f]).trim()
    if (v) return { key: `${f}:${(f === "product_url" ? handleFromUrl(v) : v).toLowerCase()}`, label: v.slice(0, 120) }
  }
  return { key: NO_PRODUCT_KEY, label: "" }
}

/** Plain errors a row can have, as the result list shows them. */
export const ROW_ERRORS = {
  rating: "No rating from 1 to 5",
  words: "No review text",
  product: "Product not found in your store",
} as const

/**
 * Every row of the table as a review to write, an error, or a row waiting
 * for its product. `assign` answers the unmatched groups (a product id, or
 * "skip"); a group with no answer stays in `unmatched`.
 */
export function planReviews(table: Pick<ImportTable, "rows">, mapping: ImportMapping, opts: { platform: PlatformId; products: readonly CatalogProduct[]; assign?: Assignments; now?: number }): ImportPlan {
  const m = mapping
  const platform = PLATFORM_BY_ID[opts.platform] ?? PLATFORM_BY_ID.other
  const match = productMatcher(opts.products)
  const owned = new Set(opts.products.map((p) => p.id))
  const assign = opts.assign ?? {}
  const scale = m.rating >= 0 ? ratingScale(table.rows.slice(0, 5000).map((r) => r[m.rating])) : 5
  const dayFirst = m.date >= 0 ? dayFirstColumn(table.rows.slice(0, 5000).map((r) => r[m.date]), platform.dayFirst) : false
  const replyDayFirst = m.reply_date >= 0 ? dayFirstColumn(table.rows.slice(0, 5000).map((r) => r[m.reply_date]), platform.dayFirst) : dayFirst

  /* The store's answers kept as their own rows (WooCommerce, WordPress): by the review they answer. */
  const replyTo = new Map<string, { text: string; date: string | null }>()
  const isReplyRow = (r: readonly string[]) => {
    const parent = cell(r, m.parent_id).trim()
    return m.parent_id >= 0 && parent !== "" && parent !== "0"
  }
  let replies = 0
  if (m.parent_id >= 0) {
    for (const r of table.rows) {
      if (!isReplyRow(r)) continue
      const parent = cell(r, m.parent_id).trim()
      const text = plainText(cell(r, m.body), MAX_REPLY_CHARS)
      if (text && !replyTo.has(parent)) replyTo.set(parent, { text, date: normalizeDate(cell(r, m.date), { dayFirst, now: opts.now }) })
    }
  }

  const rows: ImportRow[] = []
  const errors: RowError[] = []
  const groups = new Map<string, UnmatchedGroup>()
  const seen = new Set<string>()
  let skipped = 0
  let duplicates = 0

  table.rows.forEach((r, i) => {
    const line = i + 2
    if (isReplyRow(r)) return
    const rating = m.rating >= 0 ? normalizeRating(r[m.rating], scale) : null
    let body = plainText(cell(r, m.body), MAX_BODY_CHARS)
    let title = plainLine(cell(r, m.title), MAX_TITLE_CHARS)
    if (!body && title) {
      body = title
      title = ""
    }
    if (rating === null) return void errors.push({ line, error: ROW_ERRORS.rating })
    if (!body) return void errors.push({ line, error: ROW_ERRORS.words })

    let productId = match({ handle: cell(r, m.product_handle), url: cell(r, m.product_url), sku: cell(r, m.product_sku), id: cell(r, m.product_id), title: cell(r, m.product_title) })
    if (!productId) {
      const g = productKey(r, m)
      const answer = assign[g.key]
      if (answer === "skip") return void skipped++
      if (answer && owned.has(answer)) productId = answer
      else {
        const group = groups.get(g.key) ?? { key: g.key, label: g.label, count: 0, lines: [] }
        group.count++
        if (group.lines.length < 200) group.lines.push(line)
        groups.set(g.key, group)
        return
      }
    }

    const externalId = cell(r, m.external_id).trim().slice(0, 160) || null
    const own = externalId ? replyTo.get(externalId) : undefined
    const date = normalizeDate(cell(r, m.date), { dayFirst, now: opts.now })
    const author = plainLine(cell(r, m.author), 80) || null
    const row: ImportRow = {
      line,
      productId,
      rating,
      title,
      body,
      author,
      email: cleanEmail(cell(r, m.email)),
      date,
      verified: m.verified >= 0 ? normalizeBool(r[m.verified]) : platform.verifiedByDefault === true,
      photos: mediaUrls(cell(r, m.photos), MAX_PHOTOS),
      videos: mediaUrls(cell(r, m.videos), MAX_VIDEOS),
      reply: plainText(cell(r, m.reply), MAX_REPLY_CHARS) || own?.text || "",
      replyDate: normalizeDate(cell(r, m.reply_date), { dayFirst: replyDayFirst, now: opts.now }) ?? own?.date ?? null,
      status: m.status >= 0 ? normalizeStatus(r[m.status], platform.statusMap) : "published",
      externalId,
    }
    const keys = [externalKey(opts.platform, externalId), contentHash(row)].filter((k): k is string => !!k)
    if (keys.some((k) => seen.has(k))) return void duplicates++
    keys.forEach((k) => seen.add(k))
    if (row.reply) replies += own ? 1 : 0
    rows.push(row)
  })

  return { rows, errors, unmatched: [...groups.values()].sort((a, b) => b.count - a.count), skipped, duplicates, replies }
}

/** The reviewer's public name as the review will show it ("Jane D."), from the file's name. */
export function shownAuthor(author: string | null): string | null {
  return publicName(author ? author.slice(0, MAX_AUTHOR_CHARS * 2) : null)
}

/** The fields of an ImportRow the server reads, nothing else. */
export const IMPORT_ROW_FIELDS = ["line", "productId", "rating", "title", "body", "author", "email", "date", "verified", "photos", "videos", "reply", "replyDate", "status", "externalId"] as const

export type CheckedRow = { ok: true; row: ImportRow; key: string | null; hash: string } | { ok: false; line: number; error: string }

/**
 * One row from the browser, read again from nothing: every string cleaned
 * as plain text and cut to size, stars whole from one to five, the product
 * one of the store's own (else the row is refused), an email that is an
 * address, dates that are dates and never in the future, photos and videos
 * that are web addresses. The keys are made here, never taken from the
 * browser.
 */
export function checkImportRow(raw: unknown, ctx: { platform: string; productIds: ReadonlySet<string>; now?: number }): CheckedRow {
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  const line = Number.isInteger(o.line) && (o.line as number) > 0 && (o.line as number) < 10_000_000 ? (o.line as number) : 0
  const productId = typeof o.productId === "string" ? o.productId : ""
  if (!ctx.productIds.has(productId)) return { ok: false, line, error: ROW_ERRORS.product }
  const rating = Number(o.rating)
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { ok: false, line, error: ROW_ERRORS.rating }
  let body = plainText(o.body, MAX_BODY_CHARS)
  let title = plainLine(o.title, MAX_TITLE_CHARS)
  if (!body && title) {
    body = title
    title = ""
  }
  if (!body) return { ok: false, line, error: ROW_ERRORS.words }
  const status: ImportStatus = o.status === "hidden" || o.status === "pending" ? o.status : "published"
  const iso = (v: unknown) => (typeof v === "string" ? normalizeDate(v, { now: ctx.now }) : null)
  const list = (v: unknown, max: number) => (Array.isArray(v) ? mediaUrls(v.filter((x) => typeof x === "string").slice(0, max * 2), max) : [])
  const row: ImportRow = {
    line,
    productId,
    rating,
    title,
    body,
    author: plainLine(o.author, 80) || null,
    email: cleanEmail(o.email),
    date: iso(o.date),
    verified: o.verified === true,
    photos: list(o.photos, MAX_PHOTOS),
    videos: list(o.videos, MAX_VIDEOS).filter((u) => u.startsWith("https://")),
    reply: plainText(o.reply, MAX_REPLY_CHARS),
    replyDate: iso(o.replyDate),
    status,
    externalId: typeof o.externalId === "string" ? o.externalId.trim().slice(0, 160) || null : null,
  }
  return { ok: true, row, key: externalKey(ctx.platform, row.externalId), hash: contentHash(row) }
}

/** An empty mapping, every field off. */
export function emptyMapping(): ImportMapping {
  return Object.fromEntries(FIELDS.map((f) => [f, -1])) as ImportMapping
}
