"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, Check, Send, X } from "lucide-react"
import { useLocale } from "@/components/locale-provider"
import { triggerHaptic } from "@/lib/native-bridge"
import { cn } from "@/lib/utils"

type Msg = {
  id: string
  sender_id: string
  kind: "text" | "offer"
  body: string | null
  offer_cents: number | null
  offer_status: "pending" | "accepted" | "declined" | null
  created_at: string
}

type Thread = {
  id: string
  youAre: "buyer" | "seller"
  me: string
  listing: { id: string; title: string; slug: string; thumbnail_url: string | null; price_cents: number; status: string } | null
  other: { id: string; display_name: string | null; username: string | null; avatar_url: string | null } | null
  messages: Msg[]
}

const POLL_MS = 5000

/**
 * One conversation: the listing it is about pinned on top, the exchange below,
 * a composer at the bottom. Offers are structured bubbles rather than text —
 * they carry state, and the state carries actions: the counterparty can accept
 * or decline a pending one, and an accepted one becomes the buyer's way into
 * checkout at the agreed price.
 */
export function MessageThread({ id }: { id: string }) {
  const { formatPrice } = useLocale()
  const router = useRouter()
  const [thread, setThread] = useState<Thread | null>(null)
  const [failed, setFailed] = useState(false)
  const [draft, setDraft] = useState("")
  const [sending, setSending] = useState(false)
  const [answering, setAnswering] = useState<string | null>(null)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const stickBottom = useRef(true)

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/messages/${id}`, { credentials: "include" })
      if (r.status === 401) {
        router.replace(`/login?next=${encodeURIComponent(`/messages/${id}`)}`)
        return
      }
      if (!r.ok) {
        setFailed(true)
        return
      }
      setThread(await r.json())
    } catch {
      /* transient — the next poll retries */
    }
  }, [id, router])

  useEffect(() => {
    load()
    const timer = window.setInterval(load, POLL_MS)
    return () => window.clearInterval(timer)
  }, [load])

  // Keep the newest message in view — but only when the reader was already at
  // the bottom. Someone scrolled up through the history has left the present,
  // and yanking them back down on every poll would make the history unreadable.
  useEffect(() => {
    const el = scrollerRef.current
    if (el && stickBottom.current) el.scrollTop = el.scrollHeight
  }, [thread?.messages.length])
  const onScroll = useCallback(() => {
    const el = scrollerRef.current
    if (!el) return
    stickBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }, [])

  const send = useCallback(async () => {
    const body = draft.trim()
    if (!body || sending) return
    setSending(true)
    setDraft("")
    try {
      const r = await fetch(`/api/messages/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ body }),
      })
      if (r.ok) {
        const { message } = await r.json()
        stickBottom.current = true
        setThread((t) => (t ? { ...t, messages: [...t.messages, message] } : t))
      } else {
        setDraft(body) // give the text back rather than losing it
      }
    } catch {
      setDraft(body)
    } finally {
      setSending(false)
    }
  }, [draft, id, sending])

  const answer = useCallback(
    async (messageId: string, action: "accept" | "decline") => {
      if (answering) return
      setAnswering(messageId)
      void triggerHaptic("light")
      try {
        const r = await fetch(`/api/messages/${id}/offer`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ messageId, action }),
        })
        if (r.ok) await load()
      } finally {
        setAnswering(null)
      }
    },
    [answering, id, load],
  )

  if (failed) {
    return (
      <div className="flex min-h-[50svh] flex-col items-center justify-center px-6 text-center">
        <p className="text-[15px] text-neutral-500">Conversația nu a fost găsită.</p>
        <Link href="/messages" className="mt-4 text-[15px] font-semibold text-[#7c3aed]">
          Înapoi la mesaje
        </Link>
      </div>
    )
  }

  const name = thread?.other?.display_name || thread?.other?.username || "Utilizator"

  return (
    <div className="mx-auto flex h-[calc(100dvh-0px)] max-w-2xl flex-col md:h-[calc(100vh-160px)] md:rounded-2xl md:border md:border-neutral-200">
      {/* Header: who, and about what. The listing strip links back to the item,
          because "wait, how much was it again" is half of every negotiation. */}
      <div className="shrink-0 border-b border-neutral-100 bg-white/95 backdrop-blur-md">
        <div className="flex items-center gap-2 px-2 py-2">
          <button
            type="button"
            aria-label="Înapoi"
            onClick={() => (window.history.length > 1 ? router.back() : router.push("/messages"))}
            className="flex h-10 w-10 items-center justify-center rounded-full transition-colors active:bg-neutral-100"
          >
            <ArrowLeft className="h-5 w-5 text-neutral-800" />
          </button>
          {thread?.other?.avatar_url ? (
            <Image src={thread.other.avatar_url} alt="" width={34} height={34} className="h-[34px] w-[34px] rounded-full object-cover" />
          ) : (
            <span className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-[#7c3aed]/10 text-[14px] font-semibold text-[#7c3aed]">
              {name.slice(0, 1).toUpperCase()}
            </span>
          )}
          <span className="min-w-0 flex-1 truncate text-[15.5px] font-semibold text-neutral-900">{name}</span>
        </div>
        {thread?.listing && (
          <Link
            href={`/products/${encodeURIComponent(thread.listing.slug)}?origin=messages`}
            className="flex items-center gap-3 border-t border-neutral-100 px-4 py-2.5 transition-colors active:bg-neutral-50"
          >
            {thread.listing.thumbnail_url ? (
              <Image src={thread.listing.thumbnail_url} alt="" width={40} height={40} className="h-10 w-10 rounded-lg object-cover" />
            ) : (
              <span className="h-10 w-10 rounded-lg bg-neutral-100" />
            )}
            <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-neutral-700">{thread.listing.title}</span>
            <span className="shrink-0 text-[14px] font-bold text-neutral-900">{formatPrice(thread.listing.price_cents)}</span>
          </Link>
        )}
      </div>

      {/* The exchange */}
      <div ref={scrollerRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {thread === null ? (
          <div className="space-y-3">
            <div className="h-10 w-2/3 animate-pulse rounded-2xl bg-neutral-100" />
            <div className="ml-auto h-10 w-1/2 animate-pulse rounded-2xl bg-neutral-100" />
            <div className="h-10 w-1/2 animate-pulse rounded-2xl bg-neutral-100" />
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {thread.messages.map((m) => {
              const mine = m.sender_id === thread.me
              if (m.kind === "offer") {
                return (
                  <OfferBubble
                    key={m.id}
                    msg={m}
                    mine={mine}
                    youAre={thread.youAre}
                    listing={thread.listing}
                    busy={answering === m.id}
                    onAnswer={answer}
                    formatPrice={formatPrice}
                  />
                )
              }
              return (
                <div
                  key={m.id}
                  className={cn(
                    "max-w-[78%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-[15px] leading-snug",
                    mine ? "self-end rounded-br-md bg-[#7c3aed] text-white" : "self-start rounded-bl-md bg-neutral-100 text-neutral-900",
                  )}
                >
                  {m.body}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Composer — pinned above the mobile bottom nav, flush on desktop. */}
      <div className="shrink-0 border-t border-neutral-100 bg-white px-3 pb-[calc(env(safe-area-inset-bottom,0px)+70px)] pt-2.5 md:pb-3">
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                void send()
              }
            }}
            rows={1}
            placeholder="Scrie un mesaj…"
            className="max-h-28 min-h-[44px] flex-1 resize-none rounded-3xl border border-neutral-200 bg-neutral-50 px-4 py-2.5 text-[15px] outline-none placeholder:text-neutral-400 focus:border-[#7c3aed]/50"
          />
          <button
            type="button"
            aria-label="Trimite"
            onClick={() => void send()}
            disabled={!draft.trim() || sending}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#7c3aed] text-white transition-transform active:scale-[0.93] disabled:opacity-40"
          >
            <Send className="h-[18px] w-[18px]" />
          </button>
        </div>
      </div>
    </div>
  )
}

function OfferBubble({
  msg,
  mine,
  youAre,
  listing,
  busy,
  onAnswer,
  formatPrice,
}: {
  msg: Msg
  mine: boolean
  youAre: "buyer" | "seller"
  listing: Thread["listing"]
  busy: boolean
  onAnswer: (id: string, action: "accept" | "decline") => void
  formatPrice: (cents: number) => string
}) {
  const status = msg.offer_status
  return (
    <div
      className={cn(
        "max-w-[82%] rounded-2xl border p-3.5",
        mine ? "self-end rounded-br-md" : "self-start rounded-bl-md",
        status === "accepted" ? "border-emerald-200 bg-emerald-50" : status === "declined" ? "border-neutral-200 bg-neutral-50" : "border-[#7c3aed]/30 bg-[#7c3aed]/[0.06]",
      )}
    >
      <p className="text-[12.5px] font-medium text-neutral-500">{mine ? "Oferta ta" : "Ofertă primită"}</p>
      <p className="mt-0.5 text-[22px] font-bold leading-tight text-neutral-900">{formatPrice(msg.offer_cents ?? 0)}</p>
      {msg.body && <p className="mt-1 text-[14px] text-neutral-700">{msg.body}</p>}

      {status === "pending" && !mine && (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => onAnswer(msg.id, "accept")}
            className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full bg-[#7c3aed] text-[14px] font-semibold text-white transition-transform active:scale-[0.97] disabled:opacity-50"
          >
            <Check className="h-4 w-4" strokeWidth={3} /> Acceptă
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onAnswer(msg.id, "decline")}
            className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full border border-neutral-300 text-[14px] font-semibold text-neutral-700 transition-transform active:scale-[0.97] disabled:opacity-50"
          >
            <X className="h-4 w-4" strokeWidth={3} /> Refuză
          </button>
        </div>
      )}
      {status === "pending" && mine && <p className="mt-1.5 text-[12.5px] text-neutral-500">În așteptare…</p>}
      {status === "declined" && <p className="mt-1.5 text-[12.5px] font-medium text-neutral-500">Refuzată</p>}
      {status === "accepted" && (
        <>
          <p className="mt-1.5 flex items-center gap-1 text-[12.5px] font-semibold text-emerald-700">
            <Check className="h-3.5 w-3.5" strokeWidth={3} /> Acceptată
          </p>
          {/* The agreed price only helps the person paying it. */}
          {youAre === "buyer" && listing && listing.status === "published" && (
            <Link
              href={`/checkout?productId=${listing.id}&offerId=${msg.id}`}
              className="mt-2.5 flex h-10 items-center justify-center rounded-full bg-emerald-600 px-4 text-[14px] font-semibold text-white transition-transform active:scale-[0.97]"
            >
              Cumpără la {formatPrice(msg.offer_cents ?? 0)}
            </Link>
          )}
        </>
      )}
    </div>
  )
}
