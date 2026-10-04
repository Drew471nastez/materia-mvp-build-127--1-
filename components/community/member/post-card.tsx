"use client"

/**
 * ===========================================================================
 *  ONE POST
 * ===========================================================================
 * IN THE FEED (round 7, after Skool's card): the author's picture with their
 * level on it when the community counts levels, their name, how long ago
 * and in which space; the title in bold with a dot before it when there is
 * something here the member has not seen (post-seen.ts); two lines of the
 * words; ONE thumbnail on the right (media.tsx PostThumb; on a phone the
 * pictures go under the words instead, CardMedia, and the card is a full
 * width row, PHONE_ROW); then the likes,
 * the comments, the faces of the last three people who commented and "New
 * comment 2d ago" when one came in the last week. The whole card opens the
 * post over the feed (post-overlay.tsx) at the post's own address; a link or
 * a button inside it does its own thing, and a press with a modifier key on
 * the title opens the post's page as any link would.
 *
 * OPENED (`full`): the whole text, the pictures and videos as a grid that
 * opens the lightbox (media.tsx PostMediaGrid), the poll, and Like, Comment
 * and Save as words.
 *
 * The rest (copy the link, save, edit or delete your own, report somebody
 * else's, and for a moderator pin, lock, remove, mute or ban) is behind the
 * dots, a menu on a computer and a sheet on a phone (ResponsiveActionMenu).
 *
 * A like and a save answer the press on the next frame and are never
 * turned off while the server is asked; presses as fast as anybody likes
 * make at most two requests, the last press wins, and the count never
 * flickers (post-intent.ts). A refusal of the last press puts it back.
 *
 * A YouTube or Vimeo address in the words plays under them in the opened
 * post and gives the card its thumbnail when nothing else does
 * (post-media.ts withBodyEmbeds).
 */
import Link from "next/link"
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { BarChart3, Bookmark, Heart, Link2, Lock, MessageCircle, MoreHorizontal, Paperclip, Pencil, Pin, Shield, Trash2, Flag, VolumeX, Ban } from "lucide-react"
import { AppAvatar } from "@/components/app/app-avatar"
import { ResponsiveActionMenu, type ActionMenuItem } from "@/components/ui/responsive-action-menu"
import { relativeTime } from "@/lib/communities/format"
import { withBodyEmbeds } from "@/lib/communities/post-media"
import type { FeedPostView, PollView, ViewerView } from "@/lib/communities/types"
import { api, apiBase } from "./api"
import { BodyText, inline } from "./body-text"
import { ConfirmDialog, ReportDialog, type ConfirmState, type ReportTargetRef } from "./dialogs"
import { CardMedia, PostMediaGrid, PostThumb } from "./media"
import { REOPEN, actOnContent, actOnMember, moderationMenu, muteUntil } from "./moderation"
import { PollBlock } from "./poll"
import { readAheadComments } from "./comments"
import { PostOverlay } from "./post-overlay"
import { intentOf, press, useIntent } from "./post-intent"
import { SEEN_EVENT, isUnread, readSeen } from "./post-seen"
import { toast } from "./toast"
import { BTN_GHOST, BTN_PRIMARY, CARD, FIELD, ICON_BTN } from "./ui"
import { memberHref } from "./person-href"
import { RoleBadge } from "./role-badge"

/** "New comment 2d ago", "New comment just now". */
export function newCommentLabel(iso: string, now = Date.now()): string {
  const when = relativeTime(iso, now)
  return when === "just now" ? "New comment just now" : `New comment ${when} ago`
}

export type PostUpdate = (id: string, fn: (p: FeedPostView) => FeedPostView | null) => void

export interface PostCardProps {
  post: FeedPostView
  slug: string
  viewer: ViewerView
  update: PostUpdate
  /** The permalink: the whole text, no link on the title. */
  full?: boolean
  readOnly?: boolean
  /** Where the comment button goes; the permalink passes a function that focuses its box. */
  onComment?: () => void
}

/**
 * ON A PHONE A POST IS A ROW (round 9, after Skool's phone feed, image 60):
 * the screen's full width whatever padding the column has (the margin is
 * worked out from the viewport, not from the column's padding), no rounded
 * card edge, and a thin #f1f2f4 band under it as the only thing between two
 * posts. From 640px it is the card it always was. The composer above the
 * posts is a row the same way (composer.tsx).
 */
export const PHONE_ROW =
  "max-sm:mx-[calc(50%-50vw)] max-sm:mb-0 max-sm:w-screen max-sm:rounded-none max-sm:border-x-0 max-sm:border-t-0 max-sm:border-b-8 max-sm:border-b-[#f1f2f4]"

/*
  ONE CARD DRAWN AGAIN, NOT THE WHOLE FEED. A like changes one post, but the
  feed hands every card a new `update` each time its list changes, so each
  press drew every card again (several frames' work at 4x CPU). A card now
  draws again only when its own post (or how it is shown) changes, and calls
  the feed's latest `update` through a ref.
*/
export const PostCard = memo(PostCardView, (a, b) => a.post === b.post && a.slug === b.slug && a.viewer === b.viewer && a.full === b.full && a.readOnly === b.readOnly && a.onComment === b.onComment)

function PostCardView({ post, slug, viewer, update: given, full = false, readOnly = false, onComment }: PostCardProps) {
  const latest = useRef(given)
  useEffect(() => {
    latest.current = given
  })
  const update: PostUpdate = useCallback((id, fn) => latest.current(id, fn), [])
  const base = `/community/${slug}`
  const href = `${base}/post/${post.id}`
  /*
    While a press is on its way, what the member asked for wins over a copy
    of the post read before it. Only the buttons below draw it as it moves
    (LikeButton, SaveButton, SavedMark subscribe themselves), so a press
    redraws a button, not the whole card; the card reads it when it draws.
  */
  const bookmarked = intentOf(`save:${post.id}`)?.on ?? post.bookmarked
  const media = useMemo(() => withBodyEmbeds(post.media, post.bodyText), [post.media, post.bodyText])
  const [editing, setEditing] = useState(false)
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)
  const [report, setReport] = useState<ReportTargetRef | null>(null)
  const [opened, setOpened] = useState(false)
  const [unread, setUnread] = useState(false)
  const mod = moderationMenu(viewer, post.author ? { id: post.author.id, role: post.author.role } : null)
  const own = post.canEdit

  /* New to me? Read after the first paint (it lives in this browser), and again when any card or page marks a post seen. */
  useEffect(() => {
    if (full) return
    const read = () => setUnread(isUnread(post, viewer.userId, readSeen(post.communityId, viewer.userId)))
    read()
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ postId?: string }>).detail
      if (!d?.postId || d.postId === post.id) read()
    }
    window.addEventListener(SEEN_EVENT, on)
    return () => window.removeEventListener(SEEN_EVENT, on)
  }, [full, post, viewer.userId])

  /* The card opens its post over the feed; a link or a button inside it does its own thing. */
  const openPost = (e: React.MouseEvent) => {
    if (full || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    const target = e.target as HTMLElement
    const inner = target.closest("a, button, input, textarea, select, label, [role=menu], [role=menuitem], [role=dialog], [data-no-open]")
    if (inner && !inner.hasAttribute("data-post-open")) return
    if (window.getSelection?.()?.toString()) return
    e.preventDefault()
    setOpened(true)
  }

  const like = () => {
    if (readOnly || !viewer.can.react) return
    press(`like:${post.id}`, intentOf(`like:${post.id}`) ?? { on: post.reacted, count: post.reactionCount }, {
      send: (on) => api<{ on: boolean; count: number }>(`${apiBase(post.communityId)}/reactions`, { body: { targetType: "post", targetId: post.id, on } }),
      apply: (t) => update(post.id, (p) => ({ ...p, reacted: t.on, reactionCount: t.count })),
    })
  }

  /* `said`: from the menu, where nothing else shows it, a toast says it; the opened post's Save button says it itself. */
  const save = (said = true) => {
    press(`save:${post.id}`, intentOf(`save:${post.id}`) ?? { on: post.bookmarked, count: 0 }, {
      send: (on) => api<{ on: boolean }>(`${apiBase(post.communityId)}/bookmarks`, { body: { postId: post.id, on } }),
      apply: (t) => update(post.id, (p) => ({ ...p, bookmarked: t.on })),
      /* Said once, when the server has it, and only if it ended somewhere new. */
      done: (t, from) => {
        if (said && t.on !== from.on) toast(t.on ? "Saved. Find it under Saved." : "Removed from Saved.")
      },
    })
  }

  const copyLink = async () => {
    const url = `${window.location.origin}${href}`
    try {
      await navigator.clipboard.writeText(url)
      toast("Link copied")
    } catch {
      toast(url)
    }
  }

  const moderate = (action: "pin" | "unpin" | "lock" | typeof REOPEN, done: (p: FeedPostView) => FeedPostView, said: string) => async () => {
    const r = await actOnContent(post.communityId, { action, targetType: "post", targetId: post.id })
    if (!r.ok) return toast(r.error)
    update(post.id, done)
    toast(said)
  }

  const items: ActionMenuItem[] = [{ label: "Copy link", icon: <Link2 className="h-4 w-4" />, onClick: copyLink }]
  if (!full) items.push({ label: bookmarked ? "Remove from Saved" : "Save post", icon: <Bookmark className="h-4 w-4" />, onClick: () => save() })
  if (own && !readOnly) {
    items.push({ label: "Edit post", icon: <Pencil className="h-4 w-4" />, onClick: () => setEditing(true) })
    items.push({
      label: "Delete post",
      icon: <Trash2 className="h-4 w-4" />,
      variant: "destructive",
      onClick: () =>
        setConfirm({
          title: "Delete this post?",
          detail: "It goes for everyone, with its comments.",
          action: "Delete",
          danger: true,
          run: async () => {
            const r = await api(`${apiBase(post.communityId)}/posts/${post.id}`, { method: "DELETE" })
            if (!r.ok) {
              toast(r.error)
              return false
            }
            update(post.id, () => null)
            toast("Post deleted")
            return true
          },
        }),
    })
  }
  if (!own && viewer.can.report) items.push({ label: "Report post", icon: <Flag className="h-4 w-4" />, onClick: () => setReport({ type: "post", id: post.id, what: "post" }) })
  const modItems: ActionMenuItem[] = []
  if (mod.pin) modItems.push({ label: post.pinned ? "Unpin" : "Pin to top", icon: <Pin className="h-4 w-4" />, onClick: post.pinned ? moderate("unpin", (p) => ({ ...p, pinned: false }), "Unpinned") : moderate("pin", (p) => ({ ...p, pinned: true }), "Pinned to the top") })
  if (mod.lock) modItems.push({ label: post.locked ? "Open comments" : "Close comments", icon: <Lock className="h-4 w-4" />, onClick: post.locked ? moderate(REOPEN, (p) => ({ ...p, locked: false }), "Comments open") : moderate("lock", (p) => ({ ...p, locked: true }), "Comments closed") })
  if (mod.remove && !own)
    modItems.push({
      label: "Remove post",
      icon: <Shield className="h-4 w-4" />,
      variant: "destructive",
      onClick: () =>
        setConfirm({
          title: "Remove this post?",
          detail: "Members will no longer see it. It stays in the moderation log.",
          action: "Remove",
          reason: true,
          danger: true,
          run: async (reason) => {
            const r = await actOnContent(post.communityId, { action: "remove", targetType: "post", targetId: post.id, reason: reason || undefined })
            if (!r.ok) {
              toast(r.error)
              return false
            }
            update(post.id, () => null)
            toast("Post removed")
            return true
          },
        }),
    })
  if (mod.mute && post.author)
    modItems.push({
      label: `Mute ${post.author.name} for a day`,
      icon: <VolumeX className="h-4 w-4" />,
      variant: "warning",
      onClick: async () => {
        const r = await actOnMember(post.communityId, { action: "mute", userId: post.author!.id, until: muteUntil(24) })
        toast(r.ok ? `${post.author!.name} is muted for 24 hours` : r.error)
      },
    })
  if (mod.ban && post.author)
    modItems.push({
      label: `Ban ${post.author.name}`,
      icon: <Ban className="h-4 w-4" />,
      variant: "destructive",
      onClick: () =>
        setConfirm({
          title: `Ban ${post.author!.name}?`,
          detail: "They lose access to the community and cannot join again.",
          action: "Ban",
          reason: true,
          danger: true,
          run: async (reason) => {
            const r = await actOnMember(post.communityId, { action: "ban", userId: post.author!.id, reason: reason || undefined })
            if (!r.ok) {
              toast(r.error)
              return false
            }
            toast(`${post.author!.name} is banned`)
            return true
          },
        }),
    })
  if (modItems.length) modItems[0] = { ...modItems[0], section: "Moderation" }

  const author = post.author
  const removed = post.status === "removed"
  const level = post.showLevel && author?.level ? author.level : null
  const fresh = post.lastCommentAt && Date.now() - Date.parse(post.lastCommentAt) < 7 * 86_400_000 ? post.lastCommentAt : null
  const files = media.filter((m) => m.type === "file").length

  const head = (
    <header className="flex items-start gap-3">
      <span className="relative shrink-0">
        {author ? (
          <Link href={memberHref(slug, author)} className="block rounded-full" data-person-link="" data-person-id={author.id}>
            <AppAvatar src={author.avatarUrl} name={author.name} alt="" size={40} markWhileLoading />
          </Link>
        ) : (
          <AppAvatar src={null} name="Former member" alt="" size={40} markWhileLoading />
        )}
        {level ? (
          <span className="pointer-events-none absolute -bottom-1 -right-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#1a1a2e] px-1 text-[10.5px] font-semibold tabular-nums leading-none text-white ring-2 ring-white" aria-label={`Level ${level}`} data-level-badge="">
            {level}
          </span>
        ) : null}
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        {/* One line: a long name is cut short before the role ever drops under it. */}
        <div className="flex min-w-0 items-center gap-x-1.5 text-[14.5px] leading-5" data-post-name-line="">
          {author ? (
            <Link href={memberHref(slug, author)} className="truncate font-semibold text-[#1a1a2e] hover:underline" data-person-link="" data-person-id={author.id}>
              {author.name}
            </Link>
          ) : (
            <span className="font-semibold text-[#6b7280]">Former member</span>
          )}
          <RoleBadge role={author?.role} />
        </div>
        <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1 text-[13px] leading-5 text-[#6b7280]">
          <Link href={href} className="hover:underline" suppressHydrationWarning data-post-open="" onClick={openPost}>
            <time dateTime={post.createdAt} suppressHydrationWarning>
              {relativeTime(post.createdAt)}
            </time>
          </Link>
          {post.editedAt ? <span>· edited</span> : null}
          {post.space ? (
            <>
              <span aria-hidden>·</span>
              <Link href={`${base}/space/${post.space.slug}`} className="max-w-[180px] truncate font-medium text-[#4b5563] transition-colors hover:text-[#1a1a2e] hover:underline" data-post-space="">
                {post.space.name}
              </Link>
            </>
          ) : null}
        </div>
      </div>
      <div className="-mr-2 -mt-1 flex shrink-0 items-center">
        {post.pinned ? (
          <span className="mr-1 inline-flex items-center gap-1 text-[12.5px] font-medium text-[#6b7280]" data-pin-mark="">
            <Pin className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            Pinned
          </span>
        ) : null}
        <ResponsiveActionMenu
          title="Post"
          items={[...items, ...modItems]}
          trigger={
            <button type="button" aria-label="More" className={ICON_BTN}>
              <MoreHorizontal className="h-5 w-5" strokeWidth={1.75} />
            </button>
          }
        />
      </div>
    </header>
  )

  const likeButton = <LikeButton post={post} full={full} disabled={readOnly || !viewer.can.react} onPress={like} />

  if (!full) {
    return (
      <article
        className={`${CARD} ${PHONE_ROW} group/post cursor-pointer px-4 pb-2 pt-4 transition-[border-color,box-shadow] duration-150 sm:px-5 sm:pt-5 sm:hover:border-[#dfe2e6] sm:hover:shadow-[0_1px_3px_rgba(17,24,39,0.05)]`}
        data-post={post.id}
        data-pinned={post.pinned ? "true" : undefined}
        data-unread={unread ? "true" : undefined}
        onClick={openPost}
        /* The comments are asked for as the finger lands, so they are usually here before the post has finished opening. */
        onPointerDown={(e) => {
          if (e.button === 0 && !(e.target as HTMLElement).closest("button, [role=menu]")) void readAheadComments(post.communityId, post.id)
        }}
      >
        {head}
        {removed ? <p className="mt-3 rounded-lg bg-[#fff6e0] px-3 py-2 text-[13px] text-[#8a5a00]">Removed by a moderator. Only moderators see it.</p> : null}
        {editing ? (
          <div data-no-open="">
            <EditPost post={post} onDone={() => setEditing(false)} update={update} />
          </div>
        ) : (
          <div className="mt-3 flex items-start gap-4">
            <div className="min-w-0 flex-1">
              {post.kind === "announcement" ? <div className="mb-1 text-[12.5px] font-medium text-[#6b7280]">Announcement</div> : null}
              {post.title ? (
                <h2 className="flex items-start gap-2 text-[17px] font-semibold leading-snug tracking-[-0.005em] text-[#1a1a2e] sm:text-[18px]">
                  {unread ? <span className="mt-[9px] h-2 w-2 shrink-0 rounded-full bg-[#1a1a2e]" aria-label="New" data-unread-dot="" /> : null}
                  <Link href={href} className="min-w-0 [overflow-wrap:anywhere] hover:underline" data-post-open="" onClick={openPost}>
                    {post.title}
                  </Link>
                </h2>
              ) : null}
              {post.bodyText ? (
                <p className={`line-clamp-2 break-words text-[15px] leading-[1.55] text-[#4b5563] ${post.title ? "mt-1" : ""}`} data-post-excerpt="">
                  {inline(post.bodyText.replace(/\s+/g, " ").slice(0, 400))}
                </p>
              ) : null}
              {post.poll || files ? (
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-[#6b7280]">
                  {post.poll ? (
                    <span className="inline-flex items-center gap-1.5" data-card-poll="">
                      <BarChart3 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                      Poll · {post.poll.totalVotes === 1 ? "1 vote" : `${post.poll.totalVotes} votes`}
                    </span>
                  ) : null}
                  {files ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Paperclip className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                      {files === 1 ? "1 file" : `${files} files`}
                    </span>
                  ) : null}
                </div>
              ) : null}
              {/* A phone draws the pictures here, under the words; a computer keeps the thumbnail on the right. */}
              <CardMedia media={media} className="mt-3 sm:hidden" />
            </div>
            <PostThumb media={media} className="max-sm:hidden" />
          </div>
        )}
        <footer className="mt-2 flex min-h-11 items-center gap-1 sm:mt-2.5">
          {likeButton}
          <button type="button" data-post-open="" aria-label={`Comments, ${post.commentCount}`} className={`${BTN_GHOST} gap-2 px-2 sm:px-2.5`} data-comment-button="">
            <MessageCircle className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
            <span className="tabular-nums">{post.commentCount}</span>
          </button>
          {post.recentCommenters?.length ? (
            <span className="ml-1 flex shrink-0 -space-x-1.5" data-commenters="">
              {/* Three faces; two on a narrow phone, so "New comment 2d ago" keeps its words. */}
              {post.recentCommenters.slice(0, 3).map((c, i) => (
                <AppAvatar key={c.id} src={c.avatarUrl} name={c.name} alt="" size={24} markWhileLoading className={`ring-2 ring-white ${i === 2 ? "max-[399px]:hidden" : ""}`} />
              ))}
            </span>
          ) : null}
          {fresh ? (
            <span className="ml-1.5 min-w-0 truncate text-[12.5px] font-medium text-[#1a1a2e]/80 sm:ml-2 sm:text-[13px]" suppressHydrationWarning data-new-comment="">
              {newCommentLabel(fresh)}
            </span>
          ) : null}
          {post.locked ? (
            <span className="ml-auto inline-flex shrink-0 items-center gap-1 text-[12.5px] text-[#6b7280]">
              <Lock className="h-3.5 w-3.5" aria-hidden />
              <span className="hidden sm:inline">Comments closed</span>
            </span>
          ) : (
            <SavedMark post={post} />
          )}
        </footer>

        <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
        <ReportDialog communityId={post.communityId} target={report} onClose={() => setReport(null)} />
        {opened ? (
          <PostOverlay
            post={post}
            slug={slug}
            viewer={viewer}
            readOnly={readOnly}
            update={update}
            onClose={() => setOpened(false)}
            renderPost={(p, u, focus) => <PostCard post={p} slug={slug} viewer={viewer} update={u} full readOnly={readOnly} onComment={focus} />}
          />
        ) : null}
      </article>
    )
  }

  return (
    <article className={`${CARD} px-4 pb-2 pt-4 sm:px-5 sm:pt-5`} data-post={post.id} data-pinned={post.pinned ? "true" : undefined}>
      {head}
      {removed ? <p className="mt-3 rounded-lg bg-[#fff6e0] px-3 py-2 text-[13px] text-[#8a5a00]">Removed by a moderator. Only moderators see it.</p> : null}

      {editing ? (
        <EditPost post={post} onDone={() => setEditing(false)} update={update} />
      ) : (
        <div className="mt-3">
          {post.kind === "announcement" ? <div className="mb-1 text-[12.5px] font-medium text-[#6b7280]">Announcement</div> : null}
          {post.title ? <h1 className="pr-8 text-[19px] font-semibold leading-snug text-[#1a1a2e] [overflow-wrap:anywhere] sm:text-[21px]">{post.title}</h1> : null}
          {post.bodyText ? <BodyText text={post.bodyText} clamp={false} className={post.title ? "mt-1.5" : ""} /> : null}
          <PostMediaGrid media={media} communityId={post.communityId} postId={post.id} />
          {post.poll ? (
            <PollBlock poll={post.poll} communityId={post.communityId} canVote={!readOnly && !!viewer.can.react} onChange={(poll: PollView) => update(post.id, (p) => ({ ...p, poll }))} />
          ) : null}
        </div>
      )}

      <footer className="mt-2 flex items-center gap-1 border-t border-[#f0f1f3] pt-1 sm:mt-3">
        {likeButton}
        {onComment ? (
          <button type="button" onClick={onComment} className={`${BTN_GHOST} gap-2`} data-comment-button="">
            <MessageCircle className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
            <span className="tabular-nums">{post.commentCount > 0 ? post.commentCount : "Comment"}</span>
          </button>
        ) : (
          <Link href={`${href}#comments`} className={`${BTN_GHOST} gap-2`} data-comment-button="">
            <MessageCircle className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
            <span className="tabular-nums">{post.commentCount > 0 ? post.commentCount : "Comment"}</span>
          </Link>
        )}
        {post.locked ? (
          <span className="ml-1 inline-flex items-center gap-1 text-[12.5px] text-[#6b7280]">
            <Lock className="h-3.5 w-3.5" aria-hidden />
            Comments closed
          </span>
        ) : null}
        <SaveButton post={post} onPress={() => save(false)} />
      </footer>

      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
      <ReportDialog communityId={post.communityId} target={report} onClose={() => setReport(null)} />
    </article>
  )
}

/** The heart and its count: the one part of a card a like draws again. */
function LikeButton({ post, full, disabled, onPress }: { post: FeedPostView; full: boolean; disabled: boolean; onPress: () => void }) {
  const intent = useIntent(`like:${post.id}`)
  const reacted = intent ? intent.on : post.reacted
  const count = intent ? intent.count : post.reactionCount
  return (
    <button
      type="button"
      onClick={onPress}
      aria-pressed={reacted}
      aria-label={full ? undefined : reacted ? `Unlike, ${count} likes` : `Like, ${count} likes`}
      disabled={disabled}
      data-like=""
      className={`${BTN_GHOST} -ml-2 gap-2 touch-manipulation ${full ? "" : "px-2 sm:px-2.5"} ${reacted ? "text-[#c4290c] hover:text-[#c4290c]" : ""}`}
    >
      <Heart className={`h-[18px] w-[18px] ${reacted ? "fill-current" : ""}`} strokeWidth={1.75} aria-hidden />
      <span className="tabular-nums" data-like-count="">
        {full ? (count > 0 ? count : "Like") : count}
      </span>
    </button>
  )
}

/** Save in the opened post: the one part a save draws again. */
function SaveButton({ post, onPress }: { post: FeedPostView; onPress: () => void }) {
  const intent = useIntent(`save:${post.id}`)
  const on = intent ? intent.on : post.bookmarked
  return (
    <button type="button" onClick={onPress} aria-pressed={on} aria-label={on ? "Remove from Saved" : "Save"} className={`${BTN_GHOST} -mr-2 ml-auto gap-2 touch-manipulation ${on ? "text-[#1a1a2e]" : ""}`} data-save="">
      <Bookmark className={`h-[18px] w-[18px] ${on ? "fill-current" : ""}`} strokeWidth={1.75} aria-hidden />
      <span>{on ? "Saved" : "Save"}</span>
    </button>
  )
}

/** The card's small saved mark: always in the page and only hidden when off, so a save adds no element (an added one restyles the page's :has() rules) and an unsaved card keeps the room for "New comment". */
function SavedMark({ post }: { post: FeedPostView }) {
  const intent = useIntent(`save:${post.id}`)
  const on = intent ? intent.on : post.bookmarked
  return <Bookmark className={`ml-auto h-4 w-4 shrink-0 fill-current text-[#1a1a2e] ${on ? "" : "hidden"}`} aria-label={on ? "Saved" : undefined} aria-hidden={on ? undefined : true} data-saved-mark={on ? "" : undefined} />
}

function EditPost({ post, onDone, update }: { post: FeedPostView; onDone: () => void; update: PostUpdate }) {
  const [title, setTitle] = useState(post.title ?? "")
  const [body, setBody] = useState(post.bodyText)
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    const r = await api<{ post: FeedPostView }>(`${apiBase(post.communityId)}/posts/${post.id}`, { method: "PATCH", body: { title, body } })
    setBusy(false)
    if (!r.ok) return toast(r.error)
    update(post.id, () => r.data.post)
    onDone()
  }
  return (
    <div className="mt-3 space-y-2">
      <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="Title" aria-label="Title" className={`${FIELD} font-semibold`} />
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={Math.min(14, Math.max(4, body.split("\n").length + 1))} maxLength={20000} className={`${FIELD} resize-y leading-relaxed`} />
      <div className="flex justify-end gap-2">
        <button type="button" className={BTN_GHOST} onClick={onDone} disabled={busy}>
          Cancel
        </button>
        <button type="button" className={BTN_PRIMARY} onClick={save} disabled={busy || !title.trim() || !body.trim()}>
          {busy ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  )
}
