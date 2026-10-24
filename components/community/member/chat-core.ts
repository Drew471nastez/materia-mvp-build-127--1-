"use client"

/**
 * ===========================================================================
 *  WHAT EVERY CHAT SCREEN SHARES, IN THE BROWSER (round 37)
 * ===========================================================================
 * A channel (chat.tsx), a conversation and a group (messages.tsx) are drawn
 * by one screen (chat-surface.tsx). These are its parts that are not
 * drawing:
 *
 *   useTyping       "Ana is typing", over a private realtime broadcast
 *                   channel per chat (chat:<kind>:<id>), which part 270's
 *                   policy on realtime.messages opens only to people who may
 *                   read the chat. Nothing is stored. Without the policy the
 *                   join is refused and nobody is shown typing; messages
 *                   still arrive.
 *   useViewingBeat  while the chat is on screen, its read mark is renewed
 *                   every 20 seconds, which is how the server knows not to
 *                   push to a phone what is already on the screen
 *                   (lib/communities/chat-rules.ts VIEWING_MS)
 *   cache           the last page of each chat this tab opened, so going
 *                   back to a chat draws it at once and asks the server
 *                   for what changed
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { VIEWING_BEAT_MS, typingTopic, type ChatKind, type SendState } from "@/lib/communities/chat-rules"
import type { PostMedia } from "@/lib/communities/types"
import type { ChatLine } from "./view-types"
import { api } from "./api"
import { realtimeAuth } from "./realtime"

export type ChatItem = ChatLine & {
  state?: SendState
  error?: string
  /** What the send carried, for a retry. */
  sendBody?: Record<string, unknown>
  /** Round 39: sent while its pictures or files were going up; their answers (again: each failed one uploaded once more), null while any is missing. */
  upload?: (again: boolean) => Promise<PostMedia[] | null>
}

/*
  ===========================================================================
   THE LAST PAGE OF EACH CHAT, KEPT, AND ASKED FOR BEFORE IT IS OPENED (round 38)
  ===========================================================================
  The owner: "when I get inside of a conversation it takes too much to load, it shows that iOS-style loading thing".
  A conversation and a group were read from the server every time they opened, with the spinner in their place
  meanwhile (measured: 400ms at a 300ms server, 1000ms on a slow phone, scripts/check-community-chat-r38.mjs). Now:

    KEPT        the newest messages of every chat this tab opened, in memory and in the tab's sessionStorage (the
                newest 40, 24 chats, under the signed in member's id, so somebody else signing in on the same tab
                never reads them), drawn the moment the chat opens; the server is asked for what changed behind it.
    ASKED EARLY the list asks for its top rows as it is drawn, and for any row the pointer rests on or a finger
                touches (prefetchPage); opening one then finds it here, or finds the ask already on its way and waits
                for that one instead of asking twice.
    COLD        a chat never opened and never asked for draws skeleton bubbles, the shape of a few messages, at the
                foot of the list where the messages will be: no spinner.
*/

export interface KeptPage {
  messages: ChatItem[]
  hasMore: boolean
  /** What the list's answer said besides its messages (a conversation's otherReadAt). */
  extra?: Record<string, unknown>
}
export type PageAnswer = { ok: true; page: KeptPage } | { ok: false; error: string }

const PAGES = new Map<string, KeptPage & { at: number }>()
/** When the server last answered for a chat, by its key. */
const FRESH = new Map<string, number>()
const ASKING = new Map<string, Promise<PageAnswer>>()
const STORE = "storelib:chat-page:v1:"
const STORE_INDEX = "storelib:chat-page:v1"
const STORED_MESSAGES = 40
const STORED_CHATS = 24
const writing = new Map<string, number>()

/** One chat's key: whose eyes, which kind, which chat. */
export function chatCacheKey(userId: string | null | undefined, kind: ChatKind, chatId: string): string {
  return `${userId ?? "anon"}:${kind}:${chatId}`
}

function session(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage
  } catch {
    return null
  }
}

function readStored(key: string): (KeptPage & { at: number }) | null {
  try {
    const raw = session()?.getItem(STORE + key)
    if (!raw) return null
    const v = JSON.parse(raw) as KeptPage & { at: number }
    return Array.isArray(v?.messages) ? { messages: v.messages, hasMore: !!v.hasMore, extra: v.extra && typeof v.extra === "object" ? v.extra : undefined, at: Number(v.at) || 0 } : null
  } catch {
    return null
  }
}

/* Written a moment after the list settles, off the frame that drew it. */
function writeStored(key: string, page: KeptPage & { at: number }): void {
  const s = session()
  if (!s) return
  window.clearTimeout(writing.get(key))
  writing.set(
    key,
    window.setTimeout(() => {
      writing.delete(key)
      try {
        const index = (JSON.parse(s.getItem(STORE_INDEX) || "[]") as string[]).filter((k) => typeof k === "string" && k !== key)
        index.push(key)
        while (index.length > STORED_CHATS) s.removeItem(STORE + index.shift())
        s.setItem(STORE + key, JSON.stringify({ ...page, messages: page.messages.slice(-STORED_MESSAGES) }))
        s.setItem(STORE_INDEX, JSON.stringify(index))
      } catch {
        /* Full or refused: memory still has it. */
      }
    }, 400),
  )
}

export function cachedPage(key: string): KeptPage | null {
  let hit = PAGES.get(key)
  if (!hit) {
    const stored = readStored(key)
    if (stored) PAGES.set(key, (hit = stored))
  }
  return hit ? { messages: hit.messages, hasMore: hit.hasMore, extra: hit.extra } : null
}

export function keepPage(key: string, messages: ChatItem[], hasMore: boolean, extra?: Record<string, unknown>): void {
  /* The newest 60 settled messages: enough for the first screen, small enough to keep many. */
  const all = messages.filter((m) => !m.state)
  const settled = all.slice(-60)
  const page = { messages: settled, hasMore: hasMore || settled.length < all.length, extra: extra ?? PAGES.get(key)?.extra, at: Date.now() }
  PAGES.set(key, page)
  writeStored(key, page)
  if (PAGES.size > 40) {
    const oldest = [...PAGES.entries()].sort((a, b) => a[1].at - b[1].at)[0]
    if (oldest) PAGES.delete(oldest[0])
  }
}

/** Whether the server answered for this chat in the last `ms`. */
export function freshFor(key: string, ms: number): boolean {
  const at = FRESH.get(key)
  return !!at && Date.now() - at < ms
}

/**
 * The chat's newest page from the server, kept as it lands. One ask at a time per chat: a second caller (the chat
 * opening while the list's ask is on its way) gets the same answer. `force` asks even when it was answered moments ago.
 */
export function prefetchPage(key: string, url: string, opts: { force?: boolean } = {}): Promise<PageAnswer> {
  const busy = ASKING.get(key)
  if (busy) return busy
  if (!opts.force && freshFor(key, 20_000)) {
    const page = cachedPage(key)
    if (page) return Promise.resolve({ ok: true, page })
  }
  const ask = api<{ messages: ChatLine[]; hasMore: boolean } & Record<string, unknown>>(url).then((r): PageAnswer => {
    ASKING.delete(key)
    if (!r.ok) return { ok: false, error: r.error }
    const { messages, hasMore, ...extra } = r.data
    FRESH.set(key, Date.now())
    keepPage(key, messages, !!hasMore, extra)
    return { ok: true, page: { messages, hasMore: !!hasMore, extra } }
  })
  ASKING.set(key, ask)
  return ask
}

/** A chat's newest page that came with another answer (round 39: a conversation opened or found ahead), kept as if it had been asked for. */
export function keepAnswered(key: string, raw: unknown): void {
  if (!raw || typeof raw !== "object") return
  const { messages, hasMore, ...extra } = raw as { messages?: unknown; hasMore?: unknown } & Record<string, unknown>
  if (!Array.isArray(messages)) return
  FRESH.set(key, Date.now())
  keepPage(key, messages as ChatLine[], !!hasMore, extra)
}

/** The kept chat's newest settled message time, to tell whether a list row has moved past what is kept. */
export function keptNewest(key: string): string | null {
  const page = cachedPage(key)
  return page?.messages.length ? page.messages[page.messages.length - 1].createdAt : null
}

/**
 * ASK FOR A ROW BEFORE IT IS OPENED: the pointer resting on it, a finger touching it, or it being one of the first
 * rows drawn. Not when the kept page already holds the row's newest message (`lastAt`): opening it draws that, and
 * asks for what changed behind it.
 */
export function warmChat(key: string, url: string, lastAt: string | null): void {
  const newest = keptNewest(key)
  if (newest && lastAt && Date.parse(newest) >= Date.parse(lastAt)) return
  void prefetchPage(key, url)
}

/* ── Small kept answers, by key, for the life of the tab ───────────────── */

const KEPT = new Map<string, unknown>()

/** What was last read for `key` (a chat's mute switch, the chat's rules and names), or null. */
export function keptValue<T>(key: string): T | null {
  return (KEPT.get(key) as T | undefined) ?? null
}

export function keepValue<T>(key: string, value: T): void {
  KEPT.set(key, value)
}

/* The list of conversations, per community and member: in memory and in the tab's sessionStorage. */
const LIST = "storelib:chat-list:v1:"

export function keptList<T>(communityId: string, userId: string | null): T | null {
  const key = `${communityId}:${userId ?? "anon"}`
  const hit = keptValue<T>(`list:${key}`)
  if (hit) return hit
  try {
    const raw = session()?.getItem(LIST + key)
    const v = raw ? (JSON.parse(raw) as T) : null
    if (v) keepValue(`list:${key}`, v)
    return v
  } catch {
    return null
  }
}

export function keepList<T>(communityId: string, userId: string | null, value: T): void {
  const key = `${communityId}:${userId ?? "anon"}`
  keepValue(`list:${key}`, value)
  const s = session()
  if (!s) return
  window.clearTimeout(writing.get(LIST + key))
  writing.set(
    LIST + key,
    window.setTimeout(() => {
      try {
        s.setItem(LIST + key, JSON.stringify(value))
      } catch {
        /* Memory still has it. */
      }
    }, 300),
  )
}

/* ── Typing ─────────────────────────────────────────────────────────────── */

const TYPING_SEND_MS = 2500
const TYPING_SHOW_MS = 5000

export function useTyping(kind: ChatKind, chatId: string, me: { id: string; name: string } | null): { names: string[]; ping: () => void; stop: () => void } {
  const [names, setNames] = useState<{ id: string; name: string; until: number }[]>([])
  const send = useRef<((payload: Record<string, unknown>) => void) | null>(null)
  const last = useRef(0)
  const meRef = useRef(me)
  meRef.current = me

  useEffect(() => {
    if (!me?.id) return
    let gone = false
    let supabase: ReturnType<typeof createClient> | null = null
    let channel: ReturnType<ReturnType<typeof createClient>["channel"]> | null = null
    void (async () => {
      try {
        supabase = createClient()
        await realtimeAuth(supabase)
        if (gone) return
        channel = supabase
          .channel(typingTopic(kind, chatId), { config: { private: true, broadcast: { self: false } } })
          .on("broadcast", { event: "typing" }, (msg: { payload?: { id?: unknown; name?: unknown; on?: unknown } }) => {
            const p = msg.payload ?? {}
            if (typeof p.id !== "string" || p.id === meRef.current?.id) return
            const id = p.id
            const name = typeof p.name === "string" ? p.name.slice(0, 40) : "Someone"
            setNames((cur) => {
              const rest = cur.filter((x) => x.id !== id)
              return p.on === false ? rest : [...rest, { id, name, until: Date.now() + TYPING_SHOW_MS }]
            })
          })
          .subscribe((status: string) => {
            if (status !== "SUBSCRIBED" || !channel) return
            const ch = channel
            send.current = (payload) => void ch.send({ type: "broadcast", event: "typing", payload }).catch(() => {})
          })
      } catch {
        /* No typing here: nothing is shown. */
      }
    })()
    const sweep = window.setInterval(() => setNames((cur) => (cur.some((x) => x.until < Date.now()) ? cur.filter((x) => x.until >= Date.now()) : cur)), 1000)
    return () => {
      gone = true
      send.current = null
      window.clearInterval(sweep)
      if (supabase && channel) supabase.removeChannel(channel)
    }
  }, [kind, chatId, me?.id])

  const ping = useCallback(() => {
    const now = Date.now()
    if (now - last.current < TYPING_SEND_MS || !meRef.current) return
    last.current = now
    send.current?.({ id: meRef.current.id, name: meRef.current.name.split(" ")[0], on: true })
  }, [])
  const stop = useCallback(() => {
    if (!last.current || !meRef.current) return
    last.current = 0
    send.current?.({ id: meRef.current.id, on: false })
  }, [])
  return { names: names.map((n) => n.name), ping, stop }
}

/* ── The read mark, renewed while the chat is on screen ────────────────── */

export function useViewingBeat(readUrl: string | null, onRead?: () => void): () => void {
  const lastAt = useRef(0)
  const onReadRef = useRef(onRead)
  onReadRef.current = onRead
  const mark = useCallback(
    (force = false) => {
      if (!readUrl || document.visibilityState !== "visible") return
      const now = Date.now()
      if (!force && now - lastAt.current < 3000) return
      lastAt.current = now
      void api(readUrl, { method: "POST" }).then((r) => {
        if (r.ok) onReadRef.current?.()
      })
    },
    [readUrl],
  )
  useEffect(() => {
    if (!readUrl) return
    mark(true)
    const beat = window.setInterval(() => mark(true), VIEWING_BEAT_MS)
    const onVisible = () => document.visibilityState === "visible" && mark(true)
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      window.clearInterval(beat)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [readUrl, mark])
  return useCallback(() => mark(false), [mark])
}

/* ── Small words ───────────────────────────────────────────────────────── */

/*
  A time in the reader's own zone is written after the first paint of a page the server drew (the server does not
  know the zone, and the two must match). A chat drawn once the page is up (every conversation in the Messages
  panel) writes it in its first render instead: one render per bubble, not two, on the frame it opens.
*/
let pageUp = false
export function chatPageUp(): boolean {
  return pageUp
}
export function markChatPageUp(): void {
  pageUp = true
}

/*
  One formatter for every bubble (round 38): toLocaleTimeString builds a new one per call, and a chat opening drew
  fifty of them in its first frame (measured, 106 to 145ms of a slow phone's opening, scripts/check-community-chat-r38.mjs).
*/
let CLOCK: Intl.DateTimeFormat | null = null
export function clockOf(iso: string): string {
  CLOCK ??= new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" })
  return CLOCK.format(new Date(iso))
}

export function dayLabelOf(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  const key = (x: Date) => `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`
  if (key(d) === key(today)) return "Today"
  if (key(d) === key(new Date(Date.now() - 86_400_000))) return "Yesterday"
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric", ...(d.getFullYear() !== today.getFullYear() ? { year: "numeric" } : {}) })
}
