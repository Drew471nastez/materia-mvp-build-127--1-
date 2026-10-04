"use client"

/**
 * ===========================================================================
 *  A POST AND ITS CONVERSATION, AT ITS OWN ADDRESS
 * ===========================================================================
 * /community/<slug>/post/<id> loaded on its own (a shared link, a reload, a
 * notification): the post whole, then its comments (comments.tsx). From the
 * feed the same post opens over the list instead (post-overlay.tsx), at the
 * same address. Opening it marks it seen (post-seen.ts).
 */
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"
import { ArrowLeft } from "lucide-react"
import type { CommentView, FeedPostView, ViewerView } from "@/lib/communities/types"
import { CommentsSection } from "./comments"
import type { MentionTextareaHandle } from "./mention-input"
import { PostCard } from "./post-card"
import { markSeen } from "./post-seen"
import { BTN_GHOST, CARD } from "./ui"

export interface PostPageProps {
  slug: string
  viewer: ViewerView
  post: FeedPostView
  comments: { comments: CommentView[]; nextCursor: string | null }
  me: { name: string; avatarUrl: string | null }
  readOnly?: boolean
  commentsEnabled?: boolean
}

export function PostPage({ slug, viewer, post: initialPost, comments: initial, me, readOnly = false, commentsEnabled = true }: PostPageProps) {
  const router = useRouter()
  const [post, setPost] = useState(initialPost)
  const box = useRef<MentionTextareaHandle>(null)
  const open = commentsEnabled && !readOnly && !!viewer.can.comment && (!post.locked || !!viewer.can.lock)

  const updatePost = useCallback(
    (_id: string, fn: (p: FeedPostView) => FeedPostView | null) => {
      setPost((p) => {
        const next = fn(p)
        if (!next) {
          router.push(`/community/${slug}`)
          return p
        }
        return next
      })
    },
    [router, slug],
  )

  /* Seen, at its latest activity: the card's dot goes out. */
  useEffect(() => {
    markSeen(post.communityId, viewer.userId, post)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post.id])

  /* Arriving at #comments or #c-<id> scrolls there. */
  useEffect(() => {
    const hash = window.location.hash.slice(1)
    if (!hash) return
    const el = document.getElementById(hash)
    if (el) requestAnimationFrame(() => el.scrollIntoView({ block: "center" }))
  }, [])

  return (
    <div className="space-y-3 pb-10">
      <Link href={post.space ? `/community/${slug}/space/${post.space.slug}` : `/community/${slug}`} className={`${BTN_GHOST} -ml-3 text-[13.5px]`}>
        <ArrowLeft className="h-4 w-4" aria-hidden />
        {post.space ? post.space.name : "Home"}
      </Link>
      <PostCard post={post} slug={slug} viewer={viewer} update={updatePost} full readOnly={readOnly} onComment={() => (open ? box.current?.focus() : document.getElementById("comments")?.scrollIntoView({ block: "start" }))} />

      <section id="comments" className={`${CARD} px-4 py-4 sm:px-5`} aria-label="Comments" data-comments="">
        <CommentsSection
          post={post}
          slug={slug}
          viewer={viewer}
          initial={initial}
          me={me}
          readOnly={readOnly}
          commentsEnabled={commentsEnabled}
          boxRef={box}
          onAdded={() => setPost((p) => ({ ...p, commentCount: p.commentCount + 1 }))}
        />
      </section>
    </div>
  )
}
