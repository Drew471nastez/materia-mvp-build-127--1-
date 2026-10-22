"use client"

/**
 * ===========================================================================
 *  WHO IS HERE NOW, FOR A CONVERSATION'S HEADER (round 39)
 * ===========================================================================
 * The owner: "I can see if that creator is on in the chat modal".
 *
 * ONE TOPIC PER MEMBER AND COMMUNITY, `online:<community>:<user>`, a private
 * realtime channel with presence. Every member page with messages on joins
 * its member's own topic and says it is here while the page is visible
 * (useBeHere, from useUnreadMessages, which every member page runs); a
 * conversation's header watches the other person's topic only (useOnline).
 * So a page receives the comings and goings of the one person it shows,
 * never the whole community's, whatever its size. Part 275's policy lets an
 * active member of the community watch a topic and only its own member say
 * they are here on it; nothing is stored.
 *
 * WITHOUT IT (part 275 not run, realtime refused, a phone that slept): the
 * channel never joins and the header reads the member's last heartbeat
 * (community_members.last_seen_at, sent once a minute by every member page):
 * seen in the last two minutes is online, older is "Last seen ...".
 *
 * One channel per topic for the whole page, however many parts ask for it.
 */
import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { realtimeAuth } from "./realtime"

type Channel = ReturnType<ReturnType<typeof createClient>["channel"]>

/** A heartbeat this recent counts as online when presence cannot say (the heartbeat is sent once a minute). */
export const SEEN_ONLINE_MS = 2.5 * 60_000

export function onlineTopic(communityId: string, userId: string): string {
  return `online:${communityId}:${userId}`
}

export interface OnlineState {
  /** Presence joined and answering for this topic. */
  live: boolean
  online: boolean
  /** When presence last saw them go, this page. */
  leftAt: number | null
}

interface Watch {
  state: OnlineState
  listeners: Set<(s: OnlineState) => void>
  users: number
  stop: () => void
}
const WATCHED = new Map<string, Watch>()

function open(topic: string, userId: string, me: string | null, track: boolean): () => void {
  let gone = false
  let supabase: ReturnType<typeof createClient> | null = null
  let channel: Channel | null = null
  const set = (patch: Partial<OnlineState>) => {
    const cur = WATCHED.get(topic)
    if (!cur) return
    const next = { ...cur.state, ...patch }
    if (cur.state.online && patch.online === false) next.leftAt = Date.now()
    if (next.live === cur.state.live && next.online === cur.state.online && next.leftAt === cur.state.leftAt) return
    cur.state = next
    for (const l of cur.listeners) l(next)
  }
  const here = () => {
    if (!channel || !track) return
    if (document.visibilityState === "visible") void Promise.resolve(channel.track({ at: new Date().toISOString() })).catch(() => undefined)
    else void Promise.resolve(channel.untrack()).catch(() => undefined)
  }
  void (async () => {
    try {
      supabase = createClient()
      await realtimeAuth(supabase)
      if (gone) return
      channel = supabase.channel(topic, { config: { private: true, presence: { key: me ?? "" } } })
      channel.on("presence", { event: "sync" }, () => {
        const state = (channel?.presenceState() ?? {}) as Record<string, unknown[]>
        set({ live: true, online: Object.keys(state).includes(userId) && (state[userId]?.length ?? 0) > 0 })
      })
      channel.subscribe((status: string) => {
        if (status === "SUBSCRIBED") {
          set({ live: true })
          here()
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") set({ live: false })
      })
    } catch {
      /* No realtime here: the heartbeat stands in. */
    }
  })()
  const onVisible = () => here()
  if (track) document.addEventListener("visibilitychange", onVisible)
  return () => {
    gone = true
    if (track) document.removeEventListener("visibilitychange", onVisible)
    if (supabase && channel) supabase.removeChannel(channel)
  }
}

function join(topic: string, userId: string, me: string | null, track: boolean, listener: (s: OnlineState) => void): () => void {
  let w = WATCHED.get(topic)
  if (!w) {
    w = { state: { live: false, online: false, leftAt: null }, listeners: new Set(), users: 0, stop: () => undefined }
    WATCHED.set(topic, w)
    w.stop = open(topic, userId, me, track)
  }
  w.users++
  w.listeners.add(listener)
  listener(w.state)
  const mine = w
  return () => {
    mine.listeners.delete(listener)
    mine.users--
    /* Kept a moment, so a header drawn again (Back, then the same conversation) does not leave and join again. */
    window.setTimeout(() => {
      if (mine.users > 0 || WATCHED.get(topic) !== mine) return
      mine.stop()
      WATCHED.delete(topic)
    }, 4000)
  }
}

/** Says this member is here, on their own topic, while a page of theirs is visible. */
export function useBeHere(communityId: string, userId: string | null, on: boolean): void {
  useEffect(() => {
    if (!userId || !on) return
    return join(onlineTopic(communityId, userId), userId, userId, true, () => undefined)
  }, [communityId, userId, on])
}

/** Whether `userId` is here now, from their presence topic. */
export function useOnline(communityId: string, me: string | null, userId: string | null): OnlineState {
  const [state, setState] = useState<OnlineState>({ live: false, online: false, leftAt: null })
  useEffect(() => {
    if (!userId || !me || userId === me) return
    return join(onlineTopic(communityId, userId), userId, me, false, setState)
  }, [communityId, me, userId])
  return state
}

/*
  THE HEADER'S WORDS. Online now; otherwise when they were last here, the later of what presence saw this page and the
  server's heartbeat. Empty when neither is known (the header shows their @name then).
*/
let TIME: Intl.DateTimeFormat | null = null
let DAY: Intl.DateTimeFormat | null = null

export function lastSeenLine(state: OnlineState, seenAt: string | null | undefined, now: number = Date.now()): { online: boolean; text: string } {
  if (state.live && state.online) return { online: true, text: "Online" }
  const beat = seenAt ? Date.parse(seenAt) : NaN
  /* No presence to ask: a heartbeat in the last couple of minutes is a page of theirs open now. */
  if (!state.live && Number.isFinite(beat) && now - beat < SEEN_ONLINE_MS) return { online: true, text: "Online" }
  const at = Math.max(state.leftAt ?? 0, Number.isFinite(beat) ? beat : 0)
  if (!at) return { online: false, text: "" }
  const ago = Math.max(0, now - at)
  if (ago < 60_000) return { online: false, text: "Last seen just now" }
  if (ago < 3_600_000) return { online: false, text: `Last seen ${Math.floor(ago / 60_000)}m ago` }
  const d = new Date(at)
  const today = new Date(now)
  const same = (x: Date, y: Date) => x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate()
  TIME ??= new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" })
  if (same(d, today)) return { online: false, text: `Last seen today at ${TIME.format(d)}` }
  if (same(d, new Date(now - 86_400_000))) return { online: false, text: `Last seen yesterday at ${TIME.format(d)}` }
  DAY ??= new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" })
  return { online: false, text: `Last seen ${DAY.format(d)}` }
}
