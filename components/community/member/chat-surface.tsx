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
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { ArrowDown, ArrowUp, Bell, BellOff, Check, CheckCheck, Clock, Copy, CornerUpLeft, FileText, Flag, Heart, MoreHorizontal, Paperclip, Pencil, Play, RotateCw, Shield, Trash2, X } from "lucide-react"
import { ActionMenuAt, type ActionMenuItem, type ActionMenuPlace } from "@/components/ui/responsive-action-menu"
import { CHAT_ATTACHMENTS_MAX, attachmentLine, firstSettled, lastSettled, localDay, mergeMessages, newClientId, sameBubbleGroup, typingLine, type ChatKind } from "@/lib/communities/chat-rules"
import { fileSizeLabel, type ViewerItem } from "@/lib/communities/post-media"
import type { PostMedia } from "@/lib/communities/types"
import type { ChatIntroView, ChatLine } from "./view-types"
import { api, apiBase } from "./api"
import { inline } from "./body-text"
import { cachedPage, clockOf, dayLabelOf, keepPage, useTyping, useViewingBeat, type ChatItem } from "./chat-core"
import { ConfirmDialog, type ConfirmState } from "./dialogs"
import { Lightbox } from "./lightbox"
import { MemberAvatar } from "./member-avatar"
import { localPicture, stopUpload, uploadCommunityFile, uploadKindOf, uploadPicture } from "./media-upload"
import { MentionTextarea, type MentionTextareaHandle } from "./mention-input"
import { Spinner } from "./place-spinner"
import { toast } from "./toast"

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
  renderAvatar?: (m: ChatLine) => React.ReactNode
  renderName?: (m: ChatLine) => React.ReactNode
  onReport?: (m: ChatLine) => void
  onRead?: () => void
  /** What the list answers besides messages (a conversation's otherReadAt). */
  onPage?: (data: Record<string, unknown>) => void
}

const AT_BOTTOM_PX = 120
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

interface TrayItem {
  key: string
  name: string
  kind: "image" | "file"
  preview: string | null
  progress: number
  media: PostMedia | null
  failed: string | null
  ctrl: AbortController
}

export function ChatSurface(p: ChatSurfaceProps) {
  const { communityId, kind, chatId, me, url } = p
  const cacheKey = `${kind}:${chatId}`
  const phone = usePhone()
  const start = p.initial ?? cachedPage(cacheKey)
  const [items, setItems] = useState<ChatItem[]>(() => (start ? mergeMessages([], start.messages) : []))
  const [loaded, setLoaded] = useState(!!start)
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

  /* Every change to the list is kept for the next visit. */
  useEffect(() => {
    if (loaded) keepPage(cacheKey, items, hasMore)
  }, [cacheKey, items, hasMore, loaded])

  const merge = useCallback((incoming: ChatItem[], from: "mine" | "theirs" | "older") => {
    if (!incoming.length) return
    const el = listRef.current
    if (from === "older" && el) keepFrom.current = el.scrollHeight - el.scrollTop
    setItems((cur) => {
      const next = mergeMessages(cur, incoming)
      if (from === "theirs" && !atBottom.current) {
        const known = new Set(cur.map((m) => m.id))
        const fresh = incoming.filter((m) => !known.has(m.id) && !m.mine).length
        if (fresh) setUnseen((n) => n + fresh)
      }
      return next
    })
  }, [])

  /* The first page, when the server did not hand one over (a conversation, a group); the cached copy is shown meanwhile. */
  useEffect(() => {
    if (p.initial) return
    let gone = false
    void (async () => {
      const r = await api<{ messages: ChatLine[]; hasMore: boolean } & Record<string, unknown>>(url)
      if (gone) return
      setLoaded(true)
      if (!r.ok) return toast(r.error)
      onPageRef.current?.(r.data)
      setItems((cur) => mergeMessages(cur.filter((m) => m.state), r.data.messages))
      setHasMore(r.data.hasMore)
    })()
    return () => {
      gone = true
    }
  }, [url, p.initial])

  const catchUp = useCallback(async () => {
    const last = lastSettled(latest.current)
    const r = await api<{ messages: ChatLine[] } & Record<string, unknown>>(`${url}${last ? `${url.includes("?") ? "&" : "?"}after=${encodeURIComponent(last.createdAt)}` : ""}`)
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
  }, [items, loaded])

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
    if (!el || !root || !hasMore || typeof IntersectionObserver === "undefined") return
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && void loadOlder(), { root, rootMargin: "600px 0px 0px 0px" })
    io.observe(el)
    return () => io.disconnect()
  }, [hasMore, loadOlder])

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
        const code = (r as { code?: string }).code
        if (r.status === 409) setNeedsRules(true)
        setItems((cur) => cur.map((m) => (m.id === item.id ? { ...m, state: "failed", error: r.error } : m)))
        if (code !== "rules" && r.status !== 409) toast(r.error)
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
      if (a.type === "image") list.push({ kind: "image", url: localPicture(a.url) ?? a.url, ...(a.w ? { w: a.w, h: a.h } : {}) })
      else if (a.type === "gif") list.push({ kind: "gif", url: a.url, still: a.still, ...(a.w ? { w: a.w, h: a.h } : {}) })
      else if (isVideoFile(a) && !m.state) list.push({ kind: "clip", url: fileHref(communityId, kind, m.id, a) })
    })
    if (list.length) setViewer({ items: list, start: startAt })
  }

  /* ── Drawing ─────────────────────────────────────────────────────────── */

  const lastMineSeen = useMemo(() => {
    if (!p.otherReadAt) return null
    const read = Date.parse(p.otherReadAt)
    for (let i = items.length - 1; i >= 0; i--) {
      const m = items[i]
      if (m.mine && !m.state) return Date.parse(m.createdAt) <= read ? m.id : null
    }
    return null
  }, [items, p.otherReadAt])

  const lastMineId = useMemo(() => {
    for (let i = items.length - 1; i >= 0; i--) if (items[i].mine && !items[i].state) return items[i].id
    return null
  }, [items])

  const typingText = typingLine(typing.names)

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
              {older ? <Spinner size={16} /> : (
                <button type="button" onClick={() => void loadOlder()} className="h-8 rounded-full px-3 text-[12.5px] font-medium text-[#6b7280] hover:bg-[#f1f2f4]">
                  Earlier messages
                </button>
              )}
            </div>
          ) : null}
          {!loaded ? (
            <div className="flex flex-1 items-center justify-center py-16">
              <Spinner label="Loading" />
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center" data-chat-empty="">
              {p.empty}
            </div>
          ) : null}
          {items.map((m, i) => {
            const prev = items[i - 1]
            const next = items[i + 1]
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
            return (
              <div key={m.id}>
                {newDay ? <DayLine iso={m.createdAt} /> : null}
                <Bubble
                  m={m}
                  first={first}
                  last={last}
                  showAuthor={p.showAuthors && !m.mine}
                  flash={flash === m.id}
                  seen={m.id === lastMineSeen}
                  delivered={m.id === lastMineId && p.otherReadAt !== undefined}
                  reactions={!!p.reactions}
                  communityId={communityId}
                  kind={kind}
                  phone={phone}
                  renderAvatar={p.renderAvatar}
                  renderName={p.renderName}
                  onMenu={openMenu}
                  onRetry={retry}
                  onReply={!p.closed && me ? () => setReply(m) : undefined}
                  onJump={jumpTo}
                  onOpen={openViewer}
                  onLike={p.reactions && me ? () => void like(m) : undefined}
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
          className="absolute bottom-[calc(var(--chat-composer-h,64px)+12px)] right-3 z-10 flex h-10 items-center gap-1.5 rounded-full border border-[#e3e5e9] bg-white px-3.5 text-[13px] font-medium text-[#1a1a2e] shadow-[0_6px_18px_-6px_rgba(17,24,39,0.25)] transition-[opacity,transform] animate-in fade-in-0 slide-in-from-bottom-1 duration-150 active:scale-[0.97]"
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

function DayLine({ iso }: { iso: string }) {
  const [label, setLabel] = useState<string | null>(null)
  /* The reader's own day names, after the first paint (the server does not know their time zone). */
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

function Bubble({
  m,
  first,
  last,
  showAuthor,
  flash,
  seen,
  delivered,
  reactions,
  communityId,
  kind,
  phone,
  renderAvatar,
  renderName,
  onMenu,
  onRetry,
  onReply,
  onJump,
  onOpen,
  onLike,
  hasActions,
}: {
  m: ChatItem
  first: boolean
  last: boolean
  showAuthor: boolean
  flash: boolean
  seen: boolean
  delivered: boolean
  reactions: boolean
  communityId: string
  kind: ChatKind
  phone: boolean
  renderAvatar?: (m: ChatLine) => React.ReactNode
  renderName?: (m: ChatLine) => React.ReactNode
  onMenu: (m: ChatItem, el: HTMLElement, at?: { x: number; y: number }) => void
  onRetry: (m: ChatItem) => void
  onReply?: () => void
  onJump: (id: string) => void
  onOpen: (m: ChatItem, index: number) => void
  onLike?: () => void
  hasActions: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const press = useRef<{ t: number; x: number; y: number } | null>(null)
  const [clock, setClock] = useState<string | null>(null)
  useEffect(() => setClock(clockOf(m.createdAt)), [m.createdAt])
  const mine = m.mine
  const media = m.attachments ?? []
  const pics = media.filter((a) => a.type === "image" || a.type === "gif")
  const files = media.filter((a) => a.type === "file")
  const onlyPics = pics.length > 0 && !m.body && !files.length && !m.replyTo
  /* Telegram's shape: a run of bubbles from one person is one column, square where they touch, the last one with its tail corner. */
  const corner = mine ? `${first ? "" : "rounded-tr-[6px]"} rounded-br-[6px]` : `${first ? "" : "rounded-tl-[6px]"} rounded-bl-[6px]`
  const tone = mine ? "bg-[#1a1a2e] text-white" : "bg-[#f1f2f4] text-[#1a1a2e]"
  const meta = (
    <span className={`ml-2 inline-flex translate-y-[3px] items-center gap-0.5 whitespace-nowrap align-baseline text-[11px] ${mine ? "text-white/60" : "text-[#8a8f98]"}`}>
      {m.editedAt ? "edited " : ""}
      {clock ?? ""}
      {mine ? m.state === "sending" ? <Clock className="h-3 w-3" aria-label="Sending" /> : m.state === "failed" ? null : seen ? <CheckCheck className="h-3.5 w-3.5" aria-label="Seen" /> : delivered ? <Check className="h-3.5 w-3.5" aria-label="Sent" /> : null : null}
    </span>
  )

  const touchStart = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" || !hasActions) return
    const t = window.setTimeout(() => {
      press.current = null
      try {
        navigator.vibrate?.(8)
      } catch {
        /* No haptics here. */
      }
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
      className={`group/msg relative flex items-end gap-1.5 ${mine ? "justify-end" : "justify-start"} ${first ? "mt-2" : "mt-[3px]"} ${m.state === "sending" ? "opacity-70" : ""} transition-opacity duration-150`}
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
            f.type === "file" && isVideoFile(f) && !m.state ? (
              <button key={f.assetId} type="button" onClick={() => onOpen(m, media.indexOf(f))} className="relative my-1 flex aspect-video w-[min(280px,70vw)] items-center justify-center overflow-hidden rounded-xl bg-black/80 text-white" data-chat-video="">
                <video src={`${fileHref(communityId, kind, m.id, f)}#t=0.1`} preload="metadata" muted playsInline className="absolute inset-0 h-full w-full object-cover" />
                <span className="relative flex h-11 w-11 items-center justify-center rounded-full bg-black/55"><Play className="h-5 w-5 translate-x-[1px]" fill="currentColor" /></span>
              </button>
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
        </div>
        {m.state === "failed" ? (
          <button type="button" onClick={() => onRetry(m)} className="mt-1 flex items-center gap-1 px-1 text-[12px] font-medium text-[#c4290c]" data-chat-retry="">
            <RotateCw className="h-3 w-3" />
            Not sent. Tap to try again
          </button>
        ) : null}
        {reactions && (m.reactionCount ?? 0) > 0 ? (
          <button type="button" onClick={() => onLike?.()} className={`-mt-1.5 flex h-6 items-center gap-1 rounded-full border border-white bg-[#f1f2f4] px-2 text-[11.5px] font-medium shadow-[0_1px_2px_rgba(16,24,40,0.08)] ${m.reacted ? "text-[#e11d48]" : "text-[#6b7280]"}`} data-chat-likes="">
            <Heart className="h-3 w-3" fill={m.reacted ? "currentColor" : "none"} />
            {m.reactionCount}
          </button>
        ) : null}
        {seen && last ? <span className="mt-0.5 px-1 text-[11px] text-[#9ca3af]" data-chat-seen="">Seen</span> : null}
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
}

function Pictures({ m, pics, onOpen, rounded }: { m: ChatItem; pics: PostMedia[]; onOpen: (m: ChatItem, index: number) => void; rounded: boolean }) {
  const all = m.attachments
  if (pics.length === 1) {
    const a = pics[0] as Extract<PostMedia, { type: "image" | "gif" }>
    const ratio = a.w && a.h ? Math.min(1.8, Math.max(0.7, a.w / a.h)) : 4 / 3
    const src = a.type === "image" ? (localPicture(a.url) ?? a.url) : a.url
    return (
      <button type="button" onClick={() => onOpen(m, all.indexOf(a))} className={`block w-[min(300px,68vw)] overflow-hidden bg-[#e9eaee] ${rounded ? "my-1 rounded-xl" : ""}`} style={{ aspectRatio: String(ratio) }} data-chat-picture="">
        <img src={src} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" draggable={false} />
      </button>
    )
  }
  return (
    <div className={`grid w-[min(300px,68vw)] grid-cols-2 gap-0.5 overflow-hidden ${rounded ? "my-1 rounded-xl" : ""}`} data-chat-pictures="">
      {pics.slice(0, 4).map((x, i) => {
        const a = x as Extract<PostMedia, { type: "image" | "gif" }>
        const src = a.type === "image" ? (localPicture(a.url) ?? a.url) : a.url
        return (
          <button key={`${a.url}-${i}`} type="button" onClick={() => onOpen(m, all.indexOf(a))} className="relative aspect-square overflow-hidden bg-[#e9eaee]">
            <img src={src} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" draggable={false} />
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
        const isPic = uploadKindOf(f) === "image"
        const item: TrayItem = { key, name: f.name, kind: isPic ? "image" : "file", preview: isPic ? URL.createObjectURL(f) : null, progress: 0, media: null, failed: null, ctrl: new AbortController() }
        setTray((cur) => [...cur, item])
        const progress = (n: number) => setTray((cur) => cur.map((x) => (x.key === key ? { ...x, progress: n } : x)))
        const done = (media: PostMedia) => setTray((cur) => cur.map((x) => (x.key === key ? { ...x, progress: 100, media } : x)))
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

  const submit = () => {
    if (editing) {
      onSaveEdit(text)
      setText(kept.current)
      kept.current = ""
      return
    }
    if (!canSend) return
    onSend(text, ready)
    setText("")
    setTray([])
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
      {tray.length ? (
        <div className="mb-2 flex gap-2 overflow-x-auto px-1 pb-1 pt-1" data-chat-tray="">
          {tray.map((t) => (
            <div key={t.key} className="relative shrink-0" data-chat-upload={t.media ? "done" : t.failed ? "failed" : "sending"}>
              {t.preview ? (
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
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#6b7280] outline-none transition-colors hover:bg-[#f1f2f4] hover:text-[#1a1a2e] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15"
              data-chat-attach=""
            >
              <Paperclip className="h-5 w-5" />
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
          className="min-w-0 flex-1"
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
            className="block max-h-40 min-h-10 w-full resize-none rounded-[20px] border border-transparent bg-[#f3f4f6] px-4 py-2 text-[16px] leading-6 text-[#1a1a2e] outline-none transition-[border-color,background-color] placeholder:text-[#9ca3af] focus:border-[#e3e5e8] focus:bg-white sm:text-[15px]"
          />
        </div>
        <button
          type="submit"
          aria-label={editing ? "Save" : "Send"}
          disabled={!canSend}
          onPointerDown={(e) => e.preventDefault()}
          className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full bg-[#1a1a2e] text-white outline-none transition-[background-color,scale,opacity] hover:bg-[#2b2b42] active:scale-[0.92] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/25 disabled:cursor-default disabled:opacity-30"
          data-chat-send=""
        >
          {editing ? <Check className="h-[18px] w-[18px]" strokeWidth={2.5} /> : uploading ? <Spinner size={16} /> : <ArrowUp className="h-[18px] w-[18px]" strokeWidth={2.5} />}
        </button>
      </div>
    </form>
  )
}

/* ── Mute, for a chat's header ─────────────────────────────────────────── */

export function MuteButton({ communityId, kind, chatId }: { communityId: string; kind: ChatKind; chatId: string }) {
  const [state, setState] = useState<{ notify: string; mutedUntil: string | null } | null>(null)
  useEffect(() => {
    let gone = false
    void api<{ notify: string; mutedUntil: string | null }>(`${apiBase(communityId)}/chat/prefs?type=${kind}&id=${chatId}`).then((r) => {
      if (!gone && r.ok) setState(r.data)
    })
    return () => {
      gone = true
    }
  }, [communityId, kind, chatId])
  if (!state) return null
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
