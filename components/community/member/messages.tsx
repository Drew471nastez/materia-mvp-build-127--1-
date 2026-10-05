"use client"

/**
 * ===========================================================================
 *  MESSAGES BETWEEN MEMBERS
 * ===========================================================================
 * The chat button in the community's bar opens this: the member's
 * conversations in this community, newest first, and a conversation when one
 * is picked. On a computer it is a panel on the right that floats over the
 * page (the page stays where it was); on a phone it is a screen of its own
 * that slides in, sized to what the keyboard leaves (--vv-h), so the box you
 * type in sits right above the keys.
 *
 * "Message" on a person's card, a member row or a profile (through
 * /community/<slug>?dm=<userId>) opens it straight on that conversation
 * (openMessages({ userId })), made on the server the first time. The name at
 * the top of a conversation opens that person's own page.
 *
 * LIVE, BUT NEVER TRUSTED. Realtime tells the page a conversation moved or a
 * message arrived (part 83's policy sends those rows to the two members and
 * nobody else); the page then asks the server, so every name and picture is
 * the server's. Sending always goes through the server.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { ArrowUp, ChevronLeft, PenSquare, Search, Trash2, X } from "lucide-react"
import { Spinner } from "./place-spinner"
import { MemberAvatar } from "./member-avatar"
import { createClient } from "@/lib/supabase/client"
import type { MemberView } from "@/lib/communities/types"
import { useLightChrome } from "@/lib/ui/light-chrome"
import { api, apiBase } from "./api"
import { inline } from "./body-text"
import { realtimeAuth } from "./realtime"
import { memberHref } from "./person-href"
import { toast } from "./toast"
import { RoleBadge } from "./role-badge"

export const MESSAGES_EVENT = "storelib:community-messages"

/**
 * A realtime stream that works for a signed in member, with a net under it.
 * The join waits for the member's token (./realtime realtimeAuth): joined as
 * a visitor, part 83's policy sends nothing and messages never arrived
 * until the panel was opened again (round 7). If the stream is not joined
 * after a few seconds, or drops, `poll` runs every `everyMs` while the page
 * is visible, so a message still arrives without a reload.
 */
export function liveStream(
  name: string,
  table: "community_conversations" | "community_direct_messages",
  filter: string,
  onChange: (payload: { eventType: string; new?: Record<string, unknown> }) => void,
  poll: () => void,
  everyMs: number,
): () => void {
  let supabase: ReturnType<typeof createClient> | null = null
  let channel: ReturnType<ReturnType<typeof createClient>["channel"]> | null = null
  let gone = false
  let joined = false
  let timer: number | undefined
  const tick = () => {
    window.clearTimeout(timer)
    timer = window.setTimeout(() => {
      if (gone) return
      if (!joined && document.visibilityState === "visible") poll()
      tick()
    }, everyMs)
  }
  void (async () => {
    try {
      supabase = createClient()
      await realtimeAuth(supabase)
      if (gone) return
      channel = supabase
        .channel(name)
        .on("postgres_changes", { event: "*", schema: "public", table, filter }, onChange)
        .subscribe((status: string) => {
          joined = status === "SUBSCRIBED"
        })
    } catch {
      /* No realtime here: the net below carries it. */
    }
  })()
  tick()
  return () => {
    gone = true
    window.clearTimeout(timer)
    if (supabase && channel) supabase.removeChannel(channel)
  }
}

/** Opens the panel, on a member's conversation when `userId` is given. */
export function openMessages(detail: { userId?: string } = {}) {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent(MESSAGES_EVENT, { detail }))
}

interface Person {
  id: string
  name: string
  username: string | null
  avatarUrl: string | null
  role: string | null
}

interface Conversation {
  id: string
  other: Person | null
  lastBody: string
  lastAt: string | null
  lastFromMe: boolean
  unread: boolean
}

interface Message {
  id: string
  conversationId: string
  body: string
  mine: boolean
  createdAt: string
  editedAt: string | null
  sending?: boolean
}

type View = { kind: "list" } | { kind: "new" } | { kind: "thread"; id: string; other: Person | null }

function usePhone(): boolean {
  const [phone, setPhone] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)")
    const on = () => setPhone(mq.matches)
    on()
    mq.addEventListener("change", on)
    return () => mq.removeEventListener("change", on)
  }, [])
  return phone
}

function ago(iso: string | null): string {
  if (!iso) return ""
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000)
  if (s < 60) return "now"
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  if (s < 604800) return `${Math.floor(s / 86400)}d`
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

function dayOf(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

function dayLabel(iso: string): string {
  const today = new Date()
  if (dayOf(iso) === dayOf(today.toISOString())) return "Today"
  if (dayOf(iso) === dayOf(new Date(Date.now() - 86_400_000).toISOString())) return "Yesterday"
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric", ...(d.getFullYear() !== today.getFullYear() ? { year: "numeric" } : {}) })
}

function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
}

/* ── the button's number, kept live while the panel is shut ─────────────── */

/**
 * How many conversations have something unread, from realtime: any change to
 * one of the member's conversations asks the server again (debounced), so a
 * message arriving lights the badge without a reload.
 */
export function useUnreadMessages(communityId: string, userId: string | null, initial: number | null): [number | null, () => void] {
  const [count, setCount] = useState(initial)
  useEffect(() => setCount(initial), [initial])
  const refresh = useCallback(async () => {
    const r = await api<{ ready: boolean; unread: number }>(`${apiBase(communityId)}/dms`)
    if (r.ok && r.data.ready) setCount(r.data.unread)
  }, [communityId])
  useEffect(() => {
    if (!userId || initial === null) return
    let timer: number | undefined
    const stop = liveStream(
      `community-dm-inbox:${communityId}:${userId}`,
      "community_conversations",
      `community_id=eq.${communityId}`,
      () => {
        window.clearTimeout(timer)
        timer = window.setTimeout(() => void refresh(), 250)
      },
      () => void refresh(),
      45_000,
    )
    const onVisible = () => document.visibilityState === "visible" && void refresh()
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener("visibilitychange", onVisible)
      stop()
    }
  }, [communityId, userId, initial, refresh])
  return [count, refresh]
}

/* ── the panel ─────────────────────────────────────────────────────────── */

const ENTER_MS = 240
const EXIT_MS = 180

export function MessagesPanel({ communityId, slug, userId, open, onClose, start, onRead }: { communityId: string; slug: string; userId: string | null; open: boolean; onClose: () => void; start: { userId?: string } | null; onRead: () => void }) {
  const phone = usePhone()
  const [shown, setShown] = useState(open)
  const [leaving, setLeaving] = useState(false)
  const [view, setView] = useState<View>({ kind: "list" })
  const [back, setBack] = useState(false)

  useEffect(() => {
    if (open) {
      setShown(true)
      setLeaving(false)
      return
    }
    if (!shown) return
    setLeaving(true)
    const t = window.setTimeout(() => {
      setShown(false)
      setLeaving(false)
      setView({ kind: "list" })
    }, EXIT_MS)
    return () => window.clearTimeout(t)
  }, [open, shown])

  /* Opened on a member: their conversation, made on the server if new. */
  useEffect(() => {
    if (!open || !start?.userId) return
    let gone = false
    setView({ kind: "list" })
    void (async () => {
      const r = await api<{ conversation: { id: string; other: Person | null } }>(`${apiBase(communityId)}/dms`, { body: { userId: start.userId } })
      if (gone) return
      if (!r.ok) return toast(r.error)
      setBack(false)
      setView({ kind: "thread", id: r.data.conversation.id, other: r.data.conversation.other })
    })()
    return () => {
      gone = true
    }
  }, [open, start, communityId])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) onClose()
    }
    window.addEventListener("keydown", onKey)
    if (!phone) return () => window.removeEventListener("keydown", onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      window.removeEventListener("keydown", onKey)
      document.body.style.overflow = prev
    }
  }, [open, phone, onClose])

  useLightChrome(shown && phone)

  if (!shown || typeof document === "undefined") return null

  const go = (next: View, backwards = false) => {
    setBack(backwards)
    setView(next)
  }

  const body =
    view.kind === "thread" ? (
      <Thread key={view.id} communityId={communityId} slug={slug} userId={userId} id={view.id} other={view.other} onBack={() => go({ kind: "list" }, true)} onClose={onClose} onRead={onRead} back={back} />
    ) : view.kind === "new" ? (
      <NewMessage communityId={communityId} userId={userId} onBack={() => go({ kind: "list" }, true)} onPick={(c) => go({ kind: "thread", id: c.id, other: c.other })} back={back} />
    ) : (
      <Inbox communityId={communityId} userId={userId} onClose={onClose} onNew={() => go({ kind: "new" })} onOpen={(c) => go({ kind: "thread", id: c.id, other: c.other })} back={back} phone={phone} />
    )

  return createPortal(
    phone ? (
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Messages"
        data-community-messages="phone"
        className={`fixed inset-x-0 top-[var(--vv-top,0px)] z-[120] flex h-[var(--vv-h,100dvh)] flex-col bg-white ease-sheet [backface-visibility:hidden] ${
          leaving ? "animate-out slide-out-to-right duration-200" : "animate-in slide-in-from-right duration-[240ms]"
        }`}
      >
        {body}
      </div>
    ) : (
      <>
        {/* No dark scrim: the page stays as it was. A click outside closes it. */}
        <div aria-hidden className="fixed inset-0 z-[110]" onClick={onClose} />
        <div
          role="dialog"
          aria-label="Messages"
          data-community-messages="panel"
          style={{ animationDuration: `${leaving ? EXIT_MS : ENTER_MS}ms` }}
          className={`fixed bottom-4 right-4 top-[calc(var(--community-top,64px)+8px)] z-[120] flex w-[400px] max-w-[calc(100vw-32px)] flex-col overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white shadow-[0_24px_60px_-16px_rgba(17,24,39,0.28),0_2px_8px_rgba(17,24,39,0.06)] ease-sheet ${
            leaving ? "animate-out fade-out-0 slide-out-to-right-3" : "animate-in fade-in-0 slide-in-from-right-3"
          }`}
        >
          {body}
        </div>
      </>
    ),
    document.body,
  )
}

function Bar({ title, onBack, onClose, right }: { title: React.ReactNode; onBack?: () => void; onClose?: () => void; right?: React.ReactNode }) {
  return (
    <div className="shrink-0 border-b border-[#f0f1f3] bg-white pt-[env(safe-area-inset-top)] sm:pt-0">
      <div className="flex h-14 items-center gap-1 px-2">
        {onBack ? (
          <button type="button" aria-label="Back" onClick={onBack} className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full text-[#1a1a2e] outline-none transition-colors hover:bg-[#f4f5f7] active:bg-[#eef0f2] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15">
            <ChevronLeft className="h-[22px] w-[22px]" strokeWidth={2.25} />
          </button>
        ) : (
          <span className="w-2" />
        )}
        <div className="min-w-0 flex-1">{title}</div>
        {right}
        {onClose ? (
          <button type="button" aria-label="Close" onClick={onClose} className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full text-[#6b7280] outline-none transition-colors hover:bg-[#f4f5f7] hover:text-[#1a1a2e] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15">
            <X className="h-[18px] w-[18px]" />
          </button>
        ) : null}
      </div>
    </div>
  )
}

function slideClass(back: boolean): string {
  return `animate-in fade-in-0 duration-200 ease-sheet ${back ? "slide-in-from-left-2" : "slide-in-from-right-2"}`
}

/* ── the list of conversations ─────────────────────────────────────────── */

function Inbox({ communityId, userId, onClose, onNew, onOpen, back, phone }: { communityId: string; userId: string | null; onClose: () => void; onNew: () => void; onOpen: (c: Conversation) => void; back: boolean; phone: boolean }) {
  const [list, setList] = useState<Conversation[] | null>(null)
  const [failed, setFailed] = useState(false)

  const load = useCallback(async () => {
    const r = await api<{ ready: boolean; conversations: Conversation[] }>(`${apiBase(communityId)}/dms`)
    if (!r.ok) {
      setFailed(true)
      return
    }
    setFailed(false)
    setList(r.data.conversations)
  }, [communityId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!userId) return
    let timer: number | undefined
    const stop = liveStream(
      `community-dm-list:${communityId}:${userId}`,
      "community_conversations",
      `community_id=eq.${communityId}`,
      () => {
        window.clearTimeout(timer)
        timer = window.setTimeout(() => void load(), 150)
      },
      () => void load(),
      15_000,
    )
    return () => {
      window.clearTimeout(timer)
      stop()
    }
  }, [communityId, userId, load])

  return (
    <div className={`flex min-h-0 flex-1 flex-col ${slideClass(back)}`}>
      <Bar
        title={<h2 className="px-1 text-[17px] font-semibold text-[#1a1a2e]">Messages</h2>}
        onBack={phone ? onClose : undefined}
        onClose={phone ? undefined : onClose}
        right={
          <button type="button" onClick={onNew} aria-label="New message" data-messages-new="" className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full text-[#1a1a2e] outline-none transition-colors hover:bg-[#f4f5f7] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15">
            <PenSquare className="h-[18px] w-[18px]" />
          </button>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1.5">
        {list === null && !failed ? (
          <div className="space-y-1 px-2" aria-label="Loading conversations">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3 rounded-xl px-2.5 py-2.5">
                <span className="h-11 w-11 shrink-0 animate-pulse rounded-full bg-[#f1f2f4]" />
                <span className="flex-1 space-y-2">
                  <span className="block h-3 w-28 animate-pulse rounded-full bg-[#f1f2f4]" />
                  <span className="block h-3 w-44 animate-pulse rounded-full bg-[#f4f5f7]" />
                </span>
              </div>
            ))}
          </div>
        ) : failed ? (
          <div className="px-6 py-14 text-center">
            <p className="text-[14px] text-[#6b7280]">Your messages did not load.</p>
            <button type="button" onClick={() => void load()} className="mt-3 h-9 rounded-full border border-[#e3e4e8] px-4 text-[13.5px] font-medium text-[#1a1a2e] hover:bg-[#f6f7f8]">
              Try again
            </button>
          </div>
        ) : list && list.length === 0 ? (
          <div className="flex flex-col items-center px-8 py-16 text-center" data-messages-empty="">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#f4f5f7] text-[#6b7280]">
              <PenSquare className="h-5 w-5" />
            </span>
            <p className="mt-4 text-[15px] font-semibold text-[#1a1a2e]">No messages yet</p>
            <p className="mt-1 text-[13.5px] leading-relaxed text-[#6b7280]">Start a conversation with anyone in this community.</p>
            <button type="button" onClick={onNew} className="mt-5 h-10 rounded-full bg-[#1a1a2e] px-5 text-[14px] font-medium text-white transition-[background-color,scale] hover:bg-[#2b2b42] active:scale-[0.97]">
              New message
            </button>
          </div>
        ) : (
          <ul className="px-1.5">
            {(list ?? []).map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onOpen(c)}
                  data-conversation={c.id}
                  className="flex w-full cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2.5 text-left outline-none transition-colors hover:bg-[#f6f7f8] active:bg-[#f1f2f4] focus-visible:bg-[#f6f7f8]"
                >
                  <MemberAvatar src={c.other?.avatarUrl ?? null} name={c.other?.name ?? "Member"} alt="" size={44} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                      <span className={`min-w-0 flex-1 truncate text-[14.5px] ${c.unread ? "font-semibold text-[#1a1a2e]" : "font-medium text-[#1a1a2e]"}`}>{c.other?.name ?? "Former member"}</span>
                      <span className="shrink-0 text-[12px] tabular-nums text-[#9ca3af]">{ago(c.lastAt)}</span>
                    </span>
                    <span className="mt-0.5 flex items-center gap-2">
                      <span className={`min-w-0 flex-1 truncate text-[13.5px] ${c.unread ? "text-[#1a1a2e]" : "text-[#6b7280]"}`}>
                        {c.lastFromMe ? "You: " : ""}
                        {c.lastBody}
                      </span>
                      {c.unread ? <span aria-label="Unread" className="h-2 w-2 shrink-0 rounded-full bg-[#1a1a2e]" /> : null}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

/* ── picking somebody to write to ──────────────────────────────────────── */

function NewMessage({ communityId, userId, onBack, onPick, back }: { communityId: string; userId: string | null; onBack: () => void; onPick: (c: { id: string; other: Person | null }) => void; back: boolean }) {
  const [q, setQ] = useState("")
  const [found, setFound] = useState<MemberView[]>([])
  const [busy, setBusy] = useState(false)
  const [opening, setOpening] = useState<string | null>(null)

  useEffect(() => {
    const term = q.trim()
    if (!term) {
      setFound([])
      return
    }
    const ctl = new AbortController()
    const t = window.setTimeout(async () => {
      setBusy(true)
      const r = await api<{ members: MemberView[] }>(`${apiBase(communityId)}/members?q=${encodeURIComponent(term)}&limit=8`, { signal: ctl.signal })
      setBusy(false)
      if (r.ok) setFound(r.data.members.filter((m) => m.userId !== userId))
    }, 180)
    return () => {
      window.clearTimeout(t)
      ctl.abort()
    }
  }, [q, communityId, userId])

  const pick = async (m: MemberView) => {
    if (opening) return
    setOpening(m.userId)
    const r = await api<{ conversation: { id: string; other: Person | null } }>(`${apiBase(communityId)}/dms`, { body: { userId: m.userId } })
    setOpening(null)
    if (!r.ok) return toast(r.error)
    onPick(r.data.conversation)
  }

  return (
    <div className={`flex min-h-0 flex-1 flex-col ${slideClass(back)}`}>
      <Bar title={<h2 className="px-1 text-[17px] font-semibold text-[#1a1a2e]">New message</h2>} onBack={onBack} />
      <div className="px-3 pb-2 pt-3">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]" aria-hidden />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search members"
            aria-label="Search members"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            className="h-11 w-full rounded-xl border border-transparent bg-[#f3f4f6] pl-10 pr-3 text-[16px] text-[#1a1a2e] outline-none transition-[border-color,background-color,box-shadow] placeholder:text-[#9ca3af] focus:border-[#e3e5e8] focus:bg-white focus:shadow-[0_0_0_3px_rgba(17,17,19,0.05)] sm:h-10 sm:text-[14px] [&::-webkit-search-cancel-button]:hidden"
          />
        </label>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1.5 pb-3">
        {!q.trim() ? (
          <p className="px-4 py-8 text-center text-[13.5px] text-[#9ca3af]">Type a name to find someone.</p>
        ) : found.length === 0 && !busy ? (
          <p className="px-4 py-8 text-center text-[13.5px] text-[#9ca3af]">Nobody by that name here.</p>
        ) : (
          <ul>
            {found.map((m) => {
              return (
                <li key={m.userId}>
                  <button type="button" onClick={() => void pick(m)} disabled={!!opening} className="flex w-full cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2 text-left outline-none transition-colors hover:bg-[#f6f7f8] focus-visible:bg-[#f6f7f8] disabled:cursor-default">
                    <MemberAvatar src={m.avatarUrl} name={m.name} alt="" size={40} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-[14.5px] font-medium text-[#1a1a2e]">{m.name}</span>
                        <RoleBadge role={m.role} size="xs" />
                      </span>
                      {m.username ? <span className="block truncate text-[12.5px] text-[#9ca3af]">@{m.username}</span> : null}
                    </span>
                    {opening === m.userId ? <Spinner size={16} /> : null}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

/* ── one conversation ──────────────────────────────────────────────────── */

function Thread({ communityId, slug, userId, id, other, onBack, onClose, onRead, back }: { communityId: string; slug: string; userId: string | null; id: string; other: Person | null; onBack: () => void; onClose: () => void; onRead: () => void; back: boolean }) {
  const [messages, setMessages] = useState<Message[] | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [older, setOlder] = useState(false)
  const [text, setText] = useState("")
  const [picked, setPicked] = useState<string | null>(null)
  const list = useRef<HTMLDivElement>(null)
  const atBottom = useRef(true)
  const keepFrom = useRef<number | null>(null)
  const latest = useRef<Message[]>([])
  latest.current = messages ?? []
  const base = `${apiBase(communityId)}/dms/${id}`

  const markRead = useCallback(async () => {
    await api(`${base}/read`, { method: "POST" })
    onRead()
  }, [base, onRead])

  useEffect(() => {
    let gone = false
    void (async () => {
      const r = await api<{ messages: Message[]; hasMore: boolean }>(base)
      if (gone) return
      if (!r.ok) {
        setMessages([])
        return toast(r.error)
      }
      setMessages(r.data.messages)
      setHasMore(r.data.hasMore)
      void markRead()
    })()
    return () => {
      gone = true
    }
  }, [base, markRead])

  useLayoutEffect(() => {
    const el = list.current
    if (!el) return
    if (keepFrom.current !== null) {
      el.scrollTop = el.scrollHeight - keepFrom.current
      keepFrom.current = null
    } else if (atBottom.current) {
      el.scrollTop = el.scrollHeight
    }
  }, [messages])

  /* The keyboard opening shrinks the screen: stay on the newest message. */
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const onResize = () => {
      const el = list.current
      if (el && atBottom.current) el.scrollTop = el.scrollHeight
    }
    vv.addEventListener("resize", onResize)
    return () => vv.removeEventListener("resize", onResize)
  }, [])

  const catchUp = useCallback(async () => {
    const last = [...latest.current].reverse().find((m) => !m.sending)
    const r = await api<{ messages: Message[] }>(`${base}${last ? `?after=${encodeURIComponent(last.createdAt)}` : ""}`)
    if (!r.ok) return
    setMessages((cur) => {
      const now = cur ?? []
      const ids = new Set(now.map((m) => m.id))
      const fresh = r.data.messages.filter((m) => !ids.has(m.id))
      return fresh.length ? [...now, ...fresh] : now
    })
    if (document.visibilityState === "visible") void markRead()
  }, [base, markRead])

  useEffect(() => {
    let timer: number | undefined
    const stop = liveStream(
      `community-dm:${id}`,
      "community_direct_messages",
      `conversation_id=eq.${id}`,
      (payload) => {
        const row = payload.new ?? {}
        const mid = typeof row.id === "string" ? row.id : ""
        if (payload.eventType === "INSERT") {
          window.clearTimeout(timer)
          timer = window.setTimeout(() => void catchUp(), 100)
        } else if (payload.eventType === "UPDATE" && mid && row.status !== "published") {
          setMessages((cur) => (cur ?? []).filter((m) => m.id !== mid))
        }
      },
      () => void catchUp(),
      5_000,
    )
    const onVisible = () => document.visibilityState === "visible" && void catchUp()
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener("visibilitychange", onVisible)
      stop()
    }
  }, [id, catchUp])

  const loadOlder = async () => {
    const first = (messages ?? []).find((m) => !m.sending)
    if (!first || older) return
    setOlder(true)
    const r = await api<{ messages: Message[]; hasMore: boolean }>(`${base}?before=${encodeURIComponent(first.createdAt)}`)
    setOlder(false)
    if (!r.ok) return toast(r.error)
    const el = list.current
    keepFrom.current = el ? el.scrollHeight - el.scrollTop : null
    setMessages((cur) => [...r.data.messages.filter((m) => !(cur ?? []).some((c) => c.id === m.id)), ...(cur ?? [])])
    setHasMore(r.data.hasMore)
  }

  const send = async () => {
    const body = text.trim()
    if (!body) return
    const temp = `temp-${Date.now()}`
    atBottom.current = true
    setText("")
    setMessages((cur) => [...(cur ?? []), { id: temp, conversationId: id, body, mine: true, createdAt: new Date().toISOString(), editedAt: null, sending: true }])
    const r = await api<{ message: Message }>(base, { body: { body } })
    if (!r.ok) {
      setMessages((cur) => (cur ?? []).filter((m) => m.id !== temp))
      setText(body)
      return toast(r.error)
    }
    setMessages((cur) => {
      const without = (cur ?? []).filter((m) => m.id !== temp)
      return without.some((m) => m.id === r.data.message.id) ? without : [...without, r.data.message]
    })
  }

  const remove = async (m: Message) => {
    setPicked(null)
    const before = messages
    setMessages((cur) => (cur ?? []).filter((x) => x.id !== m.id))
    const r = await api(`${base}/messages/${m.id}`, { method: "DELETE" })
    if (!r.ok) {
      setMessages(before)
      toast(r.error)
    }
  }

  const all = messages ?? []

  return (
    <div className={`flex min-h-0 flex-1 flex-col ${slideClass(back)}`} data-thread={id}>
      <Bar
        onBack={onBack}
        onClose={onClose}
        title={
          other ? (
            <a href={memberHref(slug, { id: other.id, username: other.username })} data-person-link="" className="flex min-w-0 items-center gap-2.5 rounded-lg px-1 py-1 outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15">
              <MemberAvatar src={other.avatarUrl} name={other.name} alt="" size={32} />
              <span className="min-w-0">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-[15px] font-semibold text-[#1a1a2e]">{other.name}</span>
                  <RoleBadge role={other?.role as never} size="xs" />
                </span>
                {other.username ? <span className="block truncate text-[12px] leading-4 text-[#9ca3af]">@{other.username}</span> : null}
              </span>
            </a>
          ) : (
            <span className="px-1 text-[15px] font-semibold text-[#1a1a2e]">Former member</span>
          )
        }
      />

      <div
        ref={list}
        onScroll={(e) => {
          const el = e.currentTarget
          atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
        }}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3"
        role="log"
        aria-live="polite"
        data-thread-list=""
      >
        {messages === null ? (
          <div className="flex h-full items-center justify-center">
            <Spinner label="Loading" />
          </div>
        ) : null}
        {hasMore ? (
          <div className="flex justify-center pb-3">
            <button type="button" onClick={loadOlder} disabled={older} className="h-8 rounded-full border border-[#e3e4e8] px-3.5 text-[12.5px] font-medium text-[#4b5563] hover:bg-[#f6f7f8]">
              {older ? "Loading..." : "Earlier messages"}
            </button>
          </div>
        ) : null}
        {messages !== null && all.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            {other ? <MemberAvatar src={other.avatarUrl} name={other.name} alt="" size={64} /> : null}
            <p className="mt-3 text-[15px] font-semibold text-[#1a1a2e]">{other ? other.name : "Former member"}</p>
            <p className="mt-1 text-[13.5px] text-[#6b7280]">Say hello. Only the two of you see this conversation.</p>
          </div>
        ) : null}
        {all.map((m, i) => {
          const prev = all[i - 1]
          const next = all[i + 1]
          const newDay = !prev || dayOf(prev.createdAt) !== dayOf(m.createdAt)
          const first = newDay || prev.mine !== m.mine || Date.parse(m.createdAt) - Date.parse(prev.createdAt) > 5 * 60_000
          const last = !next || next.mine !== m.mine || dayOf(next.createdAt) !== dayOf(m.createdAt) || Date.parse(next.createdAt) - Date.parse(m.createdAt) > 5 * 60_000
          return (
            <div key={m.id}>
              {newDay ? <div className="my-3 text-center text-[11.5px] font-medium text-[#9ca3af]">{dayLabel(m.createdAt)}</div> : null}
              <div className={`flex ${m.mine ? "justify-end" : "justify-start"} ${first ? "mt-2" : "mt-0.5"}`}>
                <div className={`group/dm relative flex max-w-[82%] items-end gap-1.5 ${m.mine ? "flex-row-reverse" : ""}`}>
                  <button
                    type="button"
                    onClick={() => (m.mine && !m.sending ? setPicked((x) => (x === m.id ? null : m.id)) : undefined)}
                    className={`cursor-default whitespace-pre-wrap break-words px-3.5 py-2 text-left text-[15px] leading-[1.45] outline-none sm:text-[14.5px] ${
                      m.mine ? "bg-[#1a1a2e] text-white" : "bg-[#f1f2f4] text-[#1a1a2e]"
                    } ${m.mine ? `rounded-[18px] ${first ? "" : "rounded-tr-md"} ${last ? "" : "rounded-br-md"}` : `rounded-[18px] ${first ? "" : "rounded-tl-md"} ${last ? "" : "rounded-bl-md"}`} ${m.sending ? "opacity-60" : ""} transition-opacity`}
                    title={clock(m.createdAt)}
                  >
                    {inline(m.body)}
                  </button>
                  {m.mine && !m.sending ? (
                    <button
                      type="button"
                      aria-label="Delete message"
                      onClick={() => void remove(m)}
                      className={`flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-[#9ca3af] outline-none transition-opacity hover:bg-[#f4f5f7] hover:text-[#c4290c] focus-visible:opacity-100 ${picked === m.id ? "opacity-100" : "pointer-events-none opacity-0 sm:pointer-events-auto sm:group-hover/dm:opacity-100"}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>
              </div>
              {last ? <div className={`mt-1 px-1 text-[11px] text-[#9ca3af] ${m.mine ? "text-right" : ""}`}>{m.sending ? "Sending..." : clock(m.createdAt)}</div> : null}
            </div>
          )
        })}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          void send()
        }}
        className="flex shrink-0 items-end gap-2 border-t border-[#f0f1f3] bg-white px-3 pb-[max(10px,env(safe-area-inset-bottom))] pt-2.5 sm:pb-3"
        data-thread-form=""
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={1}
          maxLength={4000}
          placeholder={other ? `Message ${other.name.split(" ")[0]}` : "Message"}
          aria-label="Message"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              void send()
            }
          }}
          className="max-h-36 min-h-10 flex-1 resize-none rounded-[20px] border border-transparent bg-[#f3f4f6] px-4 py-2 text-[16px] leading-6 text-[#1a1a2e] outline-none transition-[border-color,background-color] placeholder:text-[#9ca3af] focus:border-[#e3e5e8] focus:bg-white sm:text-[14.5px]"
          style={{ fieldSizing: "content" } as React.CSSProperties}
        />
        <button
          type="submit"
          aria-label="Send"
          disabled={!text.trim()}
          className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full bg-[#1a1a2e] text-white outline-none transition-[background-color,scale,opacity] hover:bg-[#2b2b42] active:scale-[0.94] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/25 disabled:cursor-default disabled:opacity-30"
        >
          <ArrowUp className="h-[18px] w-[18px]" strokeWidth={2.5} />
        </button>
      </form>
    </div>
  )
}
