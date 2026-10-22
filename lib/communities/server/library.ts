import "server-only"

/**
 * ===========================================================================
 *  THE LIBRARY ON THE SERVER (round 39)
 * ===========================================================================
 * Everything the Library reads and writes, after the caller's gate
 * (requireMember for a member, requireCreatorCommunity for the admin), with
 * the access rule of lib/communities/library.ts asked again here for every
 * item, every file and every link: a member is never handed a file, a link's
 * address or a signed URL for an item they may not open.
 *
 *   SETTINGS   community_library_settings: on or off (part 278). Before the
 *              part has run the Library is off, and the admin says why.
 *   ITEMS      in the admin's order. A resource's files live in the
 *              community's own folder of the private file bucket, uploaded
 *              through the community's file route (./post-files.ts) and
 *              found again here by id under the uploader's own folder; the
 *              row keeps the id, the name, the size and the uploader. A
 *              product item's files are the product's own digital_assets.
 *   SELLING    an attached product is sold at its price or the item's own;
 *              an uploaded resource that is sold becomes a product made for
 *              the community (products.community_id, so it is listed in no
 *              store and its page sends people here), its files the item's,
 *              so a purchase is an order like any other (./library-checkout.ts).
 *   OWNING     an entitlement for the item's product: what a purchase makes
 *              and a full refund takes away, wherever either happened.
 *   COUNTS     views (a member once a day) and downloads, by
 *              community_library_touch; sales from community_library_purchases.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import { STORAGE_BUCKET } from "@/lib/storage/plans"
import { generateSignedDownloadUrl, SIGNED_DOWNLOAD_SECONDS } from "@/lib/storage/download"
import { gateDownload } from "@/lib/storage/scan-gate"
import { storedObjectSize } from "@/lib/storage/upload-guard"
import { cleanStoredHtml, htmlToPlainText, isBlankHtml, looksLikeHtml } from "@/lib/rich-text/html"
import { sanitizeDescription } from "@/lib/rich-text/sanitize"
import { readStoreCurrency } from "@/lib/store/selling-currency-read"
import { productPriceCurrency } from "@/lib/money/product-currency"
import { slugFrom } from "@/lib/memberships/creator"
import { avoidReservedProductSlug } from "@/lib/commerce/reserved-slugs"
import { can } from "../permissions"
import {
  LIBRARY_DESCRIPTION_MAX,
  LIBRARY_ITEMS_MAX,
  LIBRARY_PRICE_MIN_CENTS,
  LIBRARY_SECTIONS_MAX,
  LIBRARY_SUMMARY_MAX,
  checkLibraryInput,
  checkSectionName,
  cleanIds,
  isLibraryId,
  libraryFileHref,
  libraryGate,
  libraryHref,
  libraryLinkHref,
  libraryMode,
  linkHost,
  linkLabel,
  onShelf,
  resourceHref,
  type LibraryFile,
  type LibraryGate,
  type LibraryInput,
  type LibraryKind,
  type LibraryLink,
  type LibraryRule,
  type LibraryViewer,
} from "../library"
import { programPrice } from "../learn"
import { communityFilePath, fileDisplayName, fileExtension, fileSizeLabel } from "../post-media"
import type { CommunityRow } from "../types"
import type { AdminLibraryData, AdminLibraryItem, AdminLibraryProduct, LibraryCardView, LibraryItemData, LibraryLock, LibraryShelfData } from "@/components/community/library/model"
import { textToHtml } from "@/components/community/creator/logic"
import { audit } from "./audit"
import type { Viewer } from "./context"
import { missing, reasonOf, type Db } from "./db"
import { ownPicture } from "./gallery"

/** What a save answers while part 278 has not run. */
export const LIBRARY_NOT_READY = "The Library needs the latest Storelib database update (part 278). Run it, then try again."

export const ITEM_COLUMNS =
  "id, community_id, section_id, kind, product_id, made_product, title, summary, description, cover_url, files, links, access_mode, tier_ids, min_level, price_cents, currency, member_ids, status, position, view_count, download_count, created_at, updated_at, published_at"

export interface LibraryItemRow {
  id: string
  community_id: string
  section_id: string | null
  kind: LibraryKind
  product_id: string | null
  made_product: boolean
  title: string
  summary: string | null
  description: string | null
  cover_url: string | null
  files: LibraryFile[] | null
  links: LibraryLink[] | null
  access_mode: string
  tier_ids: string[] | null
  min_level: number | null
  price_cents: number | null
  currency: string | null
  member_ids: string[] | null
  status: string
  position: number
  view_count: number
  download_count: number
  created_at: string
  updated_at: string
  published_at: string | null
}

export interface ProductFacts {
  id: string
  creator_id: string | null
  title: string | null
  slug: string | null
  type: string | null
  status: string | null
  archived: boolean | null
  price_cents: number | null
  pay_what_you_want: boolean | null
  pwyw_min_price_cents: number | null
  thumbnail_url: string | null
  community_id: string | null
  description: string | null
}

const PRODUCT_COLUMNS = "id, creator_id, title, slug, type, status, archived, price_cents, pay_what_you_want, pwyw_min_price_cents, thumbnail_url, community_id, description"

export type Answer<T = unknown> = ({ ok: true } & T) | { ok: false; status: number; error: string; field?: string }

const refuse = (status: number, error: string, field?: string): { ok: false; status: number; error: string; field?: string } => ({ ok: false, status, error, ...(field ? { field } : {}) })

/* ── Reading ────────────────────────────────────────────────────────────── */

/** Whether the Library is on, and whether part 278 has run (ready). */
export async function librarySettings(db: Db, communityId: string): Promise<{ ready: boolean; enabled: boolean }> {
  try {
    const { data, error } = await db.from("community_library_settings").select("enabled").eq("community_id", communityId).maybeSingle()
    if (error) {
      if (!missing(error)) console.error(`[communities] library settings: ${reasonOf(error)}`)
      return { ready: !missing(error), enabled: false }
    }
    return { ready: true, enabled: (data as { enabled?: boolean } | null)?.enabled === true }
  } catch (e) {
    console.error(`[communities] library settings: ${reasonOf(e)}`)
    return { ready: false, enabled: false }
  }
}

/** On or off, by whoever may change the community's settings (the route asked). */
export async function setLibraryEnabled(db: Db, a: { communityId: string; actorId: string; enabled: unknown }): Promise<Answer<{ enabled: boolean }>> {
  if (typeof a.enabled !== "boolean") return refuse(400, "Say on or off.")
  const { error } = await db.from("community_library_settings").upsert({ community_id: a.communityId, enabled: a.enabled, updated_by: a.actorId, updated_at: new Date().toISOString() }, { onConflict: "community_id" })
  if (error) {
    if (missing(error)) return refuse(409, LIBRARY_NOT_READY)
    console.error(`[communities] library switch: ${reasonOf(error)}`)
    return refuse(500, "That did not save. Try again.")
  }
  await audit(db, { communityId: a.communityId, actorId: a.actorId, actorKind: "member", action: a.enabled ? "library.enabled" : "library.disabled", targetType: "community", targetId: a.communityId })
  return { ok: true, enabled: a.enabled }
}

const filesOf = (row: Pick<LibraryItemRow, "files">): LibraryFile[] =>
  (Array.isArray(row.files) ? row.files : []).filter((f): f is LibraryFile => !!f && isLibraryId(f.fileId) && isLibraryId(f.uploaderId) && typeof f.name === "string")
const linksOf = (row: Pick<LibraryItemRow, "links">): LibraryLink[] => (Array.isArray(row.links) ? row.links : []).filter((l): l is LibraryLink => !!l && typeof l.url === "string")

/** Every item of a community, in the admin's order. `ready` is false before part 278. */
export async function readItems(db: Db, communityId: string): Promise<{ ready: boolean; rows: LibraryItemRow[] }> {
  const { data, error } = await db.from("community_library_items").select(ITEM_COLUMNS).eq("community_id", communityId).order("position", { ascending: true }).order("created_at", { ascending: true }).limit(LIBRARY_ITEMS_MAX)
  if (error) {
    if (!missing(error)) console.error(`[communities] library items: ${reasonOf(error)}`)
    return { ready: !missing(error), rows: [] }
  }
  return { ready: true, rows: (data as LibraryItemRow[] | null) ?? [] }
}

export async function findItem(db: Db, communityId: string, itemId: string): Promise<LibraryItemRow | null> {
  if (!isLibraryId(itemId)) return null
  const { data, error } = await db.from("community_library_items").select(ITEM_COLUMNS).eq("id", itemId.toLowerCase()).eq("community_id", communityId).maybeSingle()
  if (error) {
    if (!missing(error)) console.error(`[communities] library item: ${reasonOf(error)}`)
    return null
  }
  const row = data as LibraryItemRow | null
  return row && row.community_id === communityId ? row : null
}

export async function readSections(db: Db, communityId: string): Promise<{ id: string; name: string; position: number }[]> {
  const { data, error } = await db.from("community_library_sections").select("id, name, position").eq("community_id", communityId).order("position", { ascending: true }).limit(LIBRARY_SECTIONS_MAX)
  if (error) {
    if (!missing(error)) console.error(`[communities] library sections: ${reasonOf(error)}`)
    return []
  }
  return (data as { id: string; name: string; position: number }[] | null) ?? []
}

async function productsById(db: Db, ids: (string | null | undefined)[]): Promise<Map<string, ProductFacts>> {
  const list = [...new Set(ids.filter((id): id is string => !!id))]
  const out = new Map<string, ProductFacts>()
  if (!list.length) return out
  const { data, error } = await db.from("products").select(PRODUCT_COLUMNS).in("id", list)
  if (error) {
    console.error(`[communities] library products: ${reasonOf(error)}`)
    return out
  }
  for (const p of (data as ProductFacts[] | null) ?? []) out.set(p.id, p)
  return out
}

/** The products among these the person owns (an entitlement: bought, claimed or given). */
export async function ownedProducts(db: Db, userId: string | null, productIds: (string | null | undefined)[]): Promise<Set<string>> {
  const ids = [...new Set(productIds.filter((id): id is string => !!id))]
  if (!userId || !ids.length) return new Set()
  const { data, error } = await db.from("entitlements").select("product_id").eq("buyer_id", userId).in("product_id", ids)
  if (error) {
    console.error(`[communities] library owned: ${reasonOf(error)}`)
    return new Set()
  }
  return new Set(((data as { product_id: string }[] | null) ?? []).map((e) => e.product_id))
}

/** A product's files: names and sizes for the page, never a path. */
async function productAssets(db: Db, productIds: string[]): Promise<Map<string, { id: string; file_name: string; file_size: number | null }[]>> {
  const out = new Map<string, { id: string; file_name: string; file_size: number | null }[]>()
  if (!productIds.length) return out
  const { data, error } = await db.from("digital_assets").select("id, product_id, file_name, file_size, created_at").in("product_id", productIds).order("created_at", { ascending: true }).limit(2000)
  if (error) {
    console.error(`[communities] library product files: ${reasonOf(error)}`)
    return out
  }
  for (const a of (data as { id: string; product_id: string; file_name: string; file_size: number | null }[] | null) ?? []) {
    const list = out.get(a.product_id) ?? []
    list.push({ id: a.id, file_name: a.file_name, file_size: a.file_size })
    out.set(a.product_id, list)
  }
  return out
}

/** What a member pays for a sold item: its own price, else its product's (at least its minimum for pay what you want). */
export function effectivePrice(row: Pick<LibraryItemRow, "price_cents">, product: Pick<ProductFacts, "price_cents" | "pay_what_you_want" | "pwyw_min_price_cents"> | null | undefined): number | null {
  if (typeof row.price_cents === "number" && row.price_cents > 0) return row.price_cents
  if (!product) return null
  const base = product.pay_what_you_want ? Math.max(Number(product.pwyw_min_price_cents) || 0, Number(product.price_cents) || 0) : Number(product.price_cents) || 0
  return base > 0 ? base : null
}

export function ruleOf(row: LibraryItemRow, product: ProductFacts | null | undefined): LibraryRule {
  return { status: row.status, mode: libraryMode(row.access_mode), tierIds: row.tier_ids ?? [], minLevel: row.min_level, priceCents: effectivePrice(row, product), memberIds: row.member_ids ?? [] }
}

export function libraryViewer(viewer: Pick<Viewer, "userId" | "role" | "active" | "tierId" | "level">, owns: boolean): LibraryViewer {
  return { userId: viewer.userId, role: viewer.role, active: viewer.active, tierId: viewer.tierId, level: viewer.level, owns }
}

/** The currency an item's price is in: its product's (a store's own), or the store's. */
async function storeCurrency(db: Db, creatorId: string | null): Promise<string> {
  return (await readStoreCurrency(db, creatorId)).currency
}

const priceLabelOf = (cents: number | null, currency: string | null) => (cents ? programPrice(cents, currency) : null)

function lockOf(gate: LibraryGate, viewer: Pick<Viewer, "level">, tierNames: Map<string, string>): LibraryLock | null {
  if (!("reason" in gate)) return null
  if (gate.reason === "paid") return { reason: "paid" }
  if (gate.reason === "level") return { reason: "level", level: gate.level, viewerLevel: viewer.level || 1 }
  if (gate.reason === "tier") return { reason: "tier", tiers: gate.tierIds.map((id) => tierNames.get(id)).filter((n): n is string => !!n) }
  return null
}

function fileType(name: string): string | null {
  const ext = fileExtension(name)
  return ext && ext !== "bin" ? ext.toUpperCase() : null
}

async function tierNamesOf(db: Db, communityId: string): Promise<Map<string, string>> {
  const { data } = await db.from("community_tiers").select("id, name").eq("community_id", communityId).limit(50)
  return new Map(((data as { id: string; name: string }[] | null) ?? []).map((t) => [t.id.toLowerCase(), t.name]))
}

interface Facts {
  rows: LibraryItemRow[]
  products: Map<string, ProductFacts>
  owned: Set<string>
  assets: Map<string, { id: string; file_name: string; file_size: number | null }[]>
  currency: string
  tiers: Map<string, string>
}

async function facts(db: Db, community: CommunityRow, viewer: Viewer, rows: LibraryItemRow[]): Promise<Facts> {
  const productIds = rows.map((r) => r.product_id).filter((id): id is string => !!id)
  const productItems = rows.filter((r) => r.kind === "product" && r.product_id).map((r) => r.product_id as string)
  const [products, owned, assets, currency, tiers] = await Promise.all([
    productsById(db, productIds),
    ownedProducts(db, viewer.userId, productIds),
    productAssets(db, [...new Set(productItems)]),
    storeCurrency(db, community.creator_id ?? null),
    rows.some((r) => r.access_mode === "tier") ? tierNamesOf(db, community.id) : Promise.resolve(new Map<string, string>()),
  ])
  return { rows, products, owned, assets, currency, tiers }
}

function cardOf(community: CommunityRow, viewer: Viewer, row: LibraryItemRow, f: Facts): { card: LibraryCardView; gate: LibraryGate } {
  const product = row.product_id ? (f.products.get(row.product_id) ?? null) : null
  const owns = !!row.product_id && f.owned.has(row.product_id)
  const gate = libraryGate(ruleOf(row, product), libraryViewer(viewer, owns))
  const resourceFiles = filesOf(row)
  const productFiles = row.kind === "product" && row.product_id ? (f.assets.get(row.product_id) ?? []) : []
  const fileNames = row.kind === "product" ? productFiles.map((a) => a.file_name) : resourceFiles.map((x) => x.name)
  const currency = row.currency || (product ? productPriceCurrency(product, f.currency) : f.currency)
  const mode = libraryMode(row.access_mode)
  const price = mode === "paid" ? effectivePrice(row, product) : null
  const summary = (row.summary || (row.description ? htmlToPlainText(row.description) : "")).replace(/\s+/g, " ").trim().slice(0, 240) || null
  return {
    gate,
    card: {
      id: row.id,
      kind: row.kind,
      title: row.title,
      summary,
      coverUrl: row.cover_url || (row.kind === "product" ? (product?.thumbnail_url ?? null) : null),
      sectionId: row.section_id,
      files: fileNames.length,
      links: row.kind === "resource" ? linksOf(row).length : 0,
      fileType: fileNames.length === 1 ? fileType(fileNames[0]) : null,
      open: gate.open,
      owned: owns,
      lock: lockOf(gate, viewer, f.tiers),
      priceLabel: priceLabelOf(price, currency),
      draft: row.status !== "published",
      private: mode === "private",
      href: resourceHref(community.slug, row.id),
    },
  }
}

/** A product item whose product is gone, archived or no longer the creator's is not on the shelf. */
function productUsable(row: LibraryItemRow, f: Facts, community: CommunityRow): boolean {
  if (row.kind !== "product") return true
  const p = row.product_id ? f.products.get(row.product_id) : null
  return !!p && p.creator_id === community.creator_id && p.archived !== true && p.status !== "archived"
}

/**
 * THE SHELF, for an active member (the caller checked): every item they may
 * see, in the admin's order, each with whether it opens and, if not, what
 * opens it. A draft and a private item off their list are not there at all.
 * Null while the Library is off (the place is then a 404).
 */
export async function libraryShelf(db: Db, community: CommunityRow, viewer: Viewer): Promise<LibraryShelfData | null> {
  const settings = await librarySettings(db, community.id)
  if (!settings.enabled) return null
  const [{ rows }, sections] = await Promise.all([readItems(db, community.id), readSections(db, community.id)])
  const f = await facts(db, community, viewer, rows)
  const items: LibraryCardView[] = []
  for (const row of rows) {
    if (!productUsable(row, f, community)) continue
    const { card, gate } = cardOf(community, viewer, row, f)
    if (!onShelf(gate)) continue
    items.push(card)
  }
  const used = new Set(items.map((i) => i.sectionId).filter(Boolean))
  return {
    communityId: community.id,
    communityName: community.name,
    slug: community.slug,
    sections: sections.filter((s) => used.has(s.id)).map((s) => ({ id: s.id, name: s.name })),
    items,
    manageHref: can(viewer.role, "manage_classroom", viewer.perms) ? `/app/community/${community.slug}/library` : null,
  }
}

/** One item and whether this viewer opens it: what every route asks before it hands anything out. Null when it is not theirs to see. */
export async function itemAccess(db: Db, community: CommunityRow, viewer: Viewer, itemId: string): Promise<{ row: LibraryItemRow; product: ProductFacts | null; gate: LibraryGate; facts: Facts } | null> {
  const settings = await librarySettings(db, community.id)
  if (!settings.enabled) return null
  const row = await findItem(db, community.id, itemId)
  if (!row) return null
  const f = await facts(db, community, viewer, [row])
  if (!productUsable(row, f, community)) return null
  const product = row.product_id ? (f.products.get(row.product_id) ?? null) : null
  const owns = !!row.product_id && f.owned.has(row.product_id)
  const gate = libraryGate(ruleOf(row, product), libraryViewer(viewer, owns))
  if (!onShelf(gate)) return null
  return { row, product, gate, facts: f }
}

/** The item's page: the description, and for somebody who opens it the files to download and the links to open. */
export async function libraryItemPage(db: Db, community: CommunityRow, viewer: Viewer, itemId: string, opts: { canBuy?: () => Promise<boolean> } = {}): Promise<LibraryItemData | null> {
  const access = await itemAccess(db, community, viewer, itemId)
  if (!access) return null
  const { row, gate, facts: f } = access
  const { card } = cardOf(community, viewer, row, f)
  const open = gate.open
  const files =
    row.kind === "product" && row.product_id
      ? (f.assets.get(row.product_id) ?? []).map((a) => ({ id: a.id, name: a.file_name, sizeLabel: fileSizeLabel(a.file_size ?? 0), href: open ? libraryFileHref(community.id, row.id, a.id) : null }))
      : filesOf(row).map((x) => ({ id: x.fileId, name: x.name, sizeLabel: fileSizeLabel(x.size), href: open ? libraryFileHref(community.id, row.id, x.fileId) : null }))
  /* A link's address is the thing itself: only somebody who opens the item gets the route to it, and nobody gets the address in the page. */
  const links = row.kind === "resource" ? linksOf(row).map((l, i) => ({ label: linkLabel(l), host: open ? linkHost(l.url) : "", href: open ? libraryLinkHref(community.id, row.id, i) : null })) : []
  const sections = row.section_id ? await readSections(db, community.id) : []
  const descriptionHtml = row.description && looksLikeHtml(row.description) ? cleanStoredHtml(row.description) : null
  const paidLock = "reason" in gate && gate.reason === "paid"
  const canBuy = paidLock && opts.canBuy ? await opts.canBuy().catch(() => false) : false
  return {
    communityId: community.id,
    communityName: community.name,
    slug: community.slug,
    item: {
      ...card,
      summary: descriptionHtml ? card.summary : row.summary || card.summary,
      descriptionHtml,
      fileList: files,
      linkList: links,
      libraryProductHref: card.owned && row.product_id ? `/account/library/products/${encodeURIComponent(row.product_id)}` : null,
      sectionName: sections.find((s) => s.id === row.section_id)?.name ?? null,
    },
    libraryHref: libraryHref(community.slug),
    aboutHref: `/community/${community.slug}/about`,
    levelsHref: community.gamification_enabled ? `/community/${community.slug}/leaderboard` : null,
    manageHref: can(viewer.role, "manage_classroom", viewer.perms) ? `/app/community/${community.slug}/library?item=${row.id}` : null,
    canBuy,
  }
}

/* ── Handing out a file or a link ───────────────────────────────────────── */

export type Delivery = { ok: true; url: string } | { ok: false; status: number; error: string }

/**
 * A five minute signed address for one file of an item, for somebody the
 * caller found may open it (itemAccess said open). A resource's file is
 * signed from the uploader's own folder in this community, rebuilt from ids
 * the server holds; a product's from its own record, after the same file
 * checks every buyer download goes through.
 */
export async function signItemFile(db: Db, community: CommunityRow, row: LibraryItemRow, fileId: string, opts: { creator?: boolean } = {}): Promise<Delivery> {
  if (!isLibraryId(fileId)) return { ok: false, status: 404, error: "File not found" }
  const id = fileId.toLowerCase()
  if (row.kind === "resource") {
    const file = filesOf(row).find((f) => f.fileId === id)
    if (!file || !community.creator_id) return { ok: false, status: 404, error: "File not found" }
    const path = communityFilePath(community.creator_id, community.id, file.uploaderId, file.fileId, fileExtension(file.name))
    const signed = await generateSignedDownloadUrl(db as SupabaseClient, path, SIGNED_DOWNLOAD_SECONDS, STORAGE_BUCKET, file.name)
    return signed ? { ok: true, url: signed.url } : { ok: false, status: 502, error: "The file could not be opened. Try again in a moment." }
  }
  if (!row.product_id) return { ok: false, status: 404, error: "File not found" }
  const { data: asset } = await db.from("digital_assets").select("id, file_path, file_name, mime_type, file_size, storage_bucket, scan_status, product_id, uploaded_by").eq("id", id).eq("product_id", row.product_id).maybeSingle()
  if (!asset?.file_path) return { ok: false, status: 404, error: "File not found" }
  const checked = await gateDownload(db as SupabaseClient, asset, { isCreator: opts.creator === true })
  if ("error" in checked) return { ok: false, status: checked.status, error: checked.error }
  const signed = await generateSignedDownloadUrl(db as SupabaseClient, asset.file_path, SIGNED_DOWNLOAD_SECONDS, asset.storage_bucket ?? undefined, asset.file_name)
  return signed ? { ok: true, url: signed.url } : { ok: false, status: 502, error: "The file could not be opened. Try again in a moment." }
}

/** A link of an item by its place in the list, for somebody who opens it. */
export function itemLinkUrl(row: LibraryItemRow, index: number): string | null {
  if (row.kind !== "resource" || !Number.isInteger(index) || index < 0) return null
  return linksOf(row)[index]?.url ?? null
}

/** A view (a member once a day) or a download, counted. Never throws, never waits on anything that matters. */
export async function touchItem(db: Db, itemId: string, userId: string | null, kind: "view" | "download"): Promise<void> {
  if (!userId) return
  try {
    const { error } = await db.rpc("community_library_touch", { p_item: itemId, p_user: userId, p_kind: kind })
    if (error && !missing(error)) console.error(`[communities] library count: ${reasonOf(error)}`)
  } catch (e) {
    console.error(`[communities] library count: ${reasonOf(e)}`)
  }
}

/* ── The admin ──────────────────────────────────────────────────────────── */

/** The creator's own digital products that can be attached: not a community's plan, not archived. */
async function attachableProducts(db: Db, creatorId: string | null, currency: string): Promise<AdminLibraryProduct[]> {
  if (!creatorId) return []
  const { data, error } = await db.from("products").select(PRODUCT_COLUMNS).eq("creator_id", creatorId).eq("type", "digital").order("created_at", { ascending: false }).limit(200)
  if (error) {
    console.error(`[communities] library attachable: ${reasonOf(error)}`)
    return []
  }
  const rows = ((data as ProductFacts[] | null) ?? []).filter((p) => !p.community_id && p.archived !== true && p.status !== "archived" && p.status !== "deleted")
  return describeProducts(db, rows, currency)
}

async function describeProducts(db: Db, rows: ProductFacts[], currency: string): Promise<AdminLibraryProduct[]> {
  if (!rows.length) return []
  const ids = rows.map((p) => p.id)
  const [assets, variants] = await Promise.all([productAssets(db, ids), db.from("product_variants").select("product_id").in("product_id", ids).limit(2000)])
  const withOptions = new Set(((variants.data as { product_id: string }[] | null) ?? []).map((v) => v.product_id))
  return rows.map((p) => {
    const cents = effectivePrice({ price_cents: null }, p)
    return { id: p.id, title: p.title?.trim() || "Product", coverUrl: p.thumbnail_url, priceCents: cents, priceLabel: priceLabelOf(cents, productPriceCurrency(p, currency)), status: p.status ?? "draft", files: (assets.get(p.id) ?? []).length, hasOptions: withOptions.has(p.id) }
  })
}

/** Sales of each item through the Library, and what came in, with refunds left out. */
async function salesOf(db: Db, communityId: string): Promise<Map<string, { sales: number; cents: number; currency: string | null }>> {
  const out = new Map<string, { sales: number; cents: number; currency: string | null }>()
  const { data, error } = await db.from("community_library_purchases").select("item_id, amount_cents, currency, refunded_at").eq("community_id", communityId).is("refunded_at", null).limit(5000)
  if (error) {
    if (!missing(error)) console.error(`[communities] library sales: ${reasonOf(error)}`)
    return out
  }
  for (const p of (data as { item_id: string | null; amount_cents: number; currency: string | null }[] | null) ?? []) {
    if (!p.item_id) continue
    const s = out.get(p.item_id) ?? { sales: 0, cents: 0, currency: p.currency }
    s.sales++
    s.cents += Math.max(0, Number(p.amount_cents) || 0)
    out.set(p.item_id, s)
  }
  return out
}

/** Everything the admin's Library draws. */
export async function libraryAdmin(db: Db, community: CommunityRow, opts: { canSell?: () => Promise<boolean> } = {}): Promise<AdminLibraryData> {
  const [settings, items, sections, currency, tiers, levels, sales, canSell] = await Promise.all([
    librarySettings(db, community.id),
    readItems(db, community.id),
    readSections(db, community.id),
    storeCurrency(db, community.creator_id ?? null),
    db.from("community_tiers").select("id, name").eq("community_id", community.id).is("archived_at", null).order("position", { ascending: true }).limit(50),
    db.from("community_levels").select("level, name").eq("community_id", community.id),
    salesOf(db, community.id),
    opts.canSell ? opts.canSell().catch(() => false) : Promise.resolve(false),
  ])
  const rows = items.rows
  const [products, attachable, people] = await Promise.all([
    productsById(db, rows.map((r) => r.product_id)),
    attachableProducts(db, community.creator_id ?? null, currency),
    privateMembers(db, community.id, rows),
  ])
  const described = new Map((await describeProducts(db, rows.filter((r) => r.kind === "product" && r.product_id).map((r) => products.get(r.product_id as string)).filter((p): p is ProductFacts => !!p), currency)).map((p) => [p.id, p]))
  const list: AdminLibraryItem[] = rows.map((r) => {
    const product = r.product_id ? (products.get(r.product_id) ?? null) : null
    const mode = libraryMode(r.access_mode)
    const itemCurrency = r.currency || (product ? productPriceCurrency(product, currency) : currency)
    const price = mode === "paid" ? effectivePrice(r, product) : null
    const s = sales.get(r.id)
    return {
      id: r.id,
      kind: r.kind,
      productId: r.product_id,
      madeProduct: r.made_product,
      product: r.kind === "product" && r.product_id ? (described.get(r.product_id) ?? null) : null,
      title: r.title,
      descriptionHtml: r.description && looksLikeHtml(r.description) ? cleanStoredHtml(r.description) : r.summary ? textToHtml(r.summary) : "",
      coverUrl: r.cover_url,
      sectionId: r.section_id,
      files: filesOf(r).map((f) => ({ fileId: f.fileId, name: f.name, size: f.size })),
      links: linksOf(r),
      mode,
      tierIds: cleanIds(r.tier_ids, 50),
      minLevel: r.min_level,
      priceCents: r.price_cents,
      priceLabel: priceLabelOf(price, itemCurrency),
      currency: itemCurrency,
      members: cleanIds(r.member_ids, 1000).map((id) => people.get(id) ?? { userId: id, name: "Member", avatarUrl: null }),
      status: r.status === "published" ? "published" : "draft",
      stats: { views: r.view_count ?? 0, downloads: r.download_count ?? 0, sales: s?.sales ?? 0, revenueLabel: s && s.cents ? programPrice(s.cents, s.currency || itemCurrency) : null },
    }
  })
  const counts = new Map<string, number>()
  for (const r of rows) if (r.section_id) counts.set(r.section_id, (counts.get(r.section_id) ?? 0) + 1)
  return {
    ready: settings.ready && items.ready,
    enabled: settings.enabled,
    communityId: community.id,
    slug: community.slug,
    currency,
    canSell,
    sections: sections.map((s) => ({ id: s.id, name: s.name, count: counts.get(s.id) ?? 0 })),
    items: list,
    products: attachable,
    tiers: ((tiers.data as { id: string; name: string }[] | null) ?? []).map((t) => ({ id: t.id, name: t.name })),
    levels: ((levels.data as { level: number; name: string }[] | null) ?? []).map((l) => ({ level: Number(l.level), name: l.name })).sort((a, b) => a.level - b.level),
  }
}

async function privateMembers(db: Db, communityId: string, rows: LibraryItemRow[]): Promise<Map<string, { userId: string; name: string; avatarUrl: string | null }>> {
  const ids = [...new Set(rows.flatMap((r) => (r.access_mode === "private" ? cleanIds(r.member_ids, 1000) : [])))]
  const out = new Map<string, { userId: string; name: string; avatarUrl: string | null }>()
  if (!ids.length) return out
  const { authorViews } = await import("./directory")
  const views = await authorViews(db, communityId, ids.slice(0, 1000))
  for (const [id, v] of views) out.set(id, { userId: id, name: v.name, avatarUrl: v.avatarUrl })
  return out
}

/* ── Writing ────────────────────────────────────────────────────────────── */

async function nextPosition(db: Db, table: "community_library_items" | "community_library_sections", communityId: string): Promise<number> {
  const { data } = await db.from(table).select("position").eq("community_id", communityId).order("position", { ascending: false }).limit(1)
  const top = ((data as { position: number }[] | null) ?? [])[0]?.position
  return typeof top === "number" ? top + 1 : 0
}

/** A product the creator may put in this community's Library: theirs, digital, not a community's plan, not archived. */
async function attachable(db: Db, community: CommunityRow, productId: unknown): Promise<ProductFacts | null> {
  if (!isLibraryId(productId) || !community.creator_id) return null
  const p = (await productsById(db, [productId.toLowerCase()])).get(productId.toLowerCase())
  if (!p || p.creator_id !== community.creator_id || p.type !== "digital" || p.community_id || p.archived === true || p.status === "archived" || p.status === "deleted") return null
  return p
}

/** A new item, as a draft at the end: a resource with a name, or one of the creator's products. */
export async function createItem(db: Db, a: { community: CommunityRow; actorId: string; kind: unknown; title?: unknown; productId?: unknown }): Promise<Answer<{ id: string }>> {
  const settings = await librarySettings(db, a.community.id)
  if (!settings.ready) return refuse(409, LIBRARY_NOT_READY)
  const { count } = await db.from("community_library_items").select("id", { count: "exact", head: true }).eq("community_id", a.community.id)
  if (typeof count === "number" && count >= LIBRARY_ITEMS_MAX) return refuse(409, `A library holds up to ${LIBRARY_ITEMS_MAX} items.`)
  const position = await nextPosition(db, "community_library_items", a.community.id)
  let row: Record<string, unknown>
  if (a.kind === "product") {
    const product = await attachable(db, a.community, a.productId)
    if (!product) return refuse(404, "That product cannot be added. Pick one of your own digital products.", "product")
    const { data: already } = await db.from("community_library_items").select("id").eq("community_id", a.community.id).eq("product_id", product.id).limit(1)
    if (((already as unknown[] | null) ?? []).length) return refuse(409, "That product is in the Library already.", "product")
    const description = product.description && looksLikeHtml(product.description) ? cleanStoredHtml(product.description).slice(0, LIBRARY_DESCRIPTION_MAX) : null
    row = {
      community_id: a.community.id,
      kind: "product",
      product_id: product.id,
      title: (product.title?.trim() || "Product").slice(0, 120),
      description,
      summary: description ? htmlToPlainText(description).slice(0, LIBRARY_SUMMARY_MAX) || null : (product.description ?? "").slice(0, LIBRARY_SUMMARY_MAX) || null,
      cover_url: product.thumbnail_url,
      access_mode: "free",
      status: "draft",
      position,
      created_by: a.actorId,
    }
  } else {
    const checked = checkLibraryInput({ title: a.title }, { requireTitle: true })
    if (checked.ok === false) return refuse(400, checked.error, checked.field)
    row = { community_id: a.community.id, kind: "resource", title: checked.patch.title, access_mode: "free", status: "draft", position, created_by: a.actorId }
  }
  const { data, error } = await db.from("community_library_items").insert(row).select("id").single()
  if (error || !data) {
    if (missing(error)) return refuse(409, LIBRARY_NOT_READY)
    console.error(`[communities] library create: ${reasonOf(error)}`)
    return refuse(500, "That could not be added. Try again.")
  }
  const id = (data as { id: string }).id
  await audit(db, { communityId: a.community.id, actorId: a.actorId, actorKind: "member", action: "library.item_created", targetType: "library_item", targetId: id, targetLabel: String(row.title) })
  return { ok: true, id }
}

/** The members among these ids who belong to this community, in the order given. */
async function membersHere(db: Db, communityId: string, ids: string[]): Promise<string[]> {
  if (!ids.length) return []
  const found = new Set<string>()
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await db.from("community_members").select("user_id").eq("community_id", communityId).in("user_id", ids.slice(i, i + 200))
    for (const r of (data as { user_id: string }[] | null) ?? []) found.add(r.user_id.toLowerCase())
  }
  return ids.filter((id) => found.has(id))
}

/**
 * The files the editor holds, found where they are: one already on the item
 * keeps what was stored; a new one must be in the uploader's (this admin's)
 * own folder of this community, under the extension its name carries.
 */
async function resolveFiles(db: Db, community: CommunityRow, actorId: string, current: LibraryFile[], wanted: { fileId: string; name: string }[]): Promise<{ ok: true; files: LibraryFile[] } | { ok: false; error: string }> {
  if (!community.creator_id) return { ok: false, error: "This community has no creator account to keep its files." }
  const out: LibraryFile[] = []
  for (const w of wanted) {
    const kept = current.find((f) => f.fileId === w.fileId)
    if (kept) {
      out.push(kept)
      continue
    }
    const ext = fileExtension(w.name)
    if (!/^[a-z0-9]{1,10}$/.test(ext)) return { ok: false, error: "That file could not be added. Upload it again." }
    const path = communityFilePath(community.creator_id, community.id, actorId, w.fileId, ext)
    const size = await storedObjectSize(db as SupabaseClient, STORAGE_BUCKET, path).catch(() => null)
    if (size === null) return { ok: false, error: "That file could not be added. Upload it again." }
    out.push({ fileId: w.fileId, name: fileDisplayName(w.name, ext), size, uploaderId: actorId.toLowerCase() })
  }
  return { ok: true, files: out }
}

/** The description as stored: cleaned HTML and its plain copy, or plain text. */
function descriptionFields(input: string | null): { summary: string | null; description: string | null } {
  const raw = (input ?? "").trim()
  if (!raw) return { summary: null, description: null }
  if (!looksLikeHtml(raw)) return { summary: raw.slice(0, LIBRARY_SUMMARY_MAX), description: null }
  const html = cleanStoredHtml(raw).slice(0, LIBRARY_DESCRIPTION_MAX)
  if (isBlankHtml(html)) return { summary: null, description: null }
  return { summary: htmlToPlainText(html).replace(/\n{3,}/g, "\n\n").trim().slice(0, LIBRARY_SUMMARY_MAX) || null, description: html }
}

/**
 * THE EDITOR'S SAVE: only the fields sent. Then what the result needs: an
 * attached product that is sold must be published, without options, at a
 * price of at least 0.50; an uploaded resource that is sold needs a file and
 * gets (or keeps) the product made for it.
 */
export async function updateItem(db: Db, a: { community: CommunityRow; actorId: string; itemId: string; input: LibraryInput & { coverUrl?: unknown } }): Promise<Answer> {
  const row = await findItem(db, a.community.id, a.itemId)
  if (!row) return refuse(404, "That item is not here.")
  const checked = checkLibraryInput(a.input, { kind: row.kind })
  if (checked.ok === false) return refuse(400, checked.error, checked.field)
  const p = checked.patch
  const update: Record<string, unknown> = {}
  if (p.title !== undefined) update.title = p.title
  if (p.summary !== undefined) Object.assign(update, descriptionFields(p.summary))
  if (a.input.coverUrl !== undefined) {
    if (a.input.coverUrl === null || a.input.coverUrl === "") update.cover_url = null
    else {
      const cover = ownPicture(a.input.coverUrl)
      if (!cover) return refuse(400, "Pick a picture uploaded here.", "cover")
      update.cover_url = cover
    }
  }
  if (p.sectionId !== undefined) {
    if (p.sectionId && !(await readSections(db, a.community.id)).some((s) => s.id === p.sectionId)) return refuse(400, "That section is not here.", "section")
    update.section_id = p.sectionId
  }
  if (p.mode !== undefined) {
    update.access_mode = p.mode
    update.min_level = p.minLevel ?? null
    update.price_cents = p.priceCents ?? null
    if (p.mode === "tier") {
      const live = await tierNamesOf(db, a.community.id)
      const tiers = (p.tierIds ?? []).filter((id) => live.has(id))
      if (!tiers.length) return refuse(400, "Pick at least one tier.", "tiers")
      update.tier_ids = tiers
    } else update.tier_ids = []
    update.member_ids = p.mode === "private" ? await membersHere(db, a.community.id, p.memberIds ?? []) : []
    if (p.mode === "private" && !(update.member_ids as string[]).length) return refuse(400, "Pick at least one member.", "members")
    update.currency = p.mode === "paid" ? await storeCurrency(db, a.community.creator_id ?? null) : null
  }
  if (p.files !== undefined) {
    if (row.kind !== "resource") return refuse(400, "A product's files are edited in the product.", "files")
    const files = await resolveFiles(db, a.community, a.actorId, filesOf(row), p.files)
    if (files.ok === false) return refuse(400, files.error, "files")
    update.files = files.files
  }
  if (p.links !== undefined) {
    if (row.kind !== "resource") return refuse(400, "A product's links are its own.", "links")
    update.links = p.links
  }
  if (p.status !== undefined) {
    update.status = p.status
    if (p.status === "published" && row.status !== "published") update.published_at = new Date().toISOString()
  }

  /* What the item will be, checked whole. */
  const next = { ...row, ...update } as LibraryItemRow
  const product = next.product_id ? ((await productsById(db, [next.product_id])).get(next.product_id) ?? null) : null
  const mode = libraryMode(next.access_mode)
  if (next.status === "published") {
    if (next.kind === "resource" && !filesOf(next).length && !linksOf(next).length) return refuse(400, "Add a file or a link before publishing.", "status")
    if (next.kind === "product" && (!product || product.creator_id !== a.community.creator_id || product.archived === true || product.status === "archived")) return refuse(409, "Its product is no longer in your store.", "status")
  }
  if (mode === "paid") {
    if (next.kind === "product") {
      if (!product || product.status !== "published") return refuse(400, "Publish the product in your store to sell it here.", "price")
      const { data: options } = await db.from("product_variants").select("id").eq("product_id", product.id).limit(1)
      if (((options as unknown[] | null) ?? []).length) return refuse(400, "This product has options, so it sells from its own page. Pick another way to open it.", "price")
      const price = effectivePrice(next, product)
      if (!price || price < LIBRARY_PRICE_MIN_CENTS) return refuse(400, "Set a price of at least 0.50.", "price")
    } else if (next.status === "published" && !filesOf(next).length) return refuse(400, "Add a file to sell this. Links alone stay inside the community.", "price")
  }

  if (Object.keys(update).length) {
    update.updated_at = new Date().toISOString()
    const { error } = await db.from("community_library_items").update(update).eq("id", row.id).eq("community_id", a.community.id)
    if (error) {
      if (missing(error)) return refuse(409, LIBRARY_NOT_READY)
      console.error(`[communities] library update: ${reasonOf(error)}`)
      return refuse(500, "That did not save. Try again.")
    }
  }
  if (next.kind === "resource") {
    const made = await syncMadeProduct(db, a.community, next)
    if (made.ok === false) return made
  }
  await audit(db, { communityId: a.community.id, actorId: a.actorId, actorKind: "member", action: "library.item_updated", targetType: "library_item", targetId: row.id, targetLabel: next.title, detail: { fields: Object.keys(update).filter((k) => k !== "updated_at") } })
  return { ok: true }
}

async function freeSlug(db: Db, creatorId: string, title: string): Promise<string> {
  const tail = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`
  let slug = slugFrom(title)
  const { data } = await db.from("products").select("id").eq("creator_id", creatorId).eq("slug", slug).limit(1)
  if (data && (data as unknown[]).length > 0) slug = `${slug}-${tail()}`
  return avoidReservedProductSlug(slug, tail)
}

/**
 * THE PRODUCT MADE FOR A SOLD RESOURCE. While the resource is sold, it has a
 * product of its own: made for the community (community_id, so no store
 * lists it and its page sends people to the community), digital, at the
 * item's price, published while the item is, its files the item's files
 * (the same stored objects, never a copy). Taken off sale, or unpublished,
 * the product goes back to a draft: nobody can buy it, and everybody who did
 * keeps it in their library.
 */
export async function syncMadeProduct(db: Db, community: CommunityRow, row: LibraryItemRow): Promise<Answer<{ productId: string | null }>> {
  if (row.kind !== "resource" || !community.creator_id) return { ok: true, productId: row.product_id }
  const selling = libraryMode(row.access_mode) === "paid" && typeof row.price_cents === "number" && row.price_cents >= LIBRARY_PRICE_MIN_CENTS
  if (!selling) {
    if (row.made_product && row.product_id) await db.from("products").update({ status: "draft" }).eq("id", row.product_id).eq("creator_id", community.creator_id).eq("community_id", community.id)
    return { ok: true, productId: row.product_id }
  }
  const fields = {
    title: row.title.slice(0, 120),
    description: sanitizeDescription(row.description || (row.summary ? textToHtml(row.summary) : "")),
    thumbnail_url: row.cover_url,
    price_cents: row.price_cents,
    status: row.status === "published" ? "published" : "draft",
  }
  let productId = row.made_product ? row.product_id : null
  if (productId) {
    const { error } = await db.from("products").update(fields).eq("id", productId).eq("creator_id", community.creator_id).eq("community_id", community.id)
    if (error) {
      console.error(`[communities] library product: ${reasonOf(error)}`)
      return refuse(500, "The price could not be saved. Try again.", "price")
    }
  } else {
    const slug = await freeSlug(db, community.creator_id, row.title)
    const { data, error } = await db.from("products").insert({ creator_id: community.creator_id, type: "digital", slug, community_id: community.id, call_to_action: "Buy", whats_included: [], ...fields }).select("id").single()
    if (error || !data) {
      console.error(`[communities] library product made: ${reasonOf(error)}`)
      return refuse(500, "The price could not be saved. Try again.", "price")
    }
    productId = (data as { id: string }).id
    const { error: linkError } = await db.from("community_library_items").update({ product_id: productId, made_product: true }).eq("id", row.id)
    if (linkError) {
      console.error(`[communities] library product link: ${reasonOf(linkError)}`)
      await db.from("products").delete().eq("id", productId)
      return refuse(500, "The price could not be saved. Try again.", "price")
    }
  }
  await syncAssets(db, community, row, productId as string)
  return { ok: true, productId }
}

/** The made product's files: one record per file of the item, at the item's own stored path; a file taken off the item leaves the product too. */
async function syncAssets(db: Db, community: CommunityRow, row: LibraryItemRow, productId: string): Promise<void> {
  if (!community.creator_id) return
  try {
    const { data } = await db.from("digital_assets").select("id, file_path").eq("product_id", productId).limit(500)
    const have = (data as { id: string; file_path: string }[] | null) ?? []
    const want = filesOf(row).map((f) => ({ f, path: communityFilePath(community.creator_id as string, community.id, f.uploaderId, f.fileId, fileExtension(f.name)) }))
    const missingOnes = want.filter((w) => !have.some((h) => h.file_path === w.path))
    if (missingOnes.length) {
      await db.from("digital_assets").insert(
        missingOnes.map((w) => ({ product_id: productId, file_name: w.f.name, file_path: w.path, file_size: w.f.size, storage_bucket: STORAGE_BUCKET, uploaded_by: w.f.uploaderId, upload_status: "completed", metadata: { library_item_id: row.id, library_file_id: w.f.fileId } })),
      )
    }
    const gone = have.filter((h) => !want.some((w) => w.path === h.file_path)).map((h) => h.id)
    if (gone.length) await db.from("digital_assets").delete().in("id", gone).eq("product_id", productId)
  } catch (e) {
    console.error(`[communities] library product files: ${reasonOf(e)}`)
  }
}

/** Out of the Library. A product made for it goes back to a draft, so buyers keep it and nobody new can buy it; an attached product is not touched. */
export async function deleteItem(db: Db, a: { community: CommunityRow; actorId: string; itemId: string }): Promise<Answer> {
  const row = await findItem(db, a.community.id, a.itemId)
  if (!row) return refuse(404, "That item is not here.")
  const { error } = await db.from("community_library_items").delete().eq("id", row.id).eq("community_id", a.community.id)
  if (error) {
    console.error(`[communities] library delete: ${reasonOf(error)}`)
    return refuse(500, "That did not go. Try again.")
  }
  if (row.made_product && row.product_id && a.community.creator_id) await db.from("products").update({ status: "draft" }).eq("id", row.product_id).eq("creator_id", a.community.creator_id).eq("community_id", a.community.id)
  await audit(db, { communityId: a.community.id, actorId: a.actorId, actorKind: "member", action: "library.item_deleted", targetType: "library_item", targetId: row.id, targetLabel: row.title })
  return { ok: true }
}

/** Every item in the new order: exactly the community's items, each once. */
export async function reorderItems(db: Db, a: { communityId: string; ids: unknown }): Promise<Answer> {
  return reorder(db, "community_library_items", a.communityId, a.ids)
}

export async function reorderSections(db: Db, a: { communityId: string; ids: unknown }): Promise<Answer> {
  return reorder(db, "community_library_sections", a.communityId, a.ids)
}

async function reorder(db: Db, table: "community_library_items" | "community_library_sections", communityId: string, ids: unknown): Promise<Answer> {
  const wanted = cleanIds(ids, LIBRARY_ITEMS_MAX)
  if (!Array.isArray(ids) || wanted.length !== ids.length) return refuse(400, "That order could not be read.")
  const { data, error } = await db.from(table).select("id").eq("community_id", communityId).limit(LIBRARY_ITEMS_MAX)
  if (error) return refuse(missing(error) ? 409 : 500, missing(error) ? LIBRARY_NOT_READY : "The order did not save.")
  const here = new Set(((data as { id: string }[] | null) ?? []).map((r) => r.id))
  if (here.size !== wanted.length || !wanted.every((id) => here.has(id))) return refuse(409, "The list changed. Refresh and try again.")
  for (let i = 0; i < wanted.length; i++) {
    const { error: e } = await db.from(table).update({ position: i }).eq("id", wanted[i]).eq("community_id", communityId)
    if (e) return refuse(500, "The order did not save.")
  }
  return { ok: true }
}

export async function createSection(db: Db, a: { communityId: string; name: unknown }): Promise<Answer<{ id: string }>> {
  const checked = checkSectionName(a.name)
  if (checked.ok === false) return refuse(400, checked.error, "name")
  const sections = await readSections(db, a.communityId)
  if (sections.length >= LIBRARY_SECTIONS_MAX) return refuse(409, `Up to ${LIBRARY_SECTIONS_MAX} sections.`)
  if (sections.some((s) => s.name.toLowerCase() === checked.name.toLowerCase())) return refuse(409, "There is a section with that name.", "name")
  const position = await nextPosition(db, "community_library_sections", a.communityId)
  const { data, error } = await db.from("community_library_sections").insert({ community_id: a.communityId, name: checked.name, position }).select("id").single()
  if (error || !data) return refuse(missing(error) ? 409 : 500, missing(error) ? LIBRARY_NOT_READY : "The section could not be added.")
  return { ok: true, id: (data as { id: string }).id }
}

export async function renameSection(db: Db, a: { communityId: string; sectionId: string; name: unknown }): Promise<Answer> {
  const checked = checkSectionName(a.name)
  if (checked.ok === false) return refuse(400, checked.error, "name")
  const sections = await readSections(db, a.communityId)
  if (!sections.some((s) => s.id === a.sectionId)) return refuse(404, "That section is not here.")
  if (sections.some((s) => s.id !== a.sectionId && s.name.toLowerCase() === checked.name.toLowerCase())) return refuse(409, "There is a section with that name.", "name")
  const { error } = await db.from("community_library_sections").update({ name: checked.name }).eq("id", a.sectionId).eq("community_id", a.communityId)
  return error ? refuse(500, "That did not save. Try again.") : { ok: true }
}

/** A section goes; its items stay, with no section. */
export async function deleteSection(db: Db, a: { communityId: string; sectionId: string }): Promise<Answer> {
  const sections = await readSections(db, a.communityId)
  if (!sections.some((s) => s.id === a.sectionId)) return refuse(404, "That section is not here.")
  await db.from("community_library_items").update({ section_id: null }).eq("community_id", a.communityId).eq("section_id", a.sectionId)
  const { error } = await db.from("community_library_sections").delete().eq("id", a.sectionId).eq("community_id", a.communityId)
  return error ? refuse(500, "That did not go. Try again.") : { ok: true }
}

/* ── The About page ─────────────────────────────────────────────────────── */

/**
 * WHAT A VISITOR IS SHOWN (the community's About page): for a public
 * community only, the published items that are not private, the first few,
 * with how each opens. Titles, covers and prices; never a file or a link.
 */
export async function aboutLibrary(db: Db, community: Pick<CommunityRow, "id" | "creator_id" | "visibility">, max = 4): Promise<{ total: number; items: { id: string; title: string; coverUrl: string | null; line: string }[] } | null> {
  if (community.visibility !== "public") return null
  try {
    const settings = await librarySettings(db, community.id)
    if (!settings.enabled) return null
    const { rows } = await readItems(db, community.id)
    const shown = rows.filter((r) => r.status === "published" && libraryMode(r.access_mode) !== "private")
    if (!shown.length) return null
    const products = await productsById(db, shown.map((r) => r.product_id))
    const usable = shown.filter((r) => r.kind !== "product" || (r.product_id && products.get(r.product_id)?.creator_id === community.creator_id && products.get(r.product_id)?.archived !== true))
    if (!usable.length) return null
    const currency = await storeCurrency(db, community.creator_id ?? null)
    return {
      total: usable.length,
      items: usable.slice(0, max).map((r) => {
        const product = r.product_id ? (products.get(r.product_id) ?? null) : null
        const mode = libraryMode(r.access_mode)
        const price = mode === "paid" ? effectivePrice(r, product) : null
        const line = mode === "paid" && price ? programPrice(price, r.currency || (product ? productPriceCurrency(product, currency) : currency)) : mode === "free" ? "Free for members" : "For members"
        return { id: r.id, title: r.title, coverUrl: r.cover_url || product?.thumbnail_url || null, line }
      }),
    }
  } catch (e) {
    console.error(`[communities] about library: ${reasonOf(e)}`)
    return null
  }
}
