"use client"

/**
 * THE BELL'S LIVE NUMBER, from Supabase realtime and from nothing else:
 * the member's own community_notifications rows (part 81 lets a member read
 * only theirs), counted up as new ones arrive and set by the notifications
 * page when it marks them read.
 *
 * Who is online is not a realtime channel any more: it is the presence
 * heartbeat the frame sends to the server (shell-frame.tsx,
 * usePresenceHeartbeat), counted from community_members.last_seen_at.
 */
import { useEffect, useState } from "react"
/* Not the client itself: the platform header's bell imports this file on every marketing page, so the client is fetched where it is used (lib/supabase/browser-lazy.ts, round 46). */
import { browserSupabase, type BrowserSupabase } from "@/lib/supabase/browser-lazy"

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
export async function realtimeAuth(supabase: BrowserSupabase): Promise<void> {
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
    let supabase: BrowserSupabase | null = null
    let channel: ReturnType<BrowserSupabase["channel"]> | null = null
    void (async () => {
      try {
        supabase = await browserSupabase()
        if (gone) return
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
