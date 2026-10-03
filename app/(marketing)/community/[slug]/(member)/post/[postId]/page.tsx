import { notFound } from "next/navigation"
import { viewerView } from "@/lib/communities/server/context"
import { admin } from "@/lib/communities/server/db"
import { getPostView } from "@/lib/communities/server/feed"
import { listComments } from "@/lib/communities/server/comments"
import { FeedColumns } from "@/components/community/member/columns"
import { meOf, memberPage, shellData } from "@/components/community/member/data"
import { PostPage } from "@/components/community/member/post-page"

/** /community/<slug>/post/<postId>: the whole post and its comments, one reply level deep. */
export default async function CommunityPostPage({ params }: { params: Promise<{ slug: string; postId: string }> }) {
  const { slug, postId } = await params
  const page = await memberPage(slug)
  if (page.state !== "member" || !page.community || !page.viewer) notFound()
  const { community, viewer } = page
  const db = admin()
  const post = await getPostView(db, community, viewer, postId)
  if (!post) notFound()
  const [comments, me, shell] = await Promise.all([listComments(db, community, viewer, postId, null), meOf(community.id, viewer), shellData(community.id, viewer, community)])
  const space = post.space ? shell.spaces.find((s) => s.id === post.space?.id) : null
  return (
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
  )
}
