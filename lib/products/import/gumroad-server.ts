import "server-only"

/**
 * ===========================================================================
 *  GUMROAD IMPORT, ON THE SERVER
 * ===========================================================================
 * Two jobs, both for the signed in store only (app/api/app/products/import/
 * gumroad checks the Products permission before either):
 *
 *   LIST     the seller's Gumroad products, read with their access token
 *            from GET https://api.gumroad.com/v2/products, page by page.
 *            The token goes in one Authorization header to that one fixed
 *            host and nowhere else: it is not stored, not logged, not put in
 *            a URL, not sent back, and a redirect is refused rather than
 *            followed. When the function returns, nothing holds it.
 *   IMPORT   one product, as a DRAFT, never published. Its pictures are
 *            copied from Gumroad's CDN into Storelib's own storage (the
 *            hosts in ./gumroad.ts GUMROAD_IMAGE_HOSTS only, through the
 *            public-address fetch, no redirects, a size and time limit, and
 *            the same picture checks every public upload passes). Its
 *            description goes through the description allow list. Files are
 *            not copied: the seller uploads them in the product editor.
 *
 * ONCE PER GUMROAD PRODUCT. product_import_links (SQL part 344) keeps which
 * Storelib product each Gumroad id became, unique per store. A row is
 * claimed before anything is written, so two tabs importing the same list
 * make one product, and running the import again finds the product made the
 * first time. A product deleted since can be imported again.
 */
import { fetchPublic } from "@/lib/api/public-fetch"
import { sanitizeDescription } from "@/lib/rich-text/sanitize"
import { MAX_DESCRIPTION_BYTES, byteLength } from "@/lib/rich-text/policy"
import { htmlToPlainText, plainTextToHtml } from "@/lib/rich-text/html"
import { preparePublicImage } from "@/lib/storage/public-image"
import { generateStoragePath } from "@/lib/storage/validation"
import { PUBLIC_BUCKET } from "@/lib/storage/plans"
import { avoidReservedProductSlug } from "@/lib/commerce/reserved-slugs"
import { importImageUrl, type LinkProduct } from "./product-link"
import { GUMROAD_API, descriptionImages, gumroadImageUrl, slugFromTitle, type ImportItem } from "./gumroad"
import { duplicateIndex, type ExistingProduct } from "./duplicates"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export const LINKS_TABLE = "product_import_links"
export const IMPORT_SQL_PART = 344
/** Pages of ten Gumroad reads at most: five hundred products. */
export const MAX_PAGES = 50
const PAGE_BYTES = 5 * 1024 * 1024
const IMAGE_BYTES = 10 * 1024 * 1024
const IMAGE_TIMEOUT_MS = 7000
/** A claim this old with no product is a run that died, and may be taken over. */
const STALE_CLAIM_MS = 10 * 60 * 1000

/** What an access token looks like: letters, digits and a few marks, never spaces. */
export function looksLikeToken(raw: unknown): raw is string {
  return typeof raw === "string" && /^[A-Za-z0-9_\-.~+/=]{20,256}$/.test(raw)
}

/* ── reading Gumroad ─────────────────────────────────────────────────── */

export type ListError = "bad_token" | "gumroad_down" | "gumroad_refused"

async function readCapped(res: Response, max: number): Promise<string | null> {
  const declared = Number(res.headers.get("content-length") ?? 0)
  if (declared > max) return null
  if (!res.body) return await res.text()
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > max) {
      await reader.cancel().catch(() => {})
      return null
    }
    chunks.push(value)
  }
  return new TextDecoder().decode(Buffer.concat(chunks))
}

/**
 * Every product on the account the token belongs to, as Gumroad wrote them.
 * `fetchImpl` is the network, handed in by a test.
 */
export async function fetchGumroadProducts(
  token: string,
  opts: { fetchImpl?: typeof fetch; maxPages?: number; timeoutMs?: number } = {},
): Promise<{ ok: true; products: unknown[]; truncated: boolean } | { ok: false; error: ListError }> {
  if (!looksLikeToken(token)) return { ok: false, error: "bad_token" }
  const doFetch = opts.fetchImpl ?? fetch
  const maxPages = opts.maxPages ?? MAX_PAGES
  const products: unknown[] = []
  const seen = new Set<string>()
  let pageKey: string | null = null
  for (let page = 0; page < maxPages; page++) {
    const url = new URL(GUMROAD_API)
    if (pageKey) url.searchParams.set("page_key", pageKey)
    let res: Response
    try {
      res = await doFetch(url.toString(), {
        method: "GET",
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(opts.timeoutMs ?? 12_000),
      })
    } catch {
      return { ok: false, error: "gumroad_down" }
    }
    if (res.status === 401 || res.status === 403) return { ok: false, error: "bad_token" }
    if (res.status >= 500 || res.status === 429) return { ok: false, error: "gumroad_down" }
    const text = await readCapped(res, PAGE_BYTES).catch(() => null)
    let body: { success?: unknown; products?: unknown; next_page_key?: unknown } | null = null
    try {
      body = text ? JSON.parse(text) : null
    } catch {
      body = null
    }
    if (!res.ok || !body || body.success !== true || !Array.isArray(body.products)) {
      return { ok: false, error: res.ok ? "gumroad_refused" : "bad_token" }
    }
    products.push(...body.products)
    const next = typeof body.next_page_key === "string" && body.next_page_key ? body.next_page_key : null
    if (!next || seen.has(next)) return { ok: true, products, truncated: false }
    seen.add(next)
    pageKey = next
  }
  return { ok: true, products, truncated: true }
}

/* ── which Gumroad products this store already has ──────────────────── */

const missingTable = (error: { code?: string; message?: string } | null | undefined) => {
  const code = String(error?.code ?? "")
  return code === "42P01" || code === "PGRST205" || /does not exist|schema cache/i.test(String(error?.message ?? ""))
}

/**
 * Gumroad id to Storelib product id for these ids, only products the store
 * still has. `ready: false` when part 344 has not run.
 */
export async function importedProducts(db: Db, creatorId: string, ids: string[]): Promise<{ ready: boolean; map: Map<string, string> }> {
  const map = new Map<string, string>()
  const { data, error } = await db.from(LINKS_TABLE).select("external_id, product_id").eq("creator_id", creatorId).eq("source", "gumroad").limit(5000)
  if (error) return { ready: !missingTable(error), map }
  const wanted = new Set(ids)
  const rows = ((data ?? []) as { external_id: string; product_id: string | null }[]).filter((r) => r.product_id && wanted.has(r.external_id))
  if (!rows.length) return { ready: true, map }
  const { data: live } = await db.from("products").select("id").eq("creator_id", creatorId).in("id", rows.map((r) => r.product_id))
  const alive = new Set(((live ?? []) as { id: string }[]).map((p) => p.id))
  for (const r of rows) if (alive.has(r.product_id as string)) map.set(r.external_id, r.product_id as string)
  return { ready: true, map }
}

/* ── is it already in the store? (./duplicates) ─────────────────────── */

/**
 * What the duplicate check reads: the store's products (id, title, address)
 * and, for this platform, which of its ids became which product. A store
 * before part 344 has no links, and the titles and addresses still match.
 */
export async function duplicatesFor(db: Db, creatorId: string, source: "gumroad" | "shopify") {
  const { data } = await db.from("products").select("id, title, slug").eq("creator_id", creatorId).limit(5000)
  const products = ((data ?? []) as ExistingProduct[]).filter((p) => p && typeof p.id === "string")
  const imported = new Map<string, string>()
  const links = await db.from(LINKS_TABLE).select("external_id, product_id").eq("creator_id", creatorId).eq("source", source).limit(5000)
  for (const r of (links.error ? [] : links.data ?? []) as { external_id: string; product_id: string | null }[]) if (r.product_id) imported.set(r.external_id, r.product_id)
  return duplicateIndex(products, imported)
}

/* ── pictures ─────────────────────────────────────────────────────────── */

/** The bytes of one Gumroad picture, or null. Gumroad's CDN only, never a redirect. */
export async function fetchGumroadImage(raw: string): Promise<Uint8Array | null> {
  const url = gumroadImageUrl(raw)
  if (!url) return null
  try {
    const res = await fetchPublic(url, { maxBytes: IMAGE_BYTES, timeoutMs: IMAGE_TIMEOUT_MS, maxRedirects: 0 })
    if (!res.ok) return null
    return new Uint8Array(await res.arrayBuffer())
  } catch {
    return null
  }
}

export interface ImportDeps {
  source?: "gumroad" | "shopify"
  linkProduct?: LinkProduct
  /** Link imports may copy only supported platform CDNs through the public-address fetch. */
  imageUrl?: (url: string) => string | null
  /** The network for pictures; a test hands in its own. Called only with allowlisted URLs. */
  fetchImage?: (url: string) => Promise<Uint8Array | null>
  /** After a picture is stored (the route screens it in the background). */
  afterUpload?: (where: { bucket: string; path: string; bytes: Uint8Array }) => void
  now?: () => number
  /**
   * The seller saw "Already in your products" and asked for a copy anyway:
   * a product imported before is made again, without its import link, so the
   * original keeps it. Without this an earlier import answers `exists`.
   */
  copy?: boolean
}

async function copyImages(db: Db, creatorId: string, urls: string[], deps: ImportDeps): Promise<{ copied: Map<string, string>; paths: string[]; failed: number }> {
  const copied = new Map<string, string>()
  const paths: string[] = []
  let failed = 0
  const fetchImage = deps.fetchImage ?? fetchGumroadImage
  const allowedImage = deps.imageUrl ?? gumroadImageUrl
  const queue = [...new Set(urls)].filter((u) => allowedImage(u) === u)
  failed += [...new Set(urls)].length - queue.length
  const worker = async () => {
    for (let url = queue.shift(); url; url = queue.shift()) {
      try {
        const bytes = await fetchImage(url)
        const picture = bytes ? preparePublicImage(bytes) : null
        if (!picture || !picture.ok) {
          failed++
          continue
        }
        const path = generateStoragePath(creatorId, `image.${picture.ext}`, "product-images")
        const { error } = await db.storage.from(PUBLIC_BUCKET).upload(path, picture.bytes, { contentType: picture.mime, cacheControl: "31536000", upsert: false })
        if (error) {
          failed++
          continue
        }
        const publicUrl = db.storage.from(PUBLIC_BUCKET).getPublicUrl(path)?.data?.publicUrl
        if (typeof publicUrl !== "string" || !publicUrl.startsWith("https://")) {
          failed++
          continue
        }
        paths.push(path)
        copied.set(url, publicUrl)
        deps.afterUpload?.({ bucket: PUBLIC_BUCKET, path, bytes: picture.bytes })
      } catch {
        failed++
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(6, queue.length) }, worker))
  return { copied, paths, failed }
}

/** The description with its Gumroad pictures pointing at their Storelib copies, then through the allow list. */
export function importedDescription(html: string, copied: Map<string, string>): string {
  let out = html
  for (const [from, to] of copied) {
    out = out.split(from).join(to).split(from.replace(/&/g, "&amp;")).join(to)
  }
  const clean = sanitizeDescription(out)
  if (byteLength(clean) <= MAX_DESCRIPTION_BYTES) return clean
  return plainTextToHtml(htmlToPlainText(clean).slice(0, 50_000))
}

/* ── one product ──────────────────────────────────────────────────────── */

export type ImportOutcome =
  | { status: "imported"; productId: string; imagesCopied: number; imagesFailed: number; variantsSaved: boolean }
  | { status: "exists"; productId: string }
  | { status: "busy" }
  | { status: "error"; error: "not_ready" | "save_failed" }

type Claim = { kind: "claimed"; id: string } | { kind: "exists"; productId: string } | { kind: "busy" } | { kind: "not_ready" } | { kind: "failed" }

async function claim(db: Db, creatorId: string, userId: string, gumroadId: string, now: number, source: "gumroad" | "shopify" = "gumroad"): Promise<Claim> {
  const stamp = new Date(now).toISOString()
  const ins = await db.from(LINKS_TABLE).insert({ creator_id: creatorId, source, external_id: gumroadId, created_by: userId, updated_at: stamp }).select("id").single()
  if (!ins.error && ins.data?.id) return { kind: "claimed", id: ins.data.id }
  if (ins.error && (missingTable(ins.error) || (source === "shopify" && ins.error.code === "23514"))) return { kind: "not_ready" }
  if (ins.error && String(ins.error.code) !== "23505") return { kind: "failed" }

  const { data: row, error } = await db.from(LINKS_TABLE).select("id, product_id, updated_at").eq("creator_id", creatorId).eq("source", source).eq("external_id", gumroadId).maybeSingle()
  if (error || !row) return { kind: "failed" }
  if (row.product_id) {
    const { data: product } = await db.from("products").select("id").eq("id", row.product_id).eq("creator_id", creatorId).maybeSingle()
    if (product) return { kind: "exists", productId: row.product_id }
  } else if (now - Date.parse(row.updated_at ?? "") < STALE_CLAIM_MS) {
    return { kind: "busy" }
  }
  /* Its product is gone, or the run that claimed it died: taken over only if nobody else took it first. */
  let take = db.from(LINKS_TABLE).update({ product_id: null, created_by: userId, updated_at: stamp }).eq("id", row.id)
  take = row.product_id ? take.eq("product_id", row.product_id) : take.is("product_id", null).eq("updated_at", row.updated_at)
  const { data: taken } = await take.select("id")
  return Array.isArray(taken) && taken.length === 1 ? { kind: "claimed", id: row.id } : { kind: "busy" }
}

const suffix = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`

async function freeSlug(db: Db, creatorId: string, title: string): Promise<string> {
  let slug = slugFromTitle(title) || `draft-${suffix()}`
  const { data: taken } = await db.from("products").select("id").eq("creator_id", creatorId).eq("slug", slug).maybeSingle()
  if (taken) slug = `${slug}-${suffix()}`
  return avoidReservedProductSlug(slug, suffix)
}

/**
 * One reviewed product into the store, as a draft. `item` has been read by
 * readImportItem already; the store and the person are the route's gate.
 */
export async function importGumroadItem(db: Db, ctx: { creatorId: string; userId: string }, item: ImportItem, deps: ImportDeps = {}): Promise<ImportOutcome> {
  const now = deps.now?.() ?? Date.now()
  const claimed = await claim(db, ctx.creatorId, ctx.userId, item.gumroadId, now, deps.source)
  /* A copy asked for: no claim of its own, the original's link stays where it is. */
  const c: Claim = claimed.kind === "exists" && deps.copy ? { kind: "claimed", id: "" } : claimed
  if (c.kind === "exists") return { status: "exists", productId: c.productId }
  if (c.kind === "busy") return { status: "busy" }
  if (c.kind === "not_ready") return { status: "error", error: "not_ready" }
  if (c.kind === "failed") return { status: "error", error: "save_failed" }

  const release = async (paths: string[]) => {
    if (c.id) await db.from(LINKS_TABLE).delete().eq("id", c.id).is("product_id", null)
    if (paths.length) {
      try {
        await db.storage.from(PUBLIC_BUCKET).remove(paths)
      } catch {
        /* The storage sweep finds a picture nothing points at. */
      }
    }
  }

  const inline = deps.linkProduct ? [...item.descriptionHtml.matchAll(/<img\b[^>]*src=["']([^"']+)["']/gi)].map((m) => m[1].replace(/&amp;/g, "&")).filter((u) => !!(deps.imageUrl ?? importImageUrl)(u)) : descriptionImages(item.descriptionHtml)
  const { copied, paths, failed } = await copyImages(db, ctx.creatorId, [...item.images, ...inline, ...(deps.linkProduct?.variants.map((v) => v.image).filter((u): u is string => !!u) ?? [])], deps)
  const gallery = item.images.map((u) => copied.get(u)).filter((u): u is string => !!u)
  const description = importedDescription(item.descriptionHtml, copied)

  const row = {
    creator_id: ctx.creatorId,
    type: deps.linkProduct?.type ?? "digital",
    ...(deps.linkProduct ? { category: deps.linkProduct.category, vendor: deps.linkProduct.vendor, requires_shipping: deps.linkProduct.type === "physical", tags: deps.linkProduct.tags } : {}),
    title: item.title,
    slug: await freeSlug(db, ctx.creatorId, item.title),
    description,
    /* Always a draft: the seller adds the files and publishes it themselves. */
    status: "draft",
    price_cents: item.priceCents,
    pay_what_you_want: item.payWhatYouWant,
    pwyw_min_price_cents: item.payWhatYouWant ? item.priceCents : null,
    pwyw_suggested_price_cents: null,
    thumbnail_url: gallery[0] ?? null,
    gallery_urls: gallery.length ? gallery : null,
    seo_title: item.title,
  }
  let ins = await db.from("products").insert(row).select("id").single()
  if (ins.error && String(ins.error.code) === "23505") ins = await db.from("products").insert({ ...row, slug: `${row.slug}-${suffix()}` }).select("id").single()
  if (ins.error || !ins.data?.id) {
    await release(paths)
    return { status: "error", error: "save_failed" }
  }
  const productId = ins.data.id as string

  let variantsSaved = true
  if (item.variants.length) {
    const { error } = await db.from("product_variants").insert(
      item.variants.map((v, position) => ({
        product_id: productId,
        name: v.name,
        description: null,
        price_cents: v.priceCents,
        compare_at_price_cents: null,
        max_purchases: null,
        position,
        pay_what_you_want: v.payWhatYouWant,
        pwyw_min_price_cents: v.payWhatYouWant ? v.priceCents : null,
        pwyw_suggested_price_cents: null,
        ...(deps.linkProduct ? {
          option1: deps.linkProduct.variants[position]?.options?.[0] ?? null,
          option2: deps.linkProduct.variants[position]?.options?.[1] ?? null,
          option3: deps.linkProduct.variants[position]?.options?.[2] ?? null,
          sku: deps.linkProduct.variants[position]?.sku ?? null,
          compare_at_price_cents: deps.linkProduct.variants[position]?.compareAtCents ?? null,
          image_url: copied.get(deps.linkProduct.variants[position]?.image ?? "") ?? null,
        } : {}),
      })),
    )
    if (error) variantsSaved = false
  }
  if (deps.linkProduct?.options.length) {
    const { error } = await db.from("product_options").insert(deps.linkProduct.options.map((o, i) => ({ product_id: productId, position: i + 1, name: o.name, values: o.values })))
    if (error) variantsSaved = false
  }
  // A link import is complete only if its options and every variant were saved.
  if (deps.linkProduct && !variantsSaved) {
    const removed = await db.from("products").delete().eq("id", productId).eq("creator_id", ctx.creatorId)
    if (!removed.error) await release(paths)
    return { status: "error", error: "save_failed" }
  }
  /* Tags in a write of their own: a database before part 78 has no column, and the product stands without them. */
  if (item.tags.length) await db.from("products").update({ tags: item.tags }).eq("id", productId).eq("creator_id", ctx.creatorId)

  /* Asked twice: a claim left without its product would let a later run make a second one. */
  const link = { product_id: productId, updated_at: new Date(now).toISOString() }
  const first = c.id ? await db.from(LINKS_TABLE).update(link).eq("id", c.id) : null
  if (first?.error) {
    const second = await db.from(LINKS_TABLE).update(link).eq("id", c.id)
    if (second?.error && deps.linkProduct) {
      const removed = await db.from("products").delete().eq("id", productId).eq("creator_id", ctx.creatorId)
      if (!removed.error) await release(paths)
      return { status: "error", error: "save_failed" }
    }
  }
  return { status: "imported", productId, imagesCopied: copied.size, imagesFailed: failed, variantsSaved }
}
