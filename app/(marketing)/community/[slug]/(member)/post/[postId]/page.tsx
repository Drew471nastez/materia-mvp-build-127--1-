import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { viewerContext, viewerView } from "@/lib/communities/server/context"
import { admin } from "@/lib/communities/server/db"
import { getPostView, getPublicPostView } from "@/lib/communities/server/feed"
import { listComments } from "@/lib/communities/server/comments"
import { resolvePostId } from "@/lib/communities/server/post-resolve"
import { FeedColumns } from "@/components/community/member/columns"
import { memberPage, shellData } from "@/components/community/member/data"
import { PlacePage } from "@/components/community/member/place-page"
import { PostPage } from "@/components/community/member/post-page"
import { SharedPost } from "@/components/community/member/shared-post"
import { jsonLdScript } from "@/lib/seo/json-ld"
import { postFacts } from "./post-facts"
import { postArticleJsonLd, postMetadata, publicPost } from "./post-seo"

/**
 * WHAT SEARCH AND A SHARED LINK ARE TOLD (./post-seo.ts): a post in a free,
 * public community's open space is its own page in search, with its words
 * and a picture drawn for it; any other post says only which community it is
 * in, and noindex. Decided from the rows, never from who is looking.
 */
export async function generateMetadata({ params }: { params: Promise<{ slug: string; postId: string }> }): Promise<Metadata> {
  const { slug, postId } = await params
  const facts = await postFacts(slug, postId)
  if (!facts) return { robots: { index: false, follow: false } }
  return postMetadata(facts)
}

/** /community/<slug>/post/<postId>: the whole post and its comments, one reply level deep. */
export default async function CommunityPostPage({ params }: { params: Promise<{ slug: string; postId: string }> }) {
  const { slug, postId } = await params
  const page = await memberPage(slug)
  /* A reader who is not a member (signed out included): only a public post, read only, with the Join bar (round 13). */
  if ((page.state === "signed_out" || page.state === "not_member") && page.community) {
    const facts = await postFacts(slug, postId)
    if (!facts || !publicPost(facts)) notFound()
    const db = admin()
    const community = page.community
    const reader = page.viewer ?? (await viewerContext(db, community, null))
    const id = await resolvePostId(db, community.id, postId)
    if (!id) notFound()
    const post = await getPublicPostView(db, community, reader, id)
    if (!post) notFound()
    const comments = await listComments(db, community, reader, id, null, { publicRead: true })
    const article = postArticleJsonLd(facts)
    return (
      <>
        {article ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(article) }} /> : null}
        <FeedColumns
          main={
            <PostPage
              slug={community.slug}
              viewer={viewerView(reader)}
              post={post}
              comments={comments.ok ? { comments: comments.value.comments, nextCursor: null } : { comments: [], nextCursor: null }}
              me={{ name: "", avatarUrl: null }}
              readOnly
              visitor={{ name: community.name, logoUrl: community.logo_url, signedIn: page.state === "not_member" }}
            />
          }
        />
      </>
    )
  }
  if (page.state !== "member" || !page.community || !page.viewer) notFound()
  const { community, viewer } = page
  const db = admin()
  const id = await resolvePostId(db, community.id, postId)
  if (!id) notFound()
  const post = await getPostView(db, community, viewer, id)
  if (!post) notFound()
  /* The Article's facts with the rest (post-seo), shared with generateMetadata's read (post-facts is cached per request). */
  const [shell, facts] = await Promise.all([shellData(community.id, viewer, community), postFacts(slug, postId)])
  const readOnly = shell.community.archived || !!viewer.mutedUntil
  /* Only for a public post; nothing for any other. */
  const article = facts ? postArticleJsonLd(facts) : null
  /*
    THE FEED UNDER A POST OPENED BY ITS LINK IS THE SHELL'S FEED (round 16). It used to be a CommunityFeed of this page's own,
    which the community's place host could not name as a place: closing the post asked the router for the feed's page, which
    drew a second feed in its place (every card and picture again), and a place the member moved to meanwhile was hidden
    behind it. Now the page seeds the shell with the feed, as the feed's own page does (place-page.tsx), and the post opens
    over it; closing it only gives the address back (shared-post.tsx), and the feed under it is the one already drawn.
  */
  return (
    <>
      {article ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(article) }} /> : null}
      <SharedPost slug={community.slug} post={post} viewer={viewerView(viewer)} readOnly={readOnly}>
        <PlacePage slug={community.slug} place={{ kind: "feed" }} />
      </SharedPost>
    </>
  )
}
