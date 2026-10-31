/**
 * ===========================================================================
 *  THE PICTURE A SHARED ONEPAGE LINK SHOWS
 * ===========================================================================
 * storelib.com/<slug>/links/share.png?v=<fingerprint>, 1200 by 630.
 *
 * Drawn from the published page: its name, its photo and its theme
 * (components/onepage/share-card ShareCardArt, the same elements the editor's
 * Settings draws its preview with), or, when the creator chose Custom image,
 * the picture they uploaded, cropped at the point they dragged to. The
 * profile photo, the default, is served beside it (links/photo.jpg). The page's metadata names this
 * address (lib/onepage/seo resolveOnePageSeo), with `v` a fingerprint of
 * what the image is drawn from.
 *
 * WHY IT IS HERE AND NOT UNDER /api. robots.txt keeps crawlers out of /api,
 * and X's crawler honours robots.txt for the card image: an image there
 * would never be shown. Beside the page it pictures, it is as open as the
 * page. The proxy skips .png addresses, so no session is read for it.
 *
 * CACHING. The address changes whenever the picture would, so the answer for
 * the current fingerprint is kept for a year by the CDN and a day by a
 * browser; an old or missing fingerprint is kept for a minute, and is drawn
 * from what the page is now.
 */
import { ImageResponse } from "next/og"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { findPublishedOnePage, onePageOwner, publishedOnePageSeo } from "@/lib/onepage/published-page"
import { fetchCardImage } from "@/lib/onepage/share-image"
import { SHARE_IMAGE_HEIGHT, SHARE_IMAGE_WIDTH, shareImageVersion } from "@/lib/onepage/seo"
import { ShareCardArt, ShareCardUpload } from "@/components/onepage/share-card"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const LONG = "public, max-age=86400, s-maxage=31536000, immutable"
const SHORT = "public, max-age=60, s-maxage=60, stale-while-revalidate=300"

let fonts: Promise<{ name: string; data: Buffer; weight: 400 | 600; style: "normal" }[]> | null = null
/* Inter, the face the editor draws the preview in, from the repository (lib/checkout/fonts; next.config.mjs traces it). */
function interFonts() {
  if (!fonts) {
    const dir = join(process.cwd(), "lib/checkout/fonts")
    fonts = Promise.all([readFile(join(dir, "Inter-Regular.woff")), readFile(join(dir, "Inter-SemiBold.woff"))])
      .then(([regular, semibold]) => [
        { name: "Inter", data: regular, weight: 400 as const, style: "normal" as const },
        { name: "Inter", data: semibold, weight: 600 as const, style: "normal" as const },
      ])
      .catch(() => {
        fonts = null
        return []
      })
  }
  return fonts
}

async function png(element: React.ReactElement, cache: string): Promise<Response | null> {
  try {
    const loaded = await interFonts()
    const image = new ImageResponse(element, {
      width: SHARE_IMAGE_WIDTH,
      height: SHARE_IMAGE_HEIGHT,
      ...(loaded.length ? { fonts: loaded } : {}),
    })
    /* Drawn in full here, so a picture it cannot draw is caught and the card drawn without it. */
    const body = await image.arrayBuffer()
    return new Response(body, { headers: { "content-type": "image/png", "cache-control": cache } })
  } catch (error) {
    console.error("OnePage share image could not be drawn:", error instanceof Error ? error.message : "unknown")
    return null
  }
}

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
  /*
    THE UPLOAD ONLY WHEN IT IS THE CHOSEN PICTURE (lib/onepage/seo
    pickShareImage). A page that shows its profile photo when shared
    (/<slug>/links/photo.jpg) is still answered here with its card, for an
    app holding this address from before, under the card's own fingerprint.
  */
  const drawsUpload = seo.image.source === "custom" && !!seo.image.customUrl
  const version = shareImageVersion({ card: seo.image.card, customUrl: drawsUpload ? seo.image.customUrl : null, focal: seo.image.focal })
  const asked = new URL(request.url).searchParams.get("v")
  const cache = asked === version ? LONG : SHORT

  if (drawsUpload && seo.image.customUrl) {
    const upload = await fetchCardImage(seo.image.customUrl)
    if (upload) {
      const drawn = await png(<ShareCardUpload src={upload.dataUrl} size={upload} focal={seo.image.focal} />, cache)
      if (drawn) return drawn
    }
    /* A picture next/og cannot read (WebP, HEIC): the picture itself, uncropped, is still better than none. */
    return new Response(null, { status: 302, headers: { location: seo.image.customUrl, "cache-control": SHORT } })
  }

  const card = seo.image.card
  const [avatar, background] = await Promise.all([
    card.avatarUrl ? fetchCardImage(card.avatarUrl, { maxBytes: 4 * 1024 * 1024 }) : Promise.resolve(null),
    card.background.imageUrl ? fetchCardImage(card.background.imageUrl) : Promise.resolve(null),
  ])
  const art = (withPictures: boolean) => (
    <ShareCardArt
      card={card}
      avatarSrc={withPictures ? avatar?.dataUrl ?? null : null}
      backgroundSrc={withPictures ? background?.dataUrl ?? null : null}
      backgroundSize={background}
    />
  )
  return (
    (await png(art(true), cache)) ??
    (await png(art(false), SHORT)) ??
    new Response("Could not draw the image", { status: 500, headers: { "cache-control": "no-store" } })
  )
}
