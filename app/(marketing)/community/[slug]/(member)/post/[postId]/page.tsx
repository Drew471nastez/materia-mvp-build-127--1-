import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { viewerView } from "@/lib/communities/server/context"
import { admin } from "@/lib/communities/server/db"
import { getPostView } from "@/lib/communities/server/feed"
import { listComments } from "@/lib/communities/server/comments"
import { FeedColumns } from "@/components/community/member/columns"
import { meOf, memberPage, shellData } from "@/components/community/member/data"
import { PostPage } from "@/components/community/member/post-page"
import { jsonLdScript } from "@/lib/seo/json-ld"
import { postFacts } from "./post-facts"
import { postArticleJsonLd, postMetadata } from "./post-seo"

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
  if (page.state !== "member" || !page.community || !page.viewer) notFound()
  const { community, viewer } = page
  const db = admin()
  const post = await getPostView(db, community, viewer, postId)
  if (!post) notFound()
  /* The Article's facts with the rest (post-seo), shared with generateMetadata's read (post-facts is cached per request). */
  const [comments, me, shell, facts] = await Promise.all([listComments(db, community, viewer, postId, null), meOf(community.id, viewer), shellData(community.id, viewer, community), postFacts(slug, postId)])
  const space = post.space ? shell.spaces.find((s) => s.id === post.space?.id) : null
  /* Only for a public post; nothing for any other. */
  const article = facts ? postArticleJsonLd(facts) : null
  return (
    <>
      {article ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(article) }} /> : null}
    <FeedColumns
      main={
        <PostPage
          slug={community.slug}
          viewer={viewerView(viewer)}
          post={post}
          comments={comments.ok ? comments.value : { comments: [], nextCursor: null }}
          me={me}
          readOnly={shell.community.archived || !!viewer.mutedUntil}
          commentsEnabled={space ? space.commentsEnabled : true}
        />
      }
    />
    </>
  )
}
