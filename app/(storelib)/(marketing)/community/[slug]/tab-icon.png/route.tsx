/**
 * ===========================================================================
 *  A COMMUNITY'S TAB ICON
 * ===========================================================================
 * Round 12, ask 8: "a community's pages use the community's avatar as the
 * tab icon (generated from the logo, cache busted by the logo URL) and the
 * community's name in the title; both update when the admin changes them".
 *
 * storelib.com/community/<slug>/tab-icon.png?v=<fingerprint>: the logo cut
 * square from its middle at 64px (twice a tab's 32), its corners rounded as
 * the community's mark is everywhere else (components/community/member/
 * community-mark.tsx), on a transparent ground; with no logo, the first
 * letter of its name in white on Storelib's ink. The layout above every
 * page of the community names it (layout.tsx generateMetadata) with `v`
 * worked out from the logo's address and the name, so a new logo is a new
 * address and the browser asks for it at once instead of keeping the old.
 *
 * The same gates as the share picture beside it: off, a draft, a suspended
 * or a deleted community is a 404, and the proxy skips .png addresses.
 */
import { ImageResponse } from "next/og"
import { communitiesEnabled } from "@/lib/communities/flag"
import { loadCommunity } from "@/lib/communities/server/context"
import { admin } from "@/lib/communities/server/db"
import { sharePreviewable } from "@/lib/communities/server/public"
import { shareFonts, sharePicture } from "@/lib/communities/server/share-image"
import { tabIconInitial } from "@/components/community/public/seo"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** The drawn size: twice a 32px tab icon. */
const SIZE = 64
/** The mark's corner at this size (10px on a 40px mark). */
const RADIUS = 16
/** Kept long: the fingerprint changes the address whenever the logo or the name does. */
const KEPT = "public, max-age=86400, s-maxage=604800, stale-while-revalidate=604800"
const MISSING = "public, max-age=60, s-maxage=60"

function notFound(): Response {
  return new Response("Not found", { status: 404, headers: { "cache-control": MISSING } })
}

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!(await communitiesEnabled())) return notFound()
  const { slug } = await params
  const key = decodeURIComponent(slug || "").toLowerCase()
  if (!/^[a-z0-9-]{1,64}$/.test(key)) return notFound()
  const community = await loadCommunity(admin(), { slug: key })
  if (!community || !sharePreviewable(community)) return notFound()

  const logo = await sharePicture(community.logo_url, SIZE, SIZE, "png")
  const element = logo ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={logo} width={SIZE} height={SIZE} alt="" style={{ width: SIZE, height: SIZE, borderRadius: RADIUS, objectFit: "cover" }} />
  ) : (
    <div style={{ width: SIZE, height: SIZE, borderRadius: RADIUS, background: "#1a1a2e", color: "#ffffff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 36, fontWeight: 600, fontFamily: "Inter" }}>{tabIconInitial(community.name)}</div>
  )
  try {
    const fonts = logo ? [] : await shareFonts()
    const image = new ImageResponse(<div style={{ width: SIZE, height: SIZE, display: "flex", background: "transparent" }}>{element}</div>, { width: SIZE, height: SIZE, ...(fonts.length ? { fonts } : {}) })
    const bytes = await image.arrayBuffer()
    return new Response(bytes, { headers: { "content-type": "image/png", "content-length": String(bytes.byteLength), "cache-control": KEPT, "x-robots-tag": "noindex" } })
  } catch (error) {
    console.error("Community tab icon could not be drawn:", error instanceof Error ? error.message : "unknown")
    return notFound()
  }
}
