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
 *
 * ROUND 13. The bubble is a lighter grey with a hairline and a 1px shadow and
 * a 14px corner; Reply and the dots are Storelib's own glyphs (the Solar set
 * the community draws with). Reply puts the caret AFTER "@name " so the
 * answer is typed straight on. Sending plays a soft sound (heart.tsx
 * commentSound, the same Sounds switch as a like). Delete and Remove ask in
 * Storelib's own sheet, above an opened post (report-confirm.tsx). An edit
 * or a delete on somebody else's screen arrives live ("comment-change").
 * Without the media column (run-now part 96) the box offers words only, and
 * staff see a note saying so. A reader who is not a member (a public post)
 * reads the comments with no box and nothing live.
 */
import Link from "next/link"
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { ArrowUp, Clapperboard, ImageIcon, Loader2, X } from "lucide-react"
import { FlagIcon } from "@solar-icons/react/linear/flag"
import { MenuDotsIcon } from "@solar-icons/react/linear/menu-dots"
import { PenIcon } from "@solar-icons/react/linear/pen"
import { ReplyIcon } from "@solar-icons/react/linear/reply"
import { ShieldIcon } from "@solar-icons/react/linear/shield"
import { TrashBinMinimalisticIcon } from "@solar-icons/react/linear/trash-bin-minimalistic"
import { EmojiControl } from "@/components/app/rich-text/emoji-picker"
import { EMOJI_POPOVER } from "@/components/ui/popover-fit"
import { MemberAvatar } from "./member-avatar"
import { ResponsiveActionMenu, type ActionMenuItem } from "@/components/ui/responsive-action-menu"
import { relativeTime } from "@/lib/communities/format"
import { EMBED_NAMES, MAX_COMMENT_GIFS, MAX_COMMENT_MEDIA } from "@/lib/communities/post-media"
import type { CommentView, FeedPostView, PostMedia, ViewerView } from "@/lib/communities/types"
import { api, apiBase } from "./api"
import { landComment, scrollCommentIntoView } from "./arrive"
import { BodyText } from "./body-text"
import type { ConfirmState, ReportTargetRef } from "./dialogs"
import { ConfirmSheet } from "./report-confirm"
import { LikeHeart, commentSound, likeSound } from "./heart"
import { CommentMedia } from "./media"
import { GifButton } from "./media-gif"
import { LinkField, type LinkPick } from "./media-link"
import { ProviderMark } from "./media-providers"
import { localPicture, uploadKindOf, uploadPicture } from "./media-upload"
import { listenLive, typingLine, useTyping } from "./live"
import { MentionTextarea, type MentionPerson, type MentionTextareaHandle } from "./mention-input"
import { actOnContent } from "./moderation"
import { press, useIntent } from "./post-intent"
import { ReportSheet } from "./report-sheet"
import { toast } from "./toast"
import { COMMENT_COMPOSER_DOCK_BOTTOM, COMMENT_COMPOSER_DOCK_SCROLL_PAD } from "@/components/community/fixed-foot-chrome"
import { useVisibleBox } from "./visible-box"
import { BTN_GHOST, BTN_PRIMARY, BTN_SECONDARY } from "./ui"
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
  /** Whether a reply box offers pictures, GIFs and video links (run-now part 96). */
  media: boolean
  /** The people on screen, for "@" in a reply. */
  nearby: () => MentionPerson[]
}

export interface CommentsPageData {
  comments: CommentView[]
  nextCursor: string | null
  commentsEnabled?: boolean
  me?: Me | null
  /** False before run-now part 96 (no media column): words only. */
  mediaReady?: boolean
}

/** What staff read in the box when comments cannot carry pictures yet. */
export const MEDIA_STAFF_NOTE = "Pictures, GIFs and videos in comments are off until run-now part 96 (the comments media column) has run. Members can send words meanwhile."

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
  /** A reader who is not a member (a public post): no box, nothing live. */
  visitor?: boolean
  /**
   * Phone post sheet: the composer sits at the bottom of the scroller and rides
   * the keyboard inset, so focusing it does not leave a tall empty white band
   * above the keys (sheetOverKeyboard padding on the panel).
   */
  pinComposer?: boolean
  /**
   * With pinComposer, a post opened full screen on a phone (post-fullscreen.tsx, round 19): the box is a frosted pill
   * floating at the foot of the page, with the comments scrolling under it, not a white band with a hairline.
   */
  floatComposer?: boolean
  /**
   * The post's own page on a phone: the composer is fixed to the visual
   * viewport, above the keyboard, instead of sitting in a card that leaves
   * a blank band under the field.
   */
  dockComposer?: boolean
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

/*
  WHILE THE COMMENTS ARE READ (round 16, the owner: "the comments show empty, then load abruptly"). The kept room used to be
  plain white, so a post with comments read as one with none until they all landed in a single frame. Now the room holds the
  comments' own outline: a face and a bubble per comment the post has (three at most), in the faintest grey, still (no
  shimmer, nothing that pops). It eases in only when the read is slow (SKELETON_DELAY_MS), so a quick answer goes straight
  from the post to its comments, and the comments rise into the same places (ARRIVE).
*/
const SKELETON_DELAY_MS = 140
const BUBBLE_WIDTHS = ["78%", "56%", "68%"]

/** Opacity (and a 4px rise when `rise`) on the compositor as `el` comes on screen, after `delay`. Nothing with reduced motion. */
function useEaseIn(ref: React.RefObject<HTMLElement | null>, on: boolean, opts: { delay?: number; rise?: boolean; duration?: number } = {}) {
  useLayoutEffect(() => {
    const el = ref.current
    if (!on || !el || typeof el.animate !== "function" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return
    const from: Keyframe = opts.rise ? { opacity: 0, translate: "0 4px" } : { opacity: 0 }
    const to: Keyframe = opts.rise ? { opacity: 1, translate: "0 0" } : { opacity: 1 }
    const a = el.animate([from, to], { duration: opts.duration ?? 240, delay: opts.delay ?? 0, easing: "cubic-bezier(0.32, 0.72, 0, 1)", fill: "backwards" })
    return () => a.cancel()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on])
}

/** The outline of `expected` comments (three at most): a face and a bubble each, as the rows will stand. */
function CommentsSkeleton({ expected, className = "", instant = false }: { expected: number; className?: string; instant?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  /* `instant`: it takes over from the placeholder's outline, already on screen, so it does not fade in a second time. */
  useEaseIn(ref, !instant, { delay: SKELETON_DELAY_MS, duration: 220 })
  const n = Math.min(Math.max(0, expected), 3)
  if (!n) return null
  return (
    <div ref={ref} aria-hidden className={`space-y-4 ${className}`} data-comments-skeleton="">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="flex items-start gap-2.5">
          <span className="mt-0.5 h-8 w-8 shrink-0 rounded-full bg-[#f1f2f4]" />
          <div className="min-w-0 flex-1">
            <div className="h-[62px] rounded-[14px] border border-[#f0f1f3] bg-[#f7f8f9] sm:h-[54px]" style={{ width: BUBBLE_WIDTHS[i] }} />
            <div className="ml-3 mt-2.5 h-2.5 w-24 rounded-full bg-[#f3f4f6]" />
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * The kept room while a post's sheet or panel is still moving (post-overlay.tsx), before the section is drawn: the outline of
 * the comments where the rows will stand (under the box's room, or from the top when the box is pinned to the sheet's foot).
 */
export function CommentsPlaceholder({ expected, pinComposer = false }: { expected: number; pinComposer?: boolean }) {
  return (
    <div style={{ minHeight: commentsRoom(expected) }} aria-hidden data-comments-loading="">
      <CommentsSkeleton expected={expected} className={pinComposer ? "mt-4" : "pt-[92px]"} />
    </div>
  )
}

/*
  THE FLOATING BOX (floatComposer, round 19). Sticky at the foot of the full screen post's scroll, with no ground of its own
  so the comments show through as they pass under it: the box's row (avatar and field) is one frosted pill, the field inside
  it plain. Its first line sits on the keyboard when the keyboard is up (the page is the height of what is on screen).
  ROUND 15 (images/73.webp, "I can see that crack and empty space"): while a field in the post is typed in (the page carries
  data-typing, post-fullscreen.tsx) the box stands on an opaque white ground down to the keyboard's bar, so the strip between
  the pill and the keys is the box's own white, never what scrolls behind it.
*/
const FLOAT_COMPOSER =
  "sticky bottom-0 z-[3] -mx-4 mt-auto px-3 pt-3 [[data-typing]_&]:bg-white [[data-typing]_&]:pt-2 [[data-typing]_&]:shadow-[0_-1px_0_#eef0f2] [&_[data-comment-box=comment]]:items-center [&_[data-comment-box=comment]]:rounded-[26px] [&_[data-comment-box=comment]]:border [&_[data-comment-box=comment]]:border-[#e6e8eb]/80 [&_[data-comment-box=comment]]:bg-white/80 [&_[data-comment-box=comment]]:py-1 [&_[data-comment-box=comment]]:pl-1.5 [&_[data-comment-box=comment]]:pr-1 [&_[data-comment-box=comment]]:shadow-[0_10px_30px_-14px_rgba(16,24,40,0.32),0_1px_2px_rgba(16,24,40,0.06)] [&_[data-comment-box=comment]]:backdrop-blur-xl [&_[data-comment-box=comment]>[data-app-avatar]]:mt-0 [&_[data-comment-box=comment]_[data-comment-field]]:border-transparent [&_[data-comment-box=comment]_[data-comment-field]]:bg-transparent [&_[data-comment-box=comment]_[data-comment-field]]:!shadow-none"

export function CommentsSection({ post, slug, viewer, initial, me: givenMe = null, readOnly = false, commentsEnabled: givenEnabled = true, boxRef, onCount, expected = 0, fadeIn = false, visitor = false, pinComposer = false, floatComposer = false, dockComposer = false }: CommentsSectionProps) {
  /* Handed a first page, or one read ahead (COMMENTS READ AHEAD): drawn on the first frame, no waiting state. */
  const [ahead] = useState(() => (initial ? null : aheadOf(post.communityId, post.id)))
  const first = initial ?? ahead?.data ?? null
  const [comments, setComments] = useState<CommentView[] | null>(first?.comments ?? null)
  const [cursor, setCursor] = useState<string | null>(first?.nextCursor ?? null)
  const [enabled, setEnabled] = useState(first?.commentsEnabled ?? givenEnabled)
  const [mediaReady, setMediaReady] = useState(first?.mediaReady !== false)
  const [me, setMe] = useState<Me | null>(givenMe ?? first?.me ?? null)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  /* The list fades in only when it arrives after the room for it was drawn. */
  const [arrived, setArrived] = useState(fadeIn)
  /* ARRIVE: the rows (or the line saying there are none) rise into the outline's place; the box fades in where its room was. */
  const rowsRef = useRef<HTMLUListElement>(null)
  const emptyRef = useRef<HTMLParagraphElement>(null)
  const composerRef = useRef<HTMLDivElement>(null)
  const listOn = arrived && comments !== null
  useEaseIn(rowsRef, listOn, { rise: true, duration: 280 })
  useEaseIn(emptyRef, listOn, { duration: 220 })
  useEaseIn(composerRef, fadeIn, { duration: 200 })
  const base = apiBase(post.communityId)
  const open = !visitor && enabled && !readOnly && !!viewer.can.comment && (!post.locked || !!viewer.can.lock)

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
    if (typeof data.mediaReady === "boolean") setMediaReady(data.mediaReady)
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
  const shownRef = useRef<{ comments: CommentView[] | null; cursor: string | null; enabled: boolean; me: Me | null; mediaReady: boolean }>({ comments, cursor, enabled, me, mediaReady })
  shownRef.current = { comments, cursor, enabled, me, mediaReady }
  useEffect(() => {
    if (initial) return
    const k = aheadKey(post.communityId, post.id)
    return () => {
      const now = shownRef.current
      const sent = (now.comments ?? []).some((c) => (c as Shown).sending || c.replies.some((r) => (r as Shown).sending))
      if (!now.comments || sent || AHEAD.get(k)?.promise) return
      AHEAD.set(k, { at: AHEAD.get(k)?.at ?? Date.now(), data: { comments: now.comments, nextCursor: now.cursor, commentsEnabled: now.enabled, me: now.me, mediaReady: now.mediaReady } })
    }
  }, [initial, post.communityId, post.id])

  /* A confirmed comment keeps the key its stand in had; the ones that arrive (sent or live) land with a small rise. */
  const keys = useRef(new Map<string, string>())
  const landing = useRef(new Map<string, "mine" | "live">())
  const rowsBase = { keyOf: (id: string) => keys.current.get(id) ?? id, lands: (id: string) => landing.current.get(id) ?? null }

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
  const typing = useTyping(post.communityId, post.id, viewer.userId, known, !visitor)
  /* The people on screen, offered first when "@" is typed (mention-input.tsx), the newest commenters first. */
  const nearby = useCallback((): MentionPerson[] => {
    const out: MentionPerson[] = []
    for (const c of [...(listRef.current ?? [])].reverse()) {
      for (const a of [...c.replies.map((r) => r.author), c.author].reverse()) {
        if (a?.username && a.id !== viewer.userId && !out.some((p) => p.id === a.id)) out.push({ id: a.id, name: a.name, username: a.username, avatarUrl: a.avatarUrl })
      }
    }
    return out
  }, [viewer.userId])
  const rows: Rows = { ...rowsBase, media: mediaReady, nearby }

  /* Somebody else's comment, by id from the post's channel, read through the gate and landed at the end of its list. */
  const cursorRef = useRef(cursor)
  cursorRef.current = cursor
  const onCountRef = useRef(onCount)
  onCountRef.current = onCount
  useEffect(() => {
    if (visitor) return
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
  }, [post.communityId, post.id, viewer.userId, visitor])

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

  /*
    AN EDIT OR A DELETE ON SOMEBODY ELSE'S SCREEN (round 13). An edit is read again through the gate and its words, its media
    and "edited" change in place; a delete (or an edit the member may no longer read) takes it away the way the author's own
    delete does: "Deleted" in its place while it has replies, gone otherwise, and the post's count follows.
  */
  useEffect(() => {
    if (visitor) return
    const gone = (id: string) => {
      const list = listRef.current
      if (!list?.some((c) => c.id === id || c.replies.some((r) => r.id === id))) return
      update(id, (x) => (x.replies.length ? { ...x, deleted: true, body: "Deleted", author: null, media: undefined, canEdit: false, canModerate: false, reactionCount: 0 } : null))
      onCountRef.current?.(-1)
    }
    return listenLive(post.communityId, post.id, "comment-change", (p) => {
      const id = typeof p.commentId === "string" ? p.commentId : ""
      if (!id) return
      if (p.change === "delete") return gone(id)
      if (p.change !== "edit") return
      void (async () => {
        const r = await api<{ comment: CommentView }>(`${apiBase(post.communityId)}/comments/${encodeURIComponent(id)}`)
        if (r.ok === false && r.status === 404) return gone(id)
        if (!r.ok || !r.data.comment) return
        const c = r.data.comment
        update(id, (x) => ({ ...x, body: c.body, editedAt: c.editedAt, media: c.media }))
      })()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post.communityId, post.id, visitor])

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
  const staff = viewer.role === "owner" || viewer.role === "admin" || viewer.role === "moderator"
  /** Docked to the keyboard only on a phone; on desktop the box stays in the comments column. */
  const [dockPhone, setDockPhone] = useState(false)
  useEffect(() => {
    if (!dockComposer) {
      setDockPhone(false)
      return
    }
    const mq = window.matchMedia("(max-width: 639px)")
    const sync = () => setDockPhone(mq.matches)
    sync()
    mq.addEventListener("change", sync)
    return () => mq.removeEventListener("change", sync)
  }, [dockComposer])
  /*
    THE DOCK ON THE KEYBOARD, FLUSH (round 15, images/73.webp). While its field is typed in, the dock's foot is the foot of
    the part of the screen that can be seen (visible-box.ts): the visual viewport, or in the iOS app the iPhone's own keyboard
    instead of the half screen floor that left a band of page between the box and the keys. With no keyboard it stands on
    the tab bar as before. A white skirt under it while it is typed in covers whatever a platform's number leaves.
  */
  useVisibleBox(
    dockPhone,
    () => composerRef.current,
    () => document.querySelector<HTMLElement>("[data-viewport-probe]"),
    (box, typing, layoutH) => {
      const dock = composerRef.current
      if (!dock) return
      dock.style.bottom = box.aboveTabs ? COMMENT_COMPOSER_DOCK_BOTTOM : `${Math.max(0, Math.round(layoutH - (box.top + box.height)))}px`
      dock.toggleAttribute("data-typing", typing)
    },
  )
  /*
    A phone pans the page to reveal a field, even a fixed one, and that pan
    is what cuts the picture and leaves the white band. Hold the page where
    it was for as long as the dock is being typed in. The dock itself is
    portalled onto <html>, so fixing the body does not take the box with it.
  */
  useEffect(() => {
    if (!dockPhone) return
    const body = document.body
    let locked = false
    let y = 0
    const lock = () => {
      if (locked) return
      y = window.scrollY
      body.style.position = "fixed"
      body.style.top = `-${y}px`
      body.style.left = "0"
      body.style.right = "0"
      body.style.width = "100%"
      locked = true
    }
    const unlock = () => {
      if (!locked) return
      body.style.position = ""
      body.style.top = ""
      body.style.left = ""
      body.style.right = ""
      body.style.width = ""
      locked = false
      window.scrollTo(0, y)
    }
    const inDock = (node: EventTarget | null) => node instanceof Element && !!node.closest("[data-comments-composer='dock']")
    const onPointerDown = (ev: Event) => {
      if (inDock(ev.target)) lock()
    }
    const onFocusOut = () => {
      window.setTimeout(() => {
        if (!inDock(document.activeElement)) unlock()
      }, 60)
    }
    document.addEventListener("pointerdown", onPointerDown, true)
    document.addEventListener("focusout", onFocusOut, true)
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true)
      document.removeEventListener("focusout", onFocusOut, true)
      unlock()
    }
  }, [dockPhone])

  const composer =
    open ? (
      <div
        ref={composerRef}
        className={
          dockComposer
            ? dockPhone
              ? "fixed inset-x-0 z-[80] border-t border-[#f0f1f3] bg-white px-4 pt-2 shadow-[0_-8px_24px_-16px_rgba(16,24,40,0.18)]"
              : "relative"
            : pinComposer && floatComposer
              ? FLOAT_COMPOSER
              : pinComposer
                ? "sticky bottom-0 z-[3] -mx-4 mt-auto border-t border-[#eceef1] bg-white px-4 pt-3 shadow-[0_-1px_0_#fff] sm:mx-0"
                : "relative"
        }
        style={
          dockComposer && dockPhone
            ? {
                bottom: COMMENT_COMPOSER_DOCK_BOTTOM,
                paddingBottom: "max(10px, calc(env(safe-area-inset-bottom, 0px) - var(--kb-inset, 0px)))",
              }
            : pinComposer
              ? {
                  paddingBottom: floatComposer
                    ? "max(calc(env(safe-area-inset-bottom, 0px) - var(--kb-inset, 0px)), 8px)"
                    : "max(calc(env(safe-area-inset-bottom, 0px) - var(--kb-inset, 0px)), 10px)",
                }
              : undefined
        }
        data-comments-composer={dockComposer ? (dockPhone ? "dock" : "top") : pinComposer ? (floatComposer ? "float" : "pin") : "top"}
      >
        {dockComposer && dockPhone ? <div aria-hidden className="pointer-events-none absolute inset-x-0 top-full hidden h-[100lvh] bg-white [[data-typing]>&]:block" data-comments-dock-skirt="" /> : null}
        <CommentBox communityId={post.communityId} postId={post.id} me={me} author={author} handleRef={boxRef} sending={sending} placeholder="Write a comment..." canUpload={!!viewer.can.upload} media={mediaReady} nearby={nearby} />
        <TypingLine names={typing.writers.map((w) => w.name)} />
      </div>
    ) : (
      <p className="text-[13.5px] text-[#6b7280]" data-comments-closed="">
        {visitor ? "Join the community to comment." : post.locked ? "Comments are closed on this post." : !enabled ? "Comments are off in this space." : "You cannot comment here right now."}
      </p>
    )

  const listGap = open && !pinComposer && !(dockComposer && dockPhone) ? "mt-6" : "mt-4"
  const dockedComposer = dockComposer && dockPhone && typeof document !== "undefined" ? createPortal(composer, document.documentElement) : null
  const composerInColumn = !pinComposer && (!dockComposer || !dockPhone)

  return (
    <div
      data-comments-list=""
      data-comments-composer-pin={pinComposer || (dockComposer && dockPhone) ? "" : undefined}
      /* Pinned in a post's sheet the box sits at the foot of the sheet, under the last comment, with nothing below it (round 15: no band of white under "Write a comment"). */
      className={`${pinComposer ? "flex min-h-full flex-1 flex-col" : ""} ${dockComposer && dockPhone ? "max-sm:[padding-bottom:var(--comments-dock-pad)]" : ""}`}
      style={dockComposer && dockPhone ? ({ ["--comments-dock-pad" as string]: COMMENT_COMPOSER_DOCK_SCROLL_PAD } as React.CSSProperties) : undefined}
    >
      {composerInColumn ? composer : null}
      {dockedComposer}
      {open && !mediaReady && staff ? (
        <p className={`${pinComposer ? "mt-4" : "mt-7"} rounded-[10px] border border-[#f0e2bf] bg-[#fffaf0] px-3 py-2 text-[12.5px] leading-relaxed text-[#7a5a12]`} data-comments-media-note="">
          {MEDIA_STAFF_NOTE}
        </p>
      ) : null}
      {comments === null ? (
        failed ? (
          <div className="mt-4 flex items-center gap-3 text-[14px] text-[#6b7280]">
            Comments did not load.
            <button type="button" className={BTN_SECONDARY} onClick={() => void load()}>
              Try again
            </button>
          </div>
        ) : (
          /* The room the comments will take, with their outline in it (CommentsSkeleton); they rise into it. */
          <div style={{ minHeight: pinComposer ? commentsRoom(expected) : commentsRoom(expected) - 44 }} aria-label="Loading comments" data-comments-loading="">
            <CommentsSkeleton expected={expected} className={listGap} instant={fadeIn} />
          </div>
        )
      ) : comments.length ? (
        <ul ref={rowsRef} className={`${listGap} space-y-4`} data-comments-rows="">
          {comments.map((c) => (
            <li key={rows.keyOf(c.id)}>
              <CommentItem c={c} slug={slug} communityId={post.communityId} postId={post.id} viewer={viewer} me={me} author={author} update={update} canReply={open} sending={sending} rows={rows} />
            </li>
          ))}
        </ul>
      ) : (
        <p
          ref={emptyRef}
          className={`${pinComposer ? "flex flex-1 flex-col items-center justify-center px-8 py-10 text-center" : listGap} text-[14px] leading-relaxed text-[#8a8f98]`}
          data-comments-empty=""
        >
          <span>No comments yet.</span>
          {open ? <span className="mt-1 block text-[13px] text-[#a3a8b0]">Say something first.</span> : null}
        </p>
      )}
      {cursor ? (
        <div className="mt-4 flex justify-center">
          <button type="button" className={BTN_SECONDARY} onClick={more} disabled={loading}>
            {loading ? "Loading..." : "Show more comments"}
          </button>
        </div>
      ) : null}
      {pinComposer ? composer : null}
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
  /** Why its upload failed (kept on the tile until it is taken off). */
  error?: string
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
  media: mediaOn = true,
  nearby,
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
  /** False before run-now part 96: no pictures, GIFs or video links, words and emoji only. */
  media?: boolean
  /** The people on screen, offered first for "@". */
  nearby?: () => MentionPerson[]
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
        setPicks((l) => [...l, { key: k, kind: "image", name: file.name, preview, progress: 0 }])
        try {
          const media = await uploadPicture(file, author.id, communityId, { key: k, onProgress: (p) => patch(k, { progress: p }) })
          patch(k, { progress: 100, media })
        } catch (e) {
          const message = (e as Error).message || "The picture did not upload."
          if (message === "Upload stopped") return drop(k)
          patch(k, { error: message })
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
    /* A soft sound as it goes, in the press itself (heart.tsx commentSound: the Sounds switch, never hidden, never with reduced motion). */
    commentSound()
    setBody("")
    setPicks([])
    setVideoField(false)
    current.current = ""
    onCancel?.()
    const r = await api<{ comment: CommentView; held?: boolean; message?: string }>(`${apiBase(communityId)}/posts/${postId}/comments`, { body: { body: text, parentId, ...(media.length ? { media } : {}) } })
    /*
      HELD FOR A MODERATOR (202): the stand in goes (it is not published), the
      words and what it carried come back into the box when it is still empty,
      so they can be changed, and a toast says what the server said.
    */
    if (r.ok && r.data.held) {
      sending.drop(tempId)
      if (!current.current.trim() && !picksNow.current.length) {
        setBody(text)
        setPicks(kept)
      }
      return toast(r.data.message || HELD_COMMENT)
    }
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
      {me ? <MemberAvatar src={me.avatarUrl} name={me.name} alt="" size={parentId ? 28 : 32} className="mt-1" /> : null}
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
                caretAtEnd={!!initial}
                nearby={nearby}
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
              {canUpload && mediaOn ? (
                <>
                  <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={(e) => (void addPictures(e.target.files), (e.target.value = ""))} data-comment-file-input="" />
                  <button type="button" aria-label="Add pictures" title="Add pictures" {...keep} onClick={() => fileInput.current?.click()} className={BOX_TOOL} disabled={picks.length >= MAX_COMMENT_MEDIA} data-comment-tool="image">
                    <ImageIcon className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
                  </button>
                </>
              ) : null}
              {mediaOn ? (
                <button type="button" aria-label="Add a video link" title="Add a video link" aria-pressed={videoField} {...keep} onClick={() => setVideoField((v) => !v)} className={BOX_TOOL} disabled={picks.length >= MAX_COMMENT_MEDIA && !videoField} data-comment-tool="video">
                  <Clapperboard className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
                </button>
              ) : null}
              <span className="contents" data-comment-tool="emoji">
                <EmojiControl className={`${BOX_TOOL} [&>svg]:h-[18px] [&>svg]:w-[18px]`} size={EMOJI_POPOVER} onBeforeOpen={() => undefined} onInsert={(e) => textRef.current?.insert(e)} />
              </span>
              {mediaOn ? (
                <span className="contents" data-comment-tool="gif">
                  <GifButton communityId={communityId} className={BOX_TOOL} onPick={addGif} disabled={picks.length >= MAX_COMMENT_MEDIA} />
                </span>
              ) : null}
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

/** Said when the server holds a comment for a moderator and gives no words of its own. */
export const HELD_COMMENT = "Your comment is waiting for a moderator."

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
    /* The member's own: scroll it into sight once it has started to land (touch and desktop). */
    const el = rowRef.current
    if (el && lands === "mine") {
      const run = () => scrollCommentIntoView(el)
      const reduce = !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
      if (reduce) run()
      else window.setTimeout(run, 80)
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
    items.push({ label: "Edit", icon: <PenIcon size={16} />, onClick: () => (setDraft(c.body), setEditing(true)) })
    items.push({
      label: "Delete",
      icon: <TrashBinMinimalisticIcon size={16} />,
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
            toast("Comment deleted")
            return true
          },
        }),
    })
  } else if (!c.deleted && viewer.can.report) {
    items.push({ label: "Report", icon: <FlagIcon size={16} />, onClick: () => setReport({ type: "comment", id: c.id, what: "comment" }) })
  }
  if (c.canModerate && !c.canEdit) {
    items.push({
      label: "Remove comment",
      icon: <ShieldIcon size={16} />,
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
            toast("Comment removed")
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
          /* The face's room is its full size from the first frame, photo or not, so a comment never resettles when one arrives (round 14's reference). */
          <Link href={memberHref(slug, c.author)} className={`mt-0.5 flex shrink-0 rounded-full ${small ? "h-7 w-7" : "h-8 w-8"}`} data-person-link="" data-person-id={c.author.id} data-comment-face="">
            <MemberAvatar src={c.author.avatarUrl} name={c.author.name} alt="" size={small ? 28 : 32} lazy />
          </Link>
        ) : (
          <span className={`mt-0.5 shrink-0 rounded-full bg-[#eceef1] ${small ? "h-7 w-7" : "h-8 w-8"}`} aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          {/* Words, or only what it carries (a GIF on its own): then the bubble is just the name's width. */}
          <div className={`rounded-[14px] px-3.5 py-2 ${c.deleted ? "bg-transparent px-0" : BUBBLE} ${!c.deleted && !c.body && !editing ? "w-fit max-w-full" : ""}`} data-comment-bubble="">
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
                <button type="button" onClick={like} aria-pressed={reacted} disabled={!viewer.can.react || !!c.sending} className={`group/like ${ACTION} gap-1 px-2 ${reacted ? "text-[#c4290c] hover:text-[#c4290c]" : ""}`} data-comment-like="">
                  <LikeHeart on={reacted} size={15} strokeWidth={2} />
                  <span className="tabular-nums">{reactionCount > 0 ? reactionCount : "Like"}</span>
                </button>
                {canReply ? (
                  <button type="button" onClick={() => setReplying(replyText(c.author))} disabled={!!c.sending} className={`${ACTION} gap-1 px-2`} data-comment-reply="">
                    <ReplyIcon size={15} aria-hidden />
                    Reply
                  </button>
                ) : null}
                {items.length && !c.sending ? (
                  <ResponsiveActionMenu
                    title="Comment"
                    items={items}
                    trigger={
                      <button type="button" aria-label="More" className={`${ACTION} w-10 justify-center`} data-comment-more="">
                        <MenuDotsIcon size={16} aria-hidden />
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
              <CommentBox communityId={communityId} postId={postId} me={me} author={author} parentId={parent ? parent.id : c.id} initial={replying} sending={sending} onCancel={() => setReplying(null)} placeholder={`Reply to ${c.author?.name ?? "this comment"}...`} autoFocus canUpload={!!viewer.can.upload} media={rows.media} nearby={rows.nearby} />
            </div>
          ) : null}
        </div>
      </div>
      <ConfirmSheet state={confirm} onClose={() => setConfirm(null)} />
      <ReportSheet communityId={communityId} target={report} onClose={() => setReport(null)} />
    </div>
  )
}

/**
 * THE BUBBLE (round 13): a lighter grey than before (#f6f7f8 for #f4f5f7),
 * a hairline and a 1px shadow (the Storelib depth), a 14px corner (was 16).
 */
export const BUBBLE = "bg-[#f6f7f8] border border-[#eceef1] shadow-[0_1px_1px_rgba(16,24,40,0.04)]"

/** A comment's actions (Like, Reply, the dots): a 40px tall target, the glyph and the word, a tint on press, never a shrink. */
const ACTION =
  "inline-flex h-10 touch-manipulation items-center rounded-full font-medium outline-none transition-colors duration-150 hover:text-[#1a1a2e] active:bg-[#f1f2f4] active:duration-0 focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15 disabled:opacity-50 motion-reduce:transition-none [-webkit-tap-highlight-color:transparent]"

/** What a reply box starts with: the person's @username and a space, so the caret lands after it (round 13), or nothing. */
export function replyText(author: { username?: string | null } | null | undefined): string {
  return author?.username ? `@${author.username} ` : ""
}
