"use client"

/**
 * ===========================================================================
 *  A POST'S CONVERSATION
 * ===========================================================================
 * Comments oldest first with their replies tucked under them (one level: a
 * reply to a reply joins the same thread and names the person it answers).
 * The comment box sits on top; Reply opens a box under the thread with the
 * person's @username already in it. Drawn by the post's own page and by a
 * post opened over the feed (post-overlay.tsx), which hands no first page:
 * the section reads it, with whether the space takes comments and the
 * viewer's own name and picture for the box.
 *
 * A like on a comment answers at once and is put back if the server says no.
 * Edit and delete are the author's; report is everybody else's; a moderator
 * removes through the moderation route.
 */
import Link from "next/link"
import { useCallback, useEffect, useRef, useState } from "react"
import { Flag, Heart, MoreHorizontal, Pencil, Shield, Trash2 } from "lucide-react"
import { AppAvatar } from "@/components/app/app-avatar"
import { ResponsiveActionMenu, type ActionMenuItem } from "@/components/ui/responsive-action-menu"
import { relativeTime } from "@/lib/communities/format"
import type { CommentView, FeedPostView, ViewerView } from "@/lib/communities/types"
import { api, apiBase } from "./api"
import { BodyText } from "./body-text"
import { ConfirmDialog, ReportDialog, type ConfirmState, type ReportTargetRef } from "./dialogs"
import { MentionTextarea, type MentionTextareaHandle } from "./mention-input"
import { actOnContent } from "./moderation"
import { toast } from "./toast"
import { BTN_GHOST, BTN_PRIMARY, BTN_SECONDARY, ICON_BTN } from "./ui"
import { memberHref } from "./person-href"
import { roleTag } from "./view-types"

type CommentUpdate = (id: string, fn: (c: CommentView) => CommentView | null) => void
type Me = { name: string; avatarUrl: string | null }

export interface CommentsPageData {
  comments: CommentView[]
  nextCursor: string | null
  commentsEnabled?: boolean
  me?: Me | null
}

export interface CommentsSectionProps {
  post: Pick<FeedPostView, "id" | "communityId" | "locked">
  slug: string
  viewer: ViewerView
  /** The first page, or null to read it here. */
  initial: CommentsPageData | null
  me?: Me | null
  readOnly?: boolean
  commentsEnabled?: boolean
  boxRef?: React.Ref<MentionTextareaHandle>
  /** A comment or reply went up: the post's count moves by one. */
  onAdded?: () => void
}

export function CommentsSection({ post, slug, viewer, initial, me: givenMe = null, readOnly = false, commentsEnabled: givenEnabled = true, boxRef, onAdded }: CommentsSectionProps) {
  const [comments, setComments] = useState<CommentView[] | null>(initial?.comments ?? null)
  const [cursor, setCursor] = useState<string | null>(initial?.nextCursor ?? null)
  const [enabled, setEnabled] = useState(initial?.commentsEnabled ?? givenEnabled)
  const [me, setMe] = useState<Me | null>(givenMe ?? initial?.me ?? null)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const base = apiBase(post.communityId)
  const open = enabled && !readOnly && !!viewer.can.comment && (!post.locked || !!viewer.can.lock)

  const load = useCallback(async () => {
    setFailed(false)
    const r = await api<CommentsPageData>(`${base}/posts/${post.id}/comments`)
    if (!r.ok) {
      setFailed(true)
      return
    }
    setComments(r.data.comments)
    setCursor(r.data.nextCursor)
    if (typeof r.data.commentsEnabled === "boolean") setEnabled(r.data.commentsEnabled)
    if (r.data.me) setMe((m) => m ?? r.data.me ?? null)
  }, [base, post.id])

  useEffect(() => {
    if (!initial) void load()
  }, [initial, load])

  const update: CommentUpdate = useCallback((id, fn) => {
    setComments((list) =>
      (list ?? []).flatMap((c) => {
        if (c.id === id) {
          const next = fn(c)
          return next ? [next] : []
        }
        if (c.replies.some((r) => r.id === id)) {
          return [
            {
              ...c,
              replies: c.replies.flatMap((r) => {
                if (r.id !== id) return [r]
                const next = fn(r)
                return next ? [next] : []
              }),
            },
          ]
        }
        return [c]
      }),
    )
  }, [])

  const more = async () => {
    if (!cursor || loading) return
    setLoading(true)
    const r = await api<CommentsPageData>(`${base}/posts/${post.id}/comments?cursor=${encodeURIComponent(cursor)}`)
    setLoading(false)
    if (!r.ok) return toast(r.error)
    setComments((list) => [...(list ?? []), ...r.data.comments.filter((c) => !(list ?? []).some((x) => x.id === c.id))])
    setCursor(r.data.nextCursor)
  }

  const added = (c: CommentView) => {
    if (c.parentId) setComments((list) => (list ?? []).map((p) => (p.id === c.parentId ? { ...p, replies: [...p.replies, c] } : p)))
    else setComments((list) => [...(list ?? []), c])
    onAdded?.()
  }

  return (
    <div data-comments-list="">
      {open ? (
        <CommentBox communityId={post.communityId} postId={post.id} me={me} handleRef={boxRef} onAdded={added} placeholder="Write a comment..." />
      ) : (
        <p className="text-[13.5px] text-[#6b7280]">{post.locked ? "Comments are closed on this post." : !enabled ? "Comments are off in this space." : "You cannot comment here right now."}</p>
      )}
      {comments === null ? (
        failed ? (
          <div className="mt-4 flex items-center gap-3 text-[14px] text-[#6b7280]">
            Comments did not load.
            <button type="button" className={BTN_SECONDARY} onClick={() => void load()}>
              Try again
            </button>
          </div>
        ) : (
          <div className="mt-4 space-y-4" aria-label="Loading comments" data-comments-loading="">
            {[0, 1].map((i) => (
              <div key={i} className="flex gap-2.5">
                <span className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-[#f1f2f4]" />
                <span className="h-14 flex-1 animate-pulse rounded-2xl bg-[#f4f5f7]" />
              </div>
            ))}
          </div>
        )
      ) : comments.length ? (
        <ul className="mt-4 space-y-4">
          {comments.map((c) => (
            <li key={c.id}>
              <CommentItem c={c} slug={slug} communityId={post.communityId} postId={post.id} viewer={viewer} me={me} update={update} canReply={open} onAdded={added} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-[14px] text-[#8a8f98]" data-comments-empty="">
          No comments yet.{open ? " Say something first." : ""}
        </p>
      )}
      {cursor ? (
        <div className="mt-4 flex justify-center">
          <button type="button" className={BTN_SECONDARY} onClick={more} disabled={loading}>
            {loading ? "Loading..." : "Show more comments"}
          </button>
        </div>
      ) : null}
    </div>
  )
}

function CommentBox({
  communityId,
  postId,
  me,
  parentId,
  initial = "",
  onAdded,
  onCancel,
  handleRef,
  placeholder,
  autoFocus,
}: {
  communityId: string
  postId: string
  me: Me | null
  parentId?: string
  initial?: string
  onAdded: (c: CommentView) => void
  onCancel?: () => void
  handleRef?: React.Ref<MentionTextareaHandle>
  placeholder: string
  autoFocus?: boolean
}) {
  const [body, setBody] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [focused, setFocused] = useState(!!autoFocus)
  const send = async () => {
    if (!body.trim() || busy) return
    setBusy(true)
    const r = await api<{ comment: CommentView }>(`${apiBase(communityId)}/posts/${postId}/comments`, { body: { body: body.trim(), parentId } })
    setBusy(false)
    if (!r.ok) return toast(r.error)
    setBody("")
    onAdded(r.data.comment)
    onCancel?.()
  }
  return (
    <div className="flex items-start gap-2.5" data-comment-box={parentId ? "reply" : "comment"}>
      {me ? <AppAvatar src={me.avatarUrl} name={me.name} alt="" size={parentId ? 28 : 32} markWhileLoading className="mt-1" /> : null}
      <div className="min-w-0 flex-1 rounded-2xl border border-[#e3e4e8] bg-white px-3 py-2 focus-within:border-[#c9ccd3]">
        <MentionTextarea
          ref={handleRef}
          communityId={communityId}
          value={body}
          onChange={setBody}
          placeholder={placeholder}
          ariaLabel={placeholder}
          maxLength={5000}
          autoFocus={autoFocus}
          onFocus={() => setFocused(true)}
          className="min-h-[24px] text-[16px] leading-6 text-[#262633] sm:text-[14.5px]"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              void send()
            }
          }}
        />
        {focused || body ? (
          <div className="mt-1.5 flex justify-end gap-1.5">
            {onCancel ? (
              <button type="button" className={BTN_GHOST} onClick={onCancel} disabled={busy}>
                Cancel
              </button>
            ) : null}
            <button type="button" className={BTN_PRIMARY} onClick={send} disabled={busy || !body.trim()} data-comment-send="">
              {busy ? "Sending..." : parentId ? "Reply" : "Comment"}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function CommentItem({
  c,
  slug,
  communityId,
  postId,
  viewer,
  me,
  update,
  canReply,
  onAdded,
  parent,
}: {
  c: CommentView
  slug: string
  communityId: string
  postId: string
  viewer: ViewerView
  me: Me | null
  update: CommentUpdate
  canReply: boolean
  onAdded: (c: CommentView) => void
  parent?: CommentView
}) {
  const [replying, setReplying] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(c.body)
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)
  const [report, setReport] = useState<ReportTargetRef | null>(null)
  const pending = useRef(false)
  const base = apiBase(communityId)
  const tag = roleTag(c.author?.role)

  const like = async () => {
    if (pending.current || c.deleted || !viewer.can.react) return
    pending.current = true
    const next = !c.reacted
    update(c.id, (x) => ({ ...x, reacted: next, reactionCount: Math.max(0, x.reactionCount + (next ? 1 : -1)) }))
    const r = await api<{ on: boolean; count: number }>(`${base}/reactions`, { body: { targetType: "comment", targetId: c.id, on: next } })
    pending.current = false
    if (!r.ok) {
      update(c.id, (x) => ({ ...x, reacted: !next, reactionCount: Math.max(0, x.reactionCount + (next ? -1 : 1)) }))
      return toast(r.error)
    }
    update(c.id, (x) => ({ ...x, reacted: r.data.on, reactionCount: r.data.count }))
  }

  const saveEdit = async () => {
    const r = await api<{ comment: CommentView }>(`${base}/comments/${c.id}`, { method: "PATCH", body: { body: draft } })
    if (!r.ok) return toast(r.error)
    update(c.id, (x) => ({ ...x, body: r.data.comment.body, editedAt: r.data.comment.editedAt }))
    setEditing(false)
  }

  const items: ActionMenuItem[] = []
  if (c.canEdit) {
    items.push({ label: "Edit", icon: <Pencil className="h-4 w-4" />, onClick: () => (setDraft(c.body), setEditing(true)) })
    items.push({
      label: "Delete",
      icon: <Trash2 className="h-4 w-4" />,
      variant: "destructive",
      onClick: () =>
        setConfirm({
          title: "Delete this comment?",
          action: "Delete",
          danger: true,
          run: async () => {
            const r = await api(`${base}/comments/${c.id}`, { method: "DELETE" })
            if (!r.ok) {
              toast(r.error)
              return false
            }
            update(c.id, (x) => (x.replies.length ? { ...x, deleted: true, body: "Deleted", author: null, canEdit: false, canModerate: false, reactionCount: 0 } : null))
            return true
          },
        }),
    })
  } else if (!c.deleted && viewer.can.report) {
    items.push({ label: "Report", icon: <Flag className="h-4 w-4" />, onClick: () => setReport({ type: "comment", id: c.id, what: "comment" }) })
  }
  if (c.canModerate && !c.canEdit) {
    items.push({
      label: "Remove comment",
      icon: <Shield className="h-4 w-4" />,
      variant: "destructive",
      section: "Moderation",
      onClick: () =>
        setConfirm({
          title: "Remove this comment?",
          detail: "Members will no longer see it.",
          action: "Remove",
          reason: true,
          danger: true,
          run: async (reason) => {
            const r = await actOnContent(communityId, { action: "remove", targetType: "comment", targetId: c.id, reason: reason || undefined })
            if (!r.ok) {
              toast(r.error)
              return false
            }
            update(c.id, (x) => (x.replies.length ? { ...x, deleted: true, body: "Removed by a moderator", author: null, canEdit: false, canModerate: false } : null))
            return true
          },
        }),
    })
  }

  const small = !!parent
  return (
    <div id={`c-${c.id}`} data-comment={c.id} className="scroll-mt-28">
      <div className="flex items-start gap-2.5">
        {c.author ? (
          <Link href={memberHref(slug, c.author)} className="mt-0.5 shrink-0 rounded-full" data-person-link="" data-person-id={c.author.id}>
            <AppAvatar src={c.author.avatarUrl} name={c.author.name} alt="" size={small ? 28 : 32} markWhileLoading />
          </Link>
        ) : (
          <span className={`mt-0.5 shrink-0 rounded-full bg-[#eceef1] ${small ? "h-7 w-7" : "h-8 w-8"}`} aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          <div className={`rounded-2xl px-3.5 py-2 ${c.deleted ? "bg-transparent px-0" : "bg-[#f4f5f7]"}`}>
            {c.deleted ? (
              <p className="text-[14px] italic text-[#8a8f98]">{c.body}</p>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-x-1.5 text-[13.5px] leading-5">
                  {c.author ? (
                    <Link href={memberHref(slug, c.author)} className="font-semibold text-[#1a1a2e] hover:underline" data-person-link="" data-person-id={c.author.id}>
                      {c.author.name}
                    </Link>
                  ) : (
                    <span className="font-semibold text-[#6b7280]">Former member</span>
                  )}
                  {tag ? <span className="rounded-md bg-white px-1.5 text-[11px] font-medium leading-[17px] text-[#4b5563]">{tag}</span> : null}
                </div>
                {editing ? (
                  <div className="mt-1">
                    <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} maxLength={5000} className="w-full resize-y rounded-lg border border-[#e3e4e8] bg-white px-2.5 py-1.5 text-[16px] outline-none sm:text-[14.5px]" />
                    <div className="mt-1 flex justify-end gap-1.5">
                      <button type="button" className={BTN_GHOST} onClick={() => setEditing(false)}>
                        Cancel
                      </button>
                      <button type="button" className={BTN_PRIMARY} onClick={saveEdit} disabled={!draft.trim()}>
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <BodyText text={c.body} className="mt-0.5 [&_div]:text-[14.5px] [&_div]:leading-[1.55]" />
                )}
              </>
            )}
          </div>
          {!c.deleted ? (
            <div className="flex items-center gap-0.5 pl-1.5 text-[12.5px] text-[#6b7280]">
              <time dateTime={c.createdAt} className="mr-1.5" suppressHydrationWarning>
                {relativeTime(c.createdAt)}
                {c.editedAt ? " · edited" : ""}
              </time>
              <button type="button" onClick={like} aria-pressed={c.reacted} disabled={!viewer.can.react} className={`inline-flex h-10 items-center gap-1 rounded-full px-2 font-medium hover:text-[#1a1a2e] ${c.reacted ? "text-[#c4290c] hover:text-[#c4290c]" : ""}`} data-comment-like="">
                <Heart className={`h-3.5 w-3.5 ${c.reacted ? "fill-current" : ""}`} strokeWidth={2} aria-hidden />
                {c.reactionCount > 0 ? c.reactionCount : "Like"}
              </button>
              {canReply ? (
                <button type="button" onClick={() => setReplying(c.author?.username ? `@${c.author.username} ` : "")} className="inline-flex h-10 items-center rounded-full px-2 font-medium hover:text-[#1a1a2e]">
                  Reply
                </button>
              ) : null}
              {items.length ? (
                <ResponsiveActionMenu
                  title="Comment"
                  items={items}
                  trigger={
                    <button type="button" aria-label="More" className={`${ICON_BTN} h-10 w-10`}>
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                  }
                />
              ) : null}
            </div>
          ) : null}

          {c.replies.length ? (
            <ul className="mt-2 space-y-3">
              {c.replies.map((r) => (
                <li key={r.id}>
                  <CommentItem c={r} slug={slug} communityId={communityId} postId={postId} viewer={viewer} me={me} update={update} canReply={canReply} onAdded={onAdded} parent={c} />
                </li>
              ))}
            </ul>
          ) : null}
          {replying !== null ? (
            <div className="mt-2">
              <CommentBox communityId={communityId} postId={postId} me={me} parentId={parent ? parent.id : c.id} initial={replying} onAdded={onAdded} onCancel={() => setReplying(null)} placeholder={`Reply to ${c.author?.name ?? "this comment"}...`} autoFocus />
            </div>
          ) : null}
        </div>
      </div>
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
      <ReportDialog communityId={communityId} target={report} onClose={() => setReport(null)} />
    </div>
  )
}
