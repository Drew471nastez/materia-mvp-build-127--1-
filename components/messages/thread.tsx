"use client"

import { Fragment, useCallback, useEffect, useRef, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, BadgeCheck, Check, CheckCheck, ImageIcon, Info, ImagePlus, Send, X } from "lucide-react"
import { useLocale } from "@/components/locale-provider"
import { IosSpinner } from "@/components/explore/ios-spinner"
import { ThreadDetails } from "@/components/messages/thread-details"
import { useFeedPullRefresh } from "@/hooks/use-feed-pull-refresh"
import { shrinkImage } from "@/lib/messages/shrink-image"
import { navigateBlended } from "@/lib/nav-blend"
import { triggerHaptic } from "@/lib/native-bridge"
import { cn } from "@/lib/utils"

type Msg = {
  id: string
  sender_id: string
  kind: "text" | "offer" | "image"
  body: string | null
  /** Signed and short-lived by the time it reaches here — what is stored is an
   *  object path in a private bucket. On an optimistic bubble it is a local
   *  blob: URL, so the photo is on screen before it has left the phone. */
  image_url?: string | null
  offer_cents: number | null
  offer_status: "pending" | "accepted" | "declined" | null
  created_at: string
  /** Set the moment the other side opens the thread — GET marks every message
   *  they hadn't read. Null on a message of theirs simply means we are the ones
   *  who haven't read it yet, which is not worth saying on screen. */
  read_at: string | null
  /** On screen, not yet on the server. Local only — never comes back from an
   *  API, and is gone the moment the real row replaces it. */
  pending?: boolean
}

/** Ids for messages that exist only on this screen so far. */
let tempSeq = 0
const nextTempId = () => `tmp-${++tempSeq}`

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

/**
 * What people actually open a marketplace chat to ask, in the order they ask it.
 * Offered rather than sent — tapping one fills the field so it can be edited,
 * which is the difference between a suggestion and a canned message.
 */
const STARTERS = [
  "Bună! Mai este disponibil?",
  "Poți trimite mai multe poze?",
  "Ce măsură este exact?",
  "Accepți o ofertă?",
] as const

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
  const [imageError, setImageError] = useState<string | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
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
      const fresh: Thread = await r.json()
      // A poll must never eat a message that is still in flight. The server's
      // copy of the thread does not contain it yet by definition, so replacing
      // wholesale would make what you just sent vanish for the rest of the round
      // trip and then reappear — which looks exactly like a message failing.
      setThread((prev) => {
        const inFlight = prev?.messages.filter((m) => m.pending) ?? []
        return inFlight.length ? { ...fresh, messages: [...fresh.messages, ...inFlight] } : fresh
      })
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
  // The numbers themselves are published once, from the root, so this screen and
  // the skeleton that preceded it are sized identically — see
  // components/viewport-vars.tsx. All this has to do is follow them down.

  // Keep the newest message in view — but only when the reader was already at
  // the bottom. Someone scrolled up through the history has left the present,
  // and yanking them back down on every poll would make the history unreadable.
  //
  // The FIRST landing is instant, because there is no "movement" from a screen
  // that has not been seen yet — animating it would be the conversation
  // visibly scrolling itself on arrival. Everything after that glides, which is
  // what makes sending feel like the thread makes room for your message rather
  // than teleporting to it.
  const landed = useRef(false)
  useEffect(() => {
    const el = scrollerRef.current
    if (!el || !stickBottom.current) return
    if (!landed.current) {
      landed.current = true
      el.scrollTop = el.scrollHeight
      return
    }
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" })
  }, [thread?.messages.length])

  // The keyboard opening shortens the scroller under it, so whatever was at the
  // bottom is suddenly above the fold. Follow it down, for the same reason a new
  // message does: the end of the conversation is where you were looking.
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const follow = () => {
      const el = scrollerRef.current
      if (el && stickBottom.current) el.scrollTop = el.scrollHeight
    }
    vv.addEventListener("resize", follow)
    return () => vv.removeEventListener("resize", follow)
  }, [])

  // The field grows with what you write, up to four lines, then scrolls.
  //
  // `rows={1}` with a max height is a box that never changes size: type a
  // paragraph and it scrolls inside 44px, so you can see one line of your own
  // message while writing it. Height is reset to auto before it is read, because
  // scrollHeight of an element with an explicit height is that height — without
  // the reset the field can only ever grow, never shrink back when you delete.
  const fieldRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const el = fieldRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, 112)}px`
  }, [draft])

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

  // Pull down at the top of the conversation to ask for it again, rather than
  // waiting out the poll. The same hook the grid uses, so it is the same
  // gesture everywhere in the app.
  const listRef = useRef<HTMLDivElement>(null)
  const spinnerRef = useRef<HTMLDivElement>(null)
  useFeedPullRefresh({
    scrollRef: scrollerRef,
    contentRef: listRef,
    spinnerRef,
    onRefresh: load,
    enabled: true,
  })

  // Sending puts the message on screen NOW.
  //
  // It used to wait for the round trip: you tapped send, the field emptied, and
  // for as long as the request took there was no message anywhere — the thing
  // you had just written had simply vanished. On anything less than perfect
  // signal that is several seconds of wondering whether it worked. The bubble
  // is drawn immediately and marked pending, the server's real row replaces it
  // when it lands, and a failure puts the text back in the field where you can
  // see it. Nothing is ever silently lost, and the common case — it works —
  // feels instant because it is.
  const send = useCallback(async () => {
    const body = draft.trim()
    if (!body || sending) return
    const tempId = nextTempId()
    setSending(true)
    setDraft("")
    stickBottom.current = true
    setThread((t) =>
      t
        ? {
            ...t,
            messages: [
              ...t.messages,
              {
                id: tempId,
                sender_id: t.me,
                kind: "text",
                body,
                offer_cents: null,
                offer_status: null,
                created_at: new Date().toISOString(),
                read_at: null,
                pending: true,
              },
            ],
          }
        : t,
    )
    try {
      const r = await fetch(`/api/messages/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ body }),
      })
      if (r.ok) {
        const { message } = await r.json()
        // The real id is recorded as already-seen in the same breath as the
        // swap, or the bubble would count as new and play its entrance a second
        // time — the same message animating twice for one send.
        seen.current?.add(message.id)
        stickBottom.current = true
        setThread((t) =>
          t ? { ...t, messages: t.messages.map((m) => (m.id === tempId ? message : m)) } : t,
        )
      } else {
        setThread((t) => (t ? { ...t, messages: t.messages.filter((m) => m.id !== tempId) } : t))
        setDraft(body) // give the text back rather than losing it
      }
    } catch {
      setThread((t) => (t ? { ...t, messages: t.messages.filter((m) => m.id !== tempId) } : t))
      setDraft(body)
    } finally {
      setSending(false)
    }
  }, [draft, id, sending])

  // Sending a photo, the same way as sending words: on screen first.
  //
  // The optimistic bubble carries a blob: URL of the file the user just picked,
  // so the picture they chose is in the conversation before a single byte has
  // left the phone. When the server answers with the real row — and a signed
  // link for it — the two are swapped and the object URL is revoked, because a
  // blob held past its usefulness is the file kept in memory for the life of
  // the tab.
  const sendImage = useCallback(
    async (file: File) => {
      if (!file || sending) return
      const tempId = nextTempId()
      const localUrl = URL.createObjectURL(file)
      setSending(true)
      void triggerHaptic("light")
      stickBottom.current = true
      setThread((t) =>
        t
          ? {
              ...t,
              messages: [
                ...t.messages,
                {
                  id: tempId,
                  sender_id: t.me,
                  kind: "image",
                  body: null,
                  image_url: localUrl,
                  offer_cents: null,
                  offer_status: null,
                  created_at: new Date().toISOString(),
                  read_at: null,
                  pending: true,
                },
              ],
            }
          : t,
      )
      try {
        // Resized on the device before it goes anywhere. A phone photo is four
        // megabytes and four thousand pixels wide, and it is going into a bubble
        // a few hundred pixels across — sending the original is several seconds
        // of waiting for detail nobody can see. See lib/messages/shrink-image.
        const small = await shrinkImage(file)
        const form = new FormData()
        form.append("file", small)
        const r = await fetch(`/api/messages/${id}/image`, {
          method: "POST",
          credentials: "include",
          body: form,
        })
        if (r.ok) {
          const { message } = await r.json()
          seen.current?.add(message.id)
          stickBottom.current = true
          setThread((t) =>
            t ? { ...t, messages: t.messages.map((m) => (m.id === tempId ? message : m)) } : t,
          )
        } else {
          const { error } = await r.json().catch(() => ({ error: null }))
          setThread((t) => (t ? { ...t, messages: t.messages.filter((m) => m.id !== tempId) } : t))
          setImageError(error || "Fotografia nu a putut fi trimisă")
        }
      } catch {
        setThread((t) => (t ? { ...t, messages: t.messages.filter((m) => m.id !== tempId) } : t))
        setImageError("Fotografia nu a putut fi trimisă")
      } finally {
        // Revoked either way: on success the bubble now points at the signed
        // URL, on failure there is no bubble left to point at anything.
        URL.revokeObjectURL(localUrl)
        setSending(false)
      }
    },
    [id, sending],
  )

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
    <div className="thread-shell mx-auto flex max-w-2xl flex-col md:rounded-2xl md:border md:border-neutral-200">
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
            // A pop, announced as one: the hint on <html> is what tells the
            // inbox it is being returned to rather than opened, so it comes
            // forward under a lifting veil instead of simply being there. Same
            // gesture as coming back from a listing, because it is one.
            onClick={() => {
              void triggerHaptic("light")
              navigateBlended("back", () =>
                window.history.length > 1 ? router.back() : router.push("/messages"),
              )
            }}
            className="flex h-10 w-10 items-center justify-center rounded-full transition-colors active:bg-neutral-100"
          >
            <ArrowLeft className="h-5 w-5 text-neutral-800" />
          </button>
          {/* The person, not just their name. Tapping who you are talking to and
              landing on their profile is the first thing anyone tries on a
              marketplace — you are about to send them money, and "who is this"
              is a fair question. Storelib has no member page, so there it stays
              a plain avatar rather than a link that goes nowhere. */}
          <PartyLink username={thread?.other?.username} official={thread?.official}>
            {thread?.other?.avatar_url ? (
              <Image src={thread.other.avatar_url} alt="" width={34} height={34} className="h-[34px] w-[34px] rounded-full object-cover" />
            ) : (
              <span className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-[#7c3aed]/10 text-[14px] font-semibold text-[#7c3aed]">
                {name.slice(0, 1).toUpperCase()}
              </span>
            )}
          </PartyLink>
          <PartyLink username={thread?.other?.username} official={thread?.official} className="min-w-0 flex-1">
            <span className="flex min-w-0 items-center gap-1">
              <span className="truncate text-[15.5px] font-semibold text-neutral-900">{name}</span>
              {thread?.official && <BadgeCheck className="h-4 w-4 shrink-0 text-[#1d9bf0]" />}
            </span>
          </PartyLink>
          {/* Everything you might want to DO about this conversation, behind one
              button, because none of it belongs in the header itself: a row of
              icons for report and block turns a conversation with a person into
              a moderation console. */}
          <button
            type="button"
            aria-label="Detalii conversație"
            onClick={() => {
              void triggerHaptic("light")
              setDetailsOpen(true)
            }}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-neutral-500 transition-colors active:bg-neutral-100"
          >
            <Info className="h-[21px] w-[21px]" />
          </button>
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
      <div className="relative min-h-0 flex-1">
        {/* The same pull the grid and the inbox have. A conversation polls every
            fifteen seconds, which is fine when you are reading and useless when
            you are waiting — this is how you ask. Parked above the frame and
            clipped, so it only exists while you are pulling. */}
        <div
          ref={spinnerRef}
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center"
          style={{ transform: "translate3d(0, -40px, 0)", opacity: 0 }}
        >
          <IosSpinner size={22} />
        </div>
      <div
        ref={scrollerRef}
        onScroll={onScroll}
        className="absolute inset-0 overflow-y-auto overscroll-y-contain px-4 py-4"
      >
        {/* The exchange arrives as one thing.
            The skeleton before this is four grey bars; this is the real
            conversation. Swapped hard, that is a visible substitution no matter
            how well the boxes line up — so the column resolves in over a fifth
            of a second and the handover reads as the placeholder becoming the
            content. One element, opacity and transform, on white. */}
        <div ref={listRef} className="thread-reveal" style={{ transform: "translate3d(0, 0, 0)" }}>
        {thread === null ? (
          <div className="space-y-3">
            <div className="h-10 w-2/3 animate-pulse rounded-2xl bg-neutral-100" />
            <div className="ml-auto h-10 w-1/2 animate-pulse rounded-2xl bg-neutral-100" />
            <div className="h-10 w-1/2 animate-pulse rounded-2xl bg-neutral-100" />
          </div>
        ) : thread.messages.length === 0 ? (
          // A conversation opened from a listing starts empty, and an empty
          // white screen with a keyboard under it is the least helpful thing
          // this page could do with the moment. The questions below are the ones
          // actually asked on a second-hand marketplace, in the order they get
          // asked — tapping one puts it in the field rather than sending it, so
          // it is a starting point you can edit and not a canned message.
          <div className="flex h-full flex-col items-center justify-center px-2 text-center">
            <p className="text-[15px] font-semibold text-neutral-900">
              {thread.listing ? "Întreabă despre acest articol" : `Scrie-i lui ${name}`}
            </p>
            <p className="mt-1 max-w-[280px] text-[13.5px] leading-snug text-neutral-500">
              {thread.listing
                ? "Vânzătorul vede articolul de mai sus, așa că nu trebuie să spui despre care e vorba."
                : "Mesajele tale apar aici."}
            </p>
            {thread.listing && (
              <div className="mt-5 flex w-full max-w-[320px] flex-col gap-2">
                {STARTERS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => {
                      void triggerHaptic("light")
                      setDraft(q)
                      fieldRef.current?.focus()
                    }}
                    className="rounded-full border border-neutral-200 px-4 py-2.5 text-[14px] font-medium text-neutral-700 transition-[transform,background-color] duration-200 active:scale-[0.98] active:bg-neutral-50"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
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
                    ) : m.kind === "image" ? (
                      <div
                        className={cn(
                          "relative max-w-[62%] overflow-hidden rounded-2xl bg-neutral-100",
                          mine ? "rounded-br-md" : "rounded-bl-md",
                        )}
                      >
                        {m.image_url ? (
                          // A plain img, not next/image: the src is a signed URL
                          // that expires, so it is neither cacheable by the
                          // optimizer nor stable enough to be worth optimising.
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={m.image_url}
                            alt={m.body || "Fotografie"}
                            className={cn(
                              "block max-h-[260px] w-full object-cover transition-[filter,opacity] duration-[320ms] ease-[cubic-bezier(0.32,0.06,0.16,1)]",
                              // While it is going up it is dimmed and softened,
                              // and it resolves to the real thing the moment the
                              // server answers. Two properties, both composited,
                              // on one element — the photo is never replaced,
                              // only sharpened, so there is nothing to flash.
                              m.pending && "scale-[1.02] opacity-60 blur-[2px]",
                            )}
                            draggable={false}
                          />
                        ) : (
                          <div className="flex h-40 w-56 items-center justify-center text-neutral-400">
                            <ImageIcon className="h-6 w-6" />
                          </div>
                        )}
                        {m.pending && (
                          <span className="absolute inset-0 flex items-center justify-center">
                            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black/45 backdrop-blur-sm">
                              <IosSpinner size={17} />
                            </span>
                          </span>
                        )}
                        {m.body && (
                          <div
                            className={cn(
                              "whitespace-pre-wrap break-words px-3.5 py-2 text-[15px] leading-snug",
                              mine ? "bg-[#7c3aed] text-white" : "bg-neutral-100 text-neutral-900",
                            )}
                          >
                            {m.body}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div
                        className={cn(
                          "max-w-[78%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-[15px] leading-snug",
                          mine
                            ? "rounded-br-md bg-[#7c3aed] text-white"
                            : "rounded-bl-md bg-neutral-100 text-neutral-900",
                          // In flight: present, readable, and visibly not
                          // finished. It settles to full strength the moment the
                          // server's row replaces it.
                          m.pending && "opacity-70 transition-opacity duration-200",
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
                            {/* Keyed on the state itself, so going from sent to
                                seen replaces the element and plays the receipt
                                animation. Without the key React would edit the
                                text in place and "Trimis" would become "Văzut"
                                by silently swapping four letters — the one
                                moment in a conversation worth noticing, and the
                                one it was doing invisibly. */}
                            <span
                              key={m.pending ? "sending" : m.read_at ? "seen" : "sent"}
                              className={cn(
                                "receipt flex items-center gap-0.5 font-medium",
                                m.read_at && !m.pending ? "text-[#7c3aed]" : "text-neutral-400",
                              )}
                            >
                              {m.pending ? (
                                <Check className="h-3 w-3 opacity-50" strokeWidth={2.5} />
                              ) : (
                                <CheckCheck className="h-3 w-3" strokeWidth={2.5} />
                              )}
                              {m.pending ? "Se trimite…" : m.read_at ? "Văzut" : "Trimis"}
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
      </div>
      </div>

      {/* Composer — on the bottom edge of what you can see, whatever that is.
          The home-indicator inset is real when the phone is idle and pure dead
          space the moment a keyboard covers that part of the screen, so
          `.thread-composer` drops it while one is open. */}
      <div className="thread-composer shrink-0 border-t border-neutral-100 bg-white px-3 pt-2.5">
        {imageError && (
          <p className="pb-2 text-center text-[13px] text-red-600">{imageError}</p>
        )}
        <div className="flex items-end gap-2">
          {/* The picker is a hidden input driven by the button beside it, so the
              button can look like the rest of the composer instead of like a
              browser's file control. Reset to "" after every pick, or choosing
              the same photo twice in a row fires no change event at all. */}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ""
              setImageError(null)
              if (file) void sendImage(file)
            }}
          />
          <button
            type="button"
            aria-label="Trimite o fotografie"
            disabled={sending}
            onClick={() => {
              void triggerHaptic("light")
              fileRef.current?.click()
            }}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-neutral-500 transition-[transform,color] duration-200 active:scale-[0.93] active:text-[#7c3aed] disabled:opacity-40"
          >
            <ImagePlus className="h-[21px] w-[21px]" />
          </button>
          <textarea
            ref={fieldRef}
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
            className="max-h-28 min-h-[44px] flex-1 resize-none overflow-y-auto rounded-3xl border border-neutral-200 bg-neutral-50 px-4 py-2.5 text-[15px] leading-[1.35] outline-none transition-colors placeholder:text-neutral-400 focus:border-[#7c3aed]/50"
          />
          <button
            type="button"
            aria-label="Trimite"
            onClick={() => {
              void triggerHaptic("light")
              void send()
            }}
            disabled={!draft.trim() || sending}
            // Two states in one control. Empty, it is a flat disc that visibly
            // does nothing; with something to send it lifts on the brand
            // gradient and presses in when tapped. The scale-down is what makes
            // the send feel like it left — the bubble appearing at the same
            // instant is the other half of it.
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white",
              "transition-[transform,box-shadow,opacity] duration-[220ms] ease-[cubic-bezier(0.32,0.06,0.16,1)]",
              "active:scale-[0.88] disabled:opacity-40 disabled:shadow-none",
            )}
            style={{
              background: "linear-gradient(160deg, #8b5cf6 0%, #7c3aed 52%, #6d28d9 100%)",
              boxShadow:
                draft.trim() && !sending
                  ? "0 1px 2px rgba(76,29,149,0.28), 0 6px 16px -4px rgba(124,58,237,0.55), inset 0 1px 0 rgba(255,255,255,0.22)"
                  : "none",
            }}
          >
            {sending ? <IosSpinner size={17} /> : <Send className="h-[18px] w-[18px]" />}
          </button>
        </div>
      </div>

      <ThreadDetails
        conversationId={id}
        other={thread?.other ?? null}
        official={thread?.official}
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
      />
    </div>
  )
}

/** The other party's name and face, linked to them where there is somebody to
 *  link to. Storelib has no member page, so it renders as plain content. */
function PartyLink({
  username,
  official,
  className,
  children,
}: {
  username?: string | null
  official?: boolean
  className?: string
  children: React.ReactNode
}) {
  if (!username || official) return <span className={cn("shrink-0", className)}>{children}</span>
  return (
    <Link
      href={`/member/${encodeURIComponent(username)}`}
      prefetch
      onClick={() => void triggerHaptic("light")}
      className={cn("shrink-0 rounded-full transition-opacity active:opacity-60", className)}
    >
      {children}
    </Link>
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
