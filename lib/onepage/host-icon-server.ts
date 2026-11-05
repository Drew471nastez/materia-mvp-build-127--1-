import "server-only"

/**
 * ===========================================================================
 *  THE ICON OF A CREATOR PAGE DOMAIN (round 53)
 * ===========================================================================
 * A domain connected to the creator page shows the creator page at / and the
 * OnePage at /links (proxy.ts). Google takes a host's icon from its front
 * page's <link rel="icon">, else from /favicon.ico on that host, and both
 * were Storelib's or nothing: /favicon.ico answered Storelib's 404 page. So
 * the domain answers them itself, from the creator's photo (the OnePage's,
 * the one at the top of it, else the profile's), cut square from the middle
 * as the page's round photo is:
 *
 *   /favicon.ico        192 by 192 PNG (four times 48, the size Google asks
 *                       multiples of)
 *   /apple-touch-icon   180 by 180 PNG on white
 *
 * The OnePage on the domain links them with `?v=` naming the photo
 * (lib/onepage/seo.ts onePageHostIcons), so a new photo is a new address.
 * A website domain keeps the website's own (lib/website-builder/site-favicon).
 */
import sharp from "sharp"
import { createAdminClient } from "@/lib/supabase/admin"
import { getMainDomain } from "@/lib/url-helpers"
import { fetchableIconSource } from "@/lib/website-builder/site-favicon"
import { findPublishedOnePage, onePageOwner, publishedOnePageSeo } from "./published-page"
import { photoAtSize, profilePhotoVersion } from "./seo"
import { fetchImageBytes } from "./share-image"

/** The current address of the photo held for a year; any other for an hour, so a changed photo reaches /favicon.ico the same day. */
const LONG = "public, max-age=86400, s-maxage=31536000, immutable"
const SHORT = "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400"
const NOTHING = "public, max-age=300, s-maxage=300"
const MAX_BYTES = 8 * 1024 * 1024

/** The creator's photo, by the handle the domain is connected for: the OnePage's, else the profile's. Undefined when the lookup failed. */
export async function creatorPhotoOf(handle: string): Promise<string | null | undefined> {
  const slug = handle.toLowerCase()
  const onepage = await findPublishedOnePage(slug).catch(() => undefined)
  if (onepage === undefined) return undefined
  if (onepage) {
    const owner = await onePageOwner(onepage.seller_id ?? null, onepage.creator_id ?? null, onepage.owner_id ?? null)
    if (owner.banned) return null
    const { seo, drawn } = await publishedOnePageSeo(onepage, owner, slug)
    /* The photo the page's metadata names too (seo.ts onePageHostIcons), so its `?v=` is this one's. */
    const photo = seo.image.photoUrl || (typeof drawn.avatar_url === "string" && /^https?:\/\//i.test(drawn.avatar_url) ? drawn.avatar_url : null)
    if (photo) return photo
  }
  try {
    const { data } = await createAdminClient().from("profiles").select("avatar_url").eq("username", slug).maybeSingle()
    const url = (data as { avatar_url?: string | null } | null)?.avatar_url
    return typeof url === "string" && url.trim() ? url.trim() : null
  } catch {
    return undefined
  }
}

async function photoBytes(photo: string): Promise<Uint8Array | null> {
  /* Storelib's own storage is fetched directly; any other address through the public fetch, which refuses a private one (./share-image.ts). */
  const own = fetchableIconSource(photo, { mainDomain: getMainDomain(), supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || "" })
  if (own) {
    try {
      const res = await fetch(own, { signal: AbortSignal.timeout(5000) })
      if (!res.ok) return null
      const bytes = new Uint8Array(await res.arrayBuffer())
      return bytes.length > 0 && bytes.length <= MAX_BYTES ? bytes : null
    } catch {
      return null
    }
  }
  const sized = photoAtSize(photo, 256)
  return (await fetchImageBytes(sized, { maxBytes: MAX_BYTES, timeoutMs: 4000 })) ?? (sized !== photo ? await fetchImageBytes(photo, { maxBytes: MAX_BYTES, timeoutMs: 4000 }) : null)
}

/** The square PNG a creator page domain answers at /favicon.ico (`opaque` false) or /apple-touch-icon (true). */
export async function creatorIconResponse(request: Request, handle: string, size: number, opaque: boolean): Promise<Response> {
  const photo = await creatorPhotoOf(handle)
  if (photo === undefined) return new Response(null, { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "5" } })
  if (!photo) return new Response(null, { status: 404, headers: { "Cache-Control": NOTHING } })
  const bytes = await photoBytes(photo)
  if (!bytes) return new Response(null, { status: 404, headers: { "Cache-Control": NOTHING } })
  try {
    let image = sharp(bytes, { failOn: "none", limitInputPixels: 40_000_000, animated: false }).rotate().resize(size, size, { fit: "cover", position: "centre" })
    if (opaque) image = image.flatten({ background: "#ffffff" })
    const png = await image.png().toBuffer()
    const asked = new URL(request.url).searchParams.get("v")
    return new Response(new Uint8Array(png), {
      headers: { "Content-Type": "image/png", "Cache-Control": asked && asked === profilePhotoVersion(photo) ? LONG : SHORT },
    })
  } catch {
    return new Response(null, { status: 404, headers: { "Cache-Control": NOTHING } })
  }
}
