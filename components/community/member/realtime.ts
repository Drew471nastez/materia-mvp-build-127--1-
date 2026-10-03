"use client"

/**
 * THE TWO LIVE NUMBERS IN THE SHELL, both from Supabase realtime and from
 * nothing else:
 *
 *   unread    the member's own community_notifications rows (part 81 lets a
 *             member read only theirs), counted up as new ones arrive and
 *             set by the notifications page when it marks them read.
 *   online    a presence channel per community. Each open page joins with a
 *             key made from the member's id (hashed, so the channel does not
 *             hand anybody a list of ids), so two tabs are one person. No
 *             presence, no number: the shell draws nothing rather than a guess.
 */
import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"

export const INBOX_EVENT = "storelib:community-inbox"

/**
 * SIGNED IN BEFORE THE JOIN. A channel's join carries the access token the
 * realtime client holds at the moment subscribe() runs, and right after the
 * page loads it holds none yet: the client asks auth for the session on its
 * own, a moment later, and the join has already gone as the visitor (anon).
 * Postgres changes then fail, because only a signed in member may read
 * community_notifications and community_messages (part 81), and the bell and
 * the chat never moved. Awaited first, the join carries the member's token.
 * Asked through the client's own token callback (no argument), so the token
 * is still refreshed with the session afterwards. Never throws.
 */
export async function realtimeAuth(supabase: ReturnType<typeof createClient>): Promise<void> {
  try {
    await supabase.realtime.setAuth()
  } catch {
    /* The join goes as it would have; the reads stay refused, nothing breaks. */
  }
}

/** Tells the shell the unread count changed (the notifications page marked some read). */
export function announceUnread(communityId: string, unread: number) {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent(INBOX_EVENT, { detail: { communityId, unread } }))
}

export function useUnreadNotifications(communityId: string, userId: string | null, initial: number): number {
  const [count, setCount] = useState(initial)
  useEffect(() => setCount(initial), [initial])
  useEffect(() => {
    const onEvent = (e: Event) => {
      const d = (e as CustomEvent<{ communityId: string; unread: number }>).detail
      if (d?.communityId === communityId && Number.isFinite(d.unread)) setCount(Math.max(0, d.unread))
    }
    window.addEventListener(INBOX_EVENT, onEvent)
    return () => window.removeEventListener(INBOX_EVENT, onEvent)
  }, [communityId])
  useEffect(() => {
    if (!userId) return
    let gone = false
    let supabase: ReturnType<typeof createClient> | null = null
    let channel: ReturnType<ReturnType<typeof createClient>["channel"]> | null = null
    void (async () => {
      try {
        supabase = createClient()
        await realtimeAuth(supabase)
        if (gone) return
        channel = supabase
          .channel(`community-inbox:${communityId}:${userId}`)
          .on("postgres_changes", { event: "INSERT", schema: "public", table: "community_notifications", filter: `user_id=eq.${userId}` }, (payload: { new?: { community_id?: string; read_at?: string | null } }) => {
            if (payload.new?.community_id === communityId && !payload.new.read_at) setCount((c) => c + 1)
          })
          .subscribe()
      } catch {
        /* No realtime here: the count is the one the page arrived with. */
      }
    })()
    return () => {
      gone = true
      if (supabase && channel) supabase.removeChannel(channel)
    }
  }, [communityId, userId])
  return count
}

async function presenceKey(communityId: string, userId: string): Promise<string> {
  try {
    const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${communityId}:${userId}`))
    return Array.from(new Uint8Array(bytes).slice(0, 12), (b) => b.toString(16).padStart(2, "0")).join("")
  } catch {
    return `m${Math.random().toString(36).slice(2, 12)}`
  }
}

/** People with this community open right now, from presence; null until presence has answered. */
export function useOnlineCount(communityId: string, userId: string | null): number | null {
  const [online, setOnline] = useState<number | null>(null)
  useEffect(() => {
    if (!userId) return
    let gone = false
    let supabase: ReturnType<typeof createClient> | null = null
    let channel: ReturnType<ReturnType<typeof createClient>["channel"]> | null = null
    void (async () => {
      const key = await presenceKey(communityId, userId)
      if (gone) return
      try {
        supabase = createClient()
        await realtimeAuth(supabase)
        if (gone) return
        const ch = supabase.channel(`community-presence:${communityId}`, { config: { presence: { key } } })
        channel = ch
        ch.on("presence", { event: "sync" }, () => {
          if (!gone) setOnline(Object.keys(ch.presenceState()).length)
        })
        ch.subscribe((status: string) => {
          if (status === "SUBSCRIBED") void ch.track({ at: Date.now() })
        })
      } catch {
        /* No presence: no number. */
      }
    })()
    return () => {
      gone = true
      if (supabase && channel) supabase.removeChannel(channel)
    }
  }, [communityId, userId])
  return online
}
