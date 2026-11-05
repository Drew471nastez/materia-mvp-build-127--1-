/**
 * ===========================================================================
 *  THE PROFILE PHOTO A SHARED ONEPAGE LINK SHOWS
 * ===========================================================================
 * storelib.com/<slug>/links/photo.jpg?v=<fingerprint>, a 600 by 600 JPEG.
 *
 * A OnePage shared in a chat shows its creator's photo unless they chose
 * the card or a picture of their own (lib/onepage/seo pickShareImage), the
 * way a Linktree or Beacons link does. The photo is the one at the top of
 * the page, and it lives wherever it was uploaded: Storelib's storage, or a
 * sign in provider's (a Google account photo is 96 pixels unless asked for
 * more). So it is served from here, one host every crawler can read, at one
 * size and in one kind, cut square from the middle as the page's round photo
 * is: what the metadata says it is (600 by 600, image/jpeg) is what arrives.
 *
 * Beside the card (links/share.png) and outside /api, for the same reason:
 * robots.txt keeps crawlers out of /api. The proxy skips .jpg addresses.
 *
 * CACHING. The address changes with the photo (`v`), so the current one is
 * kept for a year by the CDN; an old or missing `v` for a minute. A page with
 * no photo, or a photo that cannot be read, is sent to its card.
 */
import { findPublishedOnePage, onePageOwner, publishedOnePageSeo } from "@/lib/onepage/published-page"
import { fetchImageBytes, squarePhoto } from "@/lib/onepage/share-image"
import { photoAtSize, profilePhotoVersion, shareImagePath, shareImageVersion } from "@/lib/onepage/seo"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const LONG = "public, max-age=86400, s-maxage=31536000, immutable"
const SHORT = "public, max-age=60, s-maxage=60, stale-while-revalidate=300"

export async function GET(request: Request, { params }: { params: Promise<{ sellername: string }> }) {
  const { sellername } = await params
  const slug = decodeURIComponent(sellername || "").toLowerCase()
  /* A lookup that failed is "try again", never a 404 the CDN holds for a minute. */
  const onepage = slug ? await findPublishedOnePage(slug).catch(() => undefined) : null
  if (onepage === undefined) return new Response("Try again", { status: 503, headers: { "cache-control": "no-store", "retry-after": "5" } })
  if (!onepage) return new Response("Not found", { status: 404, headers: { "cache-control": SHORT } })
  const owner = await onePageOwner(onepage.seller_id ?? null, onepage.creator_id ?? null, onepage.owner_id ?? null)
  if (owner.banned) return new Response("Not found", { status: 404, headers: { "cache-control": SHORT } })

  const { seo } = await publishedOnePageSeo(onepage, owner, slug)
  const toCard = () => {
    const v = shareImageVersion({ card: seo.image.card, customUrl: null, focal: seo.image.focal })
    return new Response(null, { status: 302, headers: { location: new URL(`${shareImagePath(slug)}?v=${v}`, request.url).toString(), "cache-control": SHORT } })
  }

  const photo = seo.image.photoUrl
  if (!photo) return toCard()
  const asked = new URL(request.url).searchParams.get("v")
  const cache = asked === profilePhotoVersion(photo) ? LONG : SHORT

  const sized = photoAtSize(photo)
  const bytes = (await fetchImageBytes(sized, { maxBytes: 12 * 1024 * 1024, timeoutMs: 4000 })) ?? (sized !== photo ? await fetchImageBytes(photo, { maxBytes: 12 * 1024 * 1024, timeoutMs: 4000 }) : null)
  const jpeg = bytes ? await squarePhoto(bytes) : null
  if (!jpeg) return toCard()
  return new Response(new Uint8Array(jpeg), { headers: { "content-type": "image/jpeg", "content-length": String(jpeg.byteLength), "cache-control": cache } })
}
