/**
 * ===========================================================================
 *  THE PICTURE A SHARED POST LINK SHOWS
 * ===========================================================================
 * storelib.com/community/<slug>/post/<id>/share.png?v=<fingerprint>, 1200 by
 * 630, named by the post page's metadata (../post-seo.ts). Drawn per request
 * by next/og (../post-share-card.tsx):
 *
 *   A PUBLIC POST   (post-seo publicPost: a public community's open space,
 *                   free or paid to join;
 *                   space, the post published) its title and words, its
 *                   first picture, its author and the community's logo
 *   ANY OTHER       the generic card: the community's name and logo, "A post
 *                   for members". Nothing of the post is read into it.
 *
 * A route handler, so the (member) layout's door does not stand in front of
 * it: a chat app's crawler is signed out. That is why the rule is decided
 * here again from the rows, never from a session (none is read: the proxy
 * lets .png addresses through without one).
 *
 * Not found (communities off, no such community or post, a draft or a
 * suspended community): a 404. CACHING as the community's card: ten minutes
 * at the edge, five in a browser; `v` changes with an edit and with the
 * rule's answer, so a post made private asks again at once.
 */
import { ImageResponse } from "next/og"
import { sharePreviewable } from "@/lib/communities/server/public"
import { shareFonts, sharePicture } from "@/lib/communities/server/share-image"
import { postFacts } from "../post-facts"
import { POST_SHARE_HEIGHT, POST_SHARE_WIDTH, firstPicture, postHeadline, publicPost } from "../post-seo"
import { GenericPostShareArt, PostShareArt, type PostShareModel } from "../post-share-card"
import { plainSummary } from "@/lib/html-entities"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const BRIEF = "public, max-age=300, s-maxage=600, stale-while-revalidate=86400"
const MISSING = "public, max-age=60, s-maxage=60"

function notFound(): Response {
  return new Response("Not found", { status: 404, headers: { "cache-control": MISSING } })
}

async function png(element: React.ReactElement): Promise<ArrayBuffer | null> {
  try {
    const fonts = await shareFonts()
    const image = new ImageResponse(element, { width: POST_SHARE_WIDTH, height: POST_SHARE_HEIGHT, ...(fonts.length ? { fonts } : {}) })
    return await image.arrayBuffer()
  } catch (error) {
    console.error("Post share image could not be drawn:", error instanceof Error ? error.message : "unknown")
    return null
  }
}

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string; postId: string }> }) {
  const { slug, postId } = await params
  if (!/^[a-z0-9-]{1,64}$/i.test(decodeURIComponent(slug || ""))) return notFound()
  const facts = await postFacts(slug, postId)
  if (!facts || !sharePreviewable(facts.communityRow)) return notFound()
  if (facts.post.status === "deleted" || facts.post.deletedAt) return notFound()

  const logo = sharePicture(facts.community.logo_url, 120, 120, "png")
  let drawn: ArrayBuffer | null
  if (publicPost(facts)) {
    const headline = postHeadline(facts) || `A post in ${facts.community.name}`
    const words = plainSummary(facts.post.bodyText, 220)
    const model: PostShareModel = {
      communityName: facts.community.name,
      spaceName: facts.space?.name || null,
      headline,
      excerpt: words && !words.startsWith(headline.replace(/…$/, "")) ? words : null,
      authorName: facts.author?.name ?? null,
      commentCount: facts.post.commentCount,
    }
    const [logoSrc, pictureSrc, avatarSrc] = await Promise.all([
      logo,
      sharePicture(firstPicture(facts.post.media), POST_SHARE_WIDTH, POST_SHARE_HEIGHT, "jpeg"),
      sharePicture(facts.author?.avatarUrl, 96, 96, "jpeg"),
    ])
    drawn =
      (await png(<PostShareArt model={model} logoSrc={logoSrc} pictureSrc={pictureSrc} avatarSrc={avatarSrc} />)) ??
      (await png(<PostShareArt model={model} logoSrc={null} pictureSrc={null} avatarSrc={null} />))
  } else {
    const logoSrc = await logo
    const generic = { communityName: facts.community.name, memberCount: facts.communityRow.member_count ?? 0 }
    drawn = (await png(<GenericPostShareArt {...generic} logoSrc={logoSrc} />)) ?? (await png(<GenericPostShareArt {...generic} logoSrc={null} />))
  }
  if (!drawn) return new Response("Could not draw the image", { status: 500, headers: { "cache-control": "no-store" } })
  return new Response(drawn, { headers: { "content-type": "image/png", "cache-control": BRIEF, "x-robots-tag": "noindex" } })
}
