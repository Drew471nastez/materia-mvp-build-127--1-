/**
 * ===========================================================================
 *  THE LIBRARY: WHAT A COMMUNITY KEEPS FOR ITS MEMBERS (the rules, pure)
 * ===========================================================================
 * Round 39, the owner: "a library thing that admins can enable in their
 * community to sell resources, digital products, extra stuff". A Library is
 * a place in the community, off until an admin turns it on (part 278,
 * community_library_settings), holding items (community_library_items):
 *
 *   a resource   files and links uploaded straight into it, kept in the
 *                community's own folder of Storelib storage
 *                (lib/communities/server/post-files.ts), never a link to
 *                somewhere a file could be swapped
 *   a product    one of the creator's own digital products, attached: its
 *                files are the product's own
 *
 * WHO OPENS AN ITEM is one of five choices the admin makes:
 *
 *   free     every active member
 *   tier     members of the tiers picked
 *   level    members at a points level or above
 *   paid     bought: a price, paid in a sheet inside the community through
 *            Storelib's own checkout, so the sale is an order like any
 *            other (a receipt, a payout, refunds, the buyer's library). An
 *            uploaded resource that is sold becomes a product made for the
 *            community for that (lib/communities/server/library.ts).
 *   private  only the members picked; nobody else sees it at all
 *
 * Owning the item's product opens it whatever the choice (a member who
 * bought it in the store, or here): that is what a purchase is, and a full
 * refund takes the product out of their library, which locks the item again.
 * Staff (owner, admins, moderators) open everything, drafts included.
 *
 * Plain functions over plain data: the shelf, the item page, every download
 * route, the checkout and the tests all ask the same question here.
 */
import type { Role } from "./types"

export const LIBRARY_MODES = ["free", "tier", "level", "paid", "private"] as const
export type LibraryMode = (typeof LIBRARY_MODES)[number]

export const LIBRARY_KINDS = ["resource", "product"] as const
export type LibraryKind = (typeof LIBRARY_KINDS)[number]

export const LIBRARY_STATUSES = ["draft", "published"] as const
export type LibraryStatus = (typeof LIBRARY_STATUSES)[number]

export const LIBRARY_TITLE_MAX = 120
export const LIBRARY_SUMMARY_MAX = 2000
export const LIBRARY_DESCRIPTION_MAX = 60_000
export const LIBRARY_FILES_MAX = 20
export const LIBRARY_LINKS_MAX = 10
export const LIBRARY_ITEMS_MAX = 500
export const LIBRARY_SECTIONS_MAX = 30
export const SECTION_NAME_MAX = 40
export const LINK_LABEL_MAX = 80
export const LINK_URL_MAX = 2000
export const LIBRARY_TIERS_MAX = 50
export const LIBRARY_MEMBERS_MAX = 1000
export const LIBRARY_MAX_LEVEL = 20
/** Stripe's smallest card charge, and the ceiling part 278 holds a price to. */
export const LIBRARY_PRICE_MIN_CENTS = 50
export const LIBRARY_PRICE_MAX_CENTS = 99_999_999

const STAFF: readonly Role[] = ["owner", "admin", "moderator"]
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const isLibraryId = (v: unknown): v is string => typeof v === "string" && UUID.test(v)

/** A file of a resource as stored: the id its path is built from, the name it saves under, its size, and who uploaded it (whose folder it is in). */
export interface LibraryFile {
  fileId: string
  name: string
  size: number
  uploaderId: string
}

/** A link of a resource: where it goes and what it is called. */
export interface LibraryLink {
  url: string
  label: string
}

/** An item as the rules need it. */
export interface LibraryRule {
  status: LibraryStatus | string
  mode: LibraryMode | string
  tierIds?: readonly string[] | null
  minLevel?: number | null
  /** What it costs when it is sold: its own price, or its product's. */
  priceCents?: number | null
  memberIds?: readonly string[] | null
}

export interface LibraryViewer {
  userId: string | null
  role: Role | null
  active: boolean
  tierId: string | null
  level: number
  /** The viewer owns the item's product (an entitlement): bought here or in the store. */
  owns: boolean
}

export type LibraryGate =
  | { open: true; via: "staff" | "member" | "purchase" }
  | { open: false; reason: "not_member" | "draft" | "private" }
  | { open: false; reason: "tier"; tierIds: string[] }
  | { open: false; reason: "level"; level: number }
  | { open: false; reason: "paid"; priceCents: number | null }

export function isStaffRole(role: Role | null | undefined): boolean {
  return !!role && STAFF.includes(role)
}

/** Ids as stored: uuids, each once, lower case, at most `max`. */
export function cleanIds(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((v): v is string => typeof v === "string" && UUID.test(v)).map((v) => v.toLowerCase()))].slice(0, max)
}

/** The mode a stored row is in; anything unknown reads as free. */
export function libraryMode(value: unknown): LibraryMode {
  return (LIBRARY_MODES as readonly unknown[]).includes(value) ? (value as LibraryMode) : "free"
}

/**
 * WHETHER THIS VIEWER MAY OPEN THIS ITEM, and if not, the one thing in the
 * way. In order: a member at all; staff open everything; a draft is staff
 * only; a private item's list; owning its product; then the choice.
 */
export function libraryGate(item: LibraryRule, v: LibraryViewer): LibraryGate {
  if (!v.active || !v.role) return { open: false, reason: "not_member" }
  if (isStaffRole(v.role)) return { open: true, via: "staff" }
  if (item.status !== "published") return { open: false, reason: "draft" }
  const mode = libraryMode(item.mode)
  if (mode === "private") {
    const me = (v.userId ?? "").toLowerCase()
    return me && cleanIds(item.memberIds, LIBRARY_MEMBERS_MAX).includes(me) ? { open: true, via: "member" } : { open: false, reason: "private" }
  }
  if (v.owns) return { open: true, via: "purchase" }
  if (mode === "free") return { open: true, via: "member" }
  if (mode === "tier") {
    const tiers = cleanIds(item.tierIds, LIBRARY_TIERS_MAX)
    return v.tierId && tiers.includes(v.tierId.toLowerCase()) ? { open: true, via: "member" } : { open: false, reason: "tier", tierIds: tiers }
  }
  if (mode === "level") {
    const need = Math.max(2, Math.floor(Number(item.minLevel) || 2))
    return (v.level || 1) >= need ? { open: true, via: "member" } : { open: false, reason: "level", level: need }
  }
  return { open: false, reason: "paid", priceCents: typeof item.priceCents === "number" && item.priceCents > 0 ? item.priceCents : null }
}

/** On the shelf at all: a private item off the viewer's list and a draft (for a member) are not there. */
export function onShelf(gate: LibraryGate): boolean {
  return gate.open || (gate.reason !== "private" && gate.reason !== "draft" && gate.reason !== "not_member")
}

/* ── Links ──────────────────────────────────────────────────────────────── */

/** A link's address, if it is one a member may be sent to: http or https, no credentials in it, not too long. */
export function cleanLinkUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const v = raw.trim()
  if (!v || v.length > LINK_URL_MAX) return null
  let u: URL
  try {
    u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`)
  } catch {
    return null
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null
  if (u.username || u.password || !u.hostname.includes(".")) return null
  return u.toString()
}

/** What a link is called: its own label, or its host. */
export function linkLabel(link: { url: string; label?: string | null }): string {
  const own = (link.label ?? "").replace(/\s+/g, " ").trim()
  if (own) return own.slice(0, LINK_LABEL_MAX)
  try {
    return new URL(link.url).hostname.replace(/^www\./, "")
  } catch {
    return "Link"
  }
}

export function linkHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return ""
  }
}

/* ── What the editor sends, checked ─────────────────────────────────────── */

export interface LibraryInput {
  title?: unknown
  summary?: unknown
  coverUrl?: unknown
  status?: unknown
  sectionId?: unknown
  mode?: unknown
  tierIds?: unknown
  level?: unknown
  priceCents?: unknown
  memberIds?: unknown
  files?: unknown
  links?: unknown
}

export interface LibraryPatch {
  title?: string
  /** The description as sent (rich HTML or plain); the server cleans it and keeps a plain copy. */
  summary?: string | null
  status?: LibraryStatus
  sectionId?: string | null
  mode?: LibraryMode
  tierIds?: string[]
  minLevel?: number | null
  /** A price of its own; null for a product sold at its own price, or anything that is not sold. */
  priceCents?: number | null
  memberIds?: string[]
  /** The files as the editor holds them, by id; the server finds each one where it was uploaded. */
  files?: { fileId: string; name: string }[]
  links?: LibraryLink[]
}

export type LibraryCheck = { ok: true; patch: LibraryPatch } | { ok: false; field: string; error: string }

/**
 * The editor's fields, each checked on its own, so a save that names one
 * field changes only that one. The cover, the files' bytes, the tiers and
 * the members are checked again by the server against what is really there.
 */
export function checkLibraryInput(input: LibraryInput, opts: { requireTitle?: boolean; kind?: LibraryKind } = {}): LibraryCheck {
  const patch: LibraryPatch = {}
  if (input.title !== undefined || opts.requireTitle) {
    const title = typeof input.title === "string" ? input.title.replace(/\s+/g, " ").trim() : ""
    if (!title) return { ok: false, field: "title", error: "Give it a name." }
    if (title.length > LIBRARY_TITLE_MAX) return { ok: false, field: "title", error: `Keep the name under ${LIBRARY_TITLE_MAX} characters.` }
    patch.title = title
  }
  if (input.summary !== undefined) {
    const summary = typeof input.summary === "string" ? input.summary.trim() : ""
    const max = /<[a-z][\s\S]*>/i.test(summary) ? LIBRARY_DESCRIPTION_MAX : LIBRARY_SUMMARY_MAX
    if (summary.length > max) return { ok: false, field: "summary", error: `Keep the description under ${max.toLocaleString("en-US")} characters.` }
    patch.summary = summary || null
  }
  if (input.status !== undefined) {
    if (!(LIBRARY_STATUSES as readonly unknown[]).includes(input.status)) return { ok: false, field: "status", error: "Pick draft or published." }
    patch.status = input.status as LibraryStatus
  }
  if (input.sectionId !== undefined) {
    if (input.sectionId === null || input.sectionId === "") patch.sectionId = null
    else if (isLibraryId(input.sectionId)) patch.sectionId = input.sectionId.toLowerCase()
    else return { ok: false, field: "section", error: "Pick a section." }
  }
  if (input.mode !== undefined) {
    if (!(LIBRARY_MODES as readonly unknown[]).includes(input.mode)) return { ok: false, field: "mode", error: "Pick who can open it." }
    const mode = input.mode as LibraryMode
    patch.mode = mode
    patch.tierIds = []
    patch.minLevel = null
    patch.priceCents = null
    patch.memberIds = []
    if (mode === "tier") {
      const tiers = cleanIds(input.tierIds, LIBRARY_TIERS_MAX)
      if (!tiers.length) return { ok: false, field: "tiers", error: "Pick at least one tier." }
      patch.tierIds = tiers
    }
    if (mode === "level") {
      const level = Math.floor(Number(input.level))
      if (!Number.isFinite(level) || level < 2 || level > LIBRARY_MAX_LEVEL) return { ok: false, field: "level", error: `Pick a level from 2 to ${LIBRARY_MAX_LEVEL}.` }
      patch.minLevel = level
    }
    if (mode === "paid") {
      if (input.priceCents === null || input.priceCents === undefined || input.priceCents === "") {
        /* A product sold at the price it has; an uploaded resource needs one (the server says so: it knows the kind). */
        if (opts.kind === "resource") return { ok: false, field: "price", error: "Set a price of at least 0.50." }
        patch.priceCents = null
      } else {
        const cents = typeof input.priceCents === "number" ? Math.round(input.priceCents) : Number.NaN
        if (!Number.isFinite(cents) || cents < LIBRARY_PRICE_MIN_CENTS) return { ok: false, field: "price", error: "Set a price of at least 0.50." }
        if (cents > LIBRARY_PRICE_MAX_CENTS) return { ok: false, field: "price", error: "That price is too high." }
        patch.priceCents = cents
      }
    }
    if (mode === "private") {
      if (input.memberIds !== undefined && !Array.isArray(input.memberIds)) return { ok: false, field: "members", error: "Pick the members it is for." }
      if (Array.isArray(input.memberIds) && input.memberIds.length > LIBRARY_MEMBERS_MAX) return { ok: false, field: "members", error: `A private item is for up to ${LIBRARY_MEMBERS_MAX.toLocaleString("en-US")} members.` }
      patch.memberIds = cleanIds(input.memberIds, LIBRARY_MEMBERS_MAX)
    }
  }
  if (input.files !== undefined) {
    if (!Array.isArray(input.files)) return { ok: false, field: "files", error: "Those files could not be read. Add them again." }
    if (input.files.length > LIBRARY_FILES_MAX) return { ok: false, field: "files", error: `Up to ${LIBRARY_FILES_MAX} files in one item.` }
    const files: { fileId: string; name: string }[] = []
    for (const f of input.files) {
      const fileId = (f as { fileId?: unknown })?.fileId
      const name = (f as { name?: unknown })?.name
      if (!isLibraryId(fileId) || typeof name !== "string" || !name.trim()) return { ok: false, field: "files", error: "Those files could not be read. Add them again." }
      if (!files.some((x) => x.fileId === fileId.toLowerCase())) files.push({ fileId: fileId.toLowerCase(), name: name.trim().slice(0, 255) })
    }
    patch.files = files
  }
  if (input.links !== undefined) {
    if (!Array.isArray(input.links)) return { ok: false, field: "links", error: "Those links could not be read." }
    if (input.links.length > LIBRARY_LINKS_MAX) return { ok: false, field: "links", error: `Up to ${LIBRARY_LINKS_MAX} links in one item.` }
    const links: LibraryLink[] = []
    for (const l of input.links) {
      const url = cleanLinkUrl((l as { url?: unknown })?.url)
      if (!url) return { ok: false, field: "links", error: "A link needs a full web address, like https://example.com/guide." }
      const raw = (l as { label?: unknown })?.label
      const label = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim().slice(0, LINK_LABEL_MAX) : ""
      links.push({ url, label })
    }
    patch.links = links
  }
  return { ok: true, patch }
}

/** A section's name, checked. */
export function checkSectionName(raw: unknown): { ok: true; name: string } | { ok: false; error: string } {
  const name = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim() : ""
  if (!name) return { ok: false, error: "Give the section a name." }
  if (name.length > SECTION_NAME_MAX) return { ok: false, error: `Keep the name under ${SECTION_NAME_MAX} characters.` }
  return { ok: true, name }
}

/* ── Addresses ──────────────────────────────────────────────────────────── */

export function libraryHref(slug: string): string {
  return `/community/${slug}/library`
}

export function resourceHref(slug: string, itemId: string): string {
  return `${libraryHref(slug)}/${itemId}`
}

/** The download route for one file of an item: a resource's own file or its product's (the route decides which, and who). */
export function libraryFileHref(communityId: string, itemId: string, fileId: string): string {
  return `/api/community/${communityId}/library/${itemId}/files/${fileId}`
}

export function libraryLinkHref(communityId: string, itemId: string, index: number): string {
  return `/api/community/${communityId}/library/${itemId}/links/${index}`
}
