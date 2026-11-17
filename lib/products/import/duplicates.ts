/**
 * ===========================================================================
 *  IS THIS PRODUCT ALREADY IN THE STORE?
 * ===========================================================================
 * Asked before an import writes anything, on the review screen and again on
 * the server (app/api/app/products/import/link, .../gumroad), so a stale page
 * cannot make a second copy by accident. Three ways to recognise a product,
 * strongest first:
 *
 *   SOURCE   the platform's own id was imported before (product_import_links
 *            keeps it, with the Storelib product it became)
 *   SLUG     the source's handle (Shopify's /products/<handle>, Gumroad's
 *            /l/<permalink>) is a product address the store already uses
 *   TITLE    the same title, ignoring case, accents, spacing and punctuation
 *
 * A match is skipped by default; the seller can still ask for a copy, and the
 * server then makes one without touching the original or its import link.
 */

/** A product the store has, as the matching reads it. */
export interface ExistingProduct {
  id: string
  title: string
  slug: string | null
}

/** One product about to be imported. */
export interface IncomingProduct {
  title: string
  /** The platform's own id, as product_import_links keeps it. */
  externalId?: string | null
  /** The product's page on the platform, for its handle. */
  url?: string | null
}

export type DuplicateReason = "source" | "slug" | "title"

export interface DuplicateMatch {
  productId: string
  title: string
  by: DuplicateReason
}

/** A title as a person reads it: no case, accents, punctuation or extra spaces. */
export function normalizeTitle(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
}

/** A handle or slug in one spelling: lower case, words joined by single hyphens. */
export function normalizeSlug(slug: string): string {
  let s = slug
  try {
    s = decodeURIComponent(slug)
  } catch {
    /* A malformed escape is read as it was written. */
  }
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

/** The handle in a Shopify (/products/<handle>), Gumroad (/l/<permalink>) or Payhip (/b/<key>) product link, or null. */
export function handleFromUrl(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const path = new URL(url).pathname.replace(/\/+$/, "")
    const m = path.match(/\/(?:products|l|b)\/([^/]+)$/)
    const handle = m ? normalizeSlug(m[1]) : ""
    return handle || null
  } catch {
    return null
  }
}

/**
 * The store's products, indexed once for many lookups.
 * `imported` is the platform id to Storelib product id map of earlier imports.
 */
export function duplicateIndex(products: ExistingProduct[], imported: Map<string, string> = new Map()) {
  const byId = new Map(products.map((p) => [p.id, p]))
  const bySlug = new Map<string, ExistingProduct>()
  const byTitle = new Map<string, ExistingProduct>()
  for (const p of products) {
    const slug = p.slug ? normalizeSlug(p.slug) : ""
    if (slug && !bySlug.has(slug)) bySlug.set(slug, p)
    const title = normalizeTitle(p.title ?? "")
    if (title && !byTitle.has(title)) byTitle.set(title, p)
  }
  return {
    find(incoming: IncomingProduct): DuplicateMatch | null {
      const linked = incoming.externalId ? imported.get(incoming.externalId) : undefined
      if (linked) {
        const p = byId.get(linked)
        /* An import link to a product the store no longer has is no match. */
        if (p) return { productId: p.id, title: p.title, by: "source" }
      }
      const handle = handleFromUrl(incoming.url)
      const bySlugMatch = handle ? bySlug.get(handle) : undefined
      if (bySlugMatch) return { productId: bySlugMatch.id, title: bySlugMatch.title, by: "slug" }
      const title = normalizeTitle(incoming.title)
      const byTitleMatch = title ? byTitle.get(title) : undefined
      if (byTitleMatch) return { productId: byTitleMatch.id, title: byTitleMatch.title, by: "title" }
      return null
    },
  }
}

/** One lookup, for a caller with one product to check. */
export function findDuplicate(incoming: IncomingProduct, products: ExistingProduct[], imported?: Map<string, string>): DuplicateMatch | null {
  return duplicateIndex(products, imported).find(incoming)
}
