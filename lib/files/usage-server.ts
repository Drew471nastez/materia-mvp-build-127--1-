import "server-only"

/**
 * ===========================================================================
 *  WHERE A FILE IS USED, AND ITS ALT TEXT
 * ===========================================================================
 * Files' detail view says where a picture shows before it is deleted
 * ("Used on Lamp and your website"), and keeps a picture's alt text.
 *
 * WHERE IT IS USED is read from the shop's own rows only, each read scoped
 * by the owner and never failing the whole answer:
 *
 *   products        thumbnail_url and gallery_urls
 *   variants        image_url, of the shop's own products
 *   website         the store builder's draft and published pages
 *   OnePage         the owner's link pages
 *
 * A file is matched by `<bucket>/<path>` inside the address, which is the
 * same in Storelib's /media/ form and the storage host's, and unique, since
 * the path starts with the owner's own folder.
 *
 * ALT TEXT is public.file_details (part 214), keyed by bucket and path,
 * written only for a path the caller owns (lib/files/library ownsFile).
 */
import { ownsFile, type LibraryBucket } from "./library"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any

export interface FileUse {
  kind: "product" | "variant" | "website" | "onepage"
  label: string
  href: string
}

export const MAX_ALT = 500

/** Whether a stored value (an address, a list of them, a page's JSON) has this file in it. */
export function mentions(value: unknown, needle: string): boolean {
  if (value === null || value === undefined) return false
  if (typeof value === "string") return value.includes(needle)
  try {
    return JSON.stringify(value).includes(needle)
  } catch {
    return false
  }
}

/** What a page type is called in the list: "Website: Home". */
const PAGE_NAME: Record<string, string> = { shop: "Home", home: "Home", product: "Product page", collection: "Collection page", about: "About", contact: "Contact", checkout: "Checkout" }

export async function fileUsage(admin: Admin, owner: { userId: string; creatorId: string }, bucket: unknown, path: unknown): Promise<{ ok: true; uses: FileUse[] } | { ok: false; error: string; status: number }> {
  if (!ownsFile(owner, bucket, path)) return { ok: false, error: "That file was not found.", status: 404 }
  const needle = `${bucket as LibraryBucket}/${path}`
  const uses: FileUse[] = []
  const safe = async <T>(p: PromiseLike<{ data: T | null; error?: unknown }>): Promise<T | null> => {
    try {
      const r = await p
      return r.error ? null : r.data
    } catch {
      return null
    }
  }
  const [products, pages, onepages] = await Promise.all([
    safe<Record<string, unknown>[]>(admin.from("products").select("id, title, thumbnail_url, gallery_urls").eq("creator_id", owner.creatorId).limit(2000)),
    safe<Record<string, unknown>[]>(admin.from("store_builder_configs").select("id, page_type, draft_config, published_config").eq("creator_id", owner.creatorId).limit(50)),
    safe<Record<string, unknown>[]>(admin.from("onepages").select("*").eq("owner_id", owner.userId).limit(20)),
  ])
  const list = products ?? []
  for (const p of list) {
    if (mentions(p.thumbnail_url, needle) || mentions(p.gallery_urls, needle)) uses.push({ kind: "product", label: String(p.title ?? "A product"), href: `/app/products/${p.id}` })
  }
  if (list.length) {
    const titles = new Map(list.map((p) => [String(p.id), String(p.title ?? "A product")]))
    const variants = await safe<Record<string, unknown>[]>(admin.from("product_variants").select("id, product_id, name, image_url").in("product_id", [...titles.keys()].slice(0, 1000)).not("image_url", "is", null).limit(5000))
    for (const v of variants ?? []) {
      if (!mentions(v.image_url, needle)) continue
      const pid = String(v.product_id)
      if (uses.some((u) => u.kind === "product" && u.href.endsWith(pid))) continue
      uses.push({ kind: "variant", label: `${titles.get(pid)}, ${String(v.name ?? "")}`.replace(/, $/, ""), href: `/app/products/${pid}` })
    }
  }
  const sitePages = (pages ?? []).filter((c) => mentions(c.draft_config, needle) || mentions(c.published_config, needle))
  for (const c of sitePages.slice(0, 5)) uses.push({ kind: "website", label: `Website: ${PAGE_NAME[String(c.page_type)] ?? "a page"}`, href: "/app/website-builder" })
  for (const o of (onepages ?? []).filter((o) => mentions(o, needle)).slice(0, 5)) uses.push({ kind: "onepage", label: `OnePage${o.slug ? `: ${String(o.slug)}` : ""}`, href: "/app/onepage" })
  return { ok: true, uses: uses.slice(0, 30) }
}

/** The alt text of each of these files the shop has written one for. Empty where part 214 has not run. */
export async function altTexts(admin: Admin, creatorId: string): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  try {
    const { data, error } = await admin.from("file_details").select("bucket, path, alt_text").eq("creator_id", creatorId).not("alt_text", "is", null).limit(2000)
    if (error) return out
    for (const r of (data ?? []) as { bucket: string; path: string; alt_text: string | null }[]) if (r.alt_text) out.set(`${r.bucket}:${r.path}`, r.alt_text)
  } catch {
    /* No alt text yet. */
  }
  return out
}

/** One file's alt text, in plain words: one line, no markup, at most 500 characters. */
export function cleanAlt(value: unknown): string | null | undefined {
  if (value === null) return null
  if (typeof value !== "string") return undefined
  const v = value.replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_ALT)
  return v || null
}

export async function saveAltText(admin: Admin, owner: { userId: string; creatorId: string }, bucket: unknown, path: unknown, alt: unknown): Promise<{ ok: true; alt: string | null } | { ok: false; error: string; status: number }> {
  if (!ownsFile(owner, bucket, path)) return { ok: false, error: "That file was not found.", status: 404 }
  const text = cleanAlt(alt)
  if (text === undefined) return { ok: false, error: "Write the alt text as words.", status: 400 }
  const { error } = await admin.from("file_details").upsert({ bucket, path, creator_id: owner.creatorId, alt_text: text, updated_at: new Date().toISOString() }, { onConflict: "bucket,path" })
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") return { ok: false, error: "Alt text needs the database update. Run SQL part 214 in Supabase.", status: 409 }
    return { ok: false, error: "The alt text could not be saved.", status: 500 }
  }
  return { ok: true, alt: text }
}
