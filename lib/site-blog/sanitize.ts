/**
 * ===========================================================================
 *  WHAT A CREATOR'S POST MAY CARRY
 * ===========================================================================
 * Every post is cleaned here when it is saved (lib/site-blog/admin.ts) and
 * again when it is drawn (lib/site-blog/render-html.ts), so a row written by
 * hand, an old row or a bug elsewhere still never reaches a reader's browser
 * as script. Pure: no DOM, no database, the same input always gives the same
 * output.
 *
 *   BLOCKS   storelib.com's blog blocks through lib/blog/sanitize.ts
 *            (sanitizeBlocks: inline HTML kept to b i u s a code br, links
 *            through safeHref, media through safeMediaUrl, an embed only from
 *            its provider), without snippets; plus gallery (up to 24
 *            pictures) and button (label, safe link, style), cleaned here.
 *   META     plain text with caps; addresses through safeHref/safeMediaUrl;
 *            ids as uuids or nothing; tags through cleanTag, at most 20.
 */
import { plainText, safeHref, safeMediaUrl, sanitizeBlocks, uniqueAnchors } from "@/lib/blog/sanitize"
import type { SiteBlock } from "./blocks"
import { isBlogHandle, postSlugFrom, isPostSlug } from "./slug"
import type { SiteBlogAuthor, SiteBlogCategory, SiteBlogSettings, SitePostMeta } from "./types"

const MAX_BLOCKS = 2000
const MAX_GALLERY = 24
const MAX_TAGS = 20
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const text = (raw: unknown, max: number) => plainText(raw, max * 2).replace(/\s+/g, " ").trim().slice(0, max)
const longText = (raw: unknown, max: number) => plainText(raw, max).trim()
const blockId = (raw: unknown, i: number) => (typeof raw === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(raw) ? raw : `b${i.toString(36)}${Math.random().toString(36).slice(2, 8)}`)
const uuidOrNull = (raw: unknown) => (typeof raw === "string" && UUID.test(raw) ? raw.toLowerCase() : null)
/** A link a reader may follow from outside the article: http(s), mailto, tel or a path. */
const linkOrEmpty = (raw: unknown) => (typeof raw === "string" ? (safeHref(raw) ?? "") : "")
const mediaOrEmpty = (raw: unknown) => (typeof raw === "string" ? (safeMediaUrl(raw) ?? "") : "")
/** An absolute web address, for a canonical: never a path, a mailto or a script. */
const webUrlOrEmpty = (raw: unknown) => {
  const href = typeof raw === "string" ? safeHref(raw) : null
  return href && /^https?:\/\//i.test(href) ? href : ""
}

function galleryBlock(raw: Record<string, unknown>, id: string): SiteBlock {
  const images = (Array.isArray(raw.images) ? raw.images : [])
    .map((it) => {
      const o = it && typeof it === "object" ? (it as Record<string, unknown>) : {}
      const url = mediaOrEmpty(o.url)
      if (!url) return null
      const caption = text(o.caption, 300)
      return { url, alt: text(o.alt, 300), ...(caption ? { caption } : {}) }
    })
    .filter((x): x is { url: string; alt: string; caption?: string } => !!x)
    .slice(0, MAX_GALLERY)
  const b: SiteBlock = { id, type: "gallery", images }
  const caption = text(raw.caption, 300)
  if (caption) b.caption = caption
  return b
}

function buttonBlock(raw: Record<string, unknown>, id: string): SiteBlock {
  return { id, type: "button", label: text(raw.label, 40), url: linkOrEmpty(raw.url), style: raw.style === "secondary" ? "secondary" : "primary" }
}

/** Every block of a post made safe to store and to draw. See the top of this file. */
export function sanitizeSiteBlocks(input: unknown): SiteBlock[] {
  if (!Array.isArray(input)) return []
  const out: SiteBlock[] = []
  const seen = new Set<string>()
  for (let i = 0; i < input.length && out.length < MAX_BLOCKS; i++) {
    const raw = input[i]
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue
    const r = raw as Record<string, unknown>
    let block: SiteBlock | undefined
    if (r.type === "gallery") block = galleryBlock(r, blockId(r.id, i))
    else if (r.type === "button") block = buttonBlock(r, blockId(r.id, i))
    else if (r.type === "snippet") continue
    else block = sanitizeBlocks([r])[0]
    if (!block) continue
    if (seen.has(block.id)) block = { ...block, id: blockId(null, i) }
    seen.add(block.id)
    out.push(block)
  }
  return uniqueAnchors(out)
}

/** A tag as the blog stores and links it: plain words, lower case, no characters an address would choke on, at most 40 characters. */
export function cleanTag(s: string): string {
  if (typeof s !== "string") return ""
  return plainText(s, 200)
    .toLowerCase()
    .replace(/[\/\\?#%&<>"'`,;:|{}[\]^~]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40)
    .trim()
}

export function emptyPostMeta(): SitePostMeta {
  return {
    title: "",
    slug: "",
    excerpt: "",
    coverImageUrl: "",
    coverAlt: "",
    categoryId: null,
    tags: [],
    authorId: null,
    seoTitle: "",
    seoDescription: "",
    canonicalUrl: "",
    ogTitle: "",
    ogDescription: "",
    ogImageUrl: "",
    noindex: false,
    featured: false,
    publishedAt: null,
  }
}

function isoOrNull(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null
  const t = Date.parse(raw)
  if (!Number.isFinite(t)) return null
  return new Date(t).toISOString()
}

/** A post's slug as typed: cleaned to one, or "" (made from the title when saved). */
function postSlugOrEmpty(raw: unknown): string {
  if (typeof raw !== "string") return ""
  const s = postSlugFrom(raw)
  return isPostSlug(s) ? s : ""
}

/**
 * A post's details made safe. A field missing from `input` keeps the
 * fallback's value, so a partial update only changes what it names.
 */
export function sanitizePostMeta(input: unknown, fallback: SitePostMeta = emptyPostMeta()): SitePostMeta {
  const o = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {}
  const has = (k: keyof SitePostMeta) => Object.prototype.hasOwnProperty.call(o, k) && o[k] !== undefined
  const pick = <K extends keyof SitePostMeta>(k: K, clean: (v: unknown) => SitePostMeta[K]): SitePostMeta[K] => (has(k) ? clean(o[k]) : fallback[k])
  return {
    title: pick("title", (v) => text(v, 200)),
    slug: pick("slug", postSlugOrEmpty),
    excerpt: pick("excerpt", (v) => longText(v, 500)),
    coverImageUrl: pick("coverImageUrl", mediaOrEmpty),
    coverAlt: pick("coverAlt", (v) => text(v, 300)),
    categoryId: pick("categoryId", uuidOrNull),
    tags: pick("tags", (v) => [...new Set((Array.isArray(v) ? v : typeof v === "string" ? v.split(",") : []).map((t) => cleanTag(String(t ?? ""))).filter(Boolean))].slice(0, MAX_TAGS)),
    authorId: pick("authorId", uuidOrNull),
    seoTitle: pick("seoTitle", (v) => text(v, 70)),
    seoDescription: pick("seoDescription", (v) => text(v, 320)),
    canonicalUrl: pick("canonicalUrl", webUrlOrEmpty),
    ogTitle: pick("ogTitle", (v) => text(v, 120)),
    ogDescription: pick("ogDescription", (v) => text(v, 320)),
    ogImageUrl: pick("ogImageUrl", mediaOrEmpty),
    noindex: pick("noindex", (v) => v === true),
    featured: pick("featured", (v) => v === true),
    publishedAt: pick("publishedAt", isoOrNull),
  }
}

export type CategoryInput = Omit<SiteBlogCategory, "id" | "postCount">

/** A category as typed: a name (1–80), its address made from the name when not given. */
export function sanitizeCategoryInput(x: unknown): CategoryInput {
  const o = x && typeof x === "object" ? (x as Record<string, unknown>) : {}
  const name = text(o.name, 80)
  const slug = postSlugFrom(typeof o.slug === "string" && o.slug.trim() ? o.slug : name).slice(0, 80).replace(/-+$/g, "")
  const order = Number(o.sortOrder)
  return {
    name,
    slug,
    description: longText(o.description, 1000),
    sortOrder: Number.isFinite(order) ? Math.max(-100000, Math.min(100000, Math.round(order))) : 0,
    seoTitle: text(o.seoTitle, 70),
    seoDescription: text(o.seoDescription, 320),
  }
}

export type AuthorInput = Omit<SiteBlogAuthor, "id">

/** An author as typed: a name (1–120), a short role and bio, a picture and up to ten links. */
export function sanitizeAuthorInput(x: unknown): AuthorInput {
  const o = x && typeof x === "object" ? (x as Record<string, unknown>) : {}
  const name = text(o.name, 120)
  const slug = postSlugFrom(typeof o.slug === "string" && o.slug.trim() ? o.slug : name).slice(0, 80).replace(/-+$/g, "")
  const links = (Array.isArray(o.links) ? o.links : [])
    .map((l) => {
      const r = l && typeof l === "object" ? (l as Record<string, unknown>) : {}
      const url = linkOrEmpty(r.url)
      if (!url || !/^(https?:|mailto:)/i.test(url)) return null
      return { label: text(r.label, 60) || url.replace(/^https?:\/\/(www\.)?/i, "").split("/")[0], url }
    })
    .filter((l): l is { label: string; url: string } => !!l)
    .slice(0, 10)
  return { name, slug, role: text(o.role, 120), bio: longText(o.bio, 2000), avatarUrl: mediaOrEmpty(o.avatarUrl), links }
}

/** The blog's own settings as typed: only the fields given and valid come back, so a PATCH changes only what it names. */
export function sanitizeBlogSettingsInput(x: unknown): Partial<Omit<SiteBlogSettings, "previousHandles">> {
  const o = x && typeof x === "object" ? (x as Record<string, unknown>) : {}
  const out: Partial<Omit<SiteBlogSettings, "previousHandles">> = {}
  if (typeof o.handle === "string") {
    const h = postSlugFrom(o.handle).slice(0, 63).replace(/-+$/g, "")
    if (isBlogHandle(h)) out.handle = h
  }
  if (o.title !== undefined) out.title = text(o.title, 120)
  if (o.description !== undefined) out.description = longText(o.description, 1000)
  if (o.postsPerPage !== undefined) {
    const n = Math.round(Number(o.postsPerPage))
    if (Number.isFinite(n)) out.postsPerPage = Math.max(1, Math.min(48, n))
  }
  if (o.seoTitle !== undefined) out.seoTitle = text(o.seoTitle, 70)
  if (o.seoDescription !== undefined) out.seoDescription = text(o.seoDescription, 320)
  if (o.ogImageUrl !== undefined) out.ogImageUrl = mediaOrEmpty(o.ogImageUrl)
  return out
}
