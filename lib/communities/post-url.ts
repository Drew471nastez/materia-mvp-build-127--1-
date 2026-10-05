/**
 * Clean, readable post addresses: /community/<slug>/post/<words>-<shortId>
 * The short id is the first 8 hex digits of the post uuid (enough to resolve
 * inside a community). Full uuids still work everywhere for old links.
 */
import { slugify } from "./slug"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** Slugged segment ends with `-` and eight hex digits. */
const SLUGGED_TAIL_RE = /-([0-9a-f]{8})$/i

export type PostLinkInput = { id: string; title?: string | null; bodyText?: string | null }

/** First eight hex digits of the post id, lowercase, no dashes. */
export function postShortId(id: string): string {
  return id.replace(/-/g, "").slice(0, 8).toLowerCase()
}

/**
 * The uuid bounds for a short id. `community_feed_posts.id` is a uuid, and
 * `ilike` is not an operator on uuid, so a pretty share link
 * (/post/some-words-a1b2c3d4) and its share.png both failed the lookup and
 * answered 404. Comparison on uuid is the first bytes, which are these eight
 * digits, so every id with this prefix sits in [from, to).
 */
export function postShortIdRange(short: string): { from: string; to: string | null } {
  const hex = short.toLowerCase()
  const from = `${hex}-0000-0000-0000-000000000000`
  const n = Number.parseInt(hex, 16)
  if (!Number.isFinite(n) || n >= 0xffffffff) return { from, to: null }
  const next = (n + 1).toString(16).padStart(8, "0")
  return { from, to: `${next}-0000-0000-0000-000000000000` }
}

/** The `post` segment only (slug + short id), not the community slug. */
export function postLinkSegment(post: PostLinkInput): string {
  const lead = (post.title || post.bodyText || "").trim()
  const words = slugify(lead, 56) || "post"
  return `${words}-${postShortId(post.id)}`
}

export function postPath(communitySlug: string, post: PostLinkInput): string {
  return `/community/${communitySlug}/post/${postLinkSegment(post)}`
}

export type PostParamParse =
  | { kind: "uuid"; id: string }
  | { kind: "short"; short: string }
  | null

/** What the dynamic [postId] route segment carries. */
export function parsePostParam(param: string): PostParamParse {
  const raw = decodeURIComponent(param || "").trim()
  if (!raw) return null
  if (UUID_RE.test(raw)) return { kind: "uuid", id: raw.toLowerCase() }
  const tail = SLUGGED_TAIL_RE.exec(raw)
  if (tail) return { kind: "short", short: tail[1].toLowerCase() }
  if (/^[0-9a-f]{8}$/i.test(raw)) return { kind: "short", short: raw.toLowerCase() }
  return null
}
