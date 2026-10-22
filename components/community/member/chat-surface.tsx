"use client"

/**
 * ===========================================================================
 *  ONE CHAT SCREEN (round 37)
 * ===========================================================================
 * The owner: "the chat works 100%, very smooth, Telegram like, smooth
 * clean". A channel (chat.tsx), a conversation and a group (messages.tsx)
 * are this one screen, so they behave the same:
 *
 *   ORDER     the server's time, then the id (lib/communities/chat-rules.ts
 *             mergeMessages): one row per message however it arrives (the
 *             send's answer, realtime, a catch up), matched by id or by the
 *             sender's own client id, so nothing doubles and two people see
 *             the same order.
 *   SENDING   a message is on screen the moment Enter is pressed, faded, with
 *             a clock; it settles when the server answers; a failed one says
 *             "Not sent" and is sent again with one tap, under the same
 *             client id, so a send that did reach the server is not written
 *             twice.
 *   SCROLL    newest at the bottom. While the reader is at the bottom it
 *             stays there (new messages, a picture decoding, the keyboard
 *             opening); scrolled up, new messages from others gather in a
 *             pill ("3 new messages") instead of moving the page. Older
 *             messages load as the top comes near, and the message that was
 *             on screen stays exactly where it was.
 *   BUBBLES   grouped by sender within five minutes, a quiet day line
 *             between days, pictures in boxes of their own shape before
 *             they load (no jump), a reply showing the line it answers.
 *   ACTIONS   reply, copy, edit and delete one's own, like (channels),
 *             report, remove (moderators): a menu on hover or right click on
 *             a computer, a long press on a phone (the bottom sheet).
 *   COMPOSER  Enter sends on a computer (Shift+Enter is a new line); on a
 *             phone Enter is a new line and the button sends, and the
 *             keyboard stays up between messages. Pictures and files are
 *             uploaded as soon as they are picked, pasted or dropped, each
 *             with its progress and a cross to stop it; Send waits for them.
 *             @names are offered as you type.
 *   RULES     a community with chat rules shows them once, before a
 *             member's first message, with one button to accept.
 *
 * Who writes where is the server's: this screen only draws what it is
 * handed and sends to the addresses it is given.
 *
 * ROUND 38 (the owner: "it takes too much to load, it shows that iOS-style
 * loading thing; make sure the sending feels smooth; GIFs, images, videos,
 * emojis, links, YouTube"):
 *
 *   OPENING   a chat opens on its kept page (chat-core.ts: the newest
 *             messages, in memory and the tab's sessionStorage, asked for
 *             early by the list), at the bottom, in the frame it opens; the
 *             server is asked for what changed behind it. Never opened and
 *             never asked for, it draws skeleton bubbles at the foot of the
 *             list, where the messages land with no jump. No spinner, here
 *             or for older messages (three quiet dots) or on Send.
 *   SENDING   the bubble is drawn in the frame of the press, at full
 *             strength; a clock shows only when the server takes longer than
 *             a moment. The bubble is keyed by its client id, so the server's
 *             copy takes its place without drawing it again. Each bubble is
 *             drawn again only when it changed (memo), so a send redraws one
 *             bubble, not the whole chat.
 *   RICH      emoji and GIF search in the box (both loaded after the chat is
 *             up, so they cost the chat nothing), an animated GIF from the
 *             device kept as a GIF, a video played in place, a link's card as
 *             the server read it, previewed above the box while it is
 *             written, a YouTube, Vimeo or Loom link as a still that plays in
 *             their privacy player when pressed (chat-rich.tsx).
 */
import { Suspense, lazy, memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { ArrowDown, ArrowUp, Bell, BellOff, Check, CheckCheck, Clock, Copy, CornerUpLeft, FileText, Flag, Heart, MoreHorizontal, Paperclip, Pencil, RotateCw, Shield, Smile, Trash2, X } from "lucide-react"
import { ActionMenuAt, type ActionMenuItem, type ActionMenuPlace } from "@/components/ui/responsive-action-menu"
import { CHAT_ATTACHMENTS_MAX, attachmentLine, firstSettled, lastSettled, localDay, mergeMessages, messageTick, newClientId, sameBubbleGroup, seenLineOf, typingLine, type ChatKind, type MessageTick, type ReadMark } from "@/lib/communities/chat-rules"
import { chatVideoOf, firstLink, type ChatLinkCard } from "@/lib/communities/chat-links"
import { fileSizeLabel, type ViewerItem } from "@/lib/communities/post-media"
import type { PostMedia } from "@/lib/communities/types"
import { optimizedImageUrl, optimizedSrcSet } from "@/lib/images/optimized-url"
import { hapticTap } from "@/lib/native-bridge"
import type { ChatIntroView, ChatLine } from "./view-types"
import { api, apiBase } from "./api"
import { inline } from "./body-text"
import { cachedPage, chatCacheKey, chatPageUp, clockOf, dayLabelOf, freshFor, keepPage, keepValue, keptValue, markChatPageUp, prefetchPage, useTyping, useViewingBeat, type ChatItem, type KeptPage } from "./chat-core"
import { ChatEmbed, ChatLinkCardView, ChatVideo, LinkDraft, keepLocalVideo, localVideo, useLinkDraft } from "./chat-rich"
import { ConfirmDialog, type ConfirmState } from "./dialogs"
import { Lightbox } from "./lightbox"
import { MemberAvatar } from "./member-avatar"
import { localPicture, stopUpload, uploadCommunityFile, uploadKindOf, uploadPicture } from "./media-upload"
import { MentionTextarea, type MentionTextareaHandle } from "./mention-input"
import { toast } from "./toast"

/* The box's emoji and GIF search: their own chunks, loaded once the chat is up (Composer), never on the way to it. */
const EmojiTool = lazy(() => import("@/components/app/rich-text/emoji-picker").then((m) => ({ default: m.EmojiControl })))
const GifTool = lazy(() => import("./media-gif").then((m) => ({ default: m.GifButton })))

export interface StreamHandlers {
  /** Something was written: ask the server what is new. */
  changed: () => void
  /** A row changed (an edit, a removal): its columns as the stream carried them. */
  updated: (row: Record<string, unknown>) => void
}

export interface ChatSurfaceProps {
  communityId: string
  kind: ChatKind
  chatId: string
  me: { id: string; name: string } | null
  /** GET ?before= | ?after=, POST to send. */
  url: string
  messageUrl: (id: string) => string
  readUrl: string | null
  initial: { messages: ChatLine[]; hasMore: boolean } | null
  /** The realtime stream for this chat; the screen asks the server whenever it says something moved. */
  subscribe: (h: StreamHandlers) => () => void
  header: React.ReactNode
  empty: React.ReactNode
  placeholder: string
  /** Names on other people's bubbles (a channel, a group); a conversation of two needs none. */
  showAuthors: boolean
  /** A heart on messages (a channel's messages can be liked). */
  reactions?: boolean
  /** Why this person cannot write here, or null. */
  closed?: string | null
  intro?: ChatIntroView | null
  attachments?: boolean
  /** A conversation: when the other person last read it, for "Seen". */
  otherReadAt?: string | null
  /** A conversation: when the other person's Storelib last had it (part 275), for "delivered". */
  otherDeliveredAt?: string | null
  /** A group: each other person's read and delivered marks, for the ticks and "Seen by N". */
  groupMarks?: { read: string | null; delivered: string | null }[] | null
  /** Who is typing here, for the header (round 39). */
  onTypingChange?: (names: string[]) => void
  renderAvatar?: (m: ChatLine) => React.ReactNode
  renderName?: (m: ChatLine) => React.ReactNode
  onReport?: (m: ChatLine) => void
  onRead?: () => void
  /** What the list answers besides messages (a conversation's otherReadAt). */
  onPage?: (data: Record<string, unknown>) => void
}

const AT_BOTTOM_PX = 120
/** How many of the newest messages a chat draws in the frame it opens; the rest of its page follows when the page is idle. */
const FIRST_DRAW = 24
/** How far back a catch up asks, so a message written a moment before the newest one shown is never skipped. */
export const CATCH_UP_OVERLAP_MS = 15_000
const LONG_PRESS_MS = 420

function usePhone(): boolean {
  const [phone, setPhone] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px), (pointer: coarse)")
    const on = () => setPhone(mq.matches)
    on()
    mq.addEventListener("change", on)
    return () => mq.removeEventListener("change", on)
  }, [])
  return phone
}

function isVideoFile(m: PostMedia): boolean {
  return m.type === "file" && /\.(mp4|m4v|mov|webm)$/i.test(m.name)
}

/** A picture uploaded from the device that is a GIF: drawn as it is, and as a GIF in the viewer (never through the optimizer, which keeps one frame). */
function isGifPicture(m: PostMedia): boolean {
  return m.type === "image" && /\.gif$/i.test(m.url.split(/[?#]/)[0])
}

/**
 * The server's answer for messages already on screen, with each unchanged message kept as the very object that is
 * drawn, so a kept chat refreshed behind the reader redraws only what changed (Bubble is memoised).
 */
function sameAsBefore(cur: ChatItem[], next: ChatItem[]): ChatItem[] {
  const before = new Map(cur.map((m) => [m.id, m]))
  let changed = cur.length !== next.length
  const out = next.map((m, i) => {
    const old = before.get(m.id)
    const same =
      !!old &&
      !old.state &&
      !m.state &&
      old.body === m.body &&
      old.editedAt === m.editedAt &&
      (old.reactionCount ?? 0) === (m.reactionCount ?? 0) &&
      !!old.reacted === !!m.reacted &&
      (old.replyTo?.id ?? null) === (m.replyTo?.id ?? null) &&
      (old.author?.name ?? null) === (m.author?.name ?? null) &&
      (old.author?.avatarUrl ?? null) === (m.author?.avatarUrl ?? null) &&
      JSON.stringify(old.attachments ?? []) === JSON.stringify(m.attachments ?? [])
    if (!same || cur[i] !== old) changed = true
    return same && old ? old : m
  })
  return changed ? out : cur
}

interface TrayItem {
  key: string
  name: string
  kind: "image" | "video" | "file"
  preview: string | null
  progress: number
  media: PostMedia | null
  failed: string | null
  ctrl: AbortController
}

export function ChatSurface(p: ChatSurfaceProps) {
  const { communityId, kind, chatId, me, url } = p
  const cacheKey = chatCacheKey(me?.id, kind, chatId)
  const phone = usePhone()
  /* What the chat opens on: the page the server drew it with, else the kept page (chat-core.ts), read once. */
  const [start] = useState<KeptPage | null>(() => p.initial ?? cachedPage(cacheKey))
  const extra = useRef(start?.extra)
  const [items, setItems] = useState<ChatItem[]>(() => (start ? mergeMessages([], start.messages) : []))
  const [loaded, setLoaded] = useState(!!start)
  /*
    THE NEWEST FIRST (round 38): a chat opens drawing only its newest FIRST_DRAW messages, the screen and more, and
    draws the rest of its page above them once the page is idle, the reader still at the bottom. Its first frame lays
    out half the bubbles (measured on a slow phone: the opening frame was mostly the layout of fifty bubbles).
  */
  const [tail, setTail] = useState<number | null>(FIRST_DRAW)
  useEffect(() => {
    if (tail === null) return
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void }
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(() => setTail(null), { timeout: 400 })
      return () => w.cancelIdleCallback?.(id)
    }
    const t = window.setTimeout(() => setTail(null), 120)
    return () => window.clearTimeout(t)
  }, [tail])
  const shown = tail === null || items.length <= tail ? items : items.slice(-tail)
  const [hasMore, setHasMore] = useState(start?.hasMore ?? false)
  const [older, setOlder] = useState(false)
  const [unseen, setUnseen] = useState(0)
  const [showDown, setShowDown] = useState(false)
  const [menu, setMenu] = useState<{ at: ActionMenuPlace; m: ChatItem } | null>(null)
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)
  const [reply, setReply] = useState<ChatItem | null>(null)
  const [editing, setEditing] = useState<ChatItem | null>(null)
  const [viewer, setViewer] = useState<{ items: ViewerItem[]; start: number } | null>(null)
  const [needsRules, setNeedsRules] = useState(!!p.intro?.needsRules)
  const [flash, setFlash] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const topRef = useRef<HTMLDivElement>(null)
  const atBottom = useRef(true)
  const keepFrom = useRef<number | null>(null)
  const latest = useRef(items)
  latest.current = items
  const markRead = useViewingBeat(p.readUrl, p.onRead)
  const typing = useTyping(kind, chatId, me)
  const onPageRef = useRef(p.onPage)
  onPageRef.current = p.onPage

  useEffect(() => setNeedsRules(!!p.intro?.needsRules), [p.intro?.needsRules])
  useEffect(() => markChatPageUp(), [])
  const loadedRef = useRef(loaded)
  loadedRef.current = loaded

  /* Every change to the list is kept for the next visit. */
  useEffect(() => {
    if (loaded) keepPage(cacheKey, items, hasMore, extra.current)
  }, [cacheKey, items, hasMore, loaded])

  const merge = useCallback((incoming: ChatItem[], from: "mine" | "theirs" | "older") => {
    if (!incoming.length) return
    const el = listRef.current
    if (from === "older" && el) keepFrom.current = el.scrollHeight - el.scrollTop
    setItems((cur) => {
      const next = sameAsBefore(cur, mergeMessages(cur, incoming))
      if (from === "theirs" && !atBottom.current) {
        const known = new Set(cur.map((m) => m.id))
        const fresh = incoming.filter((m) => !known.has(m.id) && !m.mine).length
        if (fresh) setUnseen((n) => n + fresh)
      }
      return next
    })
  }, [])

  /*
    The first page, when the server did not hand one over (a conversation, a group). The kept copy is on screen
    already; the server's answer takes its place behind it. When the list asked for it a moment ago the kept copy is
    that answer, and nothing is asked again; when the list's ask is still on its way, this waits for that one.
  */
  useEffect(() => {
    if (p.initial) return
    let gone = false
    if (start?.extra) onPageRef.current?.(start.extra)
    if (start && freshFor(cacheKey, 4000)) return
    void prefetchPage(cacheKey, url, { force: !!start }).then((r) => {
      if (gone) return
      setLoaded(true)
      if (!r.ok) {
        if (!start) toast(r.error)
        return
      }
      extra.current = r.page.extra
      if (r.page.extra) onPageRef.current?.(r.page.extra)
      setItems((cur) => sameAsBefore(cur, mergeMessages(cur.filter((m) => m.state), r.page.messages)))
      setHasMore(r.page.hasMore)
    })
    return () => {
      gone = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, p.initial, cacheKey])

  /*
    A LITTLE BEFORE THE NEWEST, NOT AFTER IT (measured, scripts/check-community-chat-r37.mjs ORDER): two people writing at
    once, the reader's own message can come back from its send before somebody else's message that the server wrote a few
    milliseconds earlier reaches the page. Asking only for what is after the newest one shown would skip that one for good.
    So the page asks from CATCH_UP_OVERLAP_MS before it; what it already has is matched by id and drawn once.
  */
  const catchUp = useCallback(async () => {
    const last = lastSettled(latest.current)
    /* Nothing here yet and the first page on its way: that page is the catch up (the stream's join asked a second, whole page). */
    if (!last && !loadedRef.current) return
    const from = last ? new Date(Date.parse(last.createdAt) - CATCH_UP_OVERLAP_MS).toISOString() : null
    const r = await api<{ messages: ChatLine[] } & Record<string, unknown>>(`${url}${from ? `${url.includes("?") ? "&" : "?"}after=${encodeURIComponent(from)}` : ""}`)
    if (!r.ok) return
    onPageRef.current?.(r.data)
    merge(r.data.messages, "theirs")
    if (r.data.messages.some((m) => !m.mine)) markRead()
  }, [url, merge, markRead])

  /* The stream, as the page that holds this screen joins it. */
  const subscribe = p.subscribe
  useEffect(() => {
    let timer: number | undefined
    const stop = subscribe({
      changed: () => {
        window.clearTimeout(timer)
        timer = window.setTimeout(() => void catchUp(), 60)
      },
      updated: (row) => {
        const id = typeof row.id === "string" ? row.id : ""
        if (!id) return
        if (row.status && row.status !== "published") {
          setItems((cur) => cur.filter((m) => m.id !== id))
          return
        }
        setItems((cur) => cur.map((m) => (m.id === id ? { ...m, body: typeof row.body === "string" ? row.body : m.body, editedAt: (row.edited_at as string | null) ?? m.editedAt, reactionCount: typeof row.reaction_count === "number" ? row.reaction_count : m.reactionCount } : m)))
      },
    })
    const onVisible = () => document.visibilityState === "visible" && void catchUp()
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener("visibilitychange", onVisible)
      stop()
    }
  }, [subscribe, catchUp])

  /* ── Scroll ──────────────────────────────────────────────────────────── */

  useLayoutEffect(() => {
    const el = listRef.current
    if (!el) return
    if (keepFrom.current !== null) {
      el.scrollTop = el.scrollHeight - keepFrom.current
      keepFrom.current = null
    } else if (atBottom.current) {
      el.scrollTop = el.scrollHeight
    }
  }, [items, loaded, tail])

  /* A picture decoding, the typing line, the keyboard: whatever changes the height keeps the reader at the bottom when they were there. */
  useEffect(() => {
    const el = listRef.current
    const inner = innerRef.current
    if (!el || !inner || typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(() => {
      if (atBottom.current) el.scrollTop = el.scrollHeight
    })
    ro.observe(inner)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const loadOlder = useCallback(async () => {
    const first = firstSettled(latest.current)
    if (!first || older) return
    setOlder(true)
    const r = await api<{ messages: ChatLine[]; hasMore: boolean }>(`${url}${url.includes("?") ? "&" : "?"}before=${encodeURIComponent(first.createdAt)}`)
    setOlder(false)
    if (!r.ok) return toast(r.error)
    merge(r.data.messages, "older")
    setHasMore(r.data.hasMore)
  }, [url, older, merge])

  /* Older messages as the top comes near. */
  useEffect(() => {
    const el = topRef.current
    const root = listRef.current
    if (!el || !root || !hasMore || tail !== null || typeof IntersectionObserver === "undefined") return
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && void loadOlder(), { root, rootMargin: "600px 0px 0px 0px" })
    io.observe(el)
    return () => io.disconnect()
  }, [hasMore, loadOlder, tail])

  const toBottom = useCallback((smooth: boolean) => {
    const el = listRef.current
    if (!el) return
    atBottom.current = true
    setUnseen(0)
    setShowDown(false)
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" })
  }, [])

  const onScroll = () => {
    const el = listRef.current
    if (!el) return
    const gap = el.scrollHeight - el.scrollTop - el.clientHeight
    atBottom.current = gap < AT_BOTTOM_PX
    if (atBottom.current && unseen) setUnseen(0)
    setShowDown(gap > 600)
  }

  const jumpTo = (id: string) => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-chat-message="${CSS.escape(id)}"]`)
    if (!el) return toast("That message is further back.")
    el.scrollIntoView({ behavior: "smooth", block: "center" })
    setFlash(id)
    window.setTimeout(() => setFlash((f) => (f === id ? null : f)), 1400)
  }

  /* ── Sending ─────────────────────────────────────────────────────────── */

  const post = useCallback(
    async (item: ChatItem) => {
      const r = await api<{ message: ChatLine }>(url, { body: item.sendBody })
      if (!r.ok) {
        if (r.status === 409) setNeedsRules(true)
        setItems((cur) => cur.map((m) => (m.id === item.id ? { ...m, state: "failed", error: r.error } : m)))
        /* The bubble itself says Not sent, with its way to try again: no second word about it. */
        return
      }
      setItems((cur) => mergeMessages(cur.filter((m) => m.id !== item.id), [r.data.message]))
    },
    [url],
  )

  const send = useCallback(
    (text: string, media: PostMedia[]) => {
      if (!me) return
      const body = text.trim()
      if (!body && !media.length) return
      const clientId = newClientId()
      const sendBody: Record<string, unknown> = { body, clientId, ...(media.length ? { attachments: media } : {}), ...(reply ? { replyToId: reply.id } : {}) }
      const item: ChatItem = {
        id: `local-${clientId}`,
        clientId,
        authorId: me.id,
        author: { id: me.id, name: me.name, username: null, avatarUrl: null, role: null, level: null },
        mine: true,
        body,
        attachments: media,
        replyTo: reply ? { id: reply.id, authorName: reply.author?.name ?? "Member", text: reply.body || attachmentLine(reply.attachments) || "Message" } : null,
        createdAt: new Date().toISOString(),
        editedAt: null,
        canEdit: false,
        canDelete: false,
        canModerate: false,
        state: "sending",
        sendBody,
      }
      atBottom.current = true
      setReply(null)
      setUnseen(0)
      setItems((cur) => mergeMessages(cur, [item]))
      typing.stop()
      void post(item)
    },
    [me, reply, post, typing],
  )

  const retry = (m: ChatItem) => {
    setItems((cur) => cur.map((x) => (x.id === m.id ? { ...x, state: "sending", error: undefined } : x)))
    void post(m)
  }

  const saveEdit = async (text: string) => {
    if (!editing) return
    const m = editing
    const body = text.trim()
    setEditing(null)
    if (body === m.body) return
    setItems((cur) => cur.map((x) => (x.id === m.id ? { ...x, body, editedAt: new Date().toISOString() } : x)))
    const r = await api<{ message: ChatLine }>(p.messageUrl(m.id), { method: "PATCH", body: { body } })
    if (!r.ok) {
      setItems((cur) => cur.map((x) => (x.id === m.id ? m : x)))
      return toast(r.error)
    }
    setItems((cur) => mergeMessages(cur, [r.data.message]))
  }

  const remove = (m: ChatItem, asModerator: boolean) => {
    if (m.state) {
      setItems((cur) => cur.filter((x) => x.id !== m.id))
      return
    }
    setConfirm({
      title: asModerator ? "Remove this message?" : "Delete this message?",
      detail: asModerator ? "Nobody will see it any more." : "It is deleted for everyone.",
      action: asModerator ? "Remove" : "Delete",
      reason: asModerator && kind === "space",
      danger: true,
      run: async (reason) => {
        const r = await api(p.messageUrl(m.id), { method: "DELETE", body: reason ? { reason } : {} })
        if (!r.ok) {
          toast(r.error)
          return false
        }
        setItems((cur) => cur.filter((x) => x.id !== m.id))
        return true
      },
    })
  }

  const like = async (m: ChatItem) => {
    const on = !m.reacted
    setItems((cur) => cur.map((x) => (x.id === m.id ? { ...x, reacted: on, reactionCount: Math.max(0, (x.reactionCount ?? 0) + (on ? 1 : -1)) } : x)))
    const r = await api(`${apiBase(communityId)}/reactions`, { body: { targetType: "message", targetId: m.id, on } })
    if (!r.ok) {
      setItems((cur) => cur.map((x) => (x.id === m.id ? { ...x, reacted: m.reacted, reactionCount: m.reactionCount } : x)))
      toast(r.error)
    }
  }

  const actionsFor = (m: ChatItem): ActionMenuItem[] => {
    const out: ActionMenuItem[] = []
    if (m.state === "failed") {
      out.push({ label: "Send again", icon: <RotateCw className="h-4 w-4" />, onClick: () => retry(m) })
      out.push({ label: "Delete", icon: <Trash2 className="h-4 w-4" />, variant: "destructive", onClick: () => remove(m, false) })
      return out
    }
    if (m.state || m.kind === "event") return out
    if (!p.closed && me) out.push({ label: "Reply", icon: <CornerUpLeft className="h-4 w-4" />, onClick: () => setReply(m) })
    if (p.reactions && me) out.push({ label: m.reacted ? "Unlike" : "Like", icon: <Heart className="h-4 w-4" />, onClick: () => void like(m) })
    if (m.body) out.push({ label: "Copy text", icon: <Copy className="h-4 w-4" />, onClick: () => void navigator.clipboard?.writeText(m.body).then(() => toast("Copied")).catch(() => {}) })
    if (m.canEdit && m.body) out.push({ label: "Edit", icon: <Pencil className="h-4 w-4" />, onClick: () => setEditing(m) })
    if (m.canDelete) out.push({ label: "Delete", icon: <Trash2 className="h-4 w-4" />, variant: "destructive", onClick: () => remove(m, false) })
    if (!m.mine && p.onReport) out.push({ label: "Report", icon: <Flag className="h-4 w-4" />, onClick: () => p.onReport?.(m) })
    if (!m.mine && m.canModerate) out.push({ label: "Remove message", icon: <Shield className="h-4 w-4" />, variant: "destructive", section: "Moderation", onClick: () => remove(m, true) })
    return out
  }

  const openMenu = (m: ChatItem, el: HTMLElement, at?: { x: number; y: number }) => {
    if (!actionsFor(m).length) return
    const r = el.getBoundingClientRect()
    const box = at ? { left: at.x, top: at.y, width: 1, height: 1 } : { left: r.left, top: r.top, width: r.width, height: r.height }
    setMenu({ m, at: { box, phone, align: at ? "start" : m.mine ? "end" : "start", focus: el } })
  }

  const openViewer = (m: ChatItem, index: number) => {
    const list: ViewerItem[] = []
    let startAt = 0
    m.attachments.forEach((a, i) => {
      if (i === index) startAt = list.length
      if (a.type === "image" && isGifPicture(a)) list.push({ kind: "gif", url: localPicture(a.url) ?? a.url, still: a.url, ...(a.w ? { w: a.w, h: a.h } : {}) })
      else if (a.type === "image") list.push({ kind: "image", url: localPicture(a.url) ?? a.url, ...(a.w ? { w: a.w, h: a.h } : {}) })
      else if (a.type === "gif") list.push({ kind: "gif", url: a.url, still: a.still, ...(a.w ? { w: a.w, h: a.h } : {}) })
    })
    if (list.length) setViewer({ items: list, start: startAt })
  }

  /*
    WHAT A BUBBLE CAN DO, AS ONE OBJECT THAT NEVER CHANGES: each call reads this render's handlers, so Bubble (memo)
    is drawn again only when its own message, place or marks change, not on every keystroke, send or arrival.
  */
  const handlers = useRef({ menu: openMenu, retry, reply: (m: ChatItem) => setReply(m), jump: jumpTo, open: openViewer, like: (m: ChatItem) => void like(m) })
  handlers.current = { menu: openMenu, retry, reply: (m: ChatItem) => setReply(m), jump: jumpTo, open: openViewer, like: (m: ChatItem) => void like(m) }
  const acts = useMemo<BubbleActs>(
    () => ({
      menu: (m, el, at) => handlers.current.menu(m, el, at),
      retry: (m) => handlers.current.retry(m),
      reply: (m) => handlers.current.reply(m),
      jump: (id) => handlers.current.jump(id),
      open: (m, i) => handlers.current.open(m, i),
      like: (m) => handlers.current.like(m),
    }),
    [],
  )

  /* ── Drawing ─────────────────────────────────────────────────────────── */

  /*
    EACH OWN MESSAGE'S STATE (round 39): sending (the clock, only once a send takes a moment), sent (one tick: the
    server has it), delivered (two ticks: the other person's Storelib has it, part 275's mark or their read mark),
    seen (two lit ticks: they read past it). In a group, delivered once anybody has it and seen once everybody read it,
    with "Seen by N" under the last one. A channel has no ticks (everybody reads it).
  */
  const tickOf = useMemo(() => {
    const marks: ReadMark[] | null = p.groupMarks ?? (p.otherReadAt === undefined ? null : [{ read: p.otherReadAt ?? null, delivered: p.otherDeliveredAt ?? null }])
    return marks ? (created: string) => messageTick(created, marks) : null
  }, [p.groupMarks, p.otherReadAt, p.otherDeliveredAt])

  const lastMineId = useMemo(() => {
    for (let i = items.length - 1; i >= 0; i--) if (items[i].mine && !items[i].state) return items[i].id
    return null
  }, [items])
  const lastMine = lastMineId ? items.find((m) => m.id === lastMineId) : undefined
  const seenLine = seenLineOf(lastMine && tickOf ? tickOf(lastMine.createdAt) : null, !!p.groupMarks) || null

  const typingText = typingLine(typing.names)
  const onTypingChange = p.onTypingChange
  const typingKey = typing.names.join("\u0000")
  useEffect(() => {
    onTypingChange?.(typingKey ? typingKey.split("\u0000") : [])
  }, [typingKey, onTypingChange])

  return (
    <div
      className="relative flex h-full min-h-0 flex-col"
      data-chat-surface={kind}
      onDragOver={(e) => {
        if (p.attachments !== false && !p.closed && e.dataTransfer.types.includes("Files")) e.preventDefault()
      }}
      onDrop={(e) => {
        if (p.attachments === false || p.closed || !e.dataTransfer.files.length) return
        e.preventDefault()
        window.dispatchEvent(new CustomEvent(DROP_EVENT, { detail: { chatId, files: [...e.dataTransfer.files] } }))
      }}
    >
      {p.header}

      <div ref={listRef} onScroll={onScroll} className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain [overflow-anchor:none]" data-chat-list="" role="log" aria-live="polite" aria-relevant="additions">
        <div ref={innerRef} className="flex min-h-full flex-col justify-end px-2.5 pb-2 pt-3 sm:px-4">
          <div ref={topRef} aria-hidden className="h-px" />
          {hasMore ? (
            <div className="flex h-10 items-center justify-center" data-chat-older="">
              {older ? (
                <span role="status" aria-label="Loading earlier messages" className="text-[12.5px] text-[#8a8f98]">
                  <TypingDots />
                </span>
              ) : (
                <button type="button" onClick={() => void loadOlder()} className="h-8 rounded-full px-3 text-[12.5px] font-medium text-[#6b7280] hover:bg-[#f1f2f4]">
                  Earlier messages
                </button>
              )}
            </div>
          ) : null}
          {!loaded && items.length === 0 ? (
            <SkeletonBubbles />
          ) : items.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center" data-chat-empty="">
              {p.empty}
            </div>
          ) : null}
          {shown.map((m, i) => {
            const prev = shown[i - 1]
            const next = shown[i + 1]
            const newDay = !prev || localDay(prev.createdAt) !== localDay(m.createdAt)
            if (m.kind === "event") {
              return (
                <div key={m.id}>
                  {newDay ? <DayLine iso={m.createdAt} /> : null}
                  <p className="mx-auto my-2 w-fit max-w-[85%] rounded-full bg-[#f1f2f4] px-3 py-1 text-center text-[12px] text-[#6b7280]" data-chat-event="">
                    {m.body}
                  </p>
                </div>
              )
            }
            const first = newDay || !sameBubbleGroup(prev && prev.kind !== "event" ? prev : undefined, m)
            const last = !next || next.kind === "event" || localDay(next.createdAt) !== localDay(m.createdAt) || !sameBubbleGroup(m, next)
            /* Keyed by the sender's own id where there is one: the server's copy of a message just sent takes the place of the one on screen without drawing it again. */
            return (
              <div key={m.clientId ? `c:${m.clientId}` : m.id}>
                {newDay ? <DayLine iso={m.createdAt} /> : null}
                <Bubble
                  m={m}
                  first={first}
                  last={last}
                  showAuthor={p.showAuthors && !m.mine}
                  flash={flash === m.id}
                  tick={m.mine && !m.state && tickOf ? tickOf(m.createdAt).tick : null}
                  seenLine={m.id === lastMineId ? seenLine : null}
                  reactions={!!p.reactions}
                  communityId={communityId}
                  kind={kind}
                  phone={phone}
                  renderAvatar={p.renderAvatar}
                  renderName={p.renderName}
                  acts={acts}
                  canReply={!p.closed && !!me}
                  canLike={!!p.reactions && !!me}
                  hasActions={actionsFor(m).length > 0}
                />
              </div>
            )
          })}
        </div>
      </div>

      {unseen > 0 || showDown ? (
        <button
          type="button"
          onClick={() => toBottom(true)}
          className="absolute bottom-[calc(var(--chat-composer-h,64px)+12px)] right-3 z-10 flex h-10 items-center gap-1.5 rounded-full border border-[#e3e5e9] bg-white px-3.5 text-[13px] font-medium text-[#1a1a2e] shadow-[0_6px_18px_-6px_rgba(17,24,39,0.25)] transition-opacity animate-in fade-in-0 slide-in-from-bottom-1 duration-150 active:scale-[0.97]"
          data-chat-pill=""
          aria-label={unseen ? `${unseen} new messages` : "Newest messages"}
        >
          {unseen ? `${unseen} new message${unseen === 1 ? "" : "s"}` : null}
          <ArrowDown className="h-4 w-4" />
        </button>
      ) : null}

      <p aria-live="polite" className={`pointer-events-none h-0 overflow-visible px-4 text-[12px] text-[#8a8f98] transition-opacity duration-150 ${typingText ? "opacity-100" : "opacity-0"}`} data-chat-typing="">
        <span className="relative -top-5 inline-flex items-center gap-1.5 rounded-full bg-white/90 px-2 py-0.5">
          <TypingDots />
          {typingText}
        </span>
      </p>

      {p.closed ? (
        <p className="shrink-0 border-t border-[#eceef1] px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 text-center text-[13.5px] text-[#6b7280] [html[data-keyboard=open]_&]:pb-3" data-chat-closed="">
          {p.closed}
        </p>
      ) : needsRules && p.intro?.rules ? (
        <RulesGate communityId={communityId} rules={p.intro.rules} onAccepted={() => {
          setNeedsRules(false)
          for (const m of latest.current) if (m.state === "failed") retry(m)
        }} />
      ) : p.intro?.restriction?.kind === "muted" ? (
        <p className="shrink-0 border-t border-[#eceef1] px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 text-center text-[13.5px] text-[#6b7280]">
          You can send messages again {new Date(p.intro.restriction.until).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}.
        </p>
      ) : (
        <Composer
          communityId={communityId}
          chatId={chatId}
          me={me}
          phone={phone}
          placeholder={p.placeholder}
          attachments={p.attachments !== false && (p.intro?.attachments ?? true)}
          reply={reply}
          editing={editing}
          onCancelReply={() => setReply(null)}
          onCancelEdit={() => setEditing(null)}
          onSend={send}
          onSaveEdit={saveEdit}
          onTyping={typing.ping}
          onFocus={() => {
            if (atBottom.current) window.setTimeout(() => toBottom(false), 280)
          }}
        />
      )}

      <ActionMenuAt at={menu?.at ?? null} items={menu ? actionsFor(menu.m) : []} title="Message" onClose={() => setMenu(null)} />
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
      {viewer ? <Lightbox items={viewer.items} start={viewer.start} communityId={communityId} onClose={() => setViewer(null)} /> : null}
    </div>
  )
}

const DROP_EVENT = "storelib:chat-drop"

export function fileHref(communityId: string, kind: ChatKind, messageId: string, m: Extract<PostMedia, { type: "file" }> | PostMedia): string {
  const asset = m.type === "file" ? m.assetId : ""
  return `${apiBase(communityId)}/chat/files?chat=${kind}&message=${messageId}&asset=${asset}`
}

/*
  A COLD OPEN (round 38): a chat never opened in this tab and not yet asked for. The shape of a few messages at the
  foot of the list, where the real ones land: each is a one line bubble's height (34px, the 7px padding and a line of
  15px words), so the newest message arrives where the last of these was and the list is already at its bottom.
*/
const SKELETON: [mine: boolean, width: number][] = [
  [false, 46],
  [false, 62],
  [true, 38],
  [false, 54],
  [true, 58],
  [true, 30],
]
export function SkeletonBubbles() {
  return (
    <div className="flex flex-col" data-chat-skeleton="" role="status" aria-label="Loading messages">
      {SKELETON.map(([mine, width], i) => (
        <div key={i} className={`flex ${mine ? "justify-end" : "justify-start"} ${i && SKELETON[i - 1][0] === mine ? "mt-[3px]" : "mt-2"}`}>
          <span className={`h-[34px] rounded-[18px] motion-safe:animate-pulse ${mine ? "bg-[#e6e7eb]" : "bg-[#f1f2f4]"}`} style={{ width: `${width}%` }} />
        </div>
      ))}
    </div>
  )
}

function DayLine({ iso }: { iso: string }) {
  const [label, setLabel] = useState<string | null>(() => (chatPageUp() ? dayLabelOf(iso) : null))
  /* The reader's own day names, after the first paint of a page the server drew (it does not know their time zone). */
  useEffect(() => setLabel(dayLabelOf(iso)), [iso])
  return (
    <div className="sticky top-1 z-[1] my-2.5 flex justify-center" data-chat-day="">
      <span className="min-h-[22px] rounded-full bg-white/95 px-2.5 py-0.5 text-[11.5px] font-medium text-[#6b7280] shadow-[0_1px_2px_rgba(16,24,40,0.08)]">{label ?? " "}</span>
    </div>
  )
}

function TypingDots() {
  return (
    <span aria-hidden className="inline-flex gap-0.5">
      {[0, 1, 2].map((i) => (
        <span key={i} className="h-1 w-1 animate-bounce rounded-full bg-[#9ca3af] motion-reduce:animate-none" style={{ animationDelay: `${i * 120}ms`, animationDuration: "900ms" }} />
      ))}
    </span>
  )
}

/* ── One message ───────────────────────────────────────────────────────── */

interface BubbleActs {
  menu: (m: ChatItem, el: HTMLElement, at?: { x: number; y: number }) => void
  retry: (m: ChatItem) => void
  reply: (m: ChatItem) => void
  jump: (id: string) => void
  open: (m: ChatItem, index: number) => void
  like: (m: ChatItem) => void
}

/** How long a send may take before its bubble shows the clock: most land first, and show none. */
const PENDING_CLOCK_MS = 400

const Bubble = memo(function Bubble({
  m,
  first,
  last,
  showAuthor,
  flash,
  tick,
  seenLine,
  reactions,
  communityId,
  kind,
  phone,
  renderAvatar,
  renderName,
  acts,
  canReply,
  canLike,
  hasActions,
}: {
  m: ChatItem
  first: boolean
  last: boolean
  showAuthor: boolean
  flash: boolean
  tick: MessageTick | null
  seenLine: string | null
  reactions: boolean
  communityId: string
  kind: ChatKind
  phone: boolean
  renderAvatar?: (m: ChatLine) => React.ReactNode
  renderName?: (m: ChatLine) => React.ReactNode
  acts: BubbleActs
  canReply: boolean
  canLike: boolean
  hasActions: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const press = useRef<{ t: number; x: number; y: number } | null>(null)
  const [clock, setClock] = useState<string | null>(() => (chatPageUp() ? clockOf(m.createdAt) : null))
  useEffect(() => {
    const c = clockOf(m.createdAt)
    setClock((was) => (was === c ? was : c))
  }, [m.createdAt])
  /* Sending: the clock only once the send has taken a moment; a send that lands first is never marked at all. */
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    if (m.state !== "sending") return setSlow(false)
    const t = window.setTimeout(() => setSlow(true), PENDING_CLOCK_MS)
    return () => window.clearTimeout(t)
  }, [m.state])
  const onMenu = acts.menu
  const onRetry = acts.retry
  const onJump = acts.jump
  const onOpen = acts.open
  const onReply = canReply ? () => acts.reply(m) : undefined
  const onLike = canLike ? () => acts.like(m) : undefined
  const mine = m.mine
  const media = m.attachments ?? []
  const pics = media.filter((a) => a.type === "image" || a.type === "gif")
  const files = media.filter((a) => a.type === "file")
  const card = (media.find((a) => a.type === "link") as ChatLinkCard | undefined) ?? null
  const video = useMemo(() => chatVideoOf(m.body, card), [m.body, card])
  const onlyPics = pics.length > 0 && !m.body && !files.length && !m.replyTo
  /* Telegram's shape: a run of bubbles from one person is one column, square where they touch, the last one with its tail corner. */
  const corner = mine ? `${first ? "" : "rounded-tr-[6px]"} rounded-br-[6px]` : `${first ? "" : "rounded-tl-[6px]"} rounded-bl-[6px]`
  const tone = mine ? "bg-[#1a1a2e] text-white" : "bg-[#f1f2f4] text-[#1a1a2e]"
  const meta = (
    <span className={`ml-2 inline-flex translate-y-[3px] items-center gap-0.5 whitespace-nowrap align-baseline text-[11px] ${mine ? "text-white/60" : "text-[#8a8f98]"}`}>
      {m.editedAt ? "edited " : ""}
      {clock ?? ""}
      {mine ? (
        m.state === "sending" ? (
          slow ? <Clock className="h-3.5 w-3.5 p-px" aria-label="Sending" /> : <span className="inline-block h-3.5 w-3.5" aria-label="Sending" />
        ) : m.state === "failed" ? null : tick ? (
          <span className={`inline-flex transition-colors duration-200 ${tick === "seen" ? (onlyPics ? "text-white" : "text-[#c4b5fd]") : ""}`} data-tick={tick}>
            {tick === "sent" ? <Check className="h-3.5 w-3.5" aria-label="Sent" /> : <CheckCheck className="h-3.5 w-3.5" aria-label={tick === "seen" ? "Seen" : "Delivered"} />}
          </span>
        ) : null
      ) : null}
    </span>
  )

  const touchStart = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" || !hasActions) return
    const t = window.setTimeout(() => {
      press.current = null
      hapticTap("soft")
      if (ref.current) onMenu(m, ref.current)
    }, LONG_PRESS_MS)
    press.current = { t, x: e.clientX, y: e.clientY }
  }
  const touchMove = (e: React.PointerEvent) => {
    const p = press.current
    if (p && (Math.abs(e.clientX - p.x) > 8 || Math.abs(e.clientY - p.y) > 8)) {
      window.clearTimeout(p.t)
      press.current = null
    }
  }
  const touchEnd = () => {
    if (press.current) window.clearTimeout(press.current.t)
    press.current = null
  }

  return (
    <div
      className={`group/msg relative flex items-end gap-1.5 ${mine ? "justify-end" : "justify-start"} ${first ? "mt-2" : "mt-[3px]"}`}
      data-chat-message={m.id}
      data-mine={mine ? "" : undefined}
      data-state={m.state}
    >
      {!mine && showAuthor ? <div className="w-8 shrink-0 self-end">{last ? (renderAvatar ? renderAvatar(m) : <MemberAvatar src={m.author?.avatarUrl ?? null} name={m.author?.name ?? "Member"} alt="" size={32} lazy />) : null}</div> : null}
      <div className={`flex min-w-0 max-w-[min(78%,560px)] flex-col ${mine ? "items-end" : "items-start"}`}>
        <div
          ref={ref}
          className={`relative min-w-0 max-w-full select-text rounded-[18px] ${corner} ${onlyPics ? "overflow-hidden bg-transparent p-0" : `${tone} px-3 py-[7px]`} ${flash ? "ring-2 ring-[#8b5cf6]/50" : ""} [-webkit-touch-callout:none] transition-shadow duration-300`}
          onPointerDown={touchStart}
          onPointerMove={touchMove}
          onPointerUp={touchEnd}
          onPointerCancel={touchEnd}
          onContextMenu={(e) => {
            if (!hasActions) return
            e.preventDefault()
            onMenu(m, e.currentTarget, phone ? undefined : { x: e.clientX, y: e.clientY })
          }}
          onDoubleClick={() => onLike?.()}
          data-chat-bubble=""
        >
          {first && showAuthor && !onlyPics ? <div className="mb-0.5 text-[13px] font-semibold leading-5 text-[#8b5cf6]">{renderName ? renderName(m) : (m.author?.name ?? "Former member")}</div> : null}
          {m.replyTo ? (
            <button type="button" onClick={() => onJump(m.replyTo!.id)} className={`mb-1 block w-full min-w-[120px] rounded-lg border-l-[3px] px-2 py-1 text-left text-[12.5px] leading-snug ${mine ? "border-white/60 bg-white/10" : "border-[#8b5cf6] bg-white/70"}`} data-chat-quote="">
              <span className={`block truncate font-semibold ${mine ? "text-white" : "text-[#8b5cf6]"}`}>{m.replyTo.authorName}</span>
              <span className={`block truncate ${mine ? "text-white/75" : "text-[#4b5563]"}`}>{m.replyTo.text}</span>
            </button>
          ) : null}
          {pics.length ? <Pictures m={m} pics={pics} onOpen={onOpen} rounded={!onlyPics} /> : null}
          {files.map((f, i) =>
            f.type === "file" && isVideoFile(f) && (!m.state || localVideo(f.assetId)) ? (
              <ChatVideo key={f.assetId} src={m.state ? null : fileHref(communityId, kind, m.id, f)} local={localVideo(f.assetId)} />
            ) : f.type === "file" ? (
              <a key={`${f.assetId}-${i}`} href={m.state ? undefined : fileHref(communityId, kind, m.id, f)} className={`my-1 flex min-w-[200px] items-center gap-2.5 rounded-xl px-2 py-1.5 ${mine ? "bg-white/10 hover:bg-white/15" : "bg-white hover:bg-[#fafafa]"}`} data-chat-file="">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${mine ? "bg-white/15" : "bg-[#f1f2f4]"}`}><FileText className="h-4 w-4" /></span>
                <span className="min-w-0">
                  <span className="block truncate text-[13.5px] font-medium">{f.name}</span>
                  {f.size ? <span className={`block text-[11.5px] ${mine ? "text-white/60" : "text-[#8a8f98]"}`}>{fileSizeLabel(f.size)}</span> : null}
                </span>
              </a>
            ) : null,
          )}
          {m.body ? (
            <p className="whitespace-pre-wrap break-words text-[15.5px] leading-[1.38] [overflow-wrap:anywhere] sm:text-[15px]">
              {inline(m.body)}
              {meta}
            </p>
          ) : onlyPics ? (
            <span className="absolute bottom-1.5 right-2 rounded-full bg-black/45 px-1.5 py-0.5 text-white [&_span]:text-white">{meta}</span>
          ) : (
            <div className="text-right">{meta}</div>
          )}
          {video ? <ChatEmbed video={video} card={card} mine={mine} /> : card ? <ChatLinkCardView card={card} mine={mine} /> : null}
        </div>
        {m.state === "failed" ? (
          <button type="button" onClick={() => onRetry(m)} className="mt-1 flex items-center gap-1 px-1 text-[12px] font-medium text-[#c4290c]" data-chat-retry="">
            <RotateCw className="h-3 w-3" />
            Not sent. Tap to try again
          </button>
        ) : null}
        {m.state === "failed" && m.error && !/did not send/i.test(m.error) ? <p className="max-w-[260px] px-1 text-right text-[11.5px] leading-snug text-[#6b7280]" data-chat-why="">{m.error}</p> : null}
        {reactions && (m.reactionCount ?? 0) > 0 ? (
          <button type="button" onClick={() => onLike?.()} className={`-mt-1.5 flex h-6 items-center gap-1 rounded-full border border-white bg-[#f1f2f4] px-2 text-[11.5px] font-medium shadow-[0_1px_2px_rgba(16,24,40,0.08)] ${m.reacted ? "text-[#e11d48]" : "text-[#6b7280]"}`} data-chat-likes="">
            <Heart className="h-3 w-3" fill={m.reacted ? "currentColor" : "none"} />
            {m.reactionCount}
          </button>
        ) : null}
        {seenLine ? <span className="mt-0.5 px-1 text-[11px] text-[#9ca3af] animate-in fade-in-0 duration-200 motion-reduce:animate-none" data-chat-seen="">{seenLine}</span> : null}
      </div>
      {hasActions && !phone ? (
        <div className={`flex shrink-0 items-center self-center opacity-0 transition-opacity duration-100 focus-within:opacity-100 group-hover/msg:opacity-100 ${mine ? "order-first" : ""}`} data-chat-menu="">
          {onReply ? (
            <button type="button" aria-label="Reply" onClick={onReply} className="flex h-8 w-8 items-center justify-center rounded-full text-[#9ca3af] hover:bg-[#f1f2f4] hover:text-[#1a1a2e]">
              <CornerUpLeft className="h-4 w-4" />
            </button>
          ) : null}
          <button type="button" aria-label="More" onClick={(e) => onMenu(m, e.currentTarget)} className="flex h-8 w-8 items-center justify-center rounded-full text-[#9ca3af] hover:bg-[#f1f2f4] hover:text-[#1a1a2e]">
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </div>
      ) : null}
    </div>
  )
})

/*
  A PICTURE IN A BUBBLE, AT THE SIZE IT IS DRAWN (round 39). The one just sent is drawn from the file picked
  (localPicture), the same pixels before and after the server's copy takes its place. Any other is asked of the image
  optimizer at the bubble's width (300px, a grid's square 150px) and twice that for a sharp screen, never the 2560px
  upload; a GIF uploaded from the device is drawn as it is (the optimizer keeps one frame).
*/
function pictureSources(a: Extract<PostMedia, { type: "image" | "gif" }>, width: number, widths: number[]): { src: string; srcSet: string | undefined } {
  if (a.type === "gif" || isGifPicture(a)) return { src: a.url, srcSet: undefined }
  const local = localPicture(a.url)
  if (local) return { src: local, srcSet: undefined }
  const srcSet = optimizedSrcSet(a.url, widths)
  return srcSet ? { src: optimizedImageUrl(a.url, width), srcSet } : { src: a.url, srcSet: undefined }
}

function Pictures({ m, pics, onOpen, rounded }: { m: ChatItem; pics: PostMedia[]; onOpen: (m: ChatItem, index: number) => void; rounded: boolean }) {
  const all = m.attachments
  if (pics.length === 1) {
    const a = pics[0] as Extract<PostMedia, { type: "image" | "gif" }>
    const ratio = a.w && a.h ? Math.min(1.8, Math.max(0.7, a.w / a.h)) : 4 / 3
    const p = pictureSources(a, 300, [384, 640, 828])
    return (
      <button type="button" onClick={() => onOpen(m, all.indexOf(a))} className={`block w-[min(300px,68vw)] overflow-hidden bg-[#e9eaee] ${rounded ? "my-1 rounded-xl" : ""}`} style={{ aspectRatio: String(ratio) }} data-chat-picture="">
        <img src={p.src} srcSet={p.srcSet} sizes={p.srcSet ? "min(300px, 68vw)" : undefined} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" draggable={false} />
      </button>
    )
  }
  return (
    <div className={`grid w-[min(300px,68vw)] grid-cols-2 gap-0.5 overflow-hidden ${rounded ? "my-1 rounded-xl" : ""}`} data-chat-pictures="">
      {pics.slice(0, 4).map((x, i) => {
        const a = x as Extract<PostMedia, { type: "image" | "gif" }>
        const p = pictureSources(a, 150, [256, 384])
        return (
          <button key={`${a.url}-${i}`} type="button" onClick={() => onOpen(m, all.indexOf(a))} className="relative aspect-square overflow-hidden bg-[#e9eaee]">
            <img src={p.src} srcSet={p.srcSet} sizes={p.srcSet ? "min(150px, 34vw)" : undefined} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" draggable={false} />
            {i === 3 && pics.length > 4 ? <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-[18px] font-semibold text-white">+{pics.length - 4}</span> : null}
          </button>
        )
      })}
    </div>
  )
}

/* ── The rules, once ───────────────────────────────────────────────────── */

function RulesGate({ communityId, rules, onAccepted }: { communityId: string; rules: string; onAccepted: () => void }) {
  const [busy, setBusy] = useState(false)
  return (
    <div className="shrink-0 border-t border-[#eceef1] bg-white px-4 pb-[max(14px,env(safe-area-inset-bottom))] pt-3.5" data-chat-rules="">
      <p className="text-[14px] font-semibold text-[#1a1a2e]">Chat rules</p>
      <div className="mt-1.5 max-h-[32vh] overflow-y-auto whitespace-pre-wrap text-[13.5px] leading-relaxed text-[#4b5563]">{rules}</div>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          const r = await api(`${apiBase(communityId)}/chat`, { body: { action: "accept_rules" } })
          setBusy(false)
          if (!r.ok) return toast(r.error)
          onAccepted()
        }}
        className="mt-3 h-11 w-full rounded-full bg-[#1a1a2e] text-[14.5px] font-medium text-white transition-[background-color,scale] hover:bg-[#2b2b42] active:scale-[0.98] disabled:opacity-60 sm:h-10"
        data-chat-rules-accept=""
      >
        {busy ? "Saving..." : "I agree"}
      </button>
    </div>
  )
}

/* ── The box at the bottom ─────────────────────────────────────────────── */

/*
  THE BOX, ONE ROW (round 39, the owner: "look how ugly the GIF/emoji buttons sit"). Attach, the field, Send; inside the
  field the words, then GIF and emoji at its right end. Every button is the same 40px circle with a 20px mark, on the
  field's middle while it holds one line and at its foot as it grows. The words' box is as wide as the field
  (MentionTextarea's wrapper takes the room): it was as wide as its own default, which left GIF and emoji floating in
  the middle of a wide field (measured, scripts/check-community-chat-r39.mjs: words 235px of a 642px field at 1440).
  The field's outline when focused is an inset ring, so focusing it never changes its height.
*/
const ICON = "flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full text-[#6b7280] outline-none transition-colors hover:text-[#1a1a2e] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15 [&_svg]:h-5 [&_svg]:w-5"
const TOOL = `${ICON} hover:bg-[#e6e8eb] [[data-chat-field]:focus-within_&]:hover:bg-[#f1f2f4]`

/** GIF as an icon, drawn like the emoji button's mark (a 2px line at 24, the letters inside), never bold letters in the field. */
function GifGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden data-chat-gif-glyph="">
      <rect x="2" y="4.5" width="20" height="15" rx="4" stroke="currentColor" strokeWidth="1.9" />
      <text x="12" y="15.4" textAnchor="middle" fontSize="8.4" fontWeight="700" fill="currentColor" style={{ fontFamily: "Inter, system-ui, sans-serif", letterSpacing: "0.2px" }}>
        GIF
      </text>
    </svg>
  )
}

/**
 * The emoji button until it is first pressed: the same size and mark as the picker's own, which takes its place,
 * already open, on that press. The picker (five hundred emoji, kept built on a phone) is never built for a chat
 * nobody picks an emoji in: built on every chat it cost a slow phone 130ms each time it went Back to the list
 * (measured, scripts/check-community-chat-r38.mjs).
 */
function ToolStandIn({ onPress }: { onPress?: () => void }) {
  return (
    <button type="button" aria-label="Emoji" tabIndex={-1} disabled={!onPress} onMouseDown={(e) => e.preventDefault()} onClick={onPress} className={`${TOOL} disabled:cursor-default`} data-chat-emoji="">
      <Smile aria-hidden strokeWidth={2} />
    </button>
  )
}

function Composer({
  communityId,
  chatId,
  me,
  phone,
  placeholder,
  attachments,
  reply,
  editing,
  onCancelReply,
  onCancelEdit,
  onSend,
  onSaveEdit,
  onTyping,
  onFocus,
}: {
  communityId: string
  chatId: string
  me: { id: string; name: string } | null
  phone: boolean
  placeholder: string
  attachments: boolean
  reply: ChatItem | null
  editing: ChatItem | null
  onCancelReply: () => void
  onCancelEdit: () => void
  onSend: (text: string, media: PostMedia[]) => void
  onSaveEdit: (text: string) => void
  onTyping: () => void
  onFocus: () => void
}) {
  const [text, setText] = useState("")
  const [tray, setTray] = useState<TrayItem[]>([])
  const box = useRef<MentionTextareaHandle>(null)
  const file = useRef<HTMLInputElement>(null)
  const form = useRef<HTMLFormElement>(null)
  const kept = useRef("")

  /* Its own height, for the new messages pill above it. */
  useEffect(() => {
    const el = form.current
    if (!el || typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(() => el.parentElement?.style.setProperty("--chat-composer-h", `${Math.round(el.offsetHeight)}px`))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  /* Editing: the message's words in the box; done or cancelled, what was being written comes back. */
  useEffect(() => {
    if (editing) {
      kept.current = text
      setText(editing.body)
      requestAnimationFrame(() => box.current?.focus())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing?.id])
  useEffect(() => {
    if (reply) requestAnimationFrame(() => box.current?.focus())
  }, [reply])

  const add = useCallback(
    (files: File[]) => {
      if (!me || !attachments) return
      const room = CHAT_ATTACHMENTS_MAX - tray.length
      if (room <= 0) return toast(`Up to ${CHAT_ATTACHMENTS_MAX} at a time.`)
      for (const f of files.slice(0, room)) {
        const key = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        const what = uploadKindOf(f)
        const isPic = what === "image"
        /* A video is a file to the server (the community's file folder, played from its signed address); here it is a video, drawn from the file picked. */
        const item: TrayItem = { key, name: f.name, kind: what, preview: what === "file" ? null : URL.createObjectURL(f), progress: 0, media: null, failed: null, ctrl: new AbortController() }
        setTray((cur) => [...cur, item])
        const progress = (n: number) => setTray((cur) => cur.map((x) => (x.key === key ? { ...x, progress: n } : x)))
        const done = (media: PostMedia) => {
          if (media.type === "file" && item.kind === "video" && item.preview) keepLocalVideo(media.assetId, item.preview)
          setTray((cur) => cur.map((x) => (x.key === key ? { ...x, progress: 100, media } : x)))
        }
        const fail = (e: unknown) => {
          const msg = e instanceof Error ? e.message : "That did not upload."
          if (msg === "Upload stopped" || item.ctrl.signal.aborted) return
          setTray((cur) => cur.map((x) => (x.key === key ? { ...x, failed: msg } : x)))
        }
        if (isPic) void uploadPicture(f, me.id, communityId, { key, onProgress: progress }).then(done, fail)
        else void uploadCommunityFile({ communityId, file: f, onProgress: progress, signal: item.ctrl.signal }).then(done, fail)
      }
    },
    [me, attachments, tray.length, communityId],
  )

  /* Files dropped anywhere on this chat. */
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ chatId: string; files: File[] }>).detail
      if (d?.chatId === chatId) add(d.files)
    }
    window.addEventListener(DROP_EVENT, on)
    return () => window.removeEventListener(DROP_EVENT, on)
  }, [chatId, add])

  const drop = (key: string) => {
    setTray((cur) => {
      const it = cur.find((x) => x.key === key)
      if (it) {
        stopUpload(key)
        it.ctrl.abort()
        if (it.preview) URL.revokeObjectURL(it.preview)
      }
      return cur.filter((x) => x.key !== key)
    })
  }

  const uploading = tray.some((t) => !t.media && !t.failed)
  const ready = tray.filter((t) => t.media).map((t) => t.media as PostMedia)
  const canSend = editing ? !!text.trim() || !!editing.attachments.length : (!!text.trim() || ready.length > 0) && !uploading

  /* A link in the words: its card, read by the server a moment after typing stops, shown above the box; the cross sends without it. */
  const draftUrl = useMemo(() => (editing ? null : firstLink(text)), [text, editing])
  const draft = useLinkDraft(communityId, draftUrl)
  const [dropped, setDropped] = useState<string | null>(null)
  const linkCard = draft && draftUrl && dropped !== draftUrl && (draft.title || draft.image) ? draft : null

  /*
    The emoji and GIF tools, loaded once the chat is up: their chunks are never on the way to the first message. The
    GIF button is drawn then (it asks once whether GIFs are connected); the emoji picker's code is fetched then, and
    the picker is drawn on the first press of its button (ToolStandIn).
  */
  const [tools, setTools] = useState(false)
  const [emoji, setEmoji] = useState(false)
  useEffect(() => {
    const go = () => {
      setTools(true)
      void import("@/components/app/rich-text/emoji-picker").catch(() => undefined)
    }
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void }
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(go, { timeout: 1200 })
      return () => w.cancelIdleCallback?.(id)
    }
    const t = window.setTimeout(go, 300)
    return () => window.clearTimeout(t)
  }, [])

  const submit = () => {
    if (editing) {
      onSaveEdit(text)
      setText(kept.current)
      kept.current = ""
      return
    }
    if (!canSend) return
    const withCard = linkCard && ready.length < CHAT_ATTACHMENTS_MAX ? [...ready, { type: "link", ...linkCard } as PostMedia] : ready
    onSend(text, withCard)
    setText("")
    setTray([])
    setDropped(null)
    /* The keyboard stays up on a phone: the box keeps its focus. */
    requestAnimationFrame(() => box.current?.focus())
  }

  return (
    <form
      ref={form}
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
      className="shrink-0 border-t border-[#eceef1] bg-white px-2 pb-[max(8px,env(safe-area-inset-bottom))] pt-2 sm:px-3 sm:pb-3 [html[data-keyboard=open]_&]:pb-2"
      data-chat-form=""
    >
      {reply || editing ? (
        <div className="mb-1.5 flex items-center gap-2 rounded-xl px-2 py-1" data-chat-replying="">
          {editing ? <Pencil className="h-4 w-4 shrink-0 text-[#8b5cf6]" /> : <CornerUpLeft className="h-4 w-4 shrink-0 text-[#8b5cf6]" />}
          <span className="min-w-0 flex-1 border-l-2 border-[#8b5cf6] pl-2 text-[12.5px] leading-snug">
            <span className="block font-semibold text-[#8b5cf6]">{editing ? "Editing" : `Reply to ${reply?.mine ? "yourself" : (reply?.author?.name ?? "Member")}`}</span>
            <span className="block truncate text-[#6b7280]">{(editing ?? reply)?.body || attachmentLine((editing ?? reply)?.attachments ?? []) || "Message"}</span>
          </span>
          <button
            type="button"
            aria-label="Cancel"
            onClick={() => {
              if (editing) {
                setText(kept.current)
                onCancelEdit()
              } else onCancelReply()
            }}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#6b7280] hover:bg-[#f1f2f4]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}
      {linkCard && draftUrl ? <LinkDraft card={linkCard} onDrop={() => setDropped(draftUrl)} /> : null}
      {tray.length ? (
        <div className="mb-2 flex gap-2 overflow-x-auto px-1 pb-1 pt-1" data-chat-tray="">
          {tray.map((t) => (
            <div key={t.key} className="relative shrink-0" data-chat-upload={t.media ? "done" : t.failed ? "failed" : "sending"}>
              {t.preview && t.kind === "video" ? (
                <video src={`${t.preview}#t=0.1`} muted playsInline preload="metadata" className={`h-16 w-16 rounded-xl bg-black object-cover ${t.media ? "" : "opacity-70"}`} data-chat-upload-video="" />
              ) : t.preview ? (
                <img src={t.preview} alt="" className={`h-16 w-16 rounded-xl object-cover ${t.media ? "" : "opacity-70"}`} />
              ) : (
                <div className="flex h-16 w-40 items-center gap-2 rounded-xl bg-[#f3f4f6] px-2.5">
                  <FileText className="h-4 w-4 shrink-0 text-[#6b7280]" />
                  <span className="min-w-0 truncate text-[12.5px] text-[#1a1a2e]">{t.name}</span>
                </div>
              )}
              {!t.media && !t.failed ? (
                <span className="absolute inset-x-1.5 bottom-1.5 h-1 overflow-hidden rounded-full bg-black/15">
                  <span className="block h-full rounded-full bg-[#1a1a2e] transition-[width] duration-200" style={{ width: `${Math.max(6, t.progress)}%` }} />
                </span>
              ) : null}
              {t.failed ? <span className="absolute inset-0 flex items-center justify-center rounded-xl bg-white/85 px-1 text-center text-[11px] font-medium text-[#c4290c]">Not uploaded</span> : null}
              <button type="button" aria-label={t.media ? "Remove" : "Stop upload"} onClick={() => drop(t.key)} className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-[#1a1a2e] text-white shadow">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      ) : null}
      <div className="flex items-end gap-1.5">
        {attachments && !editing ? (
          <>
            <button
              type="button"
              aria-label="Attach pictures or files"
              onClick={() => file.current?.click()}
              onPointerDown={(e) => e.preventDefault()}
              className={`${ICON} hover:bg-[#f1f2f4]`}
              data-chat-attach=""
            >
              <Paperclip aria-hidden strokeWidth={2} />
            </button>
            <input
              ref={file}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                add([...(e.target.files ?? [])])
                e.target.value = ""
              }}
            />
          </>
        ) : null}
        <div
          className="flex min-w-0 flex-1 items-end rounded-[20px] bg-[#f3f4f6] transition-[background-color,box-shadow] duration-150 focus-within:bg-white focus-within:shadow-[inset_0_0_0_1px_#e3e5e8]"
          data-chat-field=""
          onPaste={(e) => {
            const files = [...e.clipboardData.files]
            if (files.length && attachments) {
              e.preventDefault()
              add(files)
            }
          }}
        >
          <MentionTextarea
            ref={box}
            communityId={communityId}
            value={text}
            onChange={(v) => {
              setText(v)
              if (v) onTyping()
            }}
            onFocus={onFocus}
            placeholder={placeholder}
            ariaLabel={placeholder}
            maxLength={4000}
            maxHeight={160}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && !phone) {
                e.preventDefault()
                submit()
              }
              if (e.key === "Escape" && (editing || reply)) {
                e.preventDefault()
                if (editing) {
                  setText(kept.current)
                  onCancelEdit()
                } else onCancelReply()
              }
            }}
            wrapClassName="min-w-0 flex-1"
            className="max-h-40 min-h-[38px] pb-1.5 pl-4 pr-1 pt-2 text-[16px] leading-6 text-[#1a1a2e] sm:text-[15px]"
          />
          {!editing ? (
            <div className="flex shrink-0 items-center" data-chat-tools="">
              {tools && attachments ? (
                <Suspense fallback={null}>
                  <GifTool communityId={communityId} className={`${TOOL} animate-in fade-in-0 duration-150 motion-reduce:animate-none`} hideWhenOff mark={<GifGlyph />} onPick={(gif) => onSend("", [gif])} />
                </Suspense>
              ) : null}
              {emoji ? (
                <Suspense fallback={<ToolStandIn />}>
                  <EmojiTool className={TOOL} size={{ w: 320, h: 340 }} startOpen onBeforeOpen={() => undefined} onInsert={(e) => box.current?.insert(e)} />
                </Suspense>
              ) : (
                <ToolStandIn onPress={() => setEmoji(true)} />
              )}
            </div>
          ) : null}
        </div>
        <button
          type="submit"
          aria-label={editing ? "Save" : "Send"}
          disabled={!canSend}
          onPointerDown={(e) => e.preventDefault()}
          className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full bg-[#1a1a2e] text-white outline-none transition-[background-color,scale,opacity] hover:bg-[#2b2b42] active:scale-[0.92] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/25 disabled:cursor-default disabled:opacity-30"
          data-chat-send=""
        >
          {/* Uploading, the button waits, dimmed: each picture in the tray shows its own progress. */}
          {editing ? <Check className="h-[18px] w-[18px]" strokeWidth={2.5} /> : <ArrowUp className="h-[18px] w-[18px]" strokeWidth={2.5} />}
        </button>
      </div>
    </form>
  )
}

/* ── Mute, for a chat's header ─────────────────────────────────────────── */

export function MuteButton({ communityId, kind, chatId }: { communityId: string; kind: ChatKind; chatId: string }) {
  /* Kept for the tab (round 38): a chat opened again has its bell at once, and its header never shifts when the answer lands. */
  const prefKey = `prefs:${kind}:${chatId}`
  const [state, setStateRaw] = useState<{ notify: string; mutedUntil: string | null } | null>(() => keptValue(prefKey))
  const setState = (v: { notify: string; mutedUntil: string | null }) => {
    keepValue(prefKey, v)
    setStateRaw(v)
  }
  useEffect(() => {
    let gone = false
    void api<{ notify: string; mutedUntil: string | null }>(`${apiBase(communityId)}/chat/prefs?type=${kind}&id=${chatId}`).then((r) => {
      if (gone || !r.ok) return
      keepValue(`prefs:${kind}:${chatId}`, r.data)
      setStateRaw(r.data)
    })
    return () => {
      gone = true
    }
  }, [communityId, kind, chatId])
  if (!state) return <span aria-hidden className="h-10 w-10 shrink-0" data-chat-mute="" />
  const muted = state.notify === "none" || (!!state.mutedUntil && Date.parse(state.mutedUntil) > Date.now())
  /* A channel's default is mentions only; "on" there is every message. */
  const loud = kind === "space" ? state.notify === "all" : !muted
  const flip = async () => {
    const next = kind === "space" ? { notify: loud ? "default" : "all" } : muted ? { notify: "default", muteMinutes: 0 } : { notify: "none" }
    const before = state
    setState({ notify: next.notify, mutedUntil: null })
    const r = await api<{ notify: string; mutedUntil: string | null }>(`${apiBase(communityId)}/chat/prefs`, { body: { type: kind, id: chatId, ...next } })
    if (!r.ok) {
      setState(before)
      return toast(r.error)
    }
    toast(kind === "space" ? (next.notify === "all" ? "You will hear about every message here" : "Only mentions and replies from here") : next.notify === "none" ? "Muted" : "Unmuted")
  }
  const label = kind === "space" ? (loud ? "Notifying every message" : "Notify me of every message") : muted ? "Unmute" : "Mute"
  return (
    <button type="button" onClick={() => void flip()} aria-label={label} title={label} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#6b7280] outline-none transition-colors hover:bg-[#f4f5f7] hover:text-[#1a1a2e] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15" data-chat-mute={loud ? "on" : "off"}>
      {loud ? <Bell className="h-[18px] w-[18px]" /> : <BellOff className="h-[18px] w-[18px]" />}
    </button>
  )
}
