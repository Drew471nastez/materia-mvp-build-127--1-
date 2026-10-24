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
 *   website         the store builder's draft and published pages, and the
 *                   website builder's theme pages and theme settings
 *   OnePage         the owner's link pages
 *   collections     a collection's picture
 *   profile         the creator's and the account's photo and cover
 *   communities     a community's cover and logo
 *   store settings  the logo and anything else kept there
 *
 * and, for what none of those name (a course lesson, a membership post, an
 * email, a community post), the catch-all the daily storage cleanup asks:
 * public.storage_object_referenced (referencedAnywhere below).
 *
 * A file is matched by `<bucket>/<path>` inside the address, which is the
 * same in Storelib's /media/ form and the storage host's, and unique, since
 * the path starts with the owner's own folder.
 *
 * ALT TEXT is public.file_details (part 214), keyed by bucket and path,
 * written only for a path the caller owns (lib/files/library ownsFile). The
 * same row says when a file was taken out of Files but kept because it still
 * shows somewhere (hidden_at, part 280, lib/files/keep.ts).
 */
import { ownsFile, type LibraryBucket } from "./library"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any

export interface FileUse {
  kind: "product" | "variant" | "website" | "onepage" | "collection" | "profile" | "community" | "settings" | "other"
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
const PAGE_NAME: Record<string, string> = { shop: "Home", home: "Home", index: "Home", product: "Product page", collection: "Collection page", about: "About", contact: "Contact", checkout: "Checkout", cart: "Cart" }

type Row = Record<string, unknown>
type Owner = { userId: string; creatorId: string }

/**
 * Every row of the shop's that can name a file, read once (round 39). Files'
 * detail view reads it for one file; a delete reads it once for every file
 * in the request. `doubt` is true when a table that exists could not be
 * read: nothing is then removed for good on its word (lib/files/keep.ts).
 */
export interface UseSources {
  products: Row[]
  variants: Row[]
  pages: Row[]
  onepages: Row[]
  themeInstalls: Row[]
  themeSettings: Row[]
  themePages: Row[]
  collections: Row[]
  profile: Row[]
  communities: Row[]
  settings: Row[]
  doubt: boolean
}

/* A table or column this database does not have yet holds nothing; any other failure is a doubt. */
const MISSING = new Set(["42P01", "PGRST205", "42703", "PGRST204"])

export async function loadUseSources(admin: Admin, owner: Owner): Promise<UseSources> {
  let doubt = false
  const safe = async (p: PromiseLike<{ data: unknown; error?: { code?: string } | null }>): Promise<Row[]> => {
    try {
      const r = await p
      if (r.error) {
        if (!MISSING.has(String(r.error.code ?? ""))) doubt = true
        return []
      }
      return Array.isArray(r.data) ? (r.data as Row[]) : r.data ? [r.data as Row] : []
    } catch {
      doubt = true
      return []
    }
  }
  const [products, pages, onepages, themeInstalls, collections, creatorRow, profileRow, communities, settings] = await Promise.all([
    /* The whole row: a picture can be in the description, a video setting or the SEO image too, not only the photos (AA3). */
    safe(admin.from("products").select("*").eq("creator_id", owner.creatorId).limit(2000)),
    safe(admin.from("store_builder_configs").select("id, page_type, draft_config, published_config").eq("creator_id", owner.creatorId).limit(50)),
    safe(admin.from("onepages").select("*").eq("owner_id", owner.userId).limit(20)),
    safe(admin.from("store_theme_installs").select("id, name").eq("creator_id", owner.creatorId).limit(50)),
    safe(admin.from("product_collections").select("*").eq("creator_id", owner.creatorId).limit(500)),
    safe(admin.from("creators").select("*").eq("id", owner.creatorId).limit(1)),
    safe(admin.from("profiles").select("*").eq("id", owner.userId).limit(1)),
    safe(admin.from("communities").select("*").eq("creator_id", owner.creatorId).limit(50)),
    safe(admin.from("store_settings").select("*").eq("creator_id", owner.creatorId).limit(1)),
  ])
  const productIds = products.map((p) => String(p.id)).slice(0, 1000)
  const installIds = themeInstalls.map((i) => String(i.id))
  const none = Promise.resolve([] as Row[])
  const [variants, themeSettings, themePages] = await Promise.all([
    productIds.length ? safe(admin.from("product_variants").select("id, product_id, name, image_url").in("product_id", productIds).not("image_url", "is", null).limit(5000)) : none,
    installIds.length ? safe(admin.from("store_theme_settings").select("install_id, settings, draft_settings").in("install_id", installIds).limit(100)) : none,
    installIds.length ? safe(admin.from("store_theme_pages").select("install_id, page_key, sections, draft_sections").in("install_id", installIds).limit(1000)) : none,
  ])
  return { products, variants, pages, onepages, themeInstalls, themeSettings, themePages, collections, profile: [...creatorRow, ...profileRow], communities, settings, doubt }
}

/** A page key as words: "about-us" reads "About us". */
function pageName(key: string): string {
  if (PAGE_NAME[key]) return PAGE_NAME[key]
  const words = key.replace(/[-_]+/g, " ").trim()
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "a page"
}

/** The places in these rows that show this file, at most 30. Pure: the same rows, the same answer. */
export function usesIn(src: UseSources, bucket: LibraryBucket, path: string): FileUse[] {
  const needle = `${bucket}/${path}`
  const uses: FileUse[] = []
  for (const p of src.products) {
    if (mentions(p, needle)) uses.push({ kind: "product", label: String(p.title ?? "A product"), href: `/app/products/${p.id}` })
  }
  const titles = new Map(src.products.map((p) => [String(p.id), String(p.title ?? "A product")]))
  for (const v of src.variants) {
    if (!mentions(v.image_url, needle)) continue
    const pid = String(v.product_id)
    if (uses.some((u) => u.kind === "product" && u.href.endsWith(pid))) continue
    uses.push({ kind: "variant", label: `${titles.get(pid)}, ${String(v.name ?? "")}`.replace(/, $/, ""), href: `/app/products/${pid}` })
  }
  const sitePages = src.pages.filter((c) => mentions(c.draft_config, needle) || mentions(c.published_config, needle))
  for (const c of sitePages.slice(0, 5)) uses.push({ kind: "website", label: `Website: ${PAGE_NAME[String(c.page_type)] ?? "a page"}`, href: "/app/website-builder" })
  /* The website builder's own pages and theme settings, each opening that website in the editor. */
  const editor = (installId: unknown) => `/website-builder/editor/${encodeURIComponent(String(installId))}`
  for (const pg of src.themePages.filter((r) => mentions(r.sections, needle) || mentions(r.draft_sections, needle)).slice(0, 5)) {
    const label = `Website: ${pageName(String(pg.page_key ?? ""))}`
    if (!uses.some((u) => u.label === label)) uses.push({ kind: "website", label, href: editor(pg.install_id) })
  }
  const settingsHit = src.themeSettings.find((r) => mentions(r.settings, needle) || mentions(r.draft_settings, needle))
  if (settingsHit) uses.push({ kind: "website", label: "Website: theme settings", href: editor(settingsHit.install_id) })
  for (const o of src.onepages.filter((o) => mentions(o, needle)).slice(0, 5)) uses.push({ kind: "onepage", label: `OnePage${o.slug ? `: ${String(o.slug)}` : ""}`, href: "/app/onepage" })
  for (const c of src.collections.filter((c) => mentions(c, needle)).slice(0, 5)) uses.push({ kind: "collection", label: `Collection: ${String(c.title ?? c.name ?? "untitled")}`, href: "/app/collections" })
  if (src.profile.some((r) => mentions(r, needle))) uses.push({ kind: "profile", label: "Your profile", href: "/app/creator-page" })
  for (const c of src.communities.filter((c) => mentions(c, needle)).slice(0, 3)) uses.push({ kind: "community", label: `Community: ${String(c.name ?? "yours")}`, href: "/app/community" })
  if (src.settings.some((r) => mentions(r, needle))) uses.push({ kind: "settings", label: "Store settings", href: "/app/settings" })
  return uses.slice(0, 30)
}

/**
 * Whether anything else of the shop's names the file: every table with the
 * owner's id in it, read by public.storage_object_referenced, the function
 * the daily storage cleanup asks before it removes anything (run-now parts
 * 18 and 280). Course lessons, membership posts, emails, community posts and
 * whatever is added later are in it without a line here.
 *
 *   true    somewhere names it, or the answer could not be read (keep it)
 *   false   nothing does
 *   null    the function is not there: only the rows above can tell
 *
 * Asked only once part 280 has run (hiddenColumnReady), which stops a file's
 * own alt text row from counting as a use of it.
 */
export async function referencedAnywhere(admin: Admin, bucket: LibraryBucket, path: string): Promise<boolean | null> {
  try {
    const { data, error } = await admin.rpc("storage_object_referenced", { p_bucket: bucket, p_name: path })
    if (error) return error.code === "PGRST202" || error.code === "42883" ? null : true
    return data === true
  } catch {
    return true
  }
}

/** Something the rows above do not name, found by the catch-all. */
export const ELSEWHERE: FileUse = { kind: "other", label: "Elsewhere on your store", href: "/app" }

export async function fileUsage(admin: Admin, owner: Owner, bucket: unknown, path: unknown): Promise<{ ok: true; uses: FileUse[] } | { ok: false; error: string; status: number }> {
  if (!ownsFile(owner, bucket, path)) return { ok: false, error: "That file was not found.", status: 404 }
  const src = await loadUseSources(admin, owner)
  const uses = usesIn(src, bucket as LibraryBucket, path)
  if (!uses.length && (await hiddenColumnReady(admin)) && (await referencedAnywhere(admin, bucket as LibraryBucket, path)) === true) uses.push(ELSEWHERE)
  return { ok: true, uses }
}

/**
 * Part 280 has run: file_details has hidden_at (a file taken out of Files
 * but kept where it shows), and storage_object_referenced no longer counts a
 * file_details row as a use.
 */
export async function hiddenColumnReady(admin: Admin): Promise<boolean> {
  try {
    const { error } = await admin.from("file_details").select("hidden_at").limit(1)
    return !error
  } catch {
    return false
  }
}

/**
 * The shop's file_details: each file's alt text, and the files taken out of
 * Files that stay where they show (hidden_at, part 280). Before part 280 the
 * alt text alone; before part 214, nothing.
 */
export async function fileDetails(admin: Admin, creatorId: string): Promise<{ alts: Map<string, string>; hidden: Set<string> }> {
  const alts = new Map<string, string>()
  const hidden = new Set<string>()
  try {
    let r = await admin.from("file_details").select("bucket, path, alt_text, hidden_at").eq("creator_id", creatorId).limit(5000)
    if (r.error) r = await admin.from("file_details").select("bucket, path, alt_text").eq("creator_id", creatorId).not("alt_text", "is", null).limit(2000)
    if (r.error) return { alts, hidden }
    for (const row of (r.data ?? []) as { bucket: string; path: string; alt_text: string | null; hidden_at?: string | null }[]) {
      const id = `${row.bucket}:${row.path}`
      if (row.alt_text) alts.set(id, row.alt_text)
      if (row.hidden_at) hidden.add(id)
    }
  } catch {
    /* Nothing written yet. */
  }
  return { alts, hidden }
}

/** The alt text of each of these files the shop has written one for. Empty where part 214 has not run. */
export async function altTexts(admin: Admin, creatorId: string): Promise<Map<string, string>> {
  return (await fileDetails(admin, creatorId)).alts
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
