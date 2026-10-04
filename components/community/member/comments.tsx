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
 * A comment appears the moment it is sent (round 8): drawn at once in a
 * lighter "Sending" state with the box already empty and ready for the next
 * one, then swapped for the server's copy. If the server says no it is
 * taken out, its words go back in the box when the box is still empty, and
 * the reason is said. Send is never turned off while one is on its way.
 *
 * A like on a comment answers the press on the next frame like a post's
 * (post-intent.ts: one request at a time, the last press wins).
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
import { press, useIntent } from "./post-intent"
import { toast } from "./toast"
import { BTN_GHOST, BTN_PRIMARY, BTN_SECONDARY, ICON_BTN } from "./ui"
import { memberHref } from "./person-href"
import { RoleBadge } from "./role-badge"

type CommentUpdate = (id: string, fn: (c: CommentView) => CommentView | null) => void
type Me = { name: string; avatarUrl: string | null }
/** A comment on its way: drawn at once, lighter, until the server's copy replaces it. */
type Shown = CommentView & { sending?: true }
type Author = { id: string; name: string; avatarUrl: string | null }

/** What a comment box hands its section when it sends. */
interface Sending {
  /** Draw this now. */
  start: (c: Shown) => void
  /** The server has it: swap the stand in for the real one. */
  confirm: (tempId: string, c: CommentView) => void
  /** The server said no: take it out. */
  drop: (tempId: string) => void
}

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
  /** A comment or reply went up (+1) or was refused after being drawn (-1): the post's count moves with it. */
  onCount?: (delta: number) => void
}

export function CommentsSection({ post, slug, viewer, initial, me: givenMe = null, readOnly = false, commentsEnabled: givenEnabled = true, boxRef, onCount }: CommentsSectionProps) {
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

  const sending: Sending = {
    start: (c) => {
      if (c.parentId) setComments((list) => (list ?? []).map((p) => (p.id === c.parentId ? { ...p, replies: [...p.replies, c] } : p)))
      else setComments((list) => [...(list ?? []), c])
      onCount?.(1)
    },
    confirm: (tempId, c) => update(tempId, () => c),
    drop: (tempId) => {
      update(tempId, () => null)
      onCount?.(-1)
    },
  }
  const author: Author = { id: viewer.userId ?? "", name: me?.name ?? "You", avatarUrl: me?.avatarUrl ?? null }

  return (
    <div data-comments-list="">
      {open ? (
        <CommentBox communityId={post.communityId} postId={post.id} me={me} author={author} handleRef={boxRef} sending={sending} placeholder="Write a comment..." />
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
              <CommentItem c={c} slug={slug} communityId={post.communityId} postId={post.id} viewer={viewer} me={me} author={author} update={update} canReply={open} sending={sending} />
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

let tempSeq = 0

function CommentBox({
  communityId,
  postId,
  me,
  author,
  parentId,
  initial = "",
  sending,
  onCancel,
  handleRef,
  placeholder,
  autoFocus,
}: {
  communityId: string
  postId: string
  me: Me | null
  author: Author
  parentId?: string
  initial?: string
  sending: Sending
  onCancel?: () => void
  handleRef?: React.Ref<MentionTextareaHandle>
  placeholder: string
  autoFocus?: boolean
}) {
  const [body, setBody] = useState(initial)
  const [focused, setFocused] = useState(!!autoFocus)
  /* The box's words as they are now, so a refused comment goes back only into an empty box. */
  const current = useRef(body)
  current.current = body
  const send = async () => {
    const text = body.trim()
    if (!text) return
    const tempId = `sending-${Date.now().toString(36)}-${++tempSeq}`
    sending.start({
      id: tempId,
      postId,
      parentId: parentId ?? null,
      body: text,
      status: "published",
      deleted: false,
      author: { id: author.id, name: author.name, username: null, avatarUrl: author.avatarUrl, role: null, level: null },
      reactionCount: 0,
      reacted: false,
      createdAt: new Date().toISOString(),
      editedAt: null,
      replies: [],
      canEdit: false,
      canModerate: false,
      sending: true,
    })
    setBody("")
    current.current = ""
    onCancel?.()
    const r = await api<{ comment: CommentView }>(`${apiBase(communityId)}/posts/${postId}/comments`, { body: { body: text, parentId } })
    if (!r.ok) {
      sending.drop(tempId)
      if (!current.current.trim()) setBody(text)
      return toast(r.error)
    }
    sending.confirm(tempId, r.data.comment)
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
              <button type="button" className={BTN_GHOST} onClick={onCancel}>
                Cancel
              </button>
            ) : null}
            <button type="button" className={`${BTN_PRIMARY} touch-manipulation`} onClick={send} disabled={!body.trim()} data-comment-send="">
              {parentId ? "Reply" : "Comment"}
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
  author,
  update,
  canReply,
  sending,
  parent,
}: {
  c: Shown
  slug: string
  communityId: string
  postId: string
  viewer: ViewerView
  me: Me | null
  author: Author
  update: CommentUpdate
  canReply: boolean
  sending: Sending
  parent?: CommentView
}) {
  const [replying, setReplying] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(c.body)
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)
  const [report, setReport] = useState<ReportTargetRef | null>(null)
  const base = apiBase(communityId)
  const intent = useIntent(`comment-like:${c.id}`)
  const reacted = intent ? intent.on : c.reacted
  const reactionCount = intent ? intent.count : c.reactionCount

  const like = () => {
    if (c.deleted || c.sending || !viewer.can.react) return
    press(`comment-like:${c.id}`, { on: reacted, count: reactionCount }, {
      send: (on) => api<{ on: boolean; count: number }>(`${base}/reactions`, { body: { targetType: "comment", targetId: c.id, on } }),
      apply: (t) => update(c.id, (x) => ({ ...x, reacted: t.on, reactionCount: t.count })),
    })
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
    <div id={`c-${c.id}`} data-comment={c.id} data-comment-sending={c.sending ? "" : undefined} className={`scroll-mt-28 transition-opacity duration-200 ${c.sending ? "opacity-60" : ""}`}>
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
                  <RoleBadge role={c.author?.role} size="xs" />
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
          {c.sending ? (
            <div className="flex h-10 items-center pl-1.5 text-[12.5px] text-[#6b7280]" aria-live="polite">
              Sending...
            </div>
          ) : !c.deleted ? (
            <div className="flex items-center gap-0.5 pl-1.5 text-[12.5px] text-[#6b7280]">
              <time dateTime={c.createdAt} className="mr-1.5" suppressHydrationWarning>
                {relativeTime(c.createdAt)}
                {c.editedAt ? " · edited" : ""}
              </time>
              <button type="button" onClick={like} aria-pressed={reacted} disabled={!viewer.can.react} className={`inline-flex h-10 touch-manipulation items-center gap-1 rounded-full px-2 font-medium hover:text-[#1a1a2e] ${reacted ? "text-[#c4290c] hover:text-[#c4290c]" : ""}`} data-comment-like="">
                <Heart className={`h-3.5 w-3.5 ${reacted ? "fill-current" : ""}`} strokeWidth={2} aria-hidden />
                <span className="tabular-nums">{reactionCount > 0 ? reactionCount : "Like"}</span>
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
                  <CommentItem c={r} slug={slug} communityId={communityId} postId={postId} viewer={viewer} me={me} author={author} update={update} canReply={canReply} sending={sending} parent={c} />
                </li>
              ))}
            </ul>
          ) : null}
          {replying !== null ? (
            <div className="mt-2">
              <CommentBox communityId={communityId} postId={postId} me={me} author={author} parentId={parent ? parent.id : c.id} initial={replying} sending={sending} onCancel={() => setReplying(null)} placeholder={`Reply to ${c.author?.name ?? "this comment"}...`} autoFocus />
            </div>
          ) : null}
        </div>
      </div>
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
      <ReportDialog communityId={communityId} target={report} onClose={() => setReport(null)} />
    </div>
  )
}
