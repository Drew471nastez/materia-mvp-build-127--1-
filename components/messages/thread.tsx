"use client"

import { Fragment, useCallback, useEffect, useRef, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, BadgeCheck, Check, CheckCheck, Send, X } from "lucide-react"
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
  /** Set the moment the other side opens the thread — GET marks every message
   *  they hadn't read. Null on a message of theirs simply means we are the ones
   *  who haven't read it yet, which is not worth saying on screen. */
  read_at: string | null
}

type Thread = {
  id: string
  youAre: "buyer" | "seller"
  me: string
  listing: { id: string; title: string; slug: string; thumbnail_url: string | null; price_cents: number; status: string } | null
  other: { id: string; display_name: string | null; username: string | null; avatar_url: string | null } | null
  // The other party is Storelib: verified, and writing about no listing.
  official?: boolean
  messages: Msg[]
}

// A conversation refreshes on a timer because there is no socket behind it, so
// the interval is the entire cost of having a thread open. Five seconds meant a
// reader who left the tab open overnight spent the night asking; fifteen still
// feels live in a conversation people type into, at a third of the traffic.
const POLL_MS = 15000

/**
 * How close together two messages from the same person have to be before they
 * stop being two arrivals and become one thing said in two breaths. Four
 * minutes is the window most chat apps settle on: long enough that a fast
 * back-and-forth reads as one paragraph, short enough that picking a
 * conversation back up after lunch still looks like picking it back up.
 */
const GROUP_MS = 4 * 60 * 1000

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  )
}

/** "Astăzi" / "Ieri" / "12 martie" — and the year only once it stops being
 *  obvious, because a date that says 2026 in 2026 is noise. */
function dayLabel(d: Date): string {
  const now = new Date()
  if (sameDay(d, now)) return "Astăzi"
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (sameDay(d, yesterday)) return "Ieri"
  return d.toLocaleDateString(
    "ro-RO",
    d.getFullYear() === now.getFullYear()
      ? { day: "numeric", month: "long" }
      : { day: "numeric", month: "long", year: "numeric" },
  )
}

function timeLabel(d: Date): string {
  return d.toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit" })
}

/**
 * One conversation: the listing it is about pinned on top, the exchange below,
 * a composer at the bottom. Offers are structured bubbles rather than text —
 * they carry state, and the state carries actions: the counterparty can accept
 * or decline a pending one, and an accepted one becomes the buyer's way into
 * checkout at the agreed price.
 */
export function MessageThread({ id, initial = null }: { id: string; initial?: Thread | null }) {
  const { formatPrice } = useLocale()
  const router = useRouter()
  // Born with the conversation in it. The server read it in the same request
  // that rendered this page, so there is no skeleton, no fetch-on-mount and no
  // second arrival — see app/(marketing)/messages/[id]/page.tsx.
  const [thread, setThread] = useState<Thread | null>(initial)
  const [failed, setFailed] = useState(false)
  const [draft, setDraft] = useState("")
  const [sending, setSending] = useState(false)
  const [answering, setAnswering] = useState<string | null>(null)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const stickBottom = useRef(true)

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/messages/${id}`, { credentials: "include" })
      // 401 is the server saying there is no session; 503 is the server saying
      // it could not tell. Only the first is grounds for sending someone to the
      // login page — bouncing them on the second would turn a passing auth
      // hiccup into a logout for everyone with a thread open.
      if (r.status === 401) {
        router.replace(`/login?next=${encodeURIComponent(`/messages/${id}`)}`)
        return
      }
      if (r.status === 503) return
      if (!r.ok) {
        setFailed(true)
        return
      }
      setThread(await r.json())
    } catch {
      /* transient — the next poll retries */
    }
  }, [id, router])

  // Poll only while the thread is actually on screen. A backgrounded tab cannot
  // show a message that arrives, so asking for it is spend with nothing bought;
  // the catch-up happens in one fetch the moment the reader comes back, which is
  // the first instant the answer could matter to them.
  // Skipped exactly once, when the server already handed us the conversation.
  // Fetching it again on mount would be a second, identical read landing a few
  // hundred milliseconds after the first paint — and with it a re-render of
  // every bubble on screen, which is the flicker that made an already-rendered
  // thread look like it was still loading.
  const skipFirstLoad = useRef(initial !== null)
  useEffect(() => {
    let timer: number | undefined

    const stop = () => {
      if (timer !== undefined) {
        window.clearInterval(timer)
        timer = undefined
      }
    }
    const start = () => {
      if (timer !== undefined) return
      timer = window.setInterval(load, POLL_MS)
    }

    const sync = () => {
      if (document.visibilityState === "visible") {
        if (skipFirstLoad.current) skipFirstLoad.current = false
        else load()
        start()
      } else {
        stop()
      }
    }

    sync()
    document.addEventListener("visibilitychange", sync)
    return () => {
      document.removeEventListener("visibilitychange", sync)
      stop()
    }
  }, [load])

  // ---- The screen the keyboard leaves you ----
  //
  // A conversation is sized to what you can SEE, which on a phone is not the
  // viewport: open the keyboard and half of it is behind glass. `dvh` does not
  // help — the viewport units deliberately ignore the virtual keyboard — so a
  // column measured in them keeps its full height, the composer stays where it
  // was, underneath the keys, and the browser's only way to show you the field
  // you just tapped is to scroll the whole document. That scroll is what took
  // the header up off the top of the screen: it was never moving on its own,
  // the entire page was being pushed to reach the input.
  //
  // visualViewport reports the real thing. Its height is what is left above the
  // keyboard, and its offsetTop is how far the layout viewport has already been
  // scrolled away — both are needed, because a fixed element is anchored to the
  // layout viewport and has to be pushed back down by exactly that much to stay
  // on screen. With the two, the conversation is always precisely the visible
  // area: the header pinned to the top of it, the composer sitting on the
  // keyboard, and the messages scrolling between them. The page itself never
  // moves, which is what "like WhatsApp" means.
  const rootRef = useRef<HTMLDivElement>(null)
  const [keyboard, setKeyboard] = useState(false)
  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const vv = window.visualViewport
    const apply = () => {
      const h = Math.round(vv?.height ?? window.innerHeight)
      el.style.setProperty("--vv-h", `${h}px`)
      el.style.setProperty("--vv-top", `${Math.round(vv?.offsetTop ?? 0)}px`)
      // Anything that eats a serious fraction of the screen is the keyboard.
      // The threshold is deliberately loose — a browser toolbar collapsing is
      // 60-odd pixels, a keyboard is never less than about a quarter of the
      // screen — so a scroll-driven toolbar change cannot be mistaken for one.
      setKeyboard(window.innerHeight - h > window.innerHeight * 0.2)
    }
    apply()
    vv?.addEventListener("resize", apply)
    // The scroll listener is not optional on iOS: the page can be scrolled
    // underneath an open keyboard, and without following offsetTop the pinned
    // column drifts off the top of the screen exactly as it did before.
    vv?.addEventListener("scroll", apply)
    window.addEventListener("resize", apply)
    window.addEventListener("orientationchange", apply)
    return () => {
      vv?.removeEventListener("resize", apply)
      vv?.removeEventListener("scroll", apply)
      window.removeEventListener("resize", apply)
      window.removeEventListener("orientationchange", apply)
    }
  }, [])

  // Keep the newest message in view — but only when the reader was already at
  // the bottom. Someone scrolled up through the history has left the present,
  // and yanking them back down on every poll would make the history unreadable.
  useEffect(() => {
    const el = scrollerRef.current
    if (el && stickBottom.current) el.scrollTop = el.scrollHeight
  }, [thread?.messages.length])

  // The keyboard opening shortens the scroller under it, so whatever was at the
  // bottom is suddenly above the fold. Follow it down, for the same reason a new
  // message does: the end of the conversation is where you were looking.
  useEffect(() => {
    const el = scrollerRef.current
    if (el && stickBottom.current) el.scrollTop = el.scrollHeight
  }, [keyboard])

  // Which bubbles are new enough to be worth animating.
  //
  // Everything that was on screen when the thread arrived is history and must
  // simply be there; only what turns up afterwards — what you just sent, what
  // just came in — gets an entrance. Ids are recorded after each commit, so a
  // message animates exactly once and a re-render for any other reason cannot
  // replay the whole conversation.
  const seen = useRef<Set<string> | null>(null)
  const isFresh = useCallback((msgId: string) => seen.current !== null && !seen.current.has(msgId), [])
  useEffect(() => {
    if (seen.current === null) seen.current = new Set()
    for (const m of thread?.messages ?? []) seen.current.add(m.id)
  }, [thread?.messages])
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

  // The receipt is shown on the last thing YOU said and nowhere else. Every
  // outgoing message technically knows whether it has been read, but printing
  // that under each one turns a conversation into a delivery report — and once
  // the other person has answered, the state of everything above their answer
  // is already obvious.
  const lastMineIndex = thread
    ? thread.messages.reduce((acc, m, i) => (m.sender_id === thread.me ? i : acc), -1)
    : -1

  return (
    // Exactly the room that is left, and not a pixel more.
    //
    // This asked for a whole viewport while the layout was also stacking a
    // 63px spacer for the tab bar underneath it, so the document was always
    // taller than the screen — and that one number is every symptom at once.
    // The page scrolled when a two-message thread had nothing to scroll; the
    // header, which is `shrink-0` inside this column and therefore cannot move
    // on its own, went up under the status bar because the ENTIRE column was
    // moving; and the slack showed as white below the composer. Subtracting the
    // bar leaves the column the size of what you can actually see, so the only
    // thing that scrolls is the list of messages, which is the only thing that
    // should.
    // `.thread-shell` carries the geometry (app/globals.css): on a phone it is
    // pinned to the visible area — the one the keyboard leaves — and on a
    // desktop it goes back to being a card in the page. `data-keyboard` is how
    // the composer knows to drop the home-indicator inset, which is dead space
    // when there is a keyboard where the home indicator used to be.
    <div
      ref={rootRef}
      data-keyboard={keyboard ? "open" : undefined}
      className="thread-shell mx-auto flex max-w-2xl flex-col md:rounded-2xl md:border md:border-neutral-200"
    >
      {/* Header: who, and about what. The listing strip links back to the item,
          because "wait, how much was it again" is half of every negotiation. */}
      {/* The inset is paid here rather than by a spacer above the page, so the
          white of the header runs up behind the clock instead of leaving a
          strip of conversation showing through it. */}
      <div
        className="shrink-0 border-b border-neutral-100 bg-white/95 backdrop-blur-md"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
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
          <span className="flex min-w-0 flex-1 items-center gap-1">
            <span className="truncate text-[15.5px] font-semibold text-neutral-900">{name}</span>
            {thread?.official && <BadgeCheck className="h-4 w-4 shrink-0 text-[#1d9bf0]" />}
          </span>
        </div>
        {/* Storelib's thread has no item behind it, so the strip that would
            normally say "about this listing" has nothing to say and is gone. */}
        {thread?.listing && !thread.official && (
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

      {/* The exchange.
          `overscroll-y-contain` is what stops a two-message conversation from
          bouncing: without it the scroller chains its overscroll to the
          document, so dragging on a thread that does not scroll drags the whole
          page and reveals empty space under the composer. Contained, the drag
          simply does nothing, which is the honest answer when there is nothing
          above or below to reach. */}
      <div
        ref={scrollerRef}
        onScroll={onScroll}
        className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 py-4"
      >
        {thread === null ? (
          <div className="space-y-3">
            <div className="h-10 w-2/3 animate-pulse rounded-2xl bg-neutral-100" />
            <div className="ml-auto h-10 w-1/2 animate-pulse rounded-2xl bg-neutral-100" />
            <div className="h-10 w-1/2 animate-pulse rounded-2xl bg-neutral-100" />
          </div>
        ) : (
          // No gap on the column: the space between two messages is not one
          // number but three — a hair inside a run, a clear step between runs,
          // and a wider one around a day divider — so each row carries its own.
          <div className="flex flex-col">
            {thread.messages.map((m, i, arr) => {
              const mine = m.sender_id === thread.me
              const at = new Date(m.created_at)
              const prev = i > 0 ? arr[i - 1] : null
              const next = i + 1 < arr.length ? arr[i + 1] : null
              const prevAt = prev ? new Date(prev.created_at) : null
              const nextAt = next ? new Date(next.created_at) : null

              const opensDay = !prevAt || !sameDay(prevAt, at)

              // An offer is a card with state and actions, not a line of talk,
              // so it never joins a run in either direction: it keeps its own
              // corners, its own spacing and its own timestamp.
              const grouped =
                !!prev &&
                !!prevAt &&
                !opensDay &&
                m.kind === "text" &&
                prev.kind === "text" &&
                prev.sender_id === m.sender_id &&
                at.getTime() - prevAt.getTime() < GROUP_MS

              const endsRun =
                !next ||
                !nextAt ||
                m.kind !== "text" ||
                next.kind !== "text" ||
                next.sender_id !== m.sender_id ||
                !sameDay(at, nextAt) ||
                nextAt.getTime() - at.getTime() >= GROUP_MS

              return (
                <Fragment key={m.id}>
                  {opensDay && (
                    <div className={cn("flex justify-center", i === 0 ? "pb-3" : "py-4")}>
                      <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-[11.5px] font-semibold text-neutral-500">
                        {dayLabel(at)}
                      </span>
                    </div>
                  )}

                  <div
                    className={cn(
                      "flex flex-col",
                      mine ? "items-end" : "items-start",
                      i === 0 || opensDay ? "" : grouped ? "mt-[3px]" : "mt-3",
                      // Only what arrived after you got here. It rises from the
                      // side it belongs to, so a message you sent comes off the
                      // composer rather than materialising above it.
                      isFresh(m.id) && (mine ? "msg-in-mine" : "msg-in-theirs"),
                    )}
                  >
                    {m.kind === "offer" ? (
                      <OfferBubble
                        msg={m}
                        mine={mine}
                        youAre={thread.youAre}
                        listing={thread.listing}
                        busy={answering === m.id}
                        onAnswer={answer}
                        formatPrice={formatPrice}
                      />
                    ) : (
                      <div
                        className={cn(
                          "max-w-[78%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-[15px] leading-snug",
                          mine
                            ? "rounded-br-md bg-[#7c3aed] text-white"
                            : "rounded-bl-md bg-neutral-100 text-neutral-900",
                          // The corner facing the message above closes up when
                          // there is one, which is what makes a run read as a
                          // single block rather than a stack of separate cards.
                          grouped && (mine ? "rounded-tr-md" : "rounded-tl-md"),
                        )}
                      >
                        {m.body}
                      </div>
                    )}

                    {/* One line under the last message of a run, never under the
                        ones above it — the time a run ended is the only time
                        anyone reads, and repeating it per bubble is the noise
                        that makes a thread look like a log file. */}
                    {endsRun && (
                      <div className="mt-1 flex items-center gap-1 px-1 text-[11px] leading-none text-neutral-400">
                        <span className="tabular-nums">{timeLabel(at)}</span>
                        {mine && i === lastMineIndex && (
                          <>
                            <span aria-hidden>·</span>
                            <span
                              className={cn(
                                "flex items-center gap-0.5 font-medium",
                                m.read_at ? "text-[#7c3aed]" : "text-neutral-400",
                              )}
                            >
                              <CheckCheck className="h-3 w-3" strokeWidth={2.5} />
                              {m.read_at ? "Văzut" : "Trimis"}
                            </span>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </Fragment>
              )
            })}
          </div>
        )}
      </div>

      {/* Composer — on the bottom edge of what you can see, whatever that is.
          The home-indicator inset is real when the phone is idle and pure dead
          space the moment a keyboard covers that part of the screen, so
          `.thread-composer` drops it while one is open. */}
      <div className="thread-composer shrink-0 border-t border-neutral-100 bg-white px-3 pt-2.5">
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
