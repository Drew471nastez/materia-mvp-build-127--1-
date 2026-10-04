/**
 * ===========================================================================
 *  A SHARED COMMUNITY LINK SHOWS THE COMMUNITY'S COVER
 * ===========================================================================
 * storelib.com/community/<slug>/cover.jpg?v=<fingerprint>, 1200 by 630: the
 * cover the creator chose, cut from its middle to the size every link
 * preview draws (Open Graph and X's large card), as a JPEG, the one kind
 * every app that previews links reads. Round 10: "the community's COVER
 * image by default; the generated share.png only when there is no cover".
 * components/community/public/seo.ts names this for /community/<slug>, its
 * About and its invite links whenever the community has a cover, and
 * share.png (the drawn card) otherwise.
 *
 * A COVER THAT CANNOT BE READ (a host that refuses, a file that is not a
 * picture) is never an empty preview: the address answers with the drawn
 * card instead (a 302 to share.png with the same fingerprint).
 *
 * The same gates as share.png: with communities switched off, for a draft,
 * a suspended or a deleted community it is a 404, an old address shows the
 * community it moved to, and the proxy skips .jpg addresses, so no session
 * is read for it. Kept briefly (ten minutes at the edge), and the `v`
 * fingerprint changes with the cover, which asks for a fresh one at once.
 */
import { communitiesEnabled } from "@/lib/communities/flag"
import { loadCommunity } from "@/lib/communities/server/context"
import { admin } from "@/lib/communities/server/db"
import { sharePreviewable } from "@/lib/communities/server/public"
import { sharePicture } from "@/lib/communities/server/share-image"
import { SHARE_IMAGE_HEIGHT, SHARE_IMAGE_WIDTH } from "@/components/community/public/seo"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const BRIEF = "public, max-age=300, s-maxage=600, stale-while-revalidate=86400"
const MISSING = "public, max-age=60, s-maxage=60"

function notFound(): Response {
  return new Response("Not found", { status: 404, headers: { "cache-control": MISSING } })
}

/** The drawn card at the same fingerprint: what a preview shows when the cover itself cannot be. */
function drawnCard(request: Request, slug: string): Response {
  const v = new URL(request.url).searchParams.get("v")
  const to = `/community/${slug}/share.png${v && /^[a-z0-9]{1,16}$/.test(v) ? `?v=${v}` : ""}`
  return new Response(null, { status: 302, headers: { location: to, "cache-control": MISSING } })
}

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!(await communitiesEnabled())) return notFound()
  const { slug } = await params
  const key = decodeURIComponent(slug || "").toLowerCase()
  if (!/^[a-z0-9-]{1,64}$/.test(key)) return notFound()
  const community = await loadCommunity(admin(), { slug: key })
  if (!community || !sharePreviewable(community)) return notFound()
  if (!community.cover_url) return drawnCard(request, community.slug)

  const picture = await sharePicture(community.cover_url, SHARE_IMAGE_WIDTH, SHARE_IMAGE_HEIGHT, "jpeg")
  const base64 = picture?.startsWith("data:image/jpeg;base64,") ? picture.slice("data:image/jpeg;base64,".length) : null
  if (!base64) return drawnCard(request, community.slug)
  const bytes = Buffer.from(base64, "base64")
  return new Response(new Uint8Array(bytes), {
    headers: { "content-type": "image/jpeg", "content-length": String(bytes.length), "cache-control": BRIEF, "x-robots-tag": "noindex" },
  })
}
