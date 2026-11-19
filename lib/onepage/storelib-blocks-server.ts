import "server-only"
import {withVariantPrices} from "@/lib/pricing/variant-price"
import { rowsWithOriginalCovers } from "@/lib/products/cover"

/**
 * ===========================================================================
 *  THE SHELF, THE POSTS AND THE FOLLOWER COUNT, READ WHEN THE PAGE IS DRAWN
 * ===========================================================================
 * The blocks of lib/onepage/storelib-blocks.ts that show something living
 * elsewhere are filled here, on the server, for the live page
 * (lib/onepage/published-page liveBlocksFor) and for the editor's preview
 * (app/api/onepage/blocks-live). The saved block holds only the choice.
 *
 *   storelib_shelf   the creator's products of that kind, live (published,
 *                    not archived, on the Creator page channel, not selling a
 *                    community tier), newest first; or their public
 *                    communities (lib/communities/server/public).
 *   social_posts     only the posts the creator pasted; no profile or channel
 *                    is read for posts by itself. Pasted TikToks get their picture and caption
 *                    from TikTok's public oEmbed (no key). Pasted Instagram
 *                    posts have no picture without a Meta app token, so they
 *                    are drawn in Instagram's own embed.
 *   followers        Bluesky's public count (no key) and YouTube's subscriber
 *                    count (YOUTUBE_API_KEY, when the deployment has one),
 *                    every six hours; every other network is the number the
 *                    creator typed.
 *
 * Every read has a short time limit and fails to what the block already had,
 * so a slow network never holds the page or empties a block.
 */

import { isPubliclyVisible } from "@/lib/products/visibility"
import { sellsCommunity } from "@/lib/communities/listing"
import { planIntervals } from "@/lib/memberships/intervals"
import { offChannel } from "@/lib/store/channel-filter"
import { creatorCommunityCards } from "@/lib/communities/server/public"
import {
  blueskyHandle,
  pastedPosts,
  shelfLimit,
  shelfPickedIds,
  shelfSource,
  shelfTakes,
  youtubeChannel,
  type FollowerEntry,
  type FollowersBlockData,
  type ShelfItem,
  type ShelfSource,
  type SocialPostItem,
  type SocialPostsBlockData,
  type StorelibShelfBlockData,
} from "./storelib-blocks"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

const READ_MS = 2500

/** A GET to a fixed public host, kept in Next's data cache for `revalidate` seconds. Null on any failure. */
async function cachedText(url: string, revalidate: number, accept = "*/*"): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { accept, "user-agent": "Mozilla/5.0 (compatible; Storelib/1.0; +https://storelib.com)" }, signal: AbortSignal.timeout(READ_MS), next: { revalidate } } as RequestInit)
    if (!res.ok) return null
    const text = await res.text()
    return text.length > 2_000_000 ? null : text
  } catch {
    return null
  }
}

async function cachedJson<T>(url: string, revalidate: number): Promise<T | null> {
  const text = await cachedText(url, revalidate, "application/json")
  if (!text) return null
  try {
    return JSON.parse(text) as T
  } catch {
    return null
  }
}

/* ── the shelf ─────────────────────────────────────────────────────────── */

const PRODUCT_COLUMNS = "id, title, slug, price_cents, thumbnail_url, type, status, archived, community_id, created_at"

/**
 * `ids` (round AP): the products the creator picked, in their order. Still only this creator's, still only what
 * a visitor may see (published, on the Creator page, of the shelf's kind): an id of anybody else's product, or
 * of one that is not live, is simply not there.
 */
export async function shelfItems(db: Db, creatorId: string, source: ShelfSource, limit: number, ids: string[] | null = null): Promise<ShelfItem[] | null> {
  if (!creatorId) return null
  if (source === "community") {
    try {
      const cards = await creatorCommunityCards(creatorId, db)
      return cards.slice(0, limit).map((c) => ({
        id: c.id,
        kind: "community",
        title: c.name,
        href: c.url || `/community/${c.slug}`,
        image: c.coverUrl || c.logoUrl || null,
        price_cents: null,
        meta: [c.priceLine, c.memberCount > 0 ? `${c.memberCount.toLocaleString("en-US")} ${c.memberCount === 1 ? "member" : "members"}` : null].filter(Boolean).join(" · ") || null,
      }))
    } catch {
      return null
    }
  }
  try {
    if (ids && ids.length === 0) return []
    let q = db.from("products").select(PRODUCT_COLUMNS).eq("creator_id", creatorId).eq("status", "published")
    if (source !== "all") q = q.eq("type", source)
    if (ids) q = q.in("id", ids)
    const [{ data, error }, offPage] = await Promise.all([q.order("created_at", { ascending: false }).limit(60), offChannel(db, creatorId, "creator_page")])
    if (error) return null
    const rows = ((data ?? []) as Record<string, unknown>[]).filter(
      (r) => isPubliclyVisible(r as never) && !sellsCommunity(r as never) && !offPage.has(String(r.id)) && shelfTakes(source, r.type as string | null) && typeof r.slug === "string" && r.slug,
    )
    /* Picked: in the creator's order, every one of them (up to SHELF_LIMIT_MAX, which `ids` already is). */
    if (ids) rows.sort((a, b) => ids.indexOf(String(a.id).toLowerCase()) - ids.indexOf(String(b.id).toLowerCase()))
    /* Round 19: a shelf's cards show the cover as uploaded (lib/products/cover), not the 16:9 copy with its grey padding. */
    const priced = await withVariantPrices<Record<string,unknown>&{id:string}>(db,rows.slice(0,ids ? ids.length : limit).map(row=>({...row,id:String(row.id)})))
    const picked = await rowsWithOriginalCovers(db, priced as (typeof priced[number] & { thumbnail_url?: string | null })[])
    const memberships = picked.filter((r) => r.type === "membership").map((r) => String(r.id))
    const intervals = memberships.length ? await planIntervals(db as never, memberships) : new Map()
    return picked.map((r) => ({
      id: String(r.id),
      kind: String(r.type || "digital"),
      title: String(r.title || ""),
      href: `/p/${r.slug}`,
      image: typeof r.thumbnail_url === "string" ? r.thumbnail_url : null,
      price_cents: typeof r.price_cents === "number" ? r.price_cents : null,
      variant_count:r.variant_count,variant_min_price_cents:r.variant_min_price_cents,variant_max_price_cents:r.variant_max_price_cents,single_variant_id:r.single_variant_id,
      interval: r.type === "membership" ? (intervals.get(String(r.id)) ?? "month") : null,
    }))
  } catch {
    return null
  }
}

/* ── the posts ─────────────────────────────────────────────────────────── */

/** TikTok's public oEmbed: the video's picture and its caption. */
async function withTikTokThumb(item: SocialPostItem): Promise<SocialPostItem> {
  if (item.kind !== "tiktok") return item
  const o = await cachedJson<{ thumbnail_url?: unknown; title?: unknown }>(`https://www.tiktok.com/oembed?url=${encodeURIComponent(item.url)}`, 21_600)
  const thumb = typeof o?.thumbnail_url === "string" && o.thumbnail_url.startsWith("https://") ? o.thumbnail_url : null
  const title = typeof o?.title === "string" ? o.title.slice(0, 200) : null
  return { ...item, thumb, title }
}

/** The posts the creator pasted, and only those: a profile or a channel is never read for posts by itself. */
export async function postsItems(data: SocialPostsBlockData): Promise<SocialPostItem[] | null> {
  const pasted = pastedPosts(data)
  if (pasted.length === 0) return null
  return Promise.all(pasted.map(withTikTokThumb))
}

/* ── followers ─────────────────────────────────────────────────────────── */

/** A network's own count, or null when it cannot be read (no key, unknown handle, slow answer). */
export async function liveFollowerCount(network: string, handle: string | null | undefined, revalidate = 21_600): Promise<number | null> {
  if (network === "bluesky") {
    const h = blueskyHandle(handle)
    if (!h) return null
    const p = await cachedJson<{ followersCount?: unknown }>(`https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(h)}`, revalidate)
    return typeof p?.followersCount === "number" ? p.followersCount : null
  }
  if (network === "youtube") {
    const key = process.env.YOUTUBE_API_KEY
    if (!key) return null
    const ch = youtubeChannel(handle) ?? (handle && /^[A-Za-z0-9._-]{3,30}$/.test(handle) ? { kind: "handle" as const, handle } : null)
    if (!ch) return null
    const q = ch.kind === "id" ? `id=${ch.id}` : `forHandle=${encodeURIComponent(`@${ch.handle}`)}`
    const r = await cachedJson<{ items?: { statistics?: { subscriberCount?: string; hiddenSubscriberCount?: boolean } }[] }>(`https://www.googleapis.com/youtube/v3/channels?part=statistics&${q}&key=${encodeURIComponent(key)}`, revalidate)
    const s = r?.items?.[0]?.statistics
    if (!s || s.hiddenSubscriberCount) return null
    const n = Number(s.subscriberCount)
    return Number.isFinite(n) ? n : null
  }
  return null
}

async function refreshedFollowers(data: FollowersBlockData): Promise<FollowersBlockData> {
  const networks = Array.isArray(data.networks) ? data.networks : []
  const next: FollowerEntry[] = await Promise.all(
    networks.map(async (e) => {
      if (!e || (e.network !== "bluesky" && e.network !== "youtube") || !e.handle) return e
      const n = await liveFollowerCount(e.network, e.handle)
      return n === null ? e : { ...e, count: n }
    }),
  )
  return { ...data, networks: next }
}

/* ── the walk ──────────────────────────────────────────────────────────── */

type Block = { type?: string; enabled?: boolean; data?: Record<string, unknown> | null; [k: string]: unknown }

const RESOLVED = new Set(["storelib_shelf", "social_posts", "followers"])

/** Does a block array hold anything this file fills? (So a page without one costs nothing.) */
export function needsResolving(blocks: unknown): boolean {
  if (!Array.isArray(blocks)) return false
  return blocks.some((b) => {
    const block = b as Block | null
    if (!block || typeof block !== "object") return false
    if (RESOLVED.has(block.type ?? "") && block.enabled !== false) return true
    return block.type === "group" && needsResolving(block.data?.children)
  })
}

/** One block, filled. Fails to the block as it was. */
export async function resolveStorelibBlock(db: Db, creatorId: string, block: Block): Promise<Block> {
  const data = (block.data ?? {}) as Record<string, unknown>
  if (block.type === "storelib_shelf") {
    const d = data as unknown as StorelibShelfBlockData
    const items = await shelfItems(db, creatorId, shelfSource(d.source), shelfLimit(d.limit), shelfPickedIds(d))
    return items ? { ...block, data: { ...data, items } } : block
  }
  if (block.type === "social_posts") {
    const items = await postsItems(data as unknown as SocialPostsBlockData)
    return items ? { ...block, data: { ...data, items } } : block
  }
  if (block.type === "followers") return { ...block, data: (await refreshedFollowers(data as unknown as FollowersBlockData)) as unknown as Record<string, unknown> }
  return block
}

/** The page's blocks, each shelf, posts row and follower count filled. Never throws. */
export async function withStorelibBlocks<T>(db: Db, creatorId: string, blocks: T): Promise<T> {
  if (!creatorId || !needsResolving(blocks)) return blocks
  const walk = async (list: unknown[]): Promise<unknown[]> =>
    Promise.all(
      list.map(async (raw) => {
        const block = raw as Block | null
        if (!block || typeof block !== "object") return raw
        if (block.type === "group" && Array.isArray(block.data?.children)) return { ...block, data: { ...block.data, children: await walk(block.data!.children as unknown[]) } }
        if (!RESOLVED.has(block.type ?? "") || block.enabled === false) return raw
        try {
          return await resolveStorelibBlock(db, creatorId, block)
        } catch {
          return raw
        }
      }),
    )
  try {
    return (await walk(blocks as unknown as unknown[])) as unknown as T
  } catch {
    return blocks
  }
}
