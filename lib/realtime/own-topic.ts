"use client"

/**
 * ===========================================================================
 *  A PERSON'S OWN LIVE TOPIC (round 55)
 * ===========================================================================
 * The bell, a community's inbox, Home's orders and a plan set from /admin
 * used to listen with Realtime `postgres_changes`, which makes the database
 * check every listener's row level security on every change to those tables
 * (Home listened to every order of every store and dropped the others in the
 * browser). Since SQL part 370 a trigger tells only the person concerned, on
 * their private broadcast topic `user:<user id>`, that something changed and
 * which row:
 *
 *   notification  { table, op, id, unread, community_id? }
 *   order         { op, id, creator_id }
 *   plan          { op, creator_id }
 *   ai_job        { job_id, seq }   a Start with AI build wrote progress
 *                                   events up to seq (SQL part 401)
 *
 * Nothing more travels; each listener reads again through the API it
 * already uses. Joining is checked by the policy part 370 adds to
 * realtime.messages: only the signed in person may join their own topic.
 *
 * BEFORE PART 370 HAS RUN the join is refused (a private channel with no
 * policy that lets it be read), and that refusal is how this knows: every
 * listener then opens its old `postgres_changes` subscription (`fallback`),
 * so nothing goes quiet in the meantime, and the page does not ask again.
 * Only a refusal before the first join counts; a dropped connection after it
 * is realtime's own to rejoin.
 *
 * One channel per person for the whole page however many listeners (counted,
 * closed when the last goes), as components/community/member/live.ts does.
 * Never throws.
 */
import type { BrowserSupabase } from "@/lib/supabase/browser-lazy"

export type OwnEvent = "notification" | "order" | "plan" | "ai_job"
export interface OwnPayload {
  table?: string
  op?: string
  id?: string
  unread?: boolean
  community_id?: string
  creator_id?: string
  job_id?: string
  seq?: number
}
type Channel = ReturnType<BrowserSupabase["channel"]>

/** The topic part 370 sends to and lets only this person join. */
export function ownTopic(userId: string): string {
  return `user:${userId}`
}

interface Listener {
  event: OwnEvent
  on: (payload: OwnPayload) => void
  /** The old subscription, opened only when the topic is refused; answers how to close it. */
  fallback: () => (() => void) | void
  closeFallback?: (() => void) | void
}

interface Joined {
  refs: Set<Listener>
  client: BrowserSupabase
  channel: Channel | null
  mode: "joining" | "broadcast" | "fallback"
  closed: boolean
}

const joined = new Map<string, Joined>()
/** People whose topic was refused on this page: their listeners go straight to the old way. */
const refused = new Set<string>()

function startFallback(l: Listener) {
  if (l.closeFallback) return
  try {
    l.closeFallback = l.fallback() || (() => {})
  } catch {
    l.closeFallback = () => {}
  }
}

function giveUp(userId: string, j: Joined) {
  if (j.mode === "fallback") return
  j.mode = "fallback"
  refused.add(userId)
  if (j.channel) void Promise.resolve(j.client.removeChannel(j.channel)).catch(() => {})
  j.channel = null
  for (const l of j.refs) startFallback(l)
}

async function open(userId: string, j: Joined) {
  try {
    /* The join carries the signed in token, or it goes as a visitor and is refused. */
    try {
      await j.client.realtime.setAuth()
    } catch {
      /* The join goes as it would have. */
    }
    if (j.closed) return
    const ch = j.client
      .channel(ownTopic(userId), { config: { private: true } })
      .on("broadcast", { event: "*" }, (msg: { event?: string; payload?: OwnPayload }) => {
        const ev = String(msg?.event ?? "").toLowerCase()
        for (const l of j.refs) {
          if (l.event !== ev) continue
          try {
            l.on(msg?.payload ?? {})
          } catch {
            /* One listener's mistake does not stop the others. */
          }
        }
      })
    j.channel = ch
    ch.subscribe((status: string) => {
      if (j.closed) return
      if (status === "SUBSCRIBED") j.mode = "broadcast"
      else if ((status === "CHANNEL_ERROR" || status === "TIMED_OUT") && j.mode === "joining") giveUp(userId, j)
    })
  } catch {
    giveUp(userId, j)
  }
}

/**
 * Hears `event` on this person's own topic. `fallback` opens the old
 * subscription and answers how to close it; it runs only if the topic is
 * refused (part 370 not run). Returns the way to stop.
 */
export function listenOwn(client: BrowserSupabase, userId: string, event: OwnEvent, on: (payload: OwnPayload) => void, fallback: () => (() => void) | void): () => void {
  const l: Listener = { event, on, fallback }
  let j = joined.get(userId)
  if (!j) {
    j = { refs: new Set(), client, channel: null, mode: refused.has(userId) ? "fallback" : "joining", closed: false }
    joined.set(userId, j)
    if (j.mode === "joining") void open(userId, j)
  }
  j.refs.add(l)
  if (j.mode === "fallback") startFallback(l)
  const entry = j
  return () => {
    entry.refs.delete(l)
    try {
      if (l.closeFallback) l.closeFallback()
    } catch {
      /* already gone */
    }
    if (entry.refs.size > 0) return
    entry.closed = true
    joined.delete(userId)
    if (entry.channel) void Promise.resolve(entry.client.removeChannel(entry.channel)).catch(() => {})
  }
}

/** For the tests: forget what this page learned. */
export function forgetOwnTopics(): void {
  joined.clear()
  refused.clear()
}
