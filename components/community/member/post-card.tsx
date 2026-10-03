"use client"

/**
 * ===========================================================================
 *  ONE POST
 * ===========================================================================
 * Who wrote it and when, in which space; the title and the words; what it
 * carries; and one quiet row of things to do: like, comment, save. The rest
 * (copy the link, edit or delete your own, report somebody else's, and for a
 * moderator pin, lock, remove, mute or ban) is behind the dots, a menu on a
 * computer and a sheet on a phone (ResponsiveActionMenu).
 *
 * A like answers the press at once and is put back if the server says no
 * (optimistic, rolled back on failure). A second press while the first is on
 * its way waits for it, so the count never runs ahead of the database.
 */
import Link from "next/link"
import { useRef, useState } from "react"
import { Bookmark, Heart, Link2, Lock, MessageCircle, MoreHorizontal, Pencil, Pin, Shield, Trash2, Flag, VolumeX, Ban } from "lucide-react"
import { AppAvatar } from "@/components/app/app-avatar"
import { ResponsiveActionMenu, type ActionMenuItem } from "@/components/ui/responsive-action-menu"
import { relativeTime } from "@/lib/communities/format"
import type { FeedPostView, PollView, ViewerView } from "@/lib/communities/types"
import { api, apiBase } from "./api"
import { BodyText } from "./body-text"
import { ConfirmDialog, ReportDialog, type ConfirmState, type ReportTargetRef } from "./dialogs"
import { PostMediaBlock } from "./media"
import { REOPEN, actOnContent, actOnMember, moderationMenu, muteUntil } from "./moderation"
import { PollBlock } from "./poll"
import { toast } from "./toast"
import { BTN_GHOST, BTN_PRIMARY, CARD, FIELD, ICON_BTN } from "./ui"
import { memberHref } from "./person-href"
import { roleTag } from "./view-types"

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

export function PostCard({ post, slug, viewer, update, full = false, readOnly = false, onComment }: PostCardProps) {
  const base = `/community/${slug}`
  const href = `${base}/post/${post.id}`
  const pending = useRef<Promise<unknown> | null>(null)
  /* What the last press asked for, so a press that waited on the one before it starts from there. */
  const asked = useRef<boolean | null>(null)
  const [editing, setEditing] = useState(false)
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)
  const [report, setReport] = useState<ReportTargetRef | null>(null)
  const mod = moderationMenu(viewer, post.author ? { id: post.author.id, role: post.author.role } : null)
  const own = post.canEdit

  const like = async () => {
    if (readOnly || !viewer.can.react) return
    if (pending.current) await pending.current
    const was = asked.current ?? post.reacted
    const next = !was
    asked.current = next
    update(post.id, (p) => ({ ...p, reacted: next, reactionCount: Math.max(0, p.reactionCount + (next ? 1 : -1)) }))
    const call = api<{ on: boolean; count: number }>(`${apiBase(post.communityId)}/reactions`, { body: { targetType: "post", targetId: post.id, on: next } })
    pending.current = call
    const r = await call
    pending.current = null
    if (!r.ok) {
      asked.current = was
      update(post.id, (p) => ({ ...p, reacted: was, reactionCount: Math.max(0, p.reactionCount + (next ? -1 : 1)) }))
      return toast(r.error)
    }
    asked.current = r.data.on
    update(post.id, (p) => ({ ...p, reacted: r.data.on, reactionCount: r.data.count }))
  }

  const save = async () => {
    const next = !post.bookmarked
    update(post.id, (p) => ({ ...p, bookmarked: next }))
    const r = await api<{ on: boolean }>(`${apiBase(post.communityId)}/bookmarks`, { body: { postId: post.id, on: next } })
    if (!r.ok) {
      update(post.id, (p) => ({ ...p, bookmarked: !next }))
      return toast(r.error)
    }
    toast(next ? "Saved. Find it under Saved." : "Removed from Saved.")
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
  const tag = roleTag(author?.role)
  const removed = post.status === "removed"

  return (
    <article className={`${CARD} px-4 pb-2 pt-4 sm:px-5 sm:pt-5`} data-post={post.id} data-pinned={post.pinned ? "true" : undefined}>
      <header className="flex items-start gap-3">
        {author ? (
          <Link href={memberHref(slug, author)} className="shrink-0 rounded-full" data-person-link="">
            <AppAvatar src={author.avatarUrl} name={author.name} alt="" size={40} markWhileLoading />
          </Link>
        ) : (
          <AppAvatar src={null} name="Former member" alt="" size={40} markWhileLoading />
        )}
        <div className="min-w-0 flex-1 pt-0.5">
          <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-[14.5px] leading-5">
            {author ? (
              <Link href={memberHref(slug, author)} className="truncate font-semibold text-[#1a1a2e] hover:underline" data-person-link="">
                {author.name}
              </Link>
            ) : (
              <span className="font-semibold text-[#6b7280]">Former member</span>
            )}
            {tag ? <span className="rounded-md bg-[#f1f2f4] px-1.5 text-[11.5px] font-medium leading-[18px] text-[#4b5563]">{tag}</span> : null}
          </div>
          <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1 text-[13px] leading-5 text-[#6b7280]">
            <Link href={href} className="hover:underline" suppressHydrationWarning>
              <time dateTime={post.createdAt} suppressHydrationWarning>
                {relativeTime(post.createdAt)}
              </time>
            </Link>
            {post.editedAt ? <span>· edited</span> : null}
            {post.space ? (
              <>
                <span aria-hidden>·</span>
                <Link href={`${base}/space/${post.space.slug}`} className="truncate hover:underline">
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

      {removed ? <p className="mt-3 rounded-lg bg-[#fff6e0] px-3 py-2 text-[13px] text-[#8a5a00]">Removed by a moderator. Only moderators see it.</p> : null}

      {editing ? (
        <EditPost post={post} onDone={() => setEditing(false)} update={update} />
      ) : (
        <div className="mt-3">
          {post.kind === "announcement" ? <div className="mb-1 text-[12.5px] font-medium text-[#6b7280]">Announcement</div> : null}
          {post.title ? (
            full ? (
              <h1 className="text-[19px] font-semibold leading-snug text-[#1a1a2e] sm:text-[21px]">{post.title}</h1>
            ) : (
              <h2 className="text-[17px] font-semibold leading-snug text-[#1a1a2e]">
                <Link href={href} className="hover:underline">
                  {post.title}
                </Link>
              </h2>
            )
          ) : null}
          {post.bodyText ? <BodyText text={post.bodyText} clamp={!full} className={post.title ? "mt-1.5" : ""} /> : null}
          <PostMediaBlock media={post.media} communityId={post.communityId} postId={post.id} />
          {post.poll ? (
            <PollBlock poll={post.poll} communityId={post.communityId} canVote={!readOnly && !!viewer.can.react} onChange={(poll: PollView) => update(post.id, (p) => ({ ...p, poll }))} />
          ) : null}
        </div>
      )}

      <footer className="mt-2 flex items-center gap-1 border-t border-[#f0f1f3] pt-1 sm:mt-3">
        <button
          type="button"
          onClick={like}
          aria-pressed={post.reacted}
          disabled={readOnly || !viewer.can.react}
          data-like=""
          className={`${BTN_GHOST} -ml-2 gap-2 ${post.reacted ? "text-[#c4290c] hover:text-[#c4290c]" : ""}`}
        >
          <Heart className={`h-[18px] w-[18px] transition-[scale] ${post.reacted ? "fill-current" : ""}`} strokeWidth={1.75} aria-hidden />
          <span className="tabular-nums" data-like-count="">
            {post.reactionCount > 0 ? post.reactionCount : "Like"}
          </span>
        </button>
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
        <button type="button" onClick={save} aria-pressed={post.bookmarked} aria-label={post.bookmarked ? "Remove from Saved" : "Save"} className={`${ICON_BTN} ml-auto -mr-2 ${post.bookmarked ? "text-[#1a1a2e]" : ""}`} data-save="">
          <Bookmark className={`h-[18px] w-[18px] ${post.bookmarked ? "fill-current" : ""}`} strokeWidth={1.75} />
        </button>
      </footer>

      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
      <ReportDialog communityId={post.communityId} target={report} onClose={() => setReport(null)} />
    </article>
  )
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
      <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="Title (optional)" className={`${FIELD} font-semibold`} />
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={Math.min(14, Math.max(4, body.split("\n").length + 1))} maxLength={20000} className={`${FIELD} resize-y leading-relaxed`} />
      <div className="flex justify-end gap-2">
        <button type="button" className={BTN_GHOST} onClick={onDone} disabled={busy}>
          Cancel
        </button>
        <button type="button" className={BTN_PRIMARY} onClick={save} disabled={busy || (!title.trim() && !body.trim() && !post.media.length && !post.poll)}>
          {busy ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  )
}
