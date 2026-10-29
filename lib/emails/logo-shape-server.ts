/**
 * ===========================================================================
 *  IS THE STORE'S LOGO A WORDMARK OR A SQUARE ICON? READ ONCE, AT SEND
 * ===========================================================================
 * lib/emails/brand-mark.ts draws a logo whose shape it does not know alone,
 * with the store's name beside it waiting in a comment. This reads each such
 * picture's size from its header (lib/images/metadata readImageSize, no
 * decoding), once per picture per server, and settles the mark: a square
 * picture gets the name beside it, a wide one stays alone.
 *
 * Bounded: only Storelib's own stored pictures are read (./logo-source.ts
 * logoFetchTarget: the Supabase storage host, directly, by /media/ or through
 * our inbox resizer, https only); fetched through fetchPublic, which refuses
 * private addresses, with no redirect followed, at most 4MB and 2.5s, all
 * pictures of one email at once. Any other address, or a picture that
 * cannot be read, is an unknown shape: the email goes exactly as drawn.
 */
import "server-only"
import { fetchPublic } from "@/lib/api/public-fetch"
import { readImageSize } from "@/lib/images/metadata"
import { logoFetchTarget } from "./logo-source"
import { autoLogoSources, settleBrandMarks, shapeOfSize } from "./brand-mark"

type Shape = "wide" | "square" | null

const MAX_BYTES = 4 * 1024 * 1024
const TIMEOUT_MS = 2500
/** Kept per server: a logo is the same picture on every email the store sends. A miss is asked again after a while. */
const KEEP = 500
const MISS_MS = 10 * 60_000
const shapes = new Map<string, { shape: Shape; at: number }>()
const asking = new Map<string, Promise<Shape>>()

const unescape = (s: string) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")

async function read(src: string): Promise<Shape> {
  const target = logoFetchTarget(src)
  if (!target) return null
  try {
    /* No redirect: a stored object answers itself, and a redirect could only lead somewhere else. */
    const res = await fetchPublic(target, { maxBytes: MAX_BYTES, timeoutMs: TIMEOUT_MS, maxRedirects: 0 })
    if (!res.ok) return null
    return shapeOfSize(readImageSize(new Uint8Array(await res.arrayBuffer())))
  } catch {
    return null
  }
}

/** The shape of one picture, read once. */
export async function logoShape(src: string): Promise<Shape> {
  const kept = shapes.get(src)
  if (kept && (kept.shape !== null || Date.now() - kept.at < MISS_MS)) return kept.shape
  const pending = asking.get(src)
  if (pending) return pending
  const p = read(src).then((shape) => {
    asking.delete(src)
    if (shapes.size >= KEEP) shapes.delete(shapes.keys().next().value as string)
    shapes.set(src, { shape, at: Date.now() })
    return shape
  })
  asking.set(src, p)
  return p
}

/**
 * The email with every logo drawn before its shape was known settled
 * (lib/emails/brand-mark.ts settleBrandMarks). An email with none is
 * returned as it is, without a fetch.
 */
export async function settleLogoShapes(html: string): Promise<string> {
  if (!html || !html.includes('data-logo-shape="auto"')) return html
  const sources = autoLogoSources(html)
  if (!sources.length) return html
  const found = new Map<string, Shape>()
  await Promise.all(sources.map(async (s) => found.set(s, await logoShape(unescape(s)))))
  return settleBrandMarks(html, found)
}
