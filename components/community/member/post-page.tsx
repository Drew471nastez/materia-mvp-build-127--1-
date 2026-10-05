"use client"

/**
 * ===========================================================================
 *  A POST AND ITS CONVERSATION, AT ITS OWN ADDRESS
 * ===========================================================================
 * /community/<slug>/post/<id> loaded on its own (a shared link, a reload, a
 * notification): the post whole, then its comments (comments.tsx). From the
 * feed the same post opens over the list instead (post-overlay.tsx), at the
 * same address. Opening it marks it seen (post-seen.ts).
 *
 * A READER WHO IS NOT A MEMBER (round 13) gets the post read only when it is
 * public (post-seo.ts publicPost): the post, its comments, no box, nothing to
 * press that needs a membership, and a calm Join bar at the bottom of the
 * screen that goes to the community's About page, where joining is.
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
import { AppAvatar } from "@/components/app/app-avatar"
import { BTN_GHOST, BTN_PRIMARY, CARD } from "./ui"

export interface PostPageProps {
  slug: string
  viewer: ViewerView
  post: FeedPostView
  comments: { comments: CommentView[]; nextCursor: string | null }
  me: { name: string; avatarUrl: string | null }
  readOnly?: boolean
  commentsEnabled?: boolean
  /** A reader who is not a member: the community's face for the Join bar. */
  visitor?: { name: string; logoUrl: string | null; signedIn: boolean } | null
}

export function PostPage({ slug, viewer, post: initialPost, comments: initial, me, readOnly = false, commentsEnabled = true, visitor = null }: PostPageProps) {
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

  /* Seen, at its latest activity (Unread reads it). */
  useEffect(() => {
    if (visitor) return
    markSeen(post.communityId, viewer.userId, post)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post.id])

  /*
    ?edit=1 (round 13: the Edit link on a person's own posts in their profile): Edit post opens at once when this viewer may
    edit the post (ignored otherwise), and the parameter leaves the address as it opens, so a reload or Back does not open it
    again. Next's own history state is kept.
  */
  const [autoEdit, setAutoEdit] = useState(false)
  useEffect(() => {
    const url = new URL(window.location.href)
    if (url.searchParams.get("edit") !== "1") return
    url.searchParams.delete("edit")
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`)
    if (wantsEdit(post, readOnly, visitor)) setAutoEdit(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* Arriving at #comments or #c-<id> scrolls there. */
  useEffect(() => {
    const hash = window.location.hash.slice(1)
    if (!hash) return
    const el = document.getElementById(hash)
    if (el) requestAnimationFrame(() => el.scrollIntoView({ block: "center" }))
  }, [])

  return (
    <div className={`space-y-3 ${visitor ? "pb-28" : "pb-10"}`} data-post-page={visitor ? "visitor" : "member"}>
      {visitor ? null : (
        <Link href={post.space ? `/community/${slug}/space/${post.space.slug}` : `/community/${slug}`} className={`${BTN_GHOST} -ml-3 text-[13.5px]`}>
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {post.space ? post.space.name : "Home"}
        </Link>
      )}
      <PostCard post={post} slug={slug} viewer={viewer} update={updatePost} full readOnly={readOnly} autoEdit={autoEdit} onComment={() => (open ? box.current?.focus() : document.getElementById("comments")?.scrollIntoView({ block: "start" }))} />

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
          visitor={!!visitor}
          onCount={(d) => setPost((p) => ({ ...p, commentCount: Math.max(0, p.commentCount + d) }))}
        />
      </section>
      {visitor ? <VisitorJoinBar slug={slug} {...visitor} /> : null}
    </div>
  )
}

/** Whether ?edit=1 opens Edit post: the viewer's own post, not read only, never for a visitor. */
export function wantsEdit(post: Pick<FeedPostView, "canEdit" | "status">, readOnly: boolean, visitor: unknown): boolean {
  return !!post.canEdit && post.status === "published" && !readOnly && !visitor
}

/**
 * THE JOIN BAR for a reader who is not a member: the community's mark, one
 * line, and Join. Its own white surface at the bottom of the screen (above
 * the home bar), a hairline and a soft shadow, rising in once; the page pads
 * for it so it never covers the last comment.
 */
function VisitorJoinBar({ slug, name, logoUrl, signedIn }: { slug: string; name: string; logoUrl: string | null; signedIn: boolean }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#e8e9ec] bg-white/[0.98] pb-[env(safe-area-inset-bottom)] shadow-[0_-6px_20px_-12px_rgba(17,24,39,0.18)] animate-in fade-in-0 slide-in-from-bottom-2 duration-300 motion-reduce:animate-none" data-visitor-join="">
      <div className="mx-auto flex min-h-16 max-w-[760px] items-center gap-3 px-4 py-2.5 sm:px-6">
        <AppAvatar src={logoUrl} name={name} alt="" size={36} className="rounded-[10px]" />
        <p className="min-w-0 flex-1 text-[14px] leading-snug text-[#4b5563]">
          <span className="block truncate font-semibold text-[#1a1a2e]">{name}</span>
          <span className="block truncate">{signedIn ? "Join to like and comment." : "Join free to like and comment."}</span>
        </p>
        <Link href={`/community/${slug}/about`} className={`${BTN_PRIMARY} h-10 shrink-0 px-5 sm:h-10`} data-visitor-join-button="">
          Join
        </Link>
      </div>
    </div>
  )
}
