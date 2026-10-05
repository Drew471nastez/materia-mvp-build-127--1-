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
 *
 * LIVE (round 10). While the section is on screen it listens to the post's
 * own channel (live.ts): a comment somebody else sends arrives by id and is
 * read through the gated API, then lands at the end of its list (or under
 * its comment) with the same small rise as the member's own (arrive.ts
 * landComment), and the post's count moves with it. The member's typing is
 * said there too (throttled, the id only), and while somebody else types
 * "<name> is writing..." shows in the gap under the box, taking no room of
 * its own, so nothing moves when it comes and goes.
 *
 * THE BOX (round 10): the send button sits inside it, on the right, a round
 * arrow that is grey while there is nothing to send and ink when there is,
 * so focusing the box never adds a row under it. A sent comment keeps its
 * place (its key stays the stand in's when the server's copy replaces it),
 * so it does not flash as it is confirmed.
 *
 * ROUND 11. The box is a Storelib field: a 10px corner, a hairline and a 1px
 * shadow, a soft ring when it has the caret; the send button is pressed by a
 * tint, never a shrink. Beside it a paperclip (pictures and files, for a
 * member who may upload) and GIF: what is picked shows as small tiles at the
 * top of the box while it is sent, Send waits for the uploads, and the
 * comment carries them (media-upload.ts and media-gif.tsx, the composer's
 * own; the server checks them like a post's, and as the member's own,
 * lib/communities/server/comments.ts). Under a comment they are small tiles
 * that open the viewer (media.tsx CommentMedia). A comment may be a GIF or
 * a picture alone.
 *
 * ROUND 12. No files in comments: the paperclip is now a picture button
 * (pictures only) and the server refuses a file. Beside it a video by link
 * (YouTube, Vimeo or Loom, played inline under the comment), emoji (the
 * app's own picker, put in where the caret is) and GIF. A like plays its
 * tiny sound (heart.tsx likeSound); Report opens the report sheet.
 * Edit and delete are the author's; report is everybody else's; a moderator
 * removes through the moderation route.
 */
import Link from "next/link"
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { ArrowUp, Clapperboard, Flag, ImageIcon, Loader2, MoreHorizontal, Pencil, Shield, Trash2, X } from "lucide-react"
import { EmojiControl } from "@/components/app/rich-text/emoji-picker"
import { EMOJI_POPOVER } from "@/components/ui/popover-fit"
import { AppAvatar } from "@/components/app/app-avatar"
import { ResponsiveActionMenu, type ActionMenuItem } from "@/components/ui/responsive-action-menu"
import { relativeTime } from "@/lib/communities/format"
import { EMBED_NAMES, MAX_COMMENT_GIFS, MAX_COMMENT_MEDIA } from "@/lib/communities/post-media"
import type { CommentView, FeedPostView, PostMedia, ViewerView } from "@/lib/communities/types"
import { api, apiBase } from "./api"
import { landComment } from "./arrive"
import { BodyText } from "./body-text"
import { ConfirmDialog, type ConfirmState, type ReportTargetRef } from "./dialogs"
import { LikeHeart, likeSound } from "./heart"
import { CommentMedia } from "./media"
import { GifButton } from "./media-gif"
import { LinkField, type LinkPick } from "./media-link"
import { ProviderMark } from "./media-providers"
import { localPicture, uploadKindOf, uploadPicture } from "./media-upload"
import { listenLive, typingLine, useTyping } from "./live"
import { MentionTextarea, type MentionTextareaHandle } from "./mention-input"
import { actOnContent } from "./moderation"
import { press, useIntent } from "./post-intent"
import { ReportSheet } from "./report-sheet"
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
  /** The words in the box changed (said on the post's channel, throttled). */
  typed?: (words: string) => void
  /** Draw this now. */
  start: (c: Shown) => void
  /** The server has it: swap the stand in for the real one. */
  confirm: (tempId: string, c: CommentView) => void
  /** The server said no: take it out. */
  drop: (tempId: string) => void
}

/** How the rows are keyed and which ones land: a confirmed comment keeps its stand in's key, so it is not drawn again. */
interface Rows {
  keyOf: (id: string) => string
  /** "mine" for one sent from here (it is brought into sight), "live" for somebody else's arriving, null for one read with the page. */
  lands: (id: string) => "mine" | "live" | null
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
  /** How many comments the post says it has: the room kept for them while they are read (no jump when they arrive). */
  expected?: number
  /** The section replaces a room kept for it (an opened post): the comments fade in even when they were already read. */
  fadeIn?: boolean
}

/**
 * ===========================================================================
 *  COMMENTS READ AHEAD (round 9)
 * ===========================================================================
 * A post opened over the feed asks for its comments the moment it is pressed
 * (the card's pointerdown, and the opened post itself), not once its slide has
 * finished, and keeps the answer here rather than in a component: nothing is
 * drawn while the post is still moving, and by the time the comments are
 * drawn they are usually already here, so the room kept for them simply fills
 * in. What a section last showed is kept too (the member's own comments
 * included), so opening the same post again shows it at once and only reads
 * it again quietly.
 */
type Ahead = { at: number; data?: CommentsPageData; promise?: Promise<CommentsPageData | null> }
const AHEAD = new Map<string, Ahead>()
/** Read again on open when older than this. */
const AHEAD_FRESH_MS = 5_000
const aheadKey = (communityId: string, postId: string) => `${communityId}:${postId}`

/** The first page of a post's comments, asked for once however many times this is called. */
export function readAheadComments(communityId: string, postId: string, fresh = false): Promise<CommentsPageData | null> {
  const k = aheadKey(communityId, postId)
  const have = AHEAD.get(k)
  if (have?.promise) return have.promise
  if (have?.data && !fresh) return Promise.resolve(have.data)
  const promise = api<CommentsPageData>(`${apiBase(communityId)}/posts/${postId}/comments`).then((r) => {
    if (!r.ok) {
      if (AHEAD.get(k)?.promise === promise) AHEAD.delete(k)
      return null
    }
    AHEAD.set(k, { at: Date.now(), data: r.data })
    return r.data
  })
  AHEAD.set(k, { at: have?.at ?? 0, data: have?.data, promise })
  return promise
}

/** What is already here for a post, if anything, and whether it is recent. */
function aheadOf(communityId: string, postId: string): { data: CommentsPageData; fresh: boolean } | null {
  const have = AHEAD.get(aheadKey(communityId, postId))
  return have?.data ? { data: have.data, fresh: Date.now() - have.at < AHEAD_FRESH_MS } : null
}

/** The room a list of `expected` comments takes, so the space is there before the words are. */
export function commentsRoom(expected: number): number {
  const n = Math.min(Math.max(0, expected), 4)
  /* A phone's column is narrower, so a comment wraps onto more lines. */
  const narrow = typeof window !== "undefined" && !!window.matchMedia?.("(max-width: 639px)").matches
  /* The box (44) and the band under it where "is writing..." shows (24), then one comment's bubble and its row of actions (100, 112 on a phone) a gap (16) apart; or the one line saying there are none. */
  return 44 + 24 + (n ? n * (narrow ? 112 : 100) + (n - 1) * 16 : 20)
}

/** The kept room while comments are read: still, no shimmer, the comment box's outline where it will be. */
export function CommentsPlaceholder({ expected }: { expected: number }) {
  return (
    <div style={{ minHeight: commentsRoom(expected) }} aria-hidden data-comments-loading="">
      <div className="flex items-start gap-2.5">
        <span className="mt-1 h-8 w-8 shrink-0 rounded-full bg-[#f1f2f4]" />
        <span className="h-[42px] flex-1 rounded-[10px] border border-[#eceef1]" />
      </div>
    </div>
  )
}

export function CommentsSection({ post, slug, viewer, initial, me: givenMe = null, readOnly = false, commentsEnabled: givenEnabled = true, boxRef, onCount, expected = 0, fadeIn = false }: CommentsSectionProps) {
  /* Handed a first page, or one read ahead (COMMENTS READ AHEAD): drawn on the first frame, no waiting state. */
  const [ahead] = useState(() => (initial ? null : aheadOf(post.communityId, post.id)))
  const first = initial ?? ahead?.data ?? null
  const [comments, setComments] = useState<CommentView[] | null>(first?.comments ?? null)
  const [cursor, setCursor] = useState<string | null>(first?.nextCursor ?? null)
  const [enabled, setEnabled] = useState(first?.commentsEnabled ?? givenEnabled)
  const [me, setMe] = useState<Me | null>(givenMe ?? first?.me ?? null)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  /* The list fades in only when it arrives after the room for it was drawn. */
  const [arrived, setArrived] = useState(fadeIn)
  const base = apiBase(post.communityId)
  const open = enabled && !readOnly && !!viewer.can.comment && (!post.locked || !!viewer.can.lock)

  /*
    A PAGE THAT ARRIVES LATE NEVER TAKES A COMMENT AWAY. The first page can
    land after the member has already sent one (a slow connection, a post
    opened and answered at once): what was drawn here and is not in the
    page (sending, or confirmed after the page was read) stays, at the end,
    and so do replies sent under a comment the page has.
  */
  /* The comments and replies sent from this section, stand ins and the server's copies alike. */
  const sentHere = useRef(new Set<string>())
  const apply = useCallback((data: CommentsPageData) => {
    setComments((list) => {
      if (!list?.length) return data.comments
      const byId = new Map(list.map((c) => [c.id, c]))
      const merged = data.comments.map((c) => {
        const mine = byId.get(c.id)
        if (!mine) return c
        const have = new Set(c.replies.map((r) => r.id))
        const extra = mine.replies.filter((r) => !have.has(r.id) && sentHere.current.has(r.id))
        return extra.length ? { ...c, replies: [...c.replies, ...extra] } : c
      })
      const ids = new Set(data.comments.map((c) => c.id))
      return [...merged, ...list.filter((c) => !ids.has(c.id) && sentHere.current.has(c.id))]
    })
    setCursor(data.nextCursor)
    if (typeof data.commentsEnabled === "boolean") setEnabled(data.commentsEnabled)
    if (data.me) setMe((m) => m ?? data.me ?? null)
  }, [])

  const load = useCallback(async () => {
    setFailed(false)
    const r = await api<CommentsPageData>(`${base}/posts/${post.id}/comments`)
    if (!r.ok) {
      setFailed(true)
      return
    }
    apply(r.data)
  }, [base, post.id, apply])

  useEffect(() => {
    if (initial) return
    /* Already shown from what was read ahead: read again quietly only when it is not recent, and swap without a sound. */
    if (ahead && ahead.fresh) return
    let live = true
    void readAheadComments(post.communityId, post.id, !!ahead).then((data) => {
      if (!live) return
      if (!data) {
        if (!ahead) setFailed(true)
        return
      }
      if (!ahead) setArrived(true)
      apply(data)
    })
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial, post.id])

  /* What was on screen (the member's own comments included) is what the next open shows first. */
  const shownRef = useRef<{ comments: CommentView[] | null; cursor: string | null; enabled: boolean; me: Me | null }>({ comments, cursor, enabled, me })
  shownRef.current = { comments, cursor, enabled, me }
  useEffect(() => {
    if (initial) return
    const k = aheadKey(post.communityId, post.id)
    return () => {
      const now = shownRef.current
      const sent = (now.comments ?? []).some((c) => (c as Shown).sending || c.replies.some((r) => (r as Shown).sending))
      if (!now.comments || sent || AHEAD.get(k)?.promise) return
      AHEAD.set(k, { at: AHEAD.get(k)?.at ?? Date.now(), data: { comments: now.comments, nextCursor: now.cursor, commentsEnabled: now.enabled, me: now.me } })
    }
  }, [initial, post.communityId, post.id])

  /* A confirmed comment keeps the key its stand in had; the ones that arrive (sent or live) land with a small rise. */
  const keys = useRef(new Map<string, string>())
  const landing = useRef(new Map<string, "mine" | "live">())
  const rows: Rows = { keyOf: (id) => keys.current.get(id) ?? id, lands: (id) => landing.current.get(id) ?? null }

  /* The names the page already knows, for "<name> is writing...": the commenters on screen. */
  const listRef = useRef(comments)
  listRef.current = comments
  const known = useCallback((id: string) => {
    for (const c of listRef.current ?? []) {
      if (c.author?.id === id) return c.author.name
      for (const r of c.replies) if (r.author?.id === id) return r.author.name
    }
    return null
  }, [])
  const typing = useTyping(post.communityId, post.id, viewer.userId, known)

  /* Somebody else's comment, by id from the post's channel, read through the gate and landed at the end of its list. */
  const cursorRef = useRef(cursor)
  cursorRef.current = cursor
  const onCountRef = useRef(onCount)
  onCountRef.current = onCount
  useEffect(() => {
    const taken = new Set<string>()
    return listenLive(post.communityId, post.id, "comment", (p) => {
      const id = typeof p.commentId === "string" ? p.commentId : ""
      if (!id || taken.has(id) || (viewer.userId && p.authorId === viewer.userId)) return
      taken.add(id)
      void (async () => {
        const r = await api<{ comment: CommentView }>(`${apiBase(post.communityId)}/comments/${encodeURIComponent(id)}`)
        if (!r.ok || !r.data.comment) return
        const c = r.data.comment
        const list = listRef.current
        if (!list) return
        const there = list.some((x) => x.id === c.id || x.replies.some((y) => y.id === c.id))
        if (there) return
        if (c.parentId) {
          if (!list.some((x) => x.id === c.parentId)) return onCountRef.current?.(1)
          landing.current.set(c.id, "live")
          setComments((l) => (l ?? []).map((x) => (x.id === c.parentId && !x.replies.some((y) => y.id === c.id) ? { ...x, replies: [...x.replies, c] } : x)))
        } else if (!cursorRef.current) {
          /* Only when the list is read to its end: otherwise it is on a later page, and Show more brings it. */
          landing.current.set(c.id, "live")
          setComments((l) => (l ?? []).some((x) => x.id === c.id) ? l : [...(l ?? []), c])
        }
        onCountRef.current?.(1)
      })()
    })
  }, [post.communityId, post.id, viewer.userId])

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
    typed: typing.typed,
    start: (c) => {
      typing.sent()
      landing.current.set(c.id, "mine")
      sentHere.current.add(c.id)
      if (c.parentId) setComments((list) => (list ?? []).map((p) => (p.id === c.parentId ? { ...p, replies: [...p.replies, c] } : p)))
      else setComments((list) => [...(list ?? []), c])
      onCount?.(1)
    },
    confirm: (tempId, c) => {
      sentHere.current.add(c.id)
      keys.current.set(c.id, keys.current.get(tempId) ?? tempId)
      update(tempId, () => c)
    },
    drop: (tempId) => {
      update(tempId, () => null)
      onCount?.(-1)
    },
  }
  const author: Author = { id: viewer.userId ?? "", name: me?.name ?? "You", avatarUrl: me?.avatarUrl ?? null }

  return (
    <div data-comments-list="">
      {open ? (
        <div className="relative">
          <CommentBox communityId={post.communityId} postId={post.id} me={me} author={author} handleRef={boxRef} sending={sending} placeholder="Write a comment..." canUpload={!!viewer.can.upload} />
          <TypingLine names={typing.writers.map((w) => w.name)} />
        </div>
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
          /* The room the comments will take, kept still (no shimmer); they fade into it. */
          <div style={{ minHeight: commentsRoom(expected) - 44 }} aria-label="Loading comments" data-comments-loading="" />
        )
      ) : comments.length ? (
        <ul className={`${open ? "mt-6" : "mt-4"} space-y-4 ${arrived ? "animate-in fade-in-0 duration-200 ease-out motion-reduce:animate-none" : ""}`} data-comments-rows="">
          {comments.map((c) => (
            <li key={rows.keyOf(c.id)}>
              <CommentItem c={c} slug={slug} communityId={post.communityId} postId={post.id} viewer={viewer} me={me} author={author} update={update} canReply={open} sending={sending} rows={rows} />
            </li>
          ))}
        </ul>
      ) : (
        <p className={`${open ? "mt-6" : "mt-4"} text-[14px] text-[#8a8f98] ${arrived ? "animate-in fade-in-0 duration-200 ease-out motion-reduce:animate-none" : ""}`} data-comments-empty="">
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

/** Something picked for a comment: drawn at once, sent as soon as it is picked, `media` once the upload has it. */
interface Picked {
  key: string
  kind: "image" | "gif" | "embed"
  name: string
  preview?: string
  progress: number
  media?: PostMedia
}

/** The box's own tools: the glyph alone in a 40px tall target, a tint on hover and on press (never a shrink). */
const BOX_TOOL =
  "-my-1 flex h-10 w-9 shrink-0 cursor-pointer select-none items-center justify-center rounded-[9px] text-[#8a8f98] outline-none transition-colors duration-150 hover:bg-[#f1f2f4] hover:text-[#1a1a2e] active:bg-[#eceef1] active:duration-0 focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15 disabled:pointer-events-none disabled:opacity-40 aria-pressed:bg-[#eceef1] aria-pressed:text-[#1a1a2e] motion-reduce:transition-none [-webkit-tap-highlight-color:transparent]"

/**
 * THE COMMENT BOX (round 12): the words, then its tools: pictures (a member
 * who may upload), a video by link (YouTube, Vimeo, Loom: the link field
 * opens under the box, media-link.tsx), emoji and GIF, with Send at the end.
 * On a computer it is one row; on a phone the tools sit in a row of their
 * own under the words, always there (focusing never adds it), so the words
 * keep the width. No files: the paperclip is gone and the server refuses one.
 */
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
  canUpload = false,
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
  /** Pictures (a member who may upload); a GIF, a video link and emoji are anybody's. */
  canUpload?: boolean
}) {
  const [body, setBody] = useState(initial)
  const [picks, setPicks] = useState<Picked[]>([])
  const [videoField, setVideoField] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  /* The words' own handle (emoji go in where the caret is), handed on to whoever asked for it. */
  const textRef = useRef<MentionTextareaHandle | null>(null)
  const setText = useCallback(
    (h: MentionTextareaHandle | null) => {
      textRef.current = h
      if (typeof handleRef === "function") handleRef(h)
      else if (handleRef) (handleRef as React.MutableRefObject<MentionTextareaHandle | null>).current = h
    },
    [handleRef],
  )
  /* The box's words as they are now, so a refused comment goes back only into an empty box. */
  const current = useRef(body)
  current.current = body
  const picksNow = useRef(picks)
  picksNow.current = picks
  const change = (words: string) => {
    setBody(words)
    sending.typed?.(words)
  }
  const patch = (k: string, p: Partial<Picked>) => setPicks((list) => list.map((x) => (x.key === k ? { ...x, ...p } : x)))
  const drop = (k: string) => setPicks((list) => list.filter((x) => x.key !== k))
  const newKey = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
  const full = () => picksNow.current.length >= MAX_COMMENT_MEDIA

  const addPictures = async (files: FileList | null) => {
    if (!files?.length || !author.id) return
    const room = MAX_COMMENT_MEDIA - picksNow.current.length
    const list = Array.from(files).filter((f) => uploadKindOf(f) === "image")
    if (list.length < files.length) toast(COMMENT_FILES_SAID)
    const taken = list.slice(0, Math.max(0, room))
    if (taken.length < list.length) toast(`Up to ${MAX_COMMENT_MEDIA} pictures, GIFs or videos in a comment.`)
    await Promise.all(
      taken.map(async (file) => {
        const k = newKey()
        const preview = URL.createObjectURL(file)
        setPicks((l) => [...l, { key: k, kind: "image", name: file.name, preview, progress: 10 }])
        try {
          patch(k, { progress: 100, media: await uploadPicture(file, author.id, communityId) })
        } catch (e) {
          drop(k)
          toast((e as Error).message || "The picture did not upload.")
        }
      }),
    )
  }
  const addGif = (gif: Extract<PostMedia, { type: "gif" }>) => {
    const list = picksNow.current
    if (list.filter((x) => x.kind === "gif").length >= MAX_COMMENT_GIFS) return toast("One GIF per comment.")
    if (full()) return toast(`Up to ${MAX_COMMENT_MEDIA} pictures, GIFs or videos in a comment.`)
    setPicks((l) => [...l, { key: newKey(), kind: "gif", name: gif.title ?? "GIF", preview: gif.url, progress: 100, media: gif }])
  }
  const addVideo = (pick: LinkPick) => {
    if (!pick.embed) return
    if (picksNow.current.some((x) => x.kind === "embed")) return toast("One video link per comment.")
    if (full()) return toast(`Up to ${MAX_COMMENT_MEDIA} pictures, GIFs or videos in a comment.`)
    const thumb = pick.embed.thumb ?? pick.preview?.image ?? undefined
    const title = pick.preview?.title?.slice(0, 200)
    setPicks((l) => [...l, { key: newKey(), kind: "embed", name: title || EMBED_NAMES[pick.embed!.provider], preview: thumb, progress: 100, media: { type: "embed", ...pick.embed!, ...(thumb ? { thumb } : {}), ...(title ? { title } : {}) } }])
    setVideoField(false)
    textRef.current?.focus()
  }

  const uploading = picks.some((x) => !x.media)
  const ready = (!!body.trim() || picks.length > 0) && !uploading
  const send = async () => {
    const text = body.trim()
    if (!ready) return
    const media = picks.map((x) => x.media).filter((m): m is PostMedia => !!m)
    const kept = picks
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
      ...(media.length ? { media } : {}),
      sending: true,
    })
    setBody("")
    setPicks([])
    setVideoField(false)
    current.current = ""
    onCancel?.()
    const r = await api<{ comment: CommentView }>(`${apiBase(communityId)}/posts/${postId}/comments`, { body: { body: text, parentId, ...(media.length ? { media } : {}) } })
    if (!r.ok) {
      sending.drop(tempId)
      if (!current.current.trim() && !picksNow.current.length) {
        setBody(text)
        setPicks(kept)
      }
      return toast(r.error)
    }
    sending.confirm(tempId, r.data.comment)
  }
  /* A tool pressed keeps the caret (and a phone its keyboard) in the words. */
  const keep = { onPointerDown: (e: React.PointerEvent) => e.preventDefault(), onMouseDown: (e: React.MouseEvent) => e.preventDefault() }
  return (
    <div className="flex items-start gap-2.5" data-comment-box={parentId ? "reply" : "comment"} data-keep-in-sight="">
      {me ? <AppAvatar src={me.avatarUrl} name={me.name} alt="" size={parentId ? 28 : 32} markWhileLoading className="mt-1" /> : null}
      <div className="min-w-0 flex-1">
        <div
          className="rounded-[10px] border border-[#e3e5e9] bg-white shadow-[0_1px_1px_rgba(16,24,40,0.05)] transition-[border-color,box-shadow] duration-150 focus-within:border-[#c9ccd3] focus-within:shadow-[0_0_0_3px_rgba(26,26,46,0.05),0_1px_1px_rgba(16,24,40,0.05)] motion-reduce:transition-none"
          data-comment-field=""
        >
          {picks.length ? (
            <div className="flex flex-wrap gap-1.5 px-2 pt-2" data-comment-picks="">
              {picks.map((x) => (
                <PickTile key={x.key} pick={x} onRemove={() => drop(x.key)} />
              ))}
            </div>
          ) : null}
          <div className="flex flex-wrap items-end gap-x-0.5 py-1 pl-3 pr-1 sm:flex-nowrap">
            <div className="min-w-0 basis-full py-[5px] pr-2 sm:flex-1 sm:basis-auto sm:pr-0">
              <MentionTextarea
                ref={setText}
                communityId={communityId}
                value={body}
                onChange={change}
                placeholder={placeholder}
                ariaLabel={placeholder}
                maxLength={5000}
                autoFocus={autoFocus}
                className="min-h-[24px] text-[16px] leading-6 text-[#262633] sm:text-[14.5px]"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault()
                    void send()
                  }
                  if (e.key === "Escape" && onCancel && !body && !picks.length) onCancel()
                }}
              />
            </div>
            <div className="-ml-2 flex items-center sm:ml-0" data-comment-tools="">
              {canUpload ? (
                <>
                  <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={(e) => (void addPictures(e.target.files), (e.target.value = ""))} data-comment-file-input="" />
                  <button type="button" aria-label="Add pictures" title="Add pictures" {...keep} onClick={() => fileInput.current?.click()} className={BOX_TOOL} disabled={picks.length >= MAX_COMMENT_MEDIA} data-comment-tool="image">
                    <ImageIcon className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
                  </button>
                </>
              ) : null}
              <button type="button" aria-label="Add a video link" title="Add a video link" aria-pressed={videoField} {...keep} onClick={() => setVideoField((v) => !v)} className={BOX_TOOL} disabled={picks.length >= MAX_COMMENT_MEDIA && !videoField} data-comment-tool="video">
                <Clapperboard className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
              </button>
              <span className="contents" data-comment-tool="emoji">
                <EmojiControl className={`${BOX_TOOL} [&>svg]:h-[18px] [&>svg]:w-[18px]`} size={EMOJI_POPOVER} onBeforeOpen={() => undefined} onInsert={(e) => textRef.current?.insert(e)} />
              </span>
              <span className="contents" data-comment-tool="gif">
                <GifButton communityId={communityId} className={BOX_TOOL} onPick={addGif} disabled={picks.length >= MAX_COMMENT_MEDIA} />
              </span>
            </div>
            <div className="ml-auto flex items-center">
              {onCancel ? (
                <button type="button" aria-label="Cancel reply" onClick={onCancel} className={BOX_TOOL} data-comment-cancel="">
                  <X className="h-4 w-4" strokeWidth={2} aria-hidden />
                </button>
              ) : null}
              {/* Grey with nothing to send, ink with something: one button, its look follows the words (no row added on focus). Pressed is a tint, never a shrink. */}
              <button
                type="button"
                aria-label={parentId ? "Send reply" : "Send comment"}
                /* The field keeps the caret (and a phone its keyboard) through the press. */
                onPointerDown={(e) => e.preventDefault()}
                onMouseDown={(e) => e.preventDefault()}
                onClick={send}
                className="group/send -my-1 flex h-10 w-9 shrink-0 touch-manipulation items-center justify-center rounded-[8px] outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20 disabled:cursor-default [-webkit-tap-highlight-color:transparent]"
                disabled={!ready}
                data-comment-send=""
              >
                <span className={`flex h-8 w-8 items-center justify-center rounded-[7px] transition-[background-color,color,opacity] duration-150 group-active/send:opacity-80 motion-reduce:transition-none ${ready ? "bg-[#1a1a2e] text-white shadow-[0_1px_1.5px_rgba(16,24,40,0.18)]" : "bg-[#eef0f2] text-[#a3a8b0]"}`}>
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" strokeWidth={2.25} aria-hidden /> : <ArrowUp className="h-[17px] w-[17px]" strokeWidth={2.25} aria-hidden />}
                </span>
              </button>
            </div>
          </div>
        </div>
        {videoField ? <LinkField mode="video" communityId={communityId} className="mt-2" onAdd={addVideo} onClose={() => setVideoField(false)} /> : null}
      </div>
    </div>
  )
}

/** What the box says when a file that is not a picture is picked (comments take no files, round 12). */
const COMMENT_FILES_SAID = "Comments take pictures, GIFs and video links. Share files in a post."

/** One thing picked for a comment, at the top of the box: a small tile, its upload as a thin bar, an x to take it off. */
function PickTile({ pick, onRemove }: { pick: Picked; onRemove: () => void }) {
  const picture = pick.kind === "image" ? (pick.preview ?? (pick.media?.type === "image" ? localPicture(pick.media.url) : null)) : pick.preview ?? null
  const embed = pick.media?.type === "embed" ? pick.media : null
  return (
    <div className="relative shrink-0" data-comment-pick={pick.kind} data-comment-pick-ready={pick.media ? "" : undefined}>
      <div className={`relative h-14 overflow-hidden rounded-[8px] border border-[#e6e8eb] ${embed ? "bg-[#1f2230]" : "bg-[#f4f5f7]"}`} style={{ width: embed ? 96 : 56 }}>
        {picture ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={picture} alt="" referrerPolicy={pick.kind === "image" ? undefined : "no-referrer"} className="absolute inset-0 h-full w-full object-cover" />
        ) : null}
        {embed ? (
          <span className="absolute bottom-1 left-1 flex h-5 w-5 items-center justify-center rounded-[5px] bg-white/95 shadow-[0_1px_1px_rgba(0,0,0,0.15)]" aria-label={EMBED_NAMES[embed.provider]} data-comment-pick-site={embed.provider}>
            <ProviderMark provider={embed.provider} size={14} />
          </span>
        ) : null}
        {!pick.media ? (
          <span className="absolute inset-x-1.5 bottom-1.5 h-[3px] overflow-hidden rounded-full bg-black/10" aria-hidden>
            <span className="block h-full origin-left rounded-full bg-[#1a1a2e] transition-[scale] duration-200" style={{ scale: `${Math.max(0.08, pick.progress / 100)} 1` }} />
          </span>
        ) : null}
      </div>
      {/* A 40px target over the tile's corner, the visible x a small dark circle in it. */}
      <button type="button" aria-label={`Remove ${pick.name}`} onClick={onRemove} className="group/rm absolute -right-2 -top-2 flex h-10 w-10 items-start justify-end p-1 outline-none [-webkit-tap-highlight-color:transparent]" data-comment-pick-remove="">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#0f1115]/60 text-white transition-colors group-hover/rm:bg-[#0f1115]/75 group-focus-visible/rm:ring-2 group-focus-visible/rm:ring-[#1a1a2e]/30">
          <X className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
        </span>
      </button>
    </div>
  )
}

/** "<name> is writing...", in the band under the comment box (kept whether or not anybody writes), so nothing moves when it comes and goes. */
function TypingLine({ names }: { names: string[] }) {
  const words = typingLine(names)
  const [shown, setShown] = useState(words)
  /* The last words stay while the line fades out, so it does not go blank first. */
  useEffect(() => {
    if (words) setShown(words)
  }, [words])
  /* Three dots that breathe one after another while somebody writes (opacity on the compositor), still otherwise. */
  const dots = useRef<HTMLSpanElement>(null)
  const on = !!words
  useEffect(() => {
    const box = dots.current
    if (!on || !box || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return
    const running = [...box.children].map((d, i) => (d as HTMLElement).animate?.([{ opacity: 0.3 }, { opacity: 1 }, { opacity: 0.3 }], { duration: 1200, delay: i * 160, iterations: Infinity, easing: "ease-in-out" }))
    return () => running.forEach((a) => a?.cancel())
  }, [on])
  return (
    <p
      aria-live="polite"
      className={`pointer-events-none absolute left-[42px] right-0 top-full mt-1 flex h-4 items-center gap-1.5 truncate text-[12.5px] leading-4 text-[#6b7280] transition-opacity duration-200 motion-reduce:transition-none ${words ? "opacity-100" : "opacity-0"}`}
      data-typing={words ? "" : undefined}
    >
      <span ref={dots} className="flex shrink-0 items-center gap-[3px]" aria-hidden>
        <span className="h-1 w-1 rounded-full bg-[#9ca3af]" />
        <span className="h-1 w-1 rounded-full bg-[#9ca3af]" />
        <span className="h-1 w-1 rounded-full bg-[#9ca3af]" />
      </span>
      <span className="truncate">{words ?? shown}</span>
    </p>
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
  rows,
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
  rows: Rows
  parent?: CommentView
}) {
  /* A comment that arrived while the post is open (sent here, or somebody else's) lands; the ones read with the page do not move. */
  const rowRef = useRef<HTMLDivElement>(null)
  const lands = rows.lands(c.id)
  useLayoutEffect(() => {
    if (!lands) return
    landComment(rowRef.current)
    /*
      The member's own, brought into sight with a mouse and a keyboard only: on
      a touch screen the box being typed in stays under the finger (and above
      the on screen keyboard), never scrolled away from it. Somebody else's
      never moves the reader.
    */
    const el = rowRef.current
    if (el && lands === "mine" && window.matchMedia?.("(hover: hover) and (pointer: fine)").matches && document.documentElement.dataset.keyboard !== "open") {
      /*
        Only the post's own scroller (the sheet's, the panel's) or the page is
        moved, never scrollIntoView: that also scrolls the clipped boxes a
        sheet is made of, and slid the phone's sheet off its own bottom.
      */
      const box = el.closest<HTMLElement>("[data-sheet-scroll], [data-post-overlay-scroll]")
      const r = el.getBoundingClientRect()
      const view = box ? box.getBoundingClientRect() : { top: 0, bottom: window.innerHeight }
      const below = r.bottom - (view.bottom - 12)
      if (below > 0) {
        const opts: ScrollToOptions = { top: Math.min(below, r.top - view.top - 12), behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }
        if (box) box.scrollBy(opts)
        else window.scrollBy(opts)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
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
    likeSound(!reacted)
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
    <div ref={rowRef} id={`c-${c.id}`} data-comment={c.id} data-comment-sending={c.sending ? "" : undefined} className={`scroll-mt-28 transition-opacity duration-200 ${c.sending ? "opacity-60" : ""}`}>
      <div className="flex items-start gap-2.5">
        {c.author ? (
          <Link href={memberHref(slug, c.author)} className="mt-0.5 shrink-0 rounded-full" data-person-link="" data-person-id={c.author.id}>
            <AppAvatar src={c.author.avatarUrl} name={c.author.name} alt="" size={small ? 28 : 32} markWhileLoading />
          </Link>
        ) : (
          <span className={`mt-0.5 shrink-0 rounded-full bg-[#eceef1] ${small ? "h-7 w-7" : "h-8 w-8"}`} aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          {/* Words, or only what it carries (a GIF on its own): then the bubble is just the name's width. */}
          <div className={`rounded-2xl px-3.5 py-2 ${c.deleted ? "bg-transparent px-0" : "bg-[#f4f5f7]"} ${!c.deleted && !c.body && !editing ? "w-fit max-w-full" : ""}`}>
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
                      <button type="button" className={BTN_PRIMARY} onClick={saveEdit} disabled={!draft.trim() && !c.media?.length}>
                        Save
                      </button>
                    </div>
                  </div>
                ) : c.body ? (
                  <BodyText text={c.body} className="mt-0.5 [&_div]:text-[14.5px] [&_div]:leading-[1.55]" />
                ) : null}
              </>
            )}
          </div>
          {!c.deleted ? <CommentMedia media={c.media ?? []} text={c.body} communityId={communityId} commentId={c.id} sending={!!c.sending} /> : null}
          {!c.deleted ? (
            /* One row for both states: "Sending..." in the time's place while it goes, the actions kept in their places (hidden), so confirming moves nothing. */
            <div className="flex items-center gap-0.5 pl-1.5 text-[12.5px] text-[#6b7280]">
              <time dateTime={c.createdAt} className="mr-1.5" suppressHydrationWarning aria-live={c.sending ? "polite" : undefined}>
                {c.sending ? "Sending..." : relativeTime(c.createdAt)}
                {!c.sending && c.editedAt ? " · edited" : ""}
              </time>
              <span className={`flex items-center gap-0.5 transition-opacity duration-200 ${c.sending ? "pointer-events-none opacity-0" : "opacity-100"}`} aria-hidden={c.sending ? true : undefined}>
                <button type="button" onClick={like} aria-pressed={reacted} disabled={!viewer.can.react || !!c.sending} className={`group/like inline-flex h-10 touch-manipulation items-center gap-1 rounded-full px-2 font-medium hover:text-[#1a1a2e] ${reacted ? "text-[#c4290c] hover:text-[#c4290c]" : ""}`} data-comment-like="">
                  <LikeHeart on={reacted} size={15} strokeWidth={2} />
                  <span className="tabular-nums">{reactionCount > 0 ? reactionCount : "Like"}</span>
                </button>
                {canReply ? (
                  <button type="button" onClick={() => setReplying(c.author?.username ? `@${c.author.username} ` : "")} disabled={!!c.sending} className="inline-flex h-10 items-center rounded-full px-2 font-medium hover:text-[#1a1a2e]">
                    Reply
                  </button>
                ) : null}
                {items.length && !c.sending ? (
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
              </span>
            </div>
          ) : null}

          {c.replies.length ? (
            <ul className="mt-2 space-y-3">
              {c.replies.map((r) => (
                <li key={rows.keyOf(r.id)}>
                  <CommentItem c={r} slug={slug} communityId={communityId} postId={postId} viewer={viewer} me={me} author={author} update={update} canReply={canReply} sending={sending} rows={rows} parent={c} />
                </li>
              ))}
            </ul>
          ) : null}
          {replying !== null ? (
            <div className="mt-2">
              <CommentBox communityId={communityId} postId={postId} me={me} author={author} parentId={parent ? parent.id : c.id} initial={replying} sending={sending} onCancel={() => setReplying(null)} placeholder={`Reply to ${c.author?.name ?? "this comment"}...`} autoFocus canUpload={!!viewer.can.upload} />
            </div>
          ) : null}
        </div>
      </div>
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
      <ReportSheet communityId={communityId} target={report} onClose={() => setReport(null)} />
    </div>
  )
}
