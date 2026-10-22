"use client"

/**
 * ===========================================================================
 *  WHAT EVERY COMMUNITY PAGE NEEDS OF MESSAGES, WITHOUT THE PANEL (round 39)
 * ===========================================================================
 * The frame (shell-frame.tsx) draws the chat button's number on every
 * community page, and a profile's Message button opens a conversation. Both
 * lived in messages.tsx, so every community page's first load carried the
 * whole panel with it: the chat screen, the lightbox, the video player. They
 * are here now, small, and the panel (messages.tsx) is loaded when it is
 * first opened:
 *
 *   openMessages        the event the frame listens for
 *   useUnreadMessages   the button's number, live; the list kept before the
 *                       panel opens; the member saying they are here
 *                       (chat-presence.ts)
 *   warmConversation    a Message button's hover: the conversation and its
 *                       newest page, asked for ahead of the press
 *   conversationWith    the press: made or found, with its page in one answer
 *   liveStream          a realtime stream with a polling net under it
 */
import { useCallback, useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { api, apiBase } from "./api"
import { realtimeAuth } from "./realtime"
import { chatCacheKey, keepAnswered, keepList, keepValue, keptList, keptValue } from "./chat-core"
import { useBeHere } from "./chat-presence"

export const MESSAGES_EVENT = "storelib:community-messages"

export type LiveTable = "community_conversations" | "community_direct_messages" | "community_chat_groups" | "community_chat_group_messages" | "community_chat_group_members"

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

/**
 * Opens the panel, on a member's conversation when `userId` is given, on a group when `groupId` is. `person` (round
 * 39): who they are, as the page that has the button already knows, so the conversation's header is drawn in the
 * panel's first frame while its id is still being asked for.
 */
export function openMessages(detail: { userId?: string; groupId?: string; person?: Person } = {}) {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent(MESSAGES_EVENT, { detail }))
}

/*
  ===========================================================================
   A PERSON'S CONVERSATION, ASKED FOR BEFORE MESSAGE IS PRESSED (round 39)
  ===========================================================================
  The owner: "the chat takes too much time to load". Pressed on a profile, Message opened the panel on the list, asked
  the server for the conversation's id, and only then for its messages: the list for 400ms, then skeleton bubbles, the
  first message at 730 to 860ms (measured at a 300ms server, scripts/check-community-chat-r39.mjs). Now the pointer
  resting on Message, a finger touching it or the keyboard reaching it asks for both: the id (found, or made: a
  conversation with no message in it is in nobody's list) and then its newest page, kept for the tab. The press then
  draws the conversation from what is kept, in the panel's first frame. One ask per person, however often it is hovered.
*/
type Opened = { id: string; other: Person | null } | { error: string }
const OPENING = new Map<string, Promise<Opened>>()

export function dmWithKey(communityId: string, userId: string): string {
  return `dm-with:${communityId}:${userId}`
}

/** Who is signed in on this page, as the frame's useUnreadMessages knows it: a profile's button need not. */
let VIEWER: string | null = null

/**
 * The conversation with `userId`, for the press: kept for the tab, else made or found on the server with its newest
 * page in the same answer (one round trip), kept as the chat's page. A refusal says why (the press shows it).
 */
export function conversationWith(communityId: string, userId: string, viewer: string | null = null): Promise<Opened> {
  const known = keptValue<{ id: string; other: Person | null }>(dmWithKey(communityId, userId))
  if (known) return Promise.resolve(known)
  const key = `${communityId}:${userId}`
  const busy = OPENING.get(key)
  if (busy) return busy
  const me = viewer ?? VIEWER
  const ask = api<{ conversation: { id: string; other: Person | null }; page?: unknown }>(`${apiBase(communityId)}/dms`, { body: { userId, page: true } }).then((r): Opened => {
    OPENING.delete(key)
    if (!r.ok) return { error: r.error }
    keepValue(dmWithKey(communityId, userId), r.data.conversation)
    if (me && r.data.page) keepAnswered(chatCacheKey(me, "dm", r.data.conversation.id), r.data.page)
    return r.data.conversation
  })
  OPENING.set(key, ask)
  return ask
}

/**
 * Hover, touch or focus on a Message button: the conversation, when there is one, and its newest page, in one read
 * that makes nothing and is not counted against starting conversations. Once a person, however often it is hovered.
 */
const WARMED = new Set<string>()
export function warmConversation(communityId: string, viewer: string | null, userId: string): void {
  const me = viewer ?? VIEWER
  const key = `${communityId}:${userId}`
  if (!me || me === userId || WARMED.has(key) || keptValue(dmWithKey(communityId, userId))) return
  WARMED.add(key)
  void api<{ conversation: { id: string; other: Person | null } | null; page?: unknown }>(`${apiBase(communityId)}/dms?with=${encodeURIComponent(userId)}`).then((r) => {
    if (!r.ok) {
      WARMED.delete(key)
      return
    }
    if (!r.data.conversation) return
    keepValue(dmWithKey(communityId, userId), r.data.conversation)
    if (r.data.page) keepAnswered(chatCacheKey(me, "dm", r.data.conversation.id), r.data.page)
  })
}

export interface Person {
  id: string
  name: string
  username: string | null
  avatarUrl: string | null
  role: string | null
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
  /* Round 39: every member page with messages on says its member is here (chat-presence.ts), for the headers of the conversations they are in. */
  useBeHere(communityId, userId, initial !== null)
  VIEWER = userId
  const refresh = useCallback(async () => {
    const r = await api<{ ready: boolean; unread: number; conversations?: unknown[]; groups?: unknown[] }>(`${apiBase(communityId)}/dms`)
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
