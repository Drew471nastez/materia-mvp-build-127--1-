"use client"

/**
 * ===========================================================================
 *  MESSAGES BETWEEN MEMBERS
 * ===========================================================================
 * The chat button in the community's bar opens this: the member's
 * conversations and groups in this community, newest first, and a chat when
 * one is picked. On a computer it is a panel on the right that floats over
 * the page (the page stays where it was); on a phone it is a screen of its
 * own that slides in, sized to what the keyboard leaves (--vv-h), so the box
 * you type in sits right above the keys.
 *
 * "Message" on a person's card, a member row or a profile (through
 * /community/<slug>?dm=<userId>) opens it straight on that conversation
 * (openMessages({ userId })), made on the server the first time. The name at
 * the top of a conversation opens that person's own page. A group's push
 * opens /community/<slug>?group=<groupId> (openMessages({ groupId })).
 *
 * LIVE, BUT NEVER TRUSTED. Realtime tells the page a conversation moved or a
 * message arrived (part 83's policy sends those rows to the two members and
 * nobody else; part 270's sends a group's rows to the people in it); the
 * page then asks the server, so every name and picture is the server's.
 * Sending always goes through the server.
 *
 * ROUND 37 (the owner: "Telegram like, groups, attachments, realtime"). A
 * conversation and a group are the one chat screen every chat uses
 * (chat-surface.tsx): bubbles, replies, edits, pictures and files, "Seen"
 * under your last message once they read it, typing, a mute per chat. Groups
 * are made here (New message, New group) as the community's Chat settings
 * allow, and their people are managed from the group's header.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { BellOff, Check, ChevronLeft, LogOut, MoreHorizontal, PenSquare, Search, UserPlus, Users, X } from "lucide-react"
import { Spinner } from "./place-spinner"
import { MemberAvatar } from "./member-avatar"
import { createClient } from "@/lib/supabase/client"
import type { MemberView } from "@/lib/communities/types"
import { useLightChrome } from "@/lib/ui/light-chrome"
import { ResponsiveActionMenu, type ActionMenuItem } from "@/components/ui/responsive-action-menu"
import { api, apiBase } from "./api"
import { realtimeAuth } from "./realtime"
import { memberHref } from "./person-href"
import { toast } from "./toast"
import { RoleBadge } from "./role-badge"
import { ChatSurface, MuteButton, type StreamHandlers } from "./chat-surface"
import { chatCacheKey, keepList, keepValue, keptList, keptValue, warmChat } from "./chat-core"
import { ReportDialog, type ReportTargetRef } from "./dialogs"
import type { ChatIntroView, ChatLine } from "./view-types"

export const MESSAGES_EVENT = "storelib:community-messages"

type LiveTable = "community_conversations" | "community_direct_messages" | "community_chat_groups" | "community_chat_group_messages" | "community_chat_group_members"

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
  table: LiveTable,
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
          const was = joined
          joined = status === "SUBSCRIBED"
          /* Joined again after a drop: whatever happened meanwhile. */
          if (joined && !was) poll()
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

/** Opens the panel, on a member's conversation when `userId` is given, on a group when `groupId` is. */
export function openMessages(detail: { userId?: string; groupId?: string } = {}) {
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
  muted?: boolean
}

interface Group {
  id: string
  name: string
  memberCount: number
  lastBody: string
  lastAt: string | null
  lastFromMe: boolean
  unread: boolean
  muted: boolean
}

interface GroupDetail {
  id: string
  name: string
  memberCount: number
  people: (Person & { groupRole: "owner" | "member" })[]
  canManage: boolean
}

type Intro = ChatIntroView & { canStartGroups?: boolean }

type View =
  | { kind: "list" }
  | { kind: "new" }
  | { kind: "newGroup" }
  | { kind: "thread"; id: string; other: Person | null }
  | { kind: "group"; id: string; name: string }
  | { kind: "groupInfo"; id: string; name: string }

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

/* ── the button's number, kept live while the panel is shut ─────────────── */

/**
 * How many conversations and groups have something unread, from realtime:
 * any change to one of the member's conversations or groups asks the server
 * again (debounced), so a message arriving lights the badge without a reload.
 */
export function useUnreadMessages(communityId: string, userId: string | null, initial: number | null): [number | null, () => void] {
  const [count, setCount] = useState(initial)
  useEffect(() => setCount(initial), [initial])
  const refresh = useCallback(async () => {
    const r = await api<{ ready: boolean; unread: number; conversations?: Conversation[]; groups?: Group[] }>(`${apiBase(communityId)}/dms`)
    if (!r.ok || !r.data.ready) return
    setCount(r.data.unread)
    /* The same answer is the panel's list (round 38): kept, so opening the panel draws it at once. */
    if (Array.isArray(r.data.conversations)) keepList(communityId, userId, { conversations: r.data.conversations, groups: r.data.groups ?? [] })
  }, [communityId, userId])
  /*
    THE LIST BEFORE THE PANEL OPENS (round 38): once per tab and community, while the page is idle, the list is read
    and kept (one ask, the one the badge makes anyway), so the first press on the chat button draws rows, not a
    skeleton.
  */
  useEffect(() => {
    if (!userId || initial === null || keptList(communityId, userId)) return
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void }
    const go = () => void refresh()
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(go, { timeout: 4000 })
      return () => w.cancelIdleCallback?.(id)
    }
    const t = window.setTimeout(go, 1500)
    return () => window.clearTimeout(t)
  }, [communityId, userId, initial, refresh])

  useEffect(() => {
    if (!userId || initial === null) return
    let timer: number | undefined
    const later = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => void refresh(), 250)
    }
    const stop = liveStream(`community-dm-inbox:${communityId}:${userId}`, "community_conversations", `community_id=eq.${communityId}`, later, () => void refresh(), 45_000)
    const stopGroups = liveStream(`community-group-inbox:${communityId}:${userId}`, "community_chat_groups", `community_id=eq.${communityId}`, later, () => undefined, 60_000)
    const onVisible = () => document.visibilityState === "visible" && void refresh()
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener("visibilitychange", onVisible)
      stop()
      stopGroups()
    }
  }, [communityId, userId, initial, refresh])
  return [count, refresh]
}

/* ── the panel ─────────────────────────────────────────────────────────── */

const ENTER_MS = 240
const EXIT_MS = 180

export function MessagesPanel({ communityId, slug, userId, open, onClose, start, onRead }: { communityId: string; slug: string; userId: string | null; open: boolean; onClose: () => void; start: { userId?: string; groupId?: string } | null; onRead: () => void }) {
  const phone = usePhone()
  const [shown, setShown] = useState(open)
  const [leaving, setLeaving] = useState(false)
  const [view, setView] = useState<View>({ kind: "list" })
  const [back, setBack] = useState(false)
  /* Kept for the tab (round 38): a conversation opened again has its rules, names and switches in its first frame. */
  const [intro, setIntroRaw] = useState<Intro | null>(() => keptValue<Intro>(`intro:${communityId}`))
  const setIntro = useCallback(
    (v: Intro) => {
      keepValue(`intro:${communityId}`, v)
      setIntroRaw(v)
    },
    [communityId],
  )

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

  /* What chat allows here (rules, groups, who can be messaged), once per opening. */
  useEffect(() => {
    if (!open) return
    let gone = false
    void api<Intro>(`${apiBase(communityId)}/chat`).then((r) => {
      if (!gone && r.ok) setIntro(r.data)
    })
    return () => {
      gone = true
    }
  }, [open, communityId, setIntro])

  /* Opened on a member: their conversation, made on the server if new (and kept for the tab, so the next time opens it at once). Opened on a group: that group. */
  useEffect(() => {
    if (!open || (!start?.userId && !start?.groupId)) return
    let gone = false
    setView({ kind: "list" })
    if (start.groupId) {
      setBack(false)
      setView({ kind: "group", id: start.groupId, name: "Group" })
      return
    }
    const known = keptValue<{ id: string; other: Person | null }>(`dm-with:${communityId}:${start.userId}`)
    if (known) {
      setBack(false)
      setView({ kind: "thread", id: known.id, other: known.other })
      return
    }
    void (async () => {
      const r = await api<{ conversation: { id: string; other: Person | null } }>(`${apiBase(communityId)}/dms`, { body: { userId: start.userId } })
      if (gone) return
      if (!r.ok) return toast(r.error)
      keepValue(`dm-with:${communityId}:${start.userId}`, r.data.conversation)
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
  const list = () => go({ kind: "list" }, true)

  const body =
    view.kind === "thread" ? (
      <Thread key={view.id} communityId={communityId} slug={slug} userId={userId} intro={intro} id={view.id} other={view.other} onBack={list} onClose={onClose} onRead={onRead} back={back} />
    ) : view.kind === "group" ? (
      <GroupThread key={view.id} communityId={communityId} userId={userId} intro={intro} id={view.id} name={view.name} onBack={list} onClose={onClose} onRead={onRead} onInfo={(name) => go({ kind: "groupInfo", id: view.id, name })} back={back} />
    ) : view.kind === "groupInfo" ? (
      <GroupInfo communityId={communityId} slug={slug} userId={userId} id={view.id} onBack={() => go({ kind: "group", id: view.id, name: view.name }, true)} onLeft={list} back={back} />
    ) : view.kind === "new" ? (
      <NewMessage communityId={communityId} userId={userId} intro={intro} onBack={list} onGroup={() => go({ kind: "newGroup" })} onPick={(c) => go({ kind: "thread", id: c.id, other: c.other })} back={back} />
    ) : view.kind === "newGroup" ? (
      <NewGroup communityId={communityId} userId={userId} onBack={() => go({ kind: "new" }, true)} onMade={(g) => go({ kind: "group", id: g.id, name: g.name })} back={back} />
    ) : (
      <Inbox communityId={communityId} userId={userId} onClose={onClose} onNew={() => go({ kind: "new" })} onOpen={(c) => go({ kind: "thread", id: c.id, other: c.other })} onOpenGroup={(g) => go({ kind: "group", id: g.id, name: g.name })} back={back} phone={phone} />
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
          className={`fixed bottom-4 right-4 top-[calc(var(--community-top,64px)+8px)] z-[120] flex w-[420px] max-w-[calc(100vw-32px)] flex-col overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white shadow-[0_24px_60px_-16px_rgba(17,24,39,0.28),0_2px_8px_rgba(17,24,39,0.06)] ease-sheet ${
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

const ROW = "flex w-full cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2.5 text-left outline-none transition-colors hover:bg-[#f6f7f8] active:bg-[#f1f2f4] focus-visible:bg-[#f6f7f8]"

/* ── the list of conversations and groups ──────────────────────────────── */

/*
  THE LIST AS IT WAS LAST DRAWN (round 38, the owner: "when I go back to the conversations it takes too much to load,
  loading skeleton"). Kept per community and member, in memory and in the tab's sessionStorage (chat-core.ts
  keptList), and filled before the panel is first opened (useUnreadMessages): Back, the panel opened again and the page
  loaded again in the same tab all draw it in their first frame, and the server's answer replaces it quietly. The
  skeleton, row shaped, is only for a list never read in this tab.

  ITS CHATS ASKED FOR EARLY: the first rows as the list is drawn, and any row the pointer rests on or a finger touches
  (chat-core.ts warmChat), so the conversation opened is already here.
*/
type InboxData = { conversations: Conversation[]; groups: Group[] }
const WARM_TOP = 3

function Inbox({ communityId, userId, onClose, onNew, onOpen, onOpenGroup, back, phone }: { communityId: string; userId: string | null; onClose: () => void; onNew: () => void; onOpen: (c: Conversation) => void; onOpenGroup: (g: Group) => void; back: boolean; phone: boolean }) {
  const [data, setData] = useState<InboxData | null>(() => keptList<InboxData>(communityId, userId))
  const [failed, setFailed] = useState(false)
  const askedAt = useRef(0)

  const load = useCallback(async () => {
    askedAt.current = Date.now()
    const r = await api<{ ready: boolean; conversations: Conversation[]; groups?: Group[] }>(`${apiBase(communityId)}/dms`)
    if (!r.ok) {
      setFailed(true)
      return
    }
    setFailed(false)
    const next = { conversations: r.data.conversations, groups: r.data.groups ?? [] }
    keepList(communityId, userId, next)
    setData(next)
  }, [communityId, userId])

  const warm = useCallback(
    (kind: "dm" | "group", id: string, lastAt: string | null) => warmChat(chatCacheKey(userId, kind, id), `${apiBase(communityId)}/${kind === "dm" ? "dms" : "groups"}/${id}`, lastAt),
    [communityId, userId],
  )

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!userId) return
    let timer: number | undefined
    const later = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => void load(), 150)
    }
    /* The stream's join asks again, unless the list was just asked for as it opened (one ask, not two). */
    const poll = () => {
      if (Date.now() - askedAt.current > 2000) void load()
    }
    const stop = liveStream(`community-dm-list:${communityId}:${userId}`, "community_conversations", `community_id=eq.${communityId}`, later, poll, 15_000)
    const stopGroups = liveStream(`community-group-list:${communityId}:${userId}`, "community_chat_groups", `community_id=eq.${communityId}`, later, () => undefined, 30_000)
    return () => {
      window.clearTimeout(timer)
      stop()
      stopGroups()
    }
  }, [communityId, userId, load])

  const rows = useMemo(() => {
    if (!data) return null
    const all: ({ t: "dm"; c: Conversation; at: number } | { t: "group"; g: Group; at: number })[] = [
      ...data.conversations.map((c) => ({ t: "dm" as const, c, at: c.lastAt ? Date.parse(c.lastAt) : 0 })),
      ...data.groups.map((g) => ({ t: "group" as const, g, at: g.lastAt ? Date.parse(g.lastAt) : 0 })),
    ]
    return all.sort((a, b) => b.at - a.at)
  }, [data])

  /* The first rows, asked for while the list is read (after it is drawn, when the page is idle). */
  const top = rows ? rows.slice(0, WARM_TOP).map((r) => (r.t === "dm" ? `dm:${r.c.id}:${r.c.lastAt}` : `group:${r.g.id}:${r.g.lastAt}`)).join("|") : ""
  useEffect(() => {
    if (!top) return
    const go = () => {
      for (const part of top.split("|")) {
        const [kind, id, ...at] = part.split(":")
        const lastAt = at.join(":")
        warm(kind as "dm" | "group", id, lastAt && lastAt !== "null" ? lastAt : null)
      }
    }
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void }
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(go, { timeout: 300 })
      return () => w.cancelIdleCallback?.(id)
    }
    const t = window.setTimeout(go, 60)
    return () => window.clearTimeout(t)
  }, [top, warm])

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
        {rows === null && !failed ? (
          /* A row's own box: the same padding, the 44px picture, a name line and a words line of the row's heights, so the rows land where these were. */
          <ul className="px-1.5" role="status" aria-label="Loading conversations" data-messages-skeleton="">
            {[72, 56, 80, 64, 48].map((w, i) => (
              <li key={i} className="flex items-center gap-3 rounded-xl px-2.5 py-2.5">
                <span className="h-11 w-11 shrink-0 rounded-full bg-[#f1f2f4] motion-safe:animate-pulse" />
                <span className="min-w-0 flex-1">
                  <span className="flex h-[22px] items-center">
                    <span className="block h-3 rounded-full bg-[#eceef1] motion-safe:animate-pulse" style={{ width: `${Math.round(w * 0.55)}%` }} />
                  </span>
                  <span className="mt-0.5 flex h-5 items-center">
                    <span className="block h-2.5 rounded-full bg-[#f1f2f4] motion-safe:animate-pulse" style={{ width: `${w}%` }} />
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ) : failed && !rows ? (
          <div className="px-6 py-14 text-center">
            <p className="text-[14px] text-[#6b7280]">Your messages did not load.</p>
            <button type="button" onClick={() => void load()} className="mt-3 h-9 rounded-full border border-[#e3e4e8] px-4 text-[13.5px] font-medium text-[#1a1a2e] hover:bg-[#f6f7f8]">
              Try again
            </button>
          </div>
        ) : rows && rows.length === 0 ? (
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
            {(rows ?? []).map((r) =>
              r.t === "dm" ? (
                <li key={`d-${r.c.id}`}>
                  <button type="button" onClick={() => onOpen(r.c)} onPointerEnter={() => warm("dm", r.c.id, r.c.lastAt)} onTouchStart={() => warm("dm", r.c.id, r.c.lastAt)} onFocus={() => warm("dm", r.c.id, r.c.lastAt)} data-conversation={r.c.id} className={ROW}>
                    <MemberAvatar src={r.c.other?.avatarUrl ?? null} name={r.c.other?.name ?? "Member"} alt="" size={44} />
                    <Line name={r.c.other?.name ?? "Former member"} at={r.c.lastAt} unread={r.c.unread} muted={!!r.c.muted} text={`${r.c.lastFromMe ? "You: " : ""}${r.c.lastBody}`} />
                  </button>
                </li>
              ) : (
                <li key={`g-${r.g.id}`}>
                  <button type="button" onClick={() => onOpenGroup(r.g)} onPointerEnter={() => warm("group", r.g.id, r.g.lastAt)} onTouchStart={() => warm("group", r.g.id, r.g.lastAt)} onFocus={() => warm("group", r.g.id, r.g.lastAt)} data-group={r.g.id} className={ROW}>
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#ede9fe] text-[16px] font-semibold text-[#6d28d9]">{r.g.name.slice(0, 1).toUpperCase()}</span>
                    <Line name={r.g.name} at={r.g.lastAt} unread={r.g.unread} muted={r.g.muted} text={`${r.g.lastFromMe ? "You: " : ""}${r.g.lastBody || `${r.g.memberCount} people`}`} />
                  </button>
                </li>
              ),
            )}
          </ul>
        )}
      </div>
    </div>
  )
}

function Line({ name, at, unread, muted, text }: { name: string; at: string | null; unread: boolean; muted: boolean; text: string }) {
  return (
    <span className="min-w-0 flex-1">
      <span className="flex items-baseline gap-2">
        <span className={`min-w-0 flex-1 truncate text-[14.5px] ${unread ? "font-semibold text-[#1a1a2e]" : "font-medium text-[#1a1a2e]"}`}>{name}</span>
        {muted ? <BellOff aria-label="Muted" className="h-3.5 w-3.5 shrink-0 self-center text-[#9ca3af]" /> : null}
        <span className="shrink-0 text-[12px] tabular-nums text-[#9ca3af]">{ago(at)}</span>
      </span>
      <span className="mt-0.5 flex items-center gap-2">
        <span className={`min-w-0 flex-1 truncate text-[13.5px] ${unread ? "text-[#1a1a2e]" : "text-[#6b7280]"}`}>{text}</span>
        {unread ? <span aria-label="Unread" className={`h-2 w-2 shrink-0 rounded-full ${muted ? "bg-[#9ca3af]" : "bg-[#1a1a2e]"}`} /> : null}
      </span>
    </span>
  )
}

/* ── finding people ────────────────────────────────────────────────────── */

function useMemberSearch(communityId: string, userId: string | null, q: string): { found: MemberView[]; busy: boolean } {
  const [found, setFound] = useState<MemberView[]>([])
  const [busy, setBusy] = useState(false)
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
  return { found, busy }
}

function SearchField({ q, setQ, label = "Search members" }: { q: string; setQ: (v: string) => void; label?: string }) {
  return (
    <label className="relative block">
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]" aria-hidden />
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={label}
        aria-label={label}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        className="h-11 w-full rounded-xl border border-transparent bg-[#f3f4f6] pl-10 pr-3 text-[16px] text-[#1a1a2e] outline-none transition-[border-color,background-color,box-shadow] placeholder:text-[#9ca3af] focus:border-[#e3e5e8] focus:bg-white focus:shadow-[0_0_0_3px_rgba(17,17,19,0.05)] sm:h-10 sm:text-[14px] [&::-webkit-search-cancel-button]:hidden"
      />
    </label>
  )
}

function PersonRow({ m, right, onClick, disabled }: { m: MemberView; right?: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="flex w-full cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2 text-left outline-none transition-colors hover:bg-[#f6f7f8] focus-visible:bg-[#f6f7f8] disabled:cursor-default">
      <MemberAvatar src={m.avatarUrl} name={m.name} alt="" size={40} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[14.5px] font-medium text-[#1a1a2e]">{m.name}</span>
          <RoleBadge role={m.role} size="xs" />
        </span>
        {m.username ? <span className="block truncate text-[12.5px] text-[#9ca3af]">@{m.username}</span> : null}
      </span>
      {right}
    </button>
  )
}

/* ── picking somebody to write to ──────────────────────────────────────── */

function NewMessage({ communityId, userId, intro, onBack, onPick, onGroup, back }: { communityId: string; userId: string | null; intro: Intro | null; onBack: () => void; onPick: (c: { id: string; other: Person | null }) => void; onGroup: () => void; back: boolean }) {
  const [q, setQ] = useState("")
  const { found, busy } = useMemberSearch(communityId, userId, q)
  const [opening, setOpening] = useState<string | null>(null)

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
        <SearchField q={q} setQ={setQ} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1.5 pb-3">
        {intro?.canStartGroups && !q.trim() ? (
          <button type="button" onClick={onGroup} className={ROW} data-messages-new-group="">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#f1f2f4] text-[#1a1a2e]">
              <Users className="h-[18px] w-[18px]" />
            </span>
            <span className="text-[14.5px] font-medium text-[#1a1a2e]">New group</span>
          </button>
        ) : null}
        {!q.trim() ? (
          <p className="px-4 py-8 text-center text-[13.5px] text-[#9ca3af]">{intro?.dmPolicy === "staff" ? "In this community you can message the admins and moderators." : intro?.dmPolicy === "off" ? "Messages between members are turned off here." : "Type a name to find someone."}</p>
        ) : found.length === 0 && !busy ? (
          <p className="px-4 py-8 text-center text-[13.5px] text-[#9ca3af]">Nobody by that name here.</p>
        ) : (
          <ul>
            {found.map((m) => (
              <li key={m.userId}>
                <PersonRow m={m} onClick={() => void pick(m)} disabled={!!opening} right={opening === m.userId ? <Spinner size={16} /> : null} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

/* ── a new group ───────────────────────────────────────────────────────── */

function NewGroup({ communityId, userId, onBack, onMade, back }: { communityId: string; userId: string | null; onBack: () => void; onMade: (g: { id: string; name: string }) => void; back: boolean }) {
  const [name, setName] = useState("")
  const [q, setQ] = useState("")
  const [picked, setPicked] = useState<MemberView[]>([])
  const [busy, setBusy] = useState(false)
  const { found } = useMemberSearch(communityId, userId, q)
  const toggle = (m: MemberView) => setPicked((cur) => (cur.some((x) => x.userId === m.userId) ? cur.filter((x) => x.userId !== m.userId) : [...cur, m]))
  const make = async () => {
    if (busy || !name.trim() || !picked.length) return
    setBusy(true)
    const r = await api<{ group: { id: string; name: string } }>(`${apiBase(communityId)}/groups`, { body: { name: name.trim(), userIds: picked.map((m) => m.userId) } })
    setBusy(false)
    if (!r.ok) return toast(r.error)
    onMade(r.data.group)
  }
  return (
    <div className={`flex min-h-0 flex-1 flex-col ${slideClass(back)}`} data-messages-group-form="">
      <Bar
        title={<h2 className="px-1 text-[17px] font-semibold text-[#1a1a2e]">New group</h2>}
        onBack={onBack}
        right={
          <button type="button" onClick={() => void make()} disabled={busy || !name.trim() || !picked.length} className="mr-1 h-9 rounded-full bg-[#1a1a2e] px-4 text-[13.5px] font-medium text-white transition-opacity disabled:opacity-30" data-messages-group-make="">
            {busy ? "Making..." : "Make"}
          </button>
        }
      />
      <div className="space-y-2.5 px-3 pb-2 pt-3">
        <input value={name} onChange={(e) => setName(e.target.value.slice(0, 80))} placeholder="Group name" aria-label="Group name" className="h-11 w-full rounded-xl border border-[#e3e5e8] bg-white px-3.5 text-[16px] text-[#1a1a2e] outline-none placeholder:text-[#9ca3af] focus:border-[#c9ccd3] sm:h-10 sm:text-[14.5px]" />
        {picked.length ? (
          <div className="flex flex-wrap gap-1.5">
            {picked.map((m) => (
              <button key={m.userId} type="button" onClick={() => toggle(m)} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[#f1f2f4] pl-1 pr-2.5 text-[13px] text-[#1a1a2e]">
                <MemberAvatar src={m.avatarUrl} name={m.name} alt="" size={24} />
                {m.name.split(" ")[0]}
                <X className="h-3.5 w-3.5 text-[#6b7280]" />
              </button>
            ))}
          </div>
        ) : null}
        <SearchField q={q} setQ={setQ} label="Add people" />
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1.5 pb-3">
        {found.map((m) => {
          const on = picked.some((x) => x.userId === m.userId)
          return (
            <li key={m.userId}>
              <PersonRow m={m} onClick={() => toggle(m)} right={<span className={`flex h-6 w-6 items-center justify-center rounded-full border ${on ? "border-[#1a1a2e] bg-[#1a1a2e] text-white" : "border-[#d1d5db]"}`}>{on ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : null}</span>} />
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/* ── one conversation ──────────────────────────────────────────────────── */

function Thread({ communityId, slug, userId, intro, id, other, onBack, onClose, onRead, back }: { communityId: string; slug: string; userId: string | null; intro: Intro | null; id: string; other: Person | null; onBack: () => void; onClose: () => void; onRead: () => void; back: boolean }) {
  const base = `${apiBase(communityId)}/dms/${id}`
  const [otherReadAt, setOtherReadAt] = useState<string | null>(null)
  const [blocked, setBlocked] = useState(false)
  const [report, setReport] = useState<ReportTargetRef | null>(null)

  useEffect(() => {
    if (!other?.id) return
    void api<{ blocked: boolean }>(`${apiBase(communityId)}/chat/blocks?userId=${other.id}`).then((r) => r.ok && setBlocked(r.data.blocked))
  }, [communityId, other?.id])

  const subscribe = useCallback(
    (h: StreamHandlers) => {
      const stop = liveStream(
        `community-dm:${id}`,
        "community_direct_messages",
        `conversation_id=eq.${id}`,
        (payload) => {
          if (payload.eventType === "INSERT") h.changed()
          else if (payload.eventType === "UPDATE" && payload.new) h.updated(payload.new)
        },
        () => h.changed(),
        5_000,
      )
      /* The conversation's own row: when the other person reads it, "Seen". */
      const stopRow = liveStream(
        `community-dm-row:${id}`,
        "community_conversations",
        `id=eq.${id}`,
        (payload) => {
          const row = payload.new ?? {}
          const read = row.user_a === userId ? row.b_read_at : row.a_read_at
          if (typeof read === "string") setOtherReadAt(read)
        },
        () => undefined,
        60_000,
      )
      return () => {
        stop()
        stopRow()
      }
    },
    [id, userId],
  )

  const block = async () => {
    if (!other) return
    const on = !blocked
    const r = await api<{ blocked: boolean }>(`${apiBase(communityId)}/chat/blocks`, { body: { userId: other.id, on } })
    if (!r.ok) return toast(r.error)
    setBlocked(r.data.blocked)
    toast(r.data.blocked ? `${other.name.split(" ")[0]} is blocked` : `${other.name.split(" ")[0]} is unblocked`)
  }
  const menu: ActionMenuItem[] = other
    ? [
        { label: blocked ? "Unblock" : "Block", onClick: () => void block(), variant: blocked ? undefined : "destructive" },
        { label: "Report", onClick: () => setReport({ type: "member", id: other.id, what: other.name }) },
      ]
    : []

  return (
    <div className={`flex min-h-0 flex-1 flex-col ${slideClass(back)}`} data-thread={id}>
      <ChatSurface
        communityId={communityId}
        kind="dm"
        chatId={id}
        me={userId ? { id: userId, name: intro?.myName ?? "Someone" } : null}
        url={base}
        messageUrl={(mid) => `${base}/messages/${mid}`}
        readUrl={`${base}/read`}
        initial={null}
        subscribe={subscribe}
        showAuthors={false}
        intro={intro}
        otherReadAt={otherReadAt}
        onPage={(d) => typeof d.otherReadAt === "string" && setOtherReadAt(d.otherReadAt)}
        onRead={onRead}
        closed={blocked ? "You blocked this member. Unblock them to send a message." : null}
        placeholder={other ? `Message ${other.name.split(" ")[0]}` : "Message"}
        header={
          <Bar
            onBack={onBack}
            onClose={onClose}
            right={
              <>
                <MuteButton communityId={communityId} kind="dm" chatId={id} />
                {menu.length ? <ResponsiveActionMenu title="Conversation" items={menu} trigger={<button type="button" aria-label="More" className="flex h-10 w-10 items-center justify-center rounded-full text-[#6b7280] hover:bg-[#f4f5f7]"><MoreHorizontal className="h-[18px] w-[18px]" /></button>} /> : null}
              </>
            }
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
        }
        empty={
          <>
            {other ? <MemberAvatar src={other.avatarUrl} name={other.name} alt="" size={64} /> : null}
            <p className="mt-3 text-[15px] font-semibold text-[#1a1a2e]">{other ? other.name : "Former member"}</p>
            <p className="mt-1 text-[13.5px] text-[#6b7280]">Say hello. Only the two of you see this conversation.</p>
          </>
        }
      />
      <ReportDialog communityId={communityId} target={report} onClose={() => setReport(null)} />
    </div>
  )
}

/* ── one group ─────────────────────────────────────────────────────────── */

function GroupThread({ communityId, userId, intro, id, name, onBack, onClose, onRead, onInfo, back }: { communityId: string; userId: string | null; intro: Intro | null; id: string; name: string; onBack: () => void; onClose: () => void; onRead: () => void; onInfo: (name: string) => void; back: boolean }) {
  const base = `${apiBase(communityId)}/groups/${id}`
  const [detail, setDetail] = useState<GroupDetail | null>(() => keptValue<GroupDetail>(`group:${id}`))
  const [report, setReport] = useState<ReportTargetRef | null>(null)
  const backRef = useRef(onBack)
  backRef.current = onBack
  useEffect(() => {
    let gone = false
    void api<{ group?: GroupDetail }>(`${base}?detail=1&after=${encodeURIComponent(new Date().toISOString())}`).then((r) => {
      if (gone) return
      if (!r.ok) {
        toast(r.status === 404 ? "You are not in this group." : r.error)
        backRef.current()
        return
      }
      if (r.data.group) {
        keepValue(`group:${id}`, r.data.group)
        setDetail(r.data.group)
      }
    })
    return () => {
      gone = true
    }
  }, [base, id])

  const subscribe = useCallback(
    (h: StreamHandlers) =>
      liveStream(
        `community-group:${id}`,
        "community_chat_group_messages",
        `group_id=eq.${id}`,
        (payload) => {
          if (payload.eventType === "INSERT") h.changed()
          else if (payload.eventType === "UPDATE" && payload.new) h.updated(payload.new)
        },
        () => h.changed(),
        5_000,
      ),
    [id],
  )
  const title = detail?.name ?? name

  return (
    <div className={`flex min-h-0 flex-1 flex-col ${slideClass(back)}`} data-group-thread={id}>
      <ChatSurface
        communityId={communityId}
        kind="group"
        chatId={id}
        me={userId ? { id: userId, name: intro?.myName ?? "Someone" } : null}
        url={base}
        messageUrl={(mid) => `${base}/messages/${mid}`}
        readUrl={`${base}/read`}
        initial={null}
        subscribe={subscribe}
        showAuthors
        intro={intro}
        onRead={onRead}
        onReport={(m: ChatLine) => m.author && setReport({ type: "member", id: m.author.id, what: m.author.name })}
        placeholder={`Message ${title}`}
        header={
          <Bar
            onBack={onBack}
            onClose={onClose}
            right={<MuteButton communityId={communityId} kind="group" chatId={id} />}
            title={
              <button type="button" onClick={() => onInfo(title)} className="flex min-w-0 items-center gap-2.5 rounded-lg px-1 py-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15" data-group-info="">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#ede9fe] text-[14px] font-semibold text-[#6d28d9]">{title.slice(0, 1).toUpperCase()}</span>
                <span className="min-w-0">
                  <span className="block truncate text-[15px] font-semibold text-[#1a1a2e]">{title}</span>
                  <span className="block truncate text-[12px] leading-4 text-[#9ca3af]">{detail ? `${detail.memberCount} people` : " "}</span>
                </span>
              </button>
            }
          />
        }
        empty={<p className="text-[13.5px] text-[#6b7280]">Nothing here yet. Say hello.</p>}
      />
      <ReportDialog communityId={communityId} target={report} onClose={() => setReport(null)} />
    </div>
  )
}

/* ── a group's people ──────────────────────────────────────────────────── */

function GroupInfo({ communityId, slug, userId, id, onBack, onLeft, back }: { communityId: string; slug: string; userId: string | null; id: string; onBack: () => void; onLeft: () => void; back: boolean }) {
  const base = `${apiBase(communityId)}/groups/${id}`
  /* The group as its chat last read it (round 38): its people at once, read again behind them. */
  const [detail, setDetail] = useState<GroupDetail | null>(() => keptValue<GroupDetail>(`group:${id}`))
  const [name, setName] = useState(() => keptValue<GroupDetail>(`group:${id}`)?.name ?? "")
  const [adding, setAdding] = useState(false)
  const [q, setQ] = useState("")
  const { found } = useMemberSearch(communityId, userId, q)

  useEffect(() => {
    void api<{ group?: GroupDetail }>(`${base}?detail=1&after=${encodeURIComponent(new Date().toISOString())}`).then((r) => {
      if (r.ok && r.data.group) {
        keepValue(`group:${id}`, r.data.group)
        setDetail(r.data.group)
        setName(r.data.group.name)
      }
    })
  }, [base, id])

  const change = async (body: Record<string, unknown>, done?: string) => {
    const r = await api<{ group: GroupDetail | null }>(base, { method: "PATCH", body })
    if (!r.ok) return toast(r.error)
    if (r.data.group) {
      keepValue(`group:${id}`, r.data.group)
      setDetail(r.data.group)
    }
    if (done) toast(done)
  }
  const leave = async () => {
    const r = await api(base, { method: "DELETE" })
    if (!r.ok) return toast(r.error)
    toast("You left the group")
    onLeft()
  }

  return (
    <div className={`flex min-h-0 flex-1 flex-col ${slideClass(back)}`} data-group-people="">
      <Bar title={<h2 className="px-1 text-[17px] font-semibold text-[#1a1a2e]">Group</h2>} onBack={onBack} />
      {!detail ? (
        <div className="flex flex-1 items-center justify-center">
          <Spinner label="Loading" />
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-6 pt-3">
          {detail.canManage ? (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                if (name.trim() && name.trim() !== detail.name) void change({ name: name.trim() }, "Renamed")
              }}
            >
              <input value={name} onChange={(e) => setName(e.target.value.slice(0, 80))} aria-label="Group name" className="h-10 min-w-0 flex-1 rounded-xl border border-[#e3e5e8] px-3.5 text-[16px] text-[#1a1a2e] outline-none focus:border-[#c9ccd3] sm:text-[14.5px]" />
              <button type="submit" disabled={!name.trim() || name.trim() === detail.name} className="h-10 rounded-full bg-[#1a1a2e] px-4 text-[13.5px] font-medium text-white disabled:opacity-30">
                Save
              </button>
            </form>
          ) : (
            <p className="px-1 text-[17px] font-semibold text-[#1a1a2e]">{detail.name}</p>
          )}
          <div className="mt-4 flex items-center justify-between px-1">
            <p className="text-[13px] font-medium text-[#6b7280]">{detail.memberCount} people</p>
            {detail.canManage ? (
              <button type="button" onClick={() => setAdding((v) => !v)} className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium text-[#1a1a2e] hover:bg-[#f1f2f4]">
                <UserPlus className="h-4 w-4" />
                Add people
              </button>
            ) : null}
          </div>
          {adding ? (
            <div className="mt-2">
              <SearchField q={q} setQ={setQ} label="Add people" />
              <ul className="mt-1">
                {found
                  .filter((m) => !detail.people.some((p) => p.id === m.userId))
                  .map((m) => (
                    <li key={m.userId}>
                      <PersonRow m={m} onClick={() => void change({ add: [m.userId] }, `${m.name.split(" ")[0]} added`)} right={<UserPlus className="h-4 w-4 text-[#6b7280]" />} />
                    </li>
                  ))}
              </ul>
            </div>
          ) : null}
          <ul className="mt-2">
            {detail.people.map((p) => (
              <li key={p.id} className="flex items-center gap-3 rounded-xl px-1.5 py-1.5">
                <a href={memberHref(slug, { id: p.id, username: p.username })} data-person-link="" className="flex min-w-0 flex-1 items-center gap-3">
                  <MemberAvatar src={p.avatarUrl} name={p.name} alt="" size={36} />
                  <span className="min-w-0">
                    <span className="block truncate text-[14.5px] font-medium text-[#1a1a2e]">{p.id === userId ? `${p.name} (you)` : p.name}</span>
                    {p.groupRole === "owner" ? <span className="block text-[12px] text-[#9ca3af]">Owner</span> : null}
                  </span>
                </a>
                {detail.canManage && p.id !== userId ? (
                  <button type="button" onClick={() => void change({ remove: p.id }, `${p.name.split(" ")[0]} removed`)} className="h-8 rounded-full px-3 text-[12.5px] font-medium text-[#c4290c] hover:bg-[#fdf2f0]">
                    Remove
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => void leave()} className="mt-5 inline-flex h-10 items-center gap-2 rounded-full px-3 text-[14px] font-medium text-[#c4290c] hover:bg-[#fdf2f0]" data-group-leave="">
            <LogOut className="h-4 w-4" />
            Leave group
          </button>
        </div>
      )}
    </div>
  )
}
