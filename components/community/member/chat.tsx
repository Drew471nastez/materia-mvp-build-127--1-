"use client"

/**
 * ===========================================================================
 *  A CHAT SPACE
 * ===========================================================================
 * Messages oldest at the top, newest at the bottom, grouped when one person
 * writes several in a row, with a quiet line between days. The box at the
 * bottom sends on Enter (Shift+Enter is a new line).
 *
 * LIVE, BUT NEVER TRUSTED. The page listens to Supabase realtime for this
 * space's rows of community_messages (postgres_changes filtered by space_id;
 * part 81's policy lets only members who may read the space receive them).
 * A new row is a signal: the page asks the server for the messages after
 * the last one it has, with their authors, so names and pictures always come
 * from the server. An edit carries its new words; a removal carries a blank
 * body, and the message leaves the list. Writing always goes through the
 * server route, never the stream.
 */
import Link from "next/link"
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { Flag, MoreHorizontal, Pencil, Shield, Trash2 } from "lucide-react"
import { AppAvatar } from "@/components/app/app-avatar"
import { ResponsiveActionMenu, type ActionMenuItem } from "@/components/ui/responsive-action-menu"
import { createClient } from "@/lib/supabase/client"
import { realtimeAuth } from "./realtime"
import type { ViewerView } from "@/lib/communities/types"
import { api, apiBase } from "./api"
import { inline } from "./body-text"
import { ConfirmDialog, ReportDialog, type ConfirmState, type ReportTargetRef } from "./dialogs"
import { SpaceIcon } from "./space-icon"
import { toast } from "./toast"
import { BTN_PRIMARY, BTN_SECONDARY, CARD, ICON_BTN } from "./ui"
import { memberHref } from "./person-href"
import { RoleBadge } from "./role-badge"
import type { ChatMessageView, SpaceView } from "./view-types"

/** Messages from one person within this long of each other are drawn as one group. */
export const GROUP_MS = 5 * 60_000

export function groupsStart(list: Pick<ChatMessageView, "author" | "createdAt">[], i: number): boolean {
  if (i === 0) return true
  const a = list[i - 1]
  const b = list[i]
  if ((a.author?.id ?? null) !== (b.author?.id ?? null)) return true
  if (dayOf(a.createdAt) !== dayOf(b.createdAt)) return true
  return Date.parse(b.createdAt) - Date.parse(a.createdAt) > GROUP_MS
}

function dayOf(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

function dayLabel(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  const yesterday = new Date(Date.now() - 86_400_000)
  if (dayOf(iso) === dayOf(today.toISOString())) return "Today"
  if (dayOf(iso) === dayOf(yesterday.toISOString())) return "Yesterday"
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric", ...(d.getFullYear() !== today.getFullYear() ? { year: "numeric" } : {}) })
}

function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
}

export interface ChatViewProps {
  communityId: string
  slug: string
  space: SpaceView
  viewer: ViewerView
  initial: { messages: ChatMessageView[]; hasMore: boolean }
  readOnly?: boolean
}

export function ChatView({ communityId, slug, space, viewer, initial, readOnly = false }: ChatViewProps) {
  const [messages, setMessages] = useState<(ChatMessageView & { sending?: boolean })[]>(initial.messages)
  const [hasMore, setHasMore] = useState(initial.hasMore)
  const [older, setOlder] = useState(false)
  const [text, setText] = useState("")
  const [mounted, setMounted] = useState(false)
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)
  const [report, setReport] = useState<ReportTargetRef | null>(null)
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null)
  /* On a phone there is no hover: a tap on a message shows its menu. */
  const [picked, setPicked] = useState<string | null>(null)
  const list = useRef<HTMLDivElement>(null)
  const atBottom = useRef(true)
  const keepFrom = useRef<number | null>(null)
  const lastRead = useRef(0)
  const latest = useRef(messages)
  latest.current = messages
  const base = apiBase(communityId)

  useEffect(() => setMounted(true), [])

  const markRead = useCallback(() => {
    if (Date.now() - lastRead.current < 4000) return
    lastRead.current = Date.now()
    void api(`${base}/spaces/${space.id}/read`, { method: "POST" })
  }, [base, space.id])

  /* Seen: on arrival, and as new messages come while the page is open. */
  useEffect(() => {
    markRead()
  }, [markRead])

  /* Stay at the bottom while the reader is there; keep their place when older messages arrive above. */
  useLayoutEffect(() => {
    const el = list.current
    if (!el) return
    if (keepFrom.current !== null) {
      el.scrollTop = el.scrollHeight - keepFrom.current
      keepFrom.current = null
    } else if (atBottom.current) {
      el.scrollTop = el.scrollHeight
    }
  }, [messages, mounted])

  const catchUp = useCallback(async () => {
    const last = [...latest.current].reverse().find((m) => !m.sending)
    const r = await api<{ messages: ChatMessageView[] }>(`${base}/spaces/${space.id}/messages${last ? `?after=${encodeURIComponent(last.createdAt)}` : ""}`)
    if (!r.ok) return
    setMessages((cur) => {
      const ids = new Set(cur.map((m) => m.id))
      const fresh = r.data.messages.filter((m) => !ids.has(m.id))
      return fresh.length ? [...cur, ...fresh] : cur
    })
    if (document.visibilityState === "visible") markRead()
  }, [base, space.id, markRead])

  /* The stream. */
  useEffect(() => {
    let supabase: ReturnType<typeof createClient> | null = null
    let channel: ReturnType<ReturnType<typeof createClient>["channel"]> | null = null
    let timer: number | undefined
    let net: number | undefined
    let gone = false
    let joined = false
    /* The net under the stream (round 7): not joined, or dropped, the page asks every 5 seconds while it is seen. */
    const tick = () => {
      net = window.setTimeout(() => {
        if (gone) return
        if (!joined && document.visibilityState === "visible") void catchUp()
        tick()
      }, 5000)
    }
    tick()
    void (async () => {
      try {
        supabase = createClient()
        /* Signed in before the join (./realtime realtimeAuth): the stream is a members' read. */
        await realtimeAuth(supabase)
        if (gone) return
        channel = supabase
          .channel(`community-chat:${space.id}`)
          .on("postgres_changes", { event: "*", schema: "public", table: "community_messages", filter: `space_id=eq.${space.id}` }, (payload: { eventType: string; new?: Record<string, unknown> }) => {
            const row = payload.new ?? {}
            const id = typeof row.id === "string" ? row.id : ""
            if (payload.eventType === "INSERT") {
              window.clearTimeout(timer)
              timer = window.setTimeout(() => void catchUp(), 120)
            } else if (payload.eventType === "UPDATE" && id) {
              if (row.status !== "published") setMessages((cur) => cur.filter((m) => m.id !== id))
              else setMessages((cur) => cur.map((m) => (m.id === id ? { ...m, body: String(row.body ?? m.body), editedAt: (row.edited_at as string | null) ?? m.editedAt } : m)))
            }
          })
          .subscribe((status: string) => {
            joined = status === "SUBSCRIBED"
          })
      } catch {
        /* No realtime: the net above carries it. */
      }
    })()
    const onVisible = () => document.visibilityState === "visible" && void catchUp()
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      gone = true
      window.clearTimeout(timer)
      window.clearTimeout(net)
      document.removeEventListener("visibilitychange", onVisible)
      if (supabase && channel) supabase.removeChannel(channel)
    }
  }, [space.id, catchUp])

  const loadOlder = async () => {
    const first = messages.find((m) => !m.sending)
    if (!first || older) return
    setOlder(true)
    const r = await api<{ messages: ChatMessageView[]; hasMore: boolean }>(`${base}/spaces/${space.id}/messages?before=${encodeURIComponent(first.createdAt)}`)
    setOlder(false)
    if (!r.ok) return toast(r.error)
    const el = list.current
    keepFrom.current = el ? el.scrollHeight - el.scrollTop : null
    setMessages((cur) => [...r.data.messages.filter((m) => !cur.some((c) => c.id === m.id)), ...cur])
    setHasMore(r.data.hasMore)
  }

  const send = async () => {
    const body = text.trim()
    if (!body) return
    const temp = `temp-${Date.now()}`
    const now = new Date().toISOString()
    atBottom.current = true
    setText("")
    setMessages((cur) => [
      ...cur,
      { id: temp, spaceId: space.id, body, status: "published", author: { id: viewer.userId ?? "", name: "You", username: null, avatarUrl: null, role: viewer.role, level: viewer.level }, replyToId: null, createdAt: now, editedAt: null, canEdit: false, canModerate: false, sending: true },
    ])
    const r = await api<{ message: ChatMessageView }>(`${base}/spaces/${space.id}/messages`, { body: { body } })
    if (!r.ok) {
      setMessages((cur) => cur.filter((m) => m.id !== temp))
      setText(body)
      return toast(r.error)
    }
    setMessages((cur) => {
      const without = cur.filter((m) => m.id !== temp)
      return without.some((m) => m.id === r.data.message.id) ? without : [...without, r.data.message]
    })
  }

  const saveEdit = async () => {
    if (!editing) return
    const r = await api<{ message: ChatMessageView }>(`${base}/messages/${editing.id}`, { method: "PATCH", body: { body: editing.body } })
    if (!r.ok) return toast(r.error)
    setMessages((cur) => cur.map((m) => (m.id === editing.id ? r.data.message : m)))
    setEditing(null)
  }

  const remove = (m: ChatMessageView, asModerator: boolean) =>
    setConfirm({
      title: asModerator ? "Remove this message?" : "Delete this message?",
      detail: asModerator ? "Members will no longer see it." : undefined,
      action: asModerator ? "Remove" : "Delete",
      reason: asModerator,
      danger: true,
      run: async (reason) => {
        const r = await api(`${base}/messages/${m.id}`, { method: "DELETE", body: reason ? { reason } : {} })
        if (!r.ok) {
          toast(r.error)
          return false
        }
        setMessages((cur) => cur.filter((x) => x.id !== m.id))
        return true
      },
    })

  return (
    <div className="flex h-[calc(100dvh-var(--community-top,0px)-88px)] min-h-[420px] flex-col pb-3 lg:h-[calc(100dvh-var(--community-top,0px)-104px)] lg:max-w-[760px] lg:pb-6" data-chat="">
      <div className={`${CARD} flex min-h-0 flex-1 flex-col overflow-hidden`}>
        <header className="flex items-center gap-2.5 border-b border-[#eceef1] px-4 py-3">
          <span className="text-[#6b7280]">
            <SpaceIcon icon={space.icon} kind={space.kind} />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-[16px] font-semibold text-[#1a1a2e]">{space.name}</h1>
            {space.description ? <p className="truncate text-[12.5px] text-[#6b7280]">{space.description}</p> : null}
          </div>
        </header>

        <div
          ref={list}
          onScroll={(e) => {
            const el = e.currentTarget
            atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
          }}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 sm:px-4"
          data-chat-list=""
          role="log"
          aria-live="polite"
        >
          {hasMore ? (
            <div className="flex justify-center pb-3">
              <button type="button" className={BTN_SECONDARY} onClick={loadOlder} disabled={older}>
                {older ? "Loading..." : "Load earlier messages"}
              </button>
            </div>
          ) : null}
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center px-6 text-center" data-chat-empty="">
              <p className="text-[15px] font-semibold text-[#1a1a2e]">No messages yet.</p>
              <p className="mt-1 text-[14px] text-[#6b7280]">{readOnly ? "Nothing has been said here." : "Say hello to get it going."}</p>
            </div>
          ) : null}
          {messages.map((m, i) => {
            const start = groupsStart(messages, i)
            const newDay = i === 0 || dayOf(messages[i - 1].createdAt) !== dayOf(m.createdAt)
            const items: ActionMenuItem[] = []
            if (m.canEdit) {
              items.push({ label: "Edit", icon: <Pencil className="h-4 w-4" />, onClick: () => setEditing({ id: m.id, body: m.body }) })
              items.push({ label: "Delete", icon: <Trash2 className="h-4 w-4" />, variant: "destructive", onClick: () => remove(m, false) })
            } else if (!m.sending) {
              if (viewer.can.report) items.push({ label: "Report", icon: <Flag className="h-4 w-4" />, onClick: () => setReport({ type: "message", id: m.id, what: "message" }) })
              if (m.canModerate) items.push({ label: "Remove message", icon: <Shield className="h-4 w-4" />, variant: "destructive", section: "Moderation", onClick: () => remove(m, true) })
            }
            return (
              <div key={m.id}>
                {newDay && mounted ? (
                  <div className="my-3 flex items-center gap-3 text-[12px] font-medium text-[#8a8f98]" data-chat-day="">
                    <span className="h-px flex-1 bg-[#eceef1]" />
                    {dayLabel(m.createdAt)}
                    <span className="h-px flex-1 bg-[#eceef1]" />
                  </div>
                ) : null}
                <div
                  className={`group/msg relative flex gap-2.5 rounded-xl py-0.5 pl-1.5 pr-11 hover:bg-[#f8f9fa] ${picked === m.id ? "bg-[#f4f5f7]" : ""} ${start ? "mt-2.5" : ""} ${m.sending ? "opacity-60" : ""}`}
                  data-chat-message={m.id}
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest("a,button,textarea")) return
                    setPicked((x) => (x === m.id ? null : m.id))
                  }}
                >
                  <div className="w-9 shrink-0">
                    {start ? (
                      m.author ? (
                        <Link href={memberHref(slug, m.author)} data-person-link="" data-person-id={m.author.id}>
                          <AppAvatar src={m.author.avatarUrl} name={m.author.name} alt="" size={36} markWhileLoading />
                        </Link>
                      ) : (
                        <span className="block h-9 w-9 rounded-full bg-[#eceef1]" />
                      )
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    {start ? (
                      <div className="flex items-baseline gap-1.5 text-[13.5px]">
                        {m.author ? (
                          <Link href={memberHref(slug, m.author)} className="font-semibold text-[#1a1a2e] hover:underline" data-person-link="" data-person-id={m.author.id}>
                            {m.author.name}
                          </Link>
                        ) : (
                          <span className="font-semibold text-[#6b7280]">Former member</span>
                        )}
                        <RoleBadge role={m.author?.role} size="xs" />
                        {mounted ? <span className="text-[12px] text-[#9ca3af]">{m.sending ? "Sending..." : clock(m.createdAt)}</span> : null}
                      </div>
                    ) : null}
                    {editing?.id === m.id ? (
                      <div className="mt-1">
                        <textarea
                          value={editing.body}
                          onChange={(e) => setEditing({ id: m.id, body: e.target.value })}
                          rows={2}
                          maxLength={4000}
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault()
                              void saveEdit()
                            }
                            if (e.key === "Escape") setEditing(null)
                          }}
                          className="w-full resize-none rounded-lg border border-[#e3e4e8] px-2.5 py-1.5 text-[16px] outline-none sm:text-[14.5px]"
                        />
                        <p className="text-[12px] text-[#8a8f98]">Enter to save, Escape to cancel</p>
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap break-words text-[15px] leading-[1.5] text-[#262633] sm:text-[14.5px]">
                        {inline(m.body)}
                        {m.editedAt ? <span className="ml-1 text-[11.5px] text-[#9ca3af]">(edited)</span> : null}
                      </p>
                    )}
                  </div>
                  {items.length ? (
                    <div className={`absolute right-0.5 top-0 transition-opacity focus-within:opacity-100 group-hover/msg:opacity-100 ${picked === m.id ? "opacity-100" : "pointer-events-none opacity-0 sm:pointer-events-auto"}`} data-chat-menu="">
                      <ResponsiveActionMenu
                        title="Message"
                        items={items}
                        trigger={
                          <button type="button" aria-label="More" className={`${ICON_BTN} h-10 w-10`}>
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                        }
                      />
                    </div>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>

        {readOnly ? (
          <p className="border-t border-[#eceef1] px-4 py-3 text-[13.5px] text-[#6b7280]">You can read this chat, but not send messages here.</p>
        ) : (
          <form
            className="flex items-end gap-2 border-t border-[#eceef1] p-2.5 sm:p-3"
            onSubmit={(e) => {
              e.preventDefault()
              void send()
            }}
            data-chat-form=""
          >
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={1}
              maxLength={4000}
              placeholder={`Message ${space.name}`}
              aria-label={`Message ${space.name}`}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  void send()
                }
              }}
              className="max-h-40 min-h-10 flex-1 resize-none rounded-2xl border border-[#e3e4e8] bg-[#f8f9fa] px-3.5 py-2 text-[16px] leading-6 text-[#1a1a2e] outline-none placeholder:text-[#9ca3af] focus:border-[#c9ccd3] focus:bg-white sm:text-[14.5px]"
              style={{ fieldSizing: "content" } as React.CSSProperties}
            />
            <button type="submit" className={BTN_PRIMARY} disabled={!text.trim()} data-chat-send="">
              Send
            </button>
          </form>
        )}
      </div>
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
      <ReportDialog communityId={communityId} target={report} onClose={() => setReport(null)} />
    </div>
  )
}
