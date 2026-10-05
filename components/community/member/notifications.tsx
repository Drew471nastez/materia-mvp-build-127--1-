"use client"

/**
 * THE MEMBER'S INBOX for this community: replies, mentions, likes,
 * announcements and the rest, newest first, unread ones marked with a dot.
 * Opening one marks it read; "Mark all read" does them all. New ones arrive
 * live (Supabase realtime on the member's own community_notifications rows)
 * and the bell in the shell follows the same count. What they hear about is
 * chosen here too (notify_level).
 */
import Link from "next/link"
import { useEffect, useState } from "react"
import { Bell } from "lucide-react"
import { MemberAvatar } from "./member-avatar"
import { relativeTime } from "@/lib/communities/format"
import type { NotifyLevel } from "@/lib/communities/types"
import { createClient } from "@/lib/supabase/client"
import { api, apiBase } from "./api"
import { PageTitle } from "./headers"
import { announceUnread, realtimeAuth } from "./realtime"
import { toast } from "./toast"
import { BTN_GHOST, BTN_SECONDARY, CARD } from "./ui"
import type { NotificationView } from "./view-types"

const LEVELS: { key: NotifyLevel; label: string }[] = [
  { key: "all", label: "Everything" },
  { key: "important", label: "Everything but likes" },
  { key: "mentions", label: "Only mentions and replies" },
  { key: "none", label: "Nothing" },
]

export function NotificationsList({
  communityId,
  userId,
  initial,
  notifyLevel,
}: {
  communityId: string
  slug: string
  userId: string
  initial: { notifications: NotificationView[]; unread: number; nextCursor: string | null }
  notifyLevel: NotifyLevel
}) {
  const [items, setItems] = useState(initial.notifications)
  const [unread, setUnread] = useState(initial.unread)
  const [cursor, setCursor] = useState(initial.nextCursor)
  const [loading, setLoading] = useState(false)
  const [level, setLevel] = useState<NotifyLevel>(notifyLevel)
  const base = apiBase(communityId)

  useEffect(() => announceUnread(communityId, unread), [communityId, unread])

  /* New ones, live. */
  useEffect(() => {
    let gone = false
    let supabase: ReturnType<typeof createClient> | null = null
    let channel: ReturnType<ReturnType<typeof createClient>["channel"]> | null = null
    void (async () => {
      try {
        supabase = createClient()
        /* Signed in before the join (./realtime realtimeAuth), or the inbox is read as a visitor and stays still. */
        await realtimeAuth(supabase)
        if (gone) return
        channel = supabase
          .channel(`community-inbox-page:${communityId}:${userId}`)
          .on("postgres_changes", { event: "INSERT", schema: "public", table: "community_notifications", filter: `user_id=eq.${userId}` }, async (payload: { new?: { community_id?: string } }) => {
            if (payload.new?.community_id !== communityId) return
            const r = await api<{ notifications: NotificationView[]; unread: number }>(`${base}/notifications`)
            if (!r.ok) return
            setItems((cur) => [...r.data.notifications.filter((n) => !cur.some((c) => c.id === n.id)), ...cur])
            setUnread(r.data.unread)
          })
          .subscribe()
      } catch {
        /* No realtime: the list is the one the page arrived with. */
      }
    })()
    return () => {
      gone = true
      if (supabase && channel) supabase.removeChannel(channel)
    }
  }, [base, communityId, userId])

  const markRead = async (ids: string[] | "all") => {
    setItems((cur) => cur.map((n) => (ids === "all" || ids.includes(n.id) ? { ...n, read: true } : n)))
    const r = await api<{ unread: number }>(`${base}/notifications`, { body: { read: ids } })
    if (r.ok) setUnread(r.data.unread)
  }

  const more = async () => {
    if (!cursor || loading) return
    setLoading(true)
    const r = await api<{ notifications: NotificationView[]; nextCursor: string | null }>(`${base}/notifications?cursor=${encodeURIComponent(cursor)}`)
    setLoading(false)
    if (!r.ok) return toast(r.error)
    setItems((cur) => [...cur, ...r.data.notifications.filter((n) => !cur.some((c) => c.id === n.id))])
    setCursor(r.data.nextCursor)
  }

  const chooseLevel = async (next: NotifyLevel) => {
    const was = level
    setLevel(next)
    const r = await api(`${base}/me`, { method: "PATCH", body: { notifyLevel: next } })
    if (!r.ok) {
      setLevel(was)
      return toast(r.error)
    }
    toast("Saved")
  }

  return (
    <div className="max-w-[720px]" data-notifications="">
      <PageTitle title="Notifications" detail={unread ? `${unread} unread` : null}>
        {unread ? (
          <button type="button" className={BTN_GHOST} onClick={() => markRead("all")} data-mark-all="">
            Mark all read
          </button>
        ) : null}
      </PageTitle>
      <ul className={`${CARD} divide-y divide-[#f0f1f3] overflow-hidden`} data-notification-list="">
        {items.map((n) => {
          const inner = (
            <>
              <span className="relative shrink-0">
                {n.actor ? (
                  <MemberAvatar src={n.actor.avatarUrl} name={n.actor.name} alt="" size={40} lazy />
                ) : (
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#eef0f3] text-[#6b7280]">
                    <Bell className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
                  </span>
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block text-[14.5px] leading-snug ${n.read ? "text-[#4b5563]" : "font-medium text-[#1a1a2e]"}`}>{n.title}</span>
                {n.body ? <span className="mt-0.5 line-clamp-2 block text-[13.5px] text-[#6b7280]">{n.body}</span> : null}
                <span className="mt-0.5 block text-[12.5px] text-[#9ca3af]" suppressHydrationWarning>
                  {relativeTime(n.createdAt)}
                </span>
              </span>
              {!n.read ? <span aria-label="Unread" className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[#1a1a2e]" /> : null}
            </>
          )
          const cls = `flex min-h-[64px] items-start gap-3 px-4 py-3 transition-colors hover:bg-[#f8f9fa] sm:px-5 ${n.read ? "" : "bg-[#fbfbfc]"}`
          return (
            <li key={n.id} data-notification={n.read ? "read" : "unread"}>
              {n.url ? (
                <Link href={n.url} className={cls} onClick={() => !n.read && void markRead([n.id])}>
                  {inner}
                </Link>
              ) : (
                <button type="button" className={`${cls} w-full text-left`} onClick={() => !n.read && void markRead([n.id])}>
                  {inner}
                </button>
              )}
            </li>
          )
        })}
        {items.length === 0 ? <li className="px-5 py-12 text-center text-[14px] text-[#6b7280]">All clear. Replies, mentions and news land here.</li> : null}
      </ul>
      {cursor ? (
        <div className="mt-4 flex justify-center">
          <button type="button" className={BTN_SECONDARY} onClick={more} disabled={loading}>
            {loading ? "Loading..." : "Show older"}
          </button>
        </div>
      ) : null}

      <section className={`${CARD} mt-6 p-4 sm:p-5`} data-notify-level="">
        <h2 className="text-[15px] font-semibold text-[#1a1a2e]">What you hear about here</h2>
        <div role="radiogroup" aria-label="What you hear about" className="mt-3 grid gap-2 sm:grid-cols-2">
          {LEVELS.map((l) => (
            <button
              key={l.key}
              type="button"
              role="radio"
              aria-checked={level === l.key}
              onClick={() => chooseLevel(l.key)}
              className={`min-h-11 rounded-xl border px-3.5 py-2 text-left text-[14px] font-medium transition-colors ${level === l.key ? "border-[#1a1a2e] bg-[#f6f7f8] text-[#1a1a2e]" : "border-[#e3e4e8] text-[#4b5563] hover:border-[#c9ccd3]"}`}
            >
              {l.label}
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}
