/**
 * What /admin/themes may write to a listing, read from a request body. Pure,
 * so tests/theme-marketplace.test.ts checks it without a server: every field
 * is trimmed, bounded and checked here, and anything else in the body is
 * ignored.
 */
import { THEME_CATEGORIES, THEME_TIERS, LISTING_SLUG_RE, slugify, type ThemeTier } from "./marketplace-shared"

export interface ListingInput {
  slug: string
  name: string
  author_name: string
  category: string
  tier: ThemeTier
  price_cents: number
  published: boolean
  sort_order: number
  demo_url: string | null
  screenshots?: string[]
  cover_url?: string | null
  author_avatar_url?: string | null
  /** Sent only when the form has it, so a save before RUN_THEME_RELEASES.sql still works. */
  description?: string | null
}

export type ListingInputResult = { ok: true; value: ListingInput } | { ok: false; error: string }

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "")

/** An address the page will load: https, no credentials in it. */
export function safeHttpsUrl(v: unknown): string | null {
  if (typeof v !== "string" || !v.trim()) return null
  try {
    const u = new URL(v.trim())
    if (u.protocol !== "https:" || u.username || u.password) return null
    return u.toString().slice(0, 600)
  } catch {
    return null
  }
}

export function parseListingInput(body: Record<string, unknown> | null): ListingInputResult {
  if (!body) return { ok: false, error: "Nothing was sent." }
  const name = text(body.name, 80)
  if (!name) return { ok: false, error: "Give the theme a name." }
  const slug = text(body.slug, 64).toLowerCase() || slugify(name)
  if (!LISTING_SLUG_RE.test(slug)) return { ok: false, error: "The address can use lower case letters, digits and dashes." }
  /* "base" names the shared theme in a release (lib/themes/releases-shared.ts), so no listing may take it. */
  if (slug === "base") return { ok: false, error: "That address is taken. Choose another." }
  const author = text(body.author_name ?? body.author, 80) || "Storelib"
  const category = THEME_CATEGORIES.some((c) => c.key === body.category) ? String(body.category) : "general"
  const tier = (THEME_TIERS as readonly unknown[]).includes(body.tier) ? (body.tier as ThemeTier) : "free"
  const rawPrice = Number(body.price_cents)
  const price = tier === "paid" ? Math.round(rawPrice) : 0
  if (tier === "paid" && (!Number.isFinite(price) || price < 100 || price > 1_000_000)) return { ok: false, error: "A paid theme needs a price between $1 and $10,000." }
  const order = Number(body.sort_order)
  const demoRaw = body.demo_url
  const demo = demoRaw === null || demoRaw === "" || demoRaw === undefined ? null : safeHttpsUrl(demoRaw)
  if (demoRaw && !demo) return { ok: false, error: "The demo store needs an https address." }
  const value: ListingInput = {
    slug,
    name,
    author_name: author,
    category,
    tier,
    price_cents: price,
    published: body.published === true,
    sort_order: Number.isFinite(order) ? Math.max(-1000, Math.min(100000, Math.round(order))) : 0,
    demo_url: demo,
  }
  if (Array.isArray(body.screenshots)) value.screenshots = body.screenshots.map(safeHttpsUrl).filter((u): u is string => !!u).slice(0, 12)
  if ("cover_url" in body) value.cover_url = safeHttpsUrl(body.cover_url)
  if ("author_avatar_url" in body) value.author_avatar_url = safeHttpsUrl(body.author_avatar_url)
  if ("description" in body) value.description = typeof body.description === "string" ? body.description.replace(/\s+/g, " ").trim().slice(0, 600) || null : null
  return { ok: true, value }
}

/** The pictures a listing takes, and their ceiling. SVG is left out: it can carry a script. */
export const LISTING_IMAGE_EXTENSIONS: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", avif: "image/avif", gif: "image/gif" }
/** Under a function's 4.5 MB request limit, with room for the form around it. */
export const LISTING_IMAGE_MAX_BYTES = 4 * 1024 * 1024
export type ListingImageKind = "cover" | "phone" | "screenshot" | "avatar"
export const LISTING_IMAGE_KINDS: readonly ListingImageKind[] = ["cover", "phone", "screenshot", "avatar"]
