import type {VariantPriceFacts} from "@/lib/pricing/variant-price"
import type {ProductBlockData} from "./types"
// OnePage: the rules behind the blocks that show Storelib's own things and the
// creator's social reach (components/onepage/storelib-blocks.tsx draws them).
// Location: lib/onepage/storelib-blocks.ts
//
// Plain functions, no React and no server, so the live page's server code,
// the editor and the tests read the same answers.
//
//   storelib_shelf   a row of the creator's own live products of one kind
//                    (digital, physical, course, membership) or their public
//                    communities, read from Storelib at render
//                    (./storelib-blocks-server), never from a saved copy.
//   lead_magnet      a free download, a discount code or a waitlist, given
//                    for an email in a sheet (app/api/onepage/lead-magnet).
//   social_posts     a sliding row of posts: a YouTube channel's latest
//                    videos from its public feed (synced at render), or
//                    Instagram, TikTok and YouTube posts pasted by address.
//   followers        "1.2M followers" summed over the networks the creator
//                    names, each with its own count; Bluesky and YouTube can
//                    be read again from the network (app/api/onepage/followers).
//   promo_code       a referral or discount code for another brand, with a
//                    copy button and the link it is used at.

export const STORELIB_BLOCK_TYPES = ["storelib_shelf", "lead_magnet", "social_posts", "followers", "promo_code"] as const
export type StorelibBlockType = (typeof STORELIB_BLOCK_TYPES)[number]

export function isStorelibBlock(block: { type: string }): boolean {
  return (STORELIB_BLOCK_TYPES as readonly string[]).includes(block.type)
}

/* ─── Shelf: the creator's own products or communities ────────────────── */

export const SHELF_SOURCES = ["digital", "physical", "course", "membership", "community", "all"] as const
export type ShelfSource = (typeof SHELF_SOURCES)[number]

export interface ShelfItem extends VariantPriceFacts {
  id: string
  /** The product's type, or "community". */
  kind: string
  title: string
  href: string
  image: string | null
  /** Null for a community, whose price line is its own. */
  price_cents: number | null
  /** A membership's billing period. */
  interval?: "month" | "year" | null
  /** "Free", "$19/month", "1,204 members": a community's line, said by the community. */
  meta?: string | null
}

export interface StorelibShelfBlockData {
  product_settings?:Partial<ProductBlockData>
  product_overrides?:Record<string,Partial<ProductBlockData>>
  /** "simple": the plain picture cards, even with product card settings saved. */
  card_style?: "simple" | null
  source: ShelfSource
  title?: string | null
  /** Round AR: "featured", a community drawn as one large card with its cover, its line and Join. */
  layout?: "carousel" | "list" | "grid" | "featured"
  /** A carousel's cards in view (round AL). Missing: the width each kind of card always had. */
  carousel_view?: "1" | "1.2" | "1.5" | "2" | null
  /** How many to show, 1 to 12. */
  limit?: number
  /**
   * Round AP: which of them. "all" (or nothing saved): every one of the kind, newest first, up to `limit`.
   * "some": the ones in `product_ids`, in that order. "one": the first of `product_ids` alone. Ids only: the
   * products themselves are read live on the server, and only the page owner's (shelfItems filters by creator).
   */
  pick?: ShelfPick | null
  product_ids?: string[] | null
  /**
   * What the live page draws, filled by the server at render
   * (./storelib-blocks-server withStorelibBlocks). Never saved: the editor
   * strips it (stripResolved) so a draft never holds a copy of a product.
   */
  items?: ShelfItem[] | null
}

export const SHELF_LIMIT_MAX = 12

export const SHELF_PICKS = ["all", "some", "one"] as const
export type ShelfPick = (typeof SHELF_PICKS)[number]

const PRODUCT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The shelf's choice: "all" unless it names products. A community shelf is always all of them. */
export function shelfPick(data: Pick<StorelibShelfBlockData, "pick" | "source"> | null | undefined): ShelfPick {
  if (!data || shelfSource(data.source) === "community") return "all"
  return data.pick === "some" || data.pick === "one" ? data.pick : "all"
}

/**
 * The products a shelf names, in its order: well formed ids only, each once, at most SHELF_LIMIT_MAX, the first
 * alone for "one". Null when the shelf shows all of its kind.
 */
export function shelfPickedIds(data: Pick<StorelibShelfBlockData, "pick" | "source" | "product_ids"> | null | undefined): string[] | null {
  const pick = shelfPick(data)
  if (pick === "all") return null
  const ids = [...new Set((Array.isArray(data?.product_ids) ? data!.product_ids : []).filter((id): id is string => typeof id === "string" && PRODUCT_ID.test(id)).map((id) => id.toLowerCase()))]
  return pick === "one" ? ids.slice(0, 1) : ids.slice(0, SHELF_LIMIT_MAX)
}

/** Drawn as product blocks (one of the product layouts) rather than the plain picture cards. Saved settings stay when "simple" is picked. */
export function shelfUsesProductCards(data: Pick<StorelibShelfBlockData, "product_settings" | "card_style"> | null | undefined): boolean {
  return !!data?.product_settings && data.card_style !== "simple"
}

export function shelfSource(value: unknown): ShelfSource {
  return typeof value === "string" && (SHELF_SOURCES as readonly string[]).includes(value) ? (value as ShelfSource) : "all"
}

export function shelfLimit(value: unknown): number {
  const n = typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : 6
  return Math.min(SHELF_LIMIT_MAX, Math.max(1, n))
}

/** A product row's type matches the shelf's source. `all` takes every product kind, never a community. */
export function shelfTakes(source: ShelfSource, type: string | null | undefined): boolean {
  if (source === "community") return false
  if (source === "all") return true
  return (type || "digital") === source
}

/* ─── Lead magnets ───────────────────────────────────────────────────── */

export const LEAD_MAGNET_KINDS = ["download", "discount", "waitlist"] as const
export type LeadMagnetKind = (typeof LEAD_MAGNET_KINDS)[number]

export interface LeadMagnetBlockData {
  kind: LeadMagnetKind
  title: string
  description?: string | null
  button_text?: string | null
  image_url?: string | null
  ask_name?: boolean
  success_message?: string | null
  /** download: one of the creator's free products, emailed as a link (app/api/onepage/email-capture). */
  product_id?: string | null
  product_title?: string | null
  product_thumbnail?: string | null
  /** discount: one of the creator's codes. The code itself is never in the page; the server gives it after the signup. */
  coupon_id?: string | null
  /** "15% off", for the editor's row and the block's line. Not the code. */
  coupon_label?: string | null
  /** waitlist: what they are waiting for, kept with the lead. */
  waitlist_name?: string | null
}

export function leadMagnetKind(value: unknown): LeadMagnetKind {
  return typeof value === "string" && (LEAD_MAGNET_KINDS as readonly string[]).includes(value) ? (value as LeadMagnetKind) : "download"
}

/** Is the block ready to show: a download names a product, a discount a code, a waitlist always is. */
export function leadMagnetReady(data: Partial<LeadMagnetBlockData> | null | undefined): boolean {
  if (!data) return false
  const kind = leadMagnetKind(data.kind)
  if (kind === "download") return !!(data.product_id || "").trim()
  if (kind === "discount") return !!(data.coupon_id || "").trim()
  return true
}

/** The words of the block's button when the creator left them empty. */
export function leadMagnetButton(kind: LeadMagnetKind): "Get it free" | "Get my code" | "Join the waitlist" {
  return kind === "download" ? "Get it free" : kind === "discount" ? "Get my code" : "Join the waitlist"
}

/** A coupon as the block's line says it: "15% off", "$5 off" is drawn by the page with its money format. */
export function couponLabel(c: { discount_type?: string | null; discount_value?: number | string | null } | null | undefined): string | null {
  /* numeric(10,2) comes back from PostgREST as a number or a string. */
  const v = typeof c?.discount_value === "string" ? Number.parseFloat(c.discount_value) : c?.discount_value
  if (!c || typeof v !== "number" || !Number.isFinite(v) || !(v > 0)) return null
  if (c.discount_type === "percentage") return `${Math.round(v)}% off`
  return null
}

/** A coupon a signup may be given now: on, started, not ended, not used up. */
export function couponUsable(
  c: { is_active?: boolean | null; starts_at?: string | null; expires_at?: string | null; usage_limit?: number | null; usage_count?: number | null } | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!c) return false
  if (c.is_active === false) return false
  const start = c.starts_at ? Date.parse(c.starts_at) : NaN
  const end = c.expires_at ? Date.parse(c.expires_at) : NaN
  if (!Number.isNaN(start) && now < start) return false
  if (!Number.isNaN(end) && now >= end) return false
  const used = typeof c.usage_count === "number" ? c.usage_count : 0
  if (typeof c.usage_limit === "number" && c.usage_limit > 0 && used >= c.usage_limit) return false
  return true
}

/* ─── Social posts ───────────────────────────────────────────────────── */

export const SOCIAL_POST_NETWORKS = ["youtube", "instagram", "tiktok"] as const
export type SocialPostsNetwork = (typeof SOCIAL_POST_NETWORKS)[number]

export interface SocialPostItem {
  kind: "youtube" | "instagram" | "tiktok"
  id: string
  url: string
  /** A picture to show before it plays. Instagram has none without a Meta app key: its post is shown in its own embed. */
  thumb: string | null
  title?: string | null
}

export interface SocialPostsBlockData {
  /** Embedded players (native), cards that open the post, or square media tiles. */
  presentation?:"native"|"card"|"tile"
  /** A card's or tile's picture shape, and the soft fade at its foot. */
  aspect?:"auto"|"1/1"|"4/5"|"16/9"|"9/16"
  fade?:boolean
  layout?:"carousel"|"grid"|"list"|"single"
  thumbnails?:Record<string,string|null>
  network: SocialPostsNetwork
  title?: string | null
  /** YouTube: a channel's address. Its latest videos come from the channel's public feed, read again every hour. */
  channel_url?: string | null
  /** Posts pasted by address, in the creator's order. */
  post_urls?: string[]
  /** How many from a channel, 3 to 12. */
  limit?: number
  /** Filled by the server for the live page; never saved. */
  items?: SocialPostItem[] | null
}

export const SOCIAL_POSTS_MAX = 12

const SAFE_ID = /^[A-Za-z0-9_-]+$/

function urlOf(raw: string | null | undefined): URL | null {
  const text = (raw || "").trim()
  if (!text) return null
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`)
    return url.protocol === "https:" || url.protocol === "http:" ? url : null
  } catch {
    return null
  }
}

/** One pasted post: an Instagram post or reel, a TikTok video, or a YouTube video or short. Null for anything else. */
export function socialPost(raw: string | null | undefined): SocialPostItem | null {
  const url = urlOf(raw)
  if (!url) return null
  const host = url.hostname.toLowerCase().replace(/^(www|m)\./, "")
  const parts = url.pathname.split("/").filter(Boolean)
  if (host === "instagram.com") {
    const at = parts.findIndex((p) => p === "p" || p === "reel" || p === "reels" || p === "tv")
    const id = at >= 0 ? parts[at + 1] : ""
    if (!id || !SAFE_ID.test(id)) return null
    const kind = parts[at] === "reels" ? "reel" : parts[at]
    return { kind: "instagram", id, url: `https://www.instagram.com/${kind}/${id}/`, thumb: null }
  }
  if (host === "tiktok.com") {
    const at = parts.indexOf("video")
    const id = at >= 0 ? parts[at + 1] : ""
    if (!/^\d{8,25}$/.test(id || "") || !parts[0]?.startsWith("@")) return null
    return { kind: "tiktok", id, url: `https://www.tiktok.com/${parts[0]}/video/${id}`, thumb: null }
  }
  if (host === "youtube.com" || host === "youtu.be" || host === "music.youtube.com") {
    let id = ""
    if (host === "youtu.be") id = parts[0] || ""
    else if (parts[0] === "watch") id = url.searchParams.get("v") || ""
    else if (parts[0] === "shorts" || parts[0] === "live" || parts[0] === "embed") id = parts[1] || ""
    if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return null
    return { kind: "youtube", id, url: `https://www.youtube.com/watch?v=${id}`, thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` }
  }
  return null
}

export type YouTubeChannel = { kind: "id"; id: string } | { kind: "handle"; handle: string }

/** A YouTube channel's address: /channel/UC..., /@handle, or a bare @handle. Null for anything else. */
export function youtubeChannel(raw: string | null | undefined): YouTubeChannel | null {
  const text = (raw || "").trim()
  if (/^@[A-Za-z0-9._-]{3,30}$/.test(text)) return { kind: "handle", handle: text.slice(1) }
  const url = urlOf(text)
  if (!url) return null
  const host = url.hostname.toLowerCase().replace(/^(www|m)\./, "")
  if (host !== "youtube.com") return null
  const parts = url.pathname.split("/").filter(Boolean)
  if (parts[0] === "channel" && /^UC[A-Za-z0-9_-]{22}$/.test(parts[1] || "")) return { kind: "id", id: parts[1] }
  if (parts[0]?.startsWith("@") && /^@[A-Za-z0-9._-]{3,30}$/.test(parts[0])) return { kind: "handle", handle: parts[0].slice(1) }
  return null
}

/** The channel's public feed (no key): its latest fifteen videos. */
export function youtubeFeedUrl(channelId: string): string | null {
  return /^UC[A-Za-z0-9_-]{22}$/.test(channelId) ? `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}` : null
}

/** The videos in a channel's feed, newest first, as items. A feed that cannot be read gives none. */
export function parseYouTubeFeed(xml: string, limit: number = SOCIAL_POSTS_MAX): SocialPostItem[] {
  const out: SocialPostItem[] = []
  const entries = xml.split("<entry>").slice(1)
  for (const entry of entries) {
    const id = entry.match(/<yt:videoId>([A-Za-z0-9_-]{11})<\/yt:videoId>/)?.[1]
    if (!id) continue
    const title = entry.match(/<title>([^<]{0,300})<\/title>/)?.[1] ?? null
    out.push({ kind: "youtube", id, url: `https://www.youtube.com/watch?v=${id}`, thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, title: title ? decodeXml(title) : null })
    if (out.length >= limit) break
  }
  return out
}

/** The channel id a channel page carries, for a @handle. */
export function channelIdFromPage(html: string): string | null {
  const m = html.match(/"(?:externalId|channelId)":"(UC[A-Za-z0-9_-]{22})"/) || html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[A-Za-z0-9_-]{22})"/)
  return m ? m[1] : null
}

function decodeXml(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
}

/** The posts a block names by address, checked, at most twelve, each once. */
export function pastedPosts(data: Pick<SocialPostsBlockData, "post_urls" | "network"> | null | undefined): SocialPostItem[] {
  const seen = new Set<string>()
  const out: SocialPostItem[] = []
  for (const raw of Array.isArray(data?.post_urls) ? data!.post_urls : []) {
    const p = typeof raw === "string" ? socialPost(raw) : null
    if (!p) continue
    const key = `${p.kind}:${p.id}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(p)
    if (out.length >= SOCIAL_POSTS_MAX) break
  }
  return out
}

/* ─── Followers ──────────────────────────────────────────────────────── */

export const FOLLOWER_NETWORKS = ["instagram", "tiktok", "youtube", "twitter", "facebook", "threads", "bluesky", "twitch", "linkedin", "pinterest", "snapchat", "spotify"] as const
export type FollowerNetwork = (typeof FOLLOWER_NETWORKS)[number]

/** The networks whose own public answer can be read again: Bluesky with no key, YouTube with the deployment's YOUTUBE_API_KEY. */
export const REFRESHABLE_NETWORKS: readonly FollowerNetwork[] = ["bluesky", "youtube"]

export interface FollowerEntry {
  network: FollowerNetwork
  handle?: string | null
  count: number | null
  refreshed_at?: string | null
}

export interface FollowersBlockData {
  networks: FollowerEntry[]
  /** What the total is of: "followers" by default. */
  label?: string | null
  /** "line": one line of text with the marks; "card": the total big, each network under it. */
  style?: "line" | "card"
}

/* i18n-ignore-start: hosts. */
const FOLLOWER_HOSTS: Record<string, FollowerNetwork> = {
  "instagram.com": "instagram", "tiktok.com": "tiktok", "youtube.com": "youtube", "youtu.be": "youtube", "x.com": "twitter", "twitter.com": "twitter",
  "facebook.com": "facebook", "fb.com": "facebook", "threads.net": "threads", "threads.com": "threads", "bsky.app": "bluesky", "twitch.tv": "twitch",
  "linkedin.com": "linkedin", "pinterest.com": "pinterest", "snapchat.com": "snapchat", "open.spotify.com": "spotify",
}
/* i18n-ignore-end */

/**
 * ROUND AR3, "TOTAL FOLLOWERS" IN ONE FIELD. The owner: "make the setup for
 * the total followers more easy ... add user as like @, or link". A pasted
 * profile address says its network and the account; a bare @handle says only
 * the account, so the network is asked for (network null). A Bluesky handle
 * (name.bsky.social) is Bluesky's. Null for anything that is neither.
 */
export function detectFollowerInput(raw: string | null | undefined): { network: FollowerNetwork | null; handle: string } | null {
  const text = (raw || "").trim()
  if (!text || text.length > 300 || /\s/.test(text)) return null
  if (/^@?[A-Za-z0-9_.-]+\.bsky\.social$/i.test(text)) return { network: "bluesky", handle: text.replace(/^@/, "").toLowerCase() }
  if (/^@?[A-Za-z0-9_.]{1,40}$/.test(text) && !/^https?:/i.test(text) && !text.includes("..") && !/\.(com|net|app|tv|be)$/i.test(text)) return { network: null, handle: text.replace(/^@/, "") }
  let u: URL
  try {
    u = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`)
  } catch {
    return null
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null
  const host = u.hostname.toLowerCase().replace(/^(www|m|mobile)\./, "")
  const network = FOLLOWER_HOSTS[host]
  if (!network) return null
  const parts = u.pathname.split("/").filter(Boolean)
  let handle = ""
  if (network === "youtube") handle = parts[0]?.startsWith("@") ? parts[0] : parts[0] === "channel" || parts[0] === "c" || parts[0] === "user" ? parts[1] || "" : ""
  else if (network === "bluesky") handle = parts[0] === "profile" ? parts[1] || "" : ""
  else if (network === "linkedin") handle = parts[0] === "in" || parts[0] === "company" ? parts[1] || "" : ""
  else if (network === "snapchat") handle = parts[0] === "add" ? parts[1] || "" : parts[0] || ""
  else if (network === "spotify") handle = parts[0] === "artist" ? parts[1] || "" : ""
  else handle = parts[0] || ""
  handle = network === "youtube" ? handle : handle.replace(/^@/, "")
  if (!handle || !/^@?[A-Za-z0-9_.-]{1,80}$/.test(handle)) return { network, handle: "" }
  return { network, handle }
}

export function isFollowerNetwork(v: unknown): v is FollowerNetwork {
  return typeof v === "string" && (FOLLOWER_NETWORKS as readonly string[]).includes(v)
}

/** A count as typed: "12.5k", "1,204", "2M". Null for anything that is not a count. */
export function parseCount(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : null
  if (typeof raw !== "string") return null
  const t = raw.trim().toLowerCase().replace(/[,\s_]/g, "")
  const m = t.match(/^(\d+(?:\.\d+)?)([kmb])?$/)
  if (!m) return null
  const n = Number.parseFloat(m[1]) * (m[2] === "k" ? 1e3 : m[2] === "m" ? 1e6 : m[2] === "b" ? 1e9 : 1)
  return Number.isFinite(n) && n < 1e11 ? Math.round(n) : null
}

/** The total over every network with a count, each network once. */
export function followerTotal(entries: readonly FollowerEntry[] | null | undefined): number {
  const seen = new Set<string>()
  let total = 0
  for (const e of entries || []) {
    if (!e || !isFollowerNetwork(e.network) || seen.has(e.network)) continue
    if (typeof e.count !== "number" || !Number.isFinite(e.count) || e.count < 0) continue
    seen.add(e.network)
    total += Math.floor(e.count)
  }
  return total
}

/** 950, 12.5K, 1.2M, 250K: one decimal under a hundred, none above, as Link.me and Instagram show it. */
export function compactCount(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "0"
  const units: [number, string][] = [[1e9, "B"], [1e6, "M"], [1e3, "K"]]
  for (const [size, unit] of units) {
    if (n >= size) {
      const v = n / size
      const shown = v < 100 ? Math.floor(v * 10) / 10 : Math.floor(v)
      return `${String(shown).replace(/\.0$/, "")}${unit}`
    }
  }
  return String(Math.floor(n))
}

/** A Bluesky handle, as the public API takes it: "name.bsky.social" or a domain. */
export function blueskyHandle(raw: string | null | undefined): string | null {
  let t = (raw || "").trim().replace(/^@/, "")
  const m = t.match(/bsky\.app\/profile\/([^/?#]+)/i)
  if (m) t = m[1]
  return /^[a-z0-9][a-z0-9.-]{1,252}\.[a-z]{2,}$/i.test(t) ? t.toLowerCase() : null
}

/* ─── Promo and referral codes ───────────────────────────────────────── */

export interface PromoCodeBlockData {
  title: string
  code: string
  description?: string | null
  /** Where the code is used. */
  url?: string | null
  /**
   * Round AR: one of the store's own codes (Coupons). The live page's server
   * reads the code from the coupon each time (lib/onepage/data-blocks-server),
   * so a code that was changed, switched off, used up or ended is never shown.
   */
  coupon_id?: string | null
}

export function promoCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const t = raw.trim()
  return t && t.length <= 40 && /^[A-Za-z0-9._@#%+-]+$/.test(t) ? t : null
}

/* ─── What the page draws ────────────────────────────────────────────── */

/** An empty block of these is left out of the page, so it leaves no gap. */
export function storelibBlockHasContent(block: { type: string; data?: unknown }): boolean {
  const d = (block.data ?? {}) as Record<string, unknown>
  switch (block.type) {
    case "storelib_shelf":
      /* Drawn when the server found something, or before it was asked (the preview fetches its own). */
      return !Array.isArray(d.items) || d.items.length > 0
    case "lead_magnet":
      return leadMagnetReady(d as Partial<LeadMagnetBlockData>)
    case "social_posts": {
      if (Array.isArray(d.items)) return d.items.length > 0
      const data = d as unknown as SocialPostsBlockData
      return pastedPosts(data).length > 0 || (data.network === "youtube" && youtubeChannel(data.channel_url) !== null)
    }
    case "followers":
      return followerTotal((d as unknown as FollowersBlockData).networks) > 0
    case "promo_code":
      return promoCode(d.code) !== null
    default:
      return true
  }
}

/**
 * THE SERVER'S ANSWERS COME OFF BEFORE A SAVE. The live page fills `items`
 * for a shelf and a posts block; a draft keeps only what the creator chose,
 * so a product or a video is never frozen into the page's JSON.
 */
export function stripResolved<T>(blocks: T): T {
  if (!Array.isArray(blocks)) return blocks
  return blocks.map((b) => {
    if (!b || typeof b !== "object") return b
    const block = b as { type?: string; data?: Record<string, unknown> }
    if ((block.type === "storelib_shelf" || block.type === "social_posts") && block.data && "items" in block.data) {
      const { items: _items, ...rest } = block.data
      void _items
      return { ...block, data: rest }
    }
    if (block.type === "group" && Array.isArray(block.data?.children)) return { ...block, data: { ...block.data, children: stripResolved(block.data!.children) } }
    return b
  }) as unknown as T
}

/** Is a colour dark enough that an embed should be asked for its dark look (X's theme=dark). */
export function isDarkColor(color: string | null | undefined): boolean {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec((color || "").trim())?.[1]
  if (!hex) return false
  const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.2
}
