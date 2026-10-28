import "server-only"

/**
 * The server half of ./site-favicon.ts: which picture a published website's
 * icon is, and the square PNG its host answers with. Read by the three
 * routes under app/(site)/w/[username] (favicon.ico, apple-touch-icon,
 * site.webmanifest), which the proxy sends those paths to on the site's own
 * host.
 */
import sharp from "sharp"
import { siteIconUrl } from "./site-icon"
import { fetchableIconSource } from "./site-favicon"
import { getMainDomain } from "@/lib/url-helpers"

/** The published site's picture and name, or null for no site or no picture. */
export async function siteIconSource(name: string): Promise<{ source: string; name: string; themeColor: string | null } | null> {
  /* Asked lazily, so the drawing half below loads without the site's whole data layer (tests/indexing-r41.test.ts draws with it). */
  const { publishedShopByName } = await import("./published-site")
  const found = await publishedShopByName(name).catch(() => null)
  if (!found || found.kind !== "site") return null
  const settings = (found.site.themeSettings ?? {}) as Record<string, unknown>
  const source = siteIconUrl(settings, found.site.pages.home ?? found.site.sections)
  if (!source) return null
  const brand = typeof settings.brand_name === "string" && settings.brand_name.trim() ? settings.brand_name : found.site.profile?.storeName || name
  const accent = typeof settings.accent_color === "string" ? settings.accent_color : null
  return { source, name: String(brand), themeColor: accent }
}

/** A day at the edge and in the browser; the page links the icon with `?v=`, so a new picture is a new address at once. */
const ICON_CACHE = "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800"
const NOTHING_CACHE = "public, max-age=3600, s-maxage=3600"
/** Larger than any favicon anybody uploads on purpose. */
const MAX_BYTES = 8 * 1024 * 1024

/** No site, or a site with no picture: a plain 404, never Storelib's own icon or its not found page. */
export function noIcon(): Response {
  return new Response(null, { status: 404, headers: { "Cache-Control": NOTHING_CACHE } })
}

/**
 * The site's picture fitted inside a square of `size`, as PNG. Clear around
 * the picture for the tab; on white for a phone's home screen (`opaque`).
 * A picture on another site is not fetched by the server: the browser is
 * sent there (302), as the old link did. A picture that cannot be read or
 * drawn is sent there too, so the tab still shows it.
 */
export async function squareIconResponse(source: string, size: number, opaque: boolean): Promise<Response> {
  const fallback = () =>
    /^https:\/\//i.test(source)
      ? new Response(null, { status: 302, headers: { Location: source, "Cache-Control": NOTHING_CACHE } })
      : noIcon()
  const from = fetchableIconSource(source, { mainDomain: getMainDomain(), supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || "" })
  if (!from) return fallback()
  try {
    const res = await fetch(from, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return fallback()
    const bytes = Buffer.from(await res.arrayBuffer())
    if (bytes.length === 0 || bytes.length > MAX_BYTES) return fallback()
    let image = sharp(bytes, { limitInputPixels: 40_000_000, animated: false, density: 300 }).resize(size, size, {
      fit: "contain",
      background: opaque ? { r: 255, g: 255, b: 255, alpha: 1 } : { r: 0, g: 0, b: 0, alpha: 0 },
    })
    if (opaque) image = image.flatten({ background: "#ffffff" })
    const png = await image.png().toBuffer()
    return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Cache-Control": ICON_CACHE } })
  } catch {
    return fallback()
  }
}
