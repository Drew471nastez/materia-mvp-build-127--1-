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
import type { ChatLine } from "./view-types"
import { api } from "./api"
import { realtimeAuth } from "./realtime"

export type ChatItem = ChatLine & {
  state?: SendState
  error?: string
  /** What the send carried, for a retry. */
  sendBody?: Record<string, unknown>
}

/* ── The last page of each chat, for the life of the tab ───────────────── */

const PAGES = new Map<string, { messages: ChatItem[]; hasMore: boolean; at: number }>()

export function cachedPage(key: string): { messages: ChatItem[]; hasMore: boolean } | null {
  const hit = PAGES.get(key)
  return hit ? { messages: hit.messages, hasMore: hit.hasMore } : null
}

export function keepPage(key: string, messages: ChatItem[], hasMore: boolean): void {
  /* The newest 60 settled messages: enough for the first screen, small enough to keep many. */
  const settled = messages.filter((m) => !m.state).slice(-60)
  PAGES.set(key, { messages: settled, hasMore: hasMore || settled.length < messages.filter((m) => !m.state).length, at: Date.now() })
  if (PAGES.size > 40) {
    const oldest = [...PAGES.entries()].sort((a, b) => a[1].at - b[1].at)[0]
    if (oldest) PAGES.delete(oldest[0])
  }
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

export function clockOf(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
}

export function dayLabelOf(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  const key = (x: Date) => `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`
  if (key(d) === key(today)) return "Today"
  if (key(d) === key(new Date(Date.now() - 86_400_000))) return "Yesterday"
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric", ...(d.getFullYear() !== today.getFullYear() ? { year: "numeric" } : {}) })
}
