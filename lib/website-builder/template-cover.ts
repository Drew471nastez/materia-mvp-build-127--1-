/**
 * ===========================================================================
 *  A COVER WITHOUT A BROWSER, AND KNOWING WHEN THERE IS NONE (round 27)
 * ===========================================================================
 * Production, 2026-11-21 to 11-25: every photograph failed with "The input
 * directory .../@sparticuz/chromium/bin does not exist" (the folded API
 * functions did not carry the browser; next.config.mjs now does), and the
 * Website page then asked the cover route again and again: 15 to 17 requests
 * per new website, each one starting a browser that could not start.
 *
 *   BROWSER MISSING   a launch that fails because the browser is not in the
 *                     function is remembered by this server for
 *                     BROWSER_MISSING_MS; until then a cover is refused at
 *                     once, with no launch (cover-take.ts takeCover), and the
 *                     route says so (`code: "cover_unavailable"`), so the page
 *                     backs off (cover-refresh.ts).
 *   TEMPLATE COVER    a website added from one of Storelib's templates has a
 *                     true picture already: the template's home page, built
 *                     as static files (marketplace-shared.ts
 *                     templateCoverPath). It is the first cover of such a
 *                     website, and the fallback whenever a photograph cannot
 *                     be taken and the website has none yet.
 *
 * Pure and injectable: no database, storage or fetch of its own.
 */
import { CODE_TEMPLATES, LISTING_SLUG_RE, listingSlugOfSettings, templateCoverPath, templatePhonePath } from "@/lib/themes/marketplace-shared"

/** How long a server that found no browser stops trying to start one. */
export const BROWSER_MISSING_MS = 10 * 60_000
/** What the cover route tells the page to wait before asking again, in seconds. */
export const COVER_RETRY_AFTER_S = 600
/** A template's picture, asked of the deployment's own origin, waits this long. */
export const TEMPLATE_COVER_FETCH_MS = 2500

/** A launch that failed because there is no browser to launch, not because a page was slow. */
export function isBrowserMissing(e: unknown): boolean {
  const m = e instanceof Error ? e.message : String(e ?? "")
  return /input directory .* does not exist|chromium\/bin|Could not find (Chrome|Chromium|expected browser)|Failed to launch the browser process|ENOENT.*chrom|spawn .*chrom.* ENOENT|cover_unavailable/i.test(m)
}

/** Said by takeCover when this server already knows it has no browser. */
export class CoverUnavailable extends Error {
  constructor(message = "cover_unavailable: no browser in this function") {
    super(message)
    this.name = "CoverUnavailable"
  }
}

let missingUntil = 0
export function noteBrowserMissing(now = Date.now()): void {
  missingUntil = now + BROWSER_MISSING_MS
}
export function browserKnownMissing(now = Date.now()): boolean {
  return now < missingUntil
}
/** For the tests. */
export function forgetBrowserMissing(): void {
  missingUntil = 0
}

/** The template's two pictures' addresses for a listing slug, or null for a listing that is not a code template. */
export function templateCoverPaths(slug: string | null): { cover: string; phone: string } | null {
  if (!slug || !LISTING_SLUG_RE.test(slug)) return null
  const t = CODE_TEMPLATES.find((c) => c.slug === slug)
  return t ? { cover: templateCoverPath(t.template), phone: templatePhonePath(t.template) } : null
}

/** A WebP a cover may be: by its magic bytes, and no larger than `maxBytes`. */
export function isWebpCover(bytes: Uint8Array, maxBytes: number): boolean {
  if (bytes.byteLength < 16 || bytes.byteLength > maxBytes) return false
  const tag = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to))
  return tag(0, 4) === "RIFF" && tag(8, 12) === "WEBP"
}

type Fetch = (url: URL, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; arrayBuffer(): Promise<ArrayBuffer> }>

/** The two pictures' bytes from `origin`, or null when the desktop one is not a cover. */
export async function templateCoverBytes(paths: { cover: string | null; phone: string | null }, origin: string, maxBytes: number, fetchImpl: Fetch = fetch as unknown as Fetch): Promise<{ desktop: Buffer; phone: Buffer | null } | null> {
  const read = async (path: string | null): Promise<Buffer | null> => {
    if (!path || !path.startsWith("/")) return null
    try {
      const r = await fetchImpl(new URL(path, origin), { signal: AbortSignal.timeout(TEMPLATE_COVER_FETCH_MS) })
      if (!r.ok) return null
      const bytes = Buffer.from(await r.arrayBuffer())
      return isWebpCover(bytes, maxBytes) ? bytes : null
    } catch {
      return null
    }
  }
  const [desktop, phone] = await Promise.all([read(paths.cover), read(paths.phone)])
  return desktop ? { desktop, phone } : null
}

/**
 * The template's picture as a website's cover, when the website was added
 * from a code template and has no cover yet. Null otherwise (never throws).
 */
export async function templateCoverFallback<C>(deps: {
  /** The website's live settings (where the listing it came from is noted). */
  settings: () => Promise<unknown>
  /** Its newest cover, or null. */
  newest: () => Promise<C | null>
  /** Store these bytes as its cover. */
  store: (desktop: Buffer, phone: Buffer | null) => Promise<C>
  origin: string
  maxBytes: number
  fetchImpl?: Fetch
}): Promise<C | null> {
  try {
    if (await deps.newest()) return null
    const paths = templateCoverPaths(listingSlugOfSettings(await deps.settings()))
    if (!paths) return null
    const bytes = await templateCoverBytes(paths, deps.origin, deps.maxBytes, deps.fetchImpl)
    return bytes ? await deps.store(bytes.desktop, bytes.phone) : null
  } catch {
    return null
  }
}
