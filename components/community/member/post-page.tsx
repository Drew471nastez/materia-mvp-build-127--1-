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
import { ChevronLeft } from "lucide-react"
import { ReturnLink } from "@/components/navigation/return-link"
import { useFirstTap } from "@/lib/navigation/first-tap"
import { backThen } from "@/lib/navigation/go-back"
import { canReturnTo } from "@/lib/navigation/in-app-history"
import { usePressFeedback } from "@/lib/navigation/press-feedback"
import type { CommentView, FeedPostView, ViewerView } from "@/lib/communities/types"
import { CommentsSection } from "./comments"
import type { MentionTextareaHandle } from "./mention-input"
import { PostCard } from "./post-card"
import { markSeen } from "./post-seen"
import { postPath } from "@/lib/communities/post-url"
import { CommunityMark } from "./community-mark"
import { BTN_PRIMARY, CARD, DEPTH_PRESS } from "./ui"

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

  const backHref = post.space ? `/community/${slug}/space/${post.space.slug}` : `/community/${slug}`
  const backLabel = post.space ? post.space.name : "Home"

  useEffect(() => {
    try {
      router.prefetch(backHref)
    } catch {
      /* prefetch is best effort */
    }
  }, [router, backHref])

  /* Old uuid links become the readable address without a reload. */
  useEffect(() => {
    const pretty = postPath(slug, post)
    const here = window.location.pathname
    if (here !== pretty) window.history.replaceState(window.history.state, "", `${pretty}${window.location.search}${window.location.hash}`)
  }, [slug, post.id, post.title, post.bodyText])

  return (
    <div className={`space-y-3 ${visitor ? "pb-28" : "pb-10"}`} data-post-page={visitor ? "visitor" : "member"}>
      {visitor ? null : <PostPageBack href={backHref} label={backLabel} />}
      <PostCard post={post} slug={slug} viewer={viewer} update={updatePost} full readOnly={readOnly} autoEdit={autoEdit} onComment={() => (open ? box.current?.focus() : document.getElementById("comments")?.scrollIntoView({ block: "start" }))} />

      <section id="comments" className={`${CARD} max-sm:mx-[calc(50%-50vw)] max-sm:w-screen max-sm:rounded-none max-sm:border-x-0 px-4 py-4 sm:px-5`} aria-label="Comments" data-comments="">
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
          dockComposer={!visitor}
          onCount={(d) => setPost((p) => ({ ...p, commentCount: Math.max(0, p.commentCount + d) }))}
        />
      </section>
      {visitor ? <VisitorJoinBar slug={slug} {...visitor} /> : null}
    </div>
  )
}

/**
 * BACK TO THE FEED OR SPACE: a full 44px row, the library's pill shape, returns
 * with history when that is where the reader came from, and warms the route on
 * intent so Back usually lands in one piece.
 */
function PostPageBack({ href, label }: { href: string; label: string }) {
  const router = useRouter()
  const press = usePressFeedback<HTMLAnchorElement>()
  const warm = useCallback(() => {
    try {
      router.prefetch(href, { kind: "full" } as never)
    } catch {
      /* a prefetch that fails is a tap that waits */
    }
  }, [router, href])
  const tap = useFirstTap<HTMLAnchorElement>(() => {
    if (!canReturnTo(href)) return false
    backThen(() => router.replace(href, { scroll: false }))
    return true
  })
  return (
    <div className="-mx-1 mb-0.5 flex h-11 items-center" data-post-page-back="">
      <ReturnLink
        href={href}
        scroll={false}
        prefetch
        aria-label={`Back to ${label}`}
        onPointerEnter={warm}
        onFocus={warm}
        onClick={tap.onClick}
        onPointerDown={(e) => {
          warm()
          press.onPointerDown(e)
          tap.onPointerDown(e)
        }}
        onPointerUp={(e) => {
          press.onPointerUp()
          tap.onPointerUp(e)
        }}
        onPointerCancel={() => {
          press.onPointerUp()
          tap.onPointerCancel()
        }}
        onPointerLeave={press.onPointerUp}
        className="group/back inline-flex h-11 min-w-[44px] items-center rounded-full pl-1 pr-2 outline-none [-webkit-tap-highlight-color:transparent] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15"
      >
        <span
          className={`inline-flex h-9 max-w-[min(100vw-2rem,280px)] items-center gap-0.5 rounded-full border border-[#e4e7ec] bg-white pl-2 pr-3.5 text-[14px] font-medium text-[#1a1a2e] shadow-[0_1px_2px_rgba(16,24,40,0.05)] transition-[background-color,border-color,scale] duration-150 ease-out group-hover/back:border-[#d7dadf] group-active/back:scale-[0.96] group-active/back:bg-[#eef0f3] motion-reduce:transition-none ${DEPTH_PRESS}`}
        >
          <ChevronLeft className="h-[18px] w-[18px] shrink-0 text-[#4b5563] transition-[translate] duration-150 ease-out group-hover/back:-translate-x-0.5" strokeWidth={2.25} aria-hidden />
          <span className="truncate">{label}</span>
        </span>
      </ReturnLink>
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
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#e8e9ec] bg-white/[0.98] pb-[env(safe-area-inset-bottom)] shadow-[0_-6px_20px_-12px_rgba(17,24,39,0.18)] animate-in fade-in-0 slide-in-from-bottom-2 duration-300 motion-reduce:animate-none" data-visitor-join="" data-community-fixed-foot="">
      <div className="mx-auto flex min-h-16 max-w-[760px] items-center gap-3 px-4 py-2.5 sm:px-6">
        <CommunityMark community={{ name, logoUrl }} size={36} priority />
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
