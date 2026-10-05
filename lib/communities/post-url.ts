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
