"use client"

/**
 * ===========================================================================
 *  THE COMMUNITY, LIVE (round 10)
 * ===========================================================================
 * What other members do arrives without a refresh: a new post in the feed,
 * a new comment in an open post, and "<name> is writing..." under its
 * comment box. All of it rides Supabase Realtime BROADCAST channels that
 * carry ids only (lib/communities/server/realtime.ts says why and how the
 * server sends them); the words are always read through the gated API.
 *
 *   FEED CHANNEL   the community's secret name (GET .../live, members only),
 *                  event "post" { postId, spaceId, authorId }
 *   POST CHANNEL   the same name with the post id after it, events
 *                  "comment" { commentId, parentId, authorId } from the
 *                  server and "typing" { userId, on } from the browsers
 *                  with the post open (throttled, see useTyping)
 *
 * One channel per name for the whole page however many components listen
 * (counted, closed when the last one goes), joined as the member: the token
 * is set before the join (./realtime realtimeAuth), as chat and messages do.
 * Never throws: without realtime the page is what it was before round 10.
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { api, apiBase } from "./api"
import { realtimeAuth } from "./realtime"

export type LivePayload = Record<string, unknown>
type Handler = (payload: LivePayload) => void
type Client = ReturnType<typeof createClient>
type Channel = ReturnType<Client["channel"]>

/** The events each kind of channel carries; registered before the join, as a channel requires. */
const FEED_EVENTS = ["post"] as const
const POST_EVENTS = ["comment", "typing"] as const

/* The community's channel name, asked once per community for the page's life. */
const topics = new Map<string, Promise<string | null>>()
export function liveTopicOf(communityId: string): Promise<string | null> {
  let have = topics.get(communityId)
  if (!have) {
    have = api<{ topic: string | null }>(`${apiBase(communityId)}/live`).then((r) => (r.ok && typeof r.data.topic === "string" && r.data.topic ? r.data.topic : null))
    /* A failed ask is asked again next time, not remembered as "no realtime". */
    void have.then((t) => {
      if (!t) topics.delete(communityId)
    })
    topics.set(communityId, have)
  }
  return have
}

interface Joined {
  refs: number
  handlers: Map<string, Set<Handler>>
  client: Client | null
  channel: Channel | null
  ready: boolean
  closed: boolean
}
const joined = new Map<string, Joined>()
let client: Client | null = null

/** Opens (or reuses) the channel `name` with its events; returns the shared entry. */
function join(name: string, events: readonly string[]): Joined {
  let j = joined.get(name)
  if (j) {
    j.refs++
    return j
  }
  j = { refs: 1, handlers: new Map(), client: null, channel: null, ready: false, closed: false }
  joined.set(name, j)
  const entry = j
  void (async () => {
    try {
      client ??= createClient()
      await realtimeAuth(client)
      if (entry.closed) return
      let ch = client.channel(name, { config: { broadcast: { self: false } } })
      for (const ev of events) {
        ch = ch.on("broadcast", { event: ev }, (msg: { payload?: LivePayload }) => {
          for (const h of entry.handlers.get(ev) ?? []) {
            try {
              h(msg?.payload ?? {})
            } catch {
              /* One listener's mistake does not stop the others. */
            }
          }
        })
      }
      entry.client = client
      entry.channel = ch.subscribe((status: string) => {
        entry.ready = status === "SUBSCRIBED"
      })
    } catch {
      /* No realtime here: the page shows what it read. */
    }
  })()
  return j
}

function leave(name: string) {
  const j = joined.get(name)
  if (!j) return
  if (--j.refs > 0) return
  j.closed = true
  joined.delete(name)
  if (j.client && j.channel) void j.client.removeChannel(j.channel)
}

/**
 * Listens to `event` on a community's feed channel (postId null) or a post's
 * channel. Returns the way to stop. Safe to call before the name is known:
 * the listener waits for it.
 */
export function listenLive(communityId: string, postId: string | null, event: string, handler: Handler): () => void {
  let stopped = false
  let name: string | null = null
  void liveTopicOf(communityId).then((topic) => {
    if (stopped || !topic) return
    name = postId ? `${topic}:${postId.toLowerCase()}` : topic
    const j = join(name, postId ? POST_EVENTS : FEED_EVENTS)
    let set = j.handlers.get(event)
    if (!set) j.handlers.set(event, (set = new Set()))
    set.add(handler)
  })
  return () => {
    stopped = true
    if (!name) return
    joined.get(name)?.handlers.get(event)?.delete(handler)
    leave(name)
  }
}

/** Says something on a post's channel (only "typing" comes from a browser); nothing when it is not joined yet. */
export function sayLive(communityId: string, postId: string, event: "typing", payload: LivePayload): void {
  const topic = topics.get(communityId)
  if (!topic) return
  void topic.then((t) => {
    const j = t ? joined.get(`${t}:${postId.toLowerCase()}`) : undefined
    if (!j?.channel || !j.ready) return
    void Promise.resolve(j.channel.send({ type: "broadcast", event, payload })).catch(() => {})
  })
}

/**
 * ===========================================================================
 *  "<NAME> IS WRITING..."
 * ===========================================================================
 * The member's own box says it is being typed in at most once every
 * TYPING_EVERY_MS while the words change, and says it stopped when they are
 * sent or emptied; the others show it until they hear it stopped or for
 * TYPING_SHOWN_MS after the last word (a closed tab never says it stopped).
 * Only the writer's id travels; the name comes from the people already on
 * screen (the post's author, the commenters) or, for anybody else, the
 * community's own person card (members only, rate limited), once.
 */
export const TYPING_EVERY_MS = 2_000
export const TYPING_SHOWN_MS = 5_000

const names = new Map<string, Promise<string | null>>()
/** A member's name for the line, from what the page knows or one small gated read. */
export function nameOf(communityId: string, userId: string, known: (id: string) => string | null): Promise<string | null> {
  const k = known(userId)
  if (k) return Promise.resolve(k)
  const key = `${communityId}:${userId}`
  let have = names.get(key)
  if (!have) {
    have = api<{ person: { name?: string } }>(`${apiBase(communityId)}/people/${encodeURIComponent(userId)}/card`).then((r) => (r.ok && r.data.person?.name ? r.data.person.name : null))
    names.set(key, have)
  }
  return have
}

/** The words for who is writing: one name, two names, or "Several people". */
export function typingLine(list: string[]): string | null {
  if (!list.length) return null
  if (list.length === 1) return `${list[0]} is writing...`
  if (list.length === 2) return `${list[0]} and ${list[1]} are writing...`
  return "Several people are writing..."
}

/**
 * Both sides of the line for one open post: `typed(words)` from the member's
 * own box, `sent()` when it went, and `writers` (names, oldest first) to show.
 */
export function useTyping(communityId: string, postId: string, userId: string | null, known: (id: string) => string | null) {
  const [writers, setWriters] = useState<{ id: string; name: string }[]>([])
  const timers = useRef(new Map<string, number>())
  const knownRef = useRef(known)
  useEffect(() => {
    knownRef.current = known
  })

  useEffect(() => {
    const live = timers.current
    const drop = (id: string) => {
      window.clearTimeout(live.get(id))
      live.delete(id)
      setWriters((w) => (w.some((x) => x.id === id) ? w.filter((x) => x.id !== id) : w))
    }
    const stop = listenLive(communityId, postId, "typing", (p) => {
      const id = typeof p.userId === "string" ? p.userId : ""
      if (!id || id === userId) return
      if (p.on === false) return drop(id)
      window.clearTimeout(live.get(id))
      live.set(id, window.setTimeout(() => drop(id), TYPING_SHOWN_MS))
      void nameOf(communityId, id, (x) => knownRef.current(x)).then((name) => {
        if (!name || !live.has(id)) return
        setWriters((w) => (w.some((x) => x.id === id) ? w : [...w, { id, name }]))
      })
    })
    /* A comment from a writer ends their line at once. */
    const stopComment = listenLive(communityId, postId, "comment", (p) => {
      if (typeof p.authorId === "string") drop(p.authorId)
    })
    return () => {
      stop()
      stopComment()
      for (const t of live.values()) window.clearTimeout(t)
      live.clear()
    }
  }, [communityId, postId, userId])

  const last = useRef(0)
  const on = useRef(false)
  const typed = useCallback(
    (words: string) => {
      if (!userId) return
      if (!words.trim()) {
        if (on.current) sayLive(communityId, postId, "typing", { userId, on: false })
        on.current = false
        last.current = 0
        return
      }
      const now = Date.now()
      if (now - last.current < TYPING_EVERY_MS) return
      last.current = now
      on.current = true
      sayLive(communityId, postId, "typing", { userId, on: true })
    },
    [communityId, postId, userId],
  )
  const sent = useCallback(() => {
    if (userId && on.current) sayLive(communityId, postId, "typing", { userId, on: false })
    on.current = false
    last.current = 0
  }, [communityId, postId, userId])

  return { writers, typed, sent }
}
