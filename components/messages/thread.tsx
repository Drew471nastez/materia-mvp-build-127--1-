"use client"

import { Fragment, useCallback, useEffect, useRef, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, BadgeCheck, Check, CheckCheck, ImageIcon, Info, ImagePlus, Send, X } from "lucide-react"
import { useLocale } from "@/components/locale-provider"
import { IosSpinner } from "@/components/explore/ios-spinner"
import { SafetyNotice } from "@/components/messages/safety-notice"
import { InitialAvatar } from "@/components/ui/initial-avatar"
import { MessageActions } from "@/components/messages/message-actions"
import { ImageViewer } from "@/components/messages/image-viewer"
import { ThreadDetails } from "@/components/messages/thread-details"
import { isEncodedImage } from "@/lib/messages/image-fallback"
import { shrinkImage } from "@/lib/messages/shrink-image"
import { createClient } from "@/lib/supabase/client"
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
  /** Unsent by its author. The row stays so the conversation keeps its shape. */
  deleted_at?: string | null
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
  other: {
    id: string
    display_name: string | null
    username: string | null
    avatar_url: string | null
    /** Undefined means the column is not in this database — an unknown presence
     *  must render as nothing, never as "offline". */
    last_seen_at?: string | null
  } | null
  // The other party is Storelib: verified, and writing about no listing.
  official?: boolean
  messages: Msg[]
}

/**
 * How often a thread asks when the socket is NOT carrying it.
 *
 * This was fifteen seconds, chosen when the poll was a background top-up behind
 * a working socket. It is not that: whenever realtime fails to subscribe — a
 * blocked websocket, a cold WebView, a project without the publication — the
 * poll IS the delivery mechanism, and a chat that delivers every fifteen
 * seconds is one where you leave the conversation, come back, and only then see
 * the reply. That is exactly the reported bug, and no amount of animation
 * covers a fifteen-second wait.
 *
 * Two and a half seconds is chat-grade. It costs one indexed read per tick, only
 * while the tab is visible and only while the socket is down, which after the
 * server-side broadcast (lib/messages/announce.ts) should be rare rather than
 * normal. Being a little expensive in the degraded case is the correct trade
 * against a conversation that looks broken.
 */
const POLL_MS = 2500
/**
 * The poll once messages are actually being pushed to us. It is not the
 * mechanism then, it is the net under it — a websocket can drop without saying
 * so, and a thread that quietly stops updating is worse than one that is a few
 * seconds behind. Thirty seconds is a heartbeat, not a refresh.
 */
const POLL_LIVE_MS = 30000

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

/** Five minutes, the same window the member page and the follow list use, so
 *  one person is never online in one place and offline in another. */
const ONLINE_WINDOW_MS = 5 * 60 * 1000

/**
 * Whether the person you are talking to is around, and what to call it.
 *
 * Returns null in the two cases where the honest answer is to say nothing at
 * all, and getting these right is most of the value of the line:
 *
 *   - `last_seen_at` is undefined. The column is not in this database, so we do
 *     not know — and "activ acum 2 zile" invented from a missing column is
 *     worse than a header with one line in it.
 *   - The other party is Storelib. A platform account has no presence to
 *     report and claiming it was "last active four hours ago" would be a small
 *     lie told constantly.
 *
 * The wording steps down in the same places a person's sense of recency does:
 * a minute is "now", an hour is minutes, a day is hours, and past a week it
 * stops counting and says "a long time ago" — because the difference between
 * eleven and nineteen days is not information anyone acts on.
 */
function presenceOf(
  lastSeenAt: string | null | undefined,
  official: boolean | undefined,
): { online: boolean; label: string } | null {
  if (official) return null
  if (lastSeenAt === undefined) return null
  const at = lastSeenAt ? Date.parse(lastSeenAt) : NaN
  if (!Number.isFinite(at)) return null

  const ago = Date.now() - at
  if (ago < ONLINE_WINDOW_MS) return { online: true, label: "activ acum" }

  const minutes = Math.floor(ago / 60_000)
  if (minutes < 60) return { online: false, label: `activ acum ${minutes} min` }
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return { online: false, label: `activ acum ${hours} h` }
  const days = Math.floor(hours / 24)
  if (days === 1) return { online: false, label: "activ ieri" }
  if (days < 7) return { online: false, label: `activ acum ${days} zile` }
  return { online: false, label: "activ acum mult timp" }
}

/**
 * One conversation: the listing it is about pinned on top, the exchange below,
 * a composer at the bottom. Offers are structured bubbles rather than text —
 * they carry state, and the state carries actions: the counterparty can accept
 * or decline a pending one, and an accepted one becomes the buyer's way into
 * checkout at the agreed price.
 */
export function MessageThread({
  id,
  initial = null,
  renderedAt,
}: {
  id: string
  initial?: Thread | null
  /** When the server produced `initial`. A conversation route is held in the
   *  client router cache too, so "the server just told us" is an assumption
   *  rather than a fact — and acting on it means opening a thread to messages
   *  that are minutes old with nothing on screen admitting it. */
  renderedAt?: number
}) {
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
  /** The message being held, and therefore the one the action sheet is about. */
  const [acting, setActing] = useState<Msg | null>(null)
  /** The photo being looked at full screen, if any. */
  const [viewing, setViewing] = useState<string | null>(null)
  /**
   * How far along each in-flight photo is, 0→1, keyed by its optimistic id.
   *
   * Real bytes, not a fake sweep: an indeterminate spinner over an upload tells
   * you something is happening and nothing else, so a slow connection and a
   * stalled one look identical for as long as you are willing to wait. The
   * numbers come off the XHR's upload progress events; the ring is the only
   * honest way to say "this is nearly there".
   */
  const [progress, setProgress] = useState<Record<string, number>>({})
  const fileRef = useRef<HTMLInputElement>(null)
  /** Object URLs still being displayed. Released when the thread unmounts —
   *  earlier than that and the img whose src they are goes blank. */
  const blobs = useRef<string[]>([])
  useEffect(() => () => blobs.current.forEach(URL.revokeObjectURL), [])
  const scrollerRef = useRef<HTMLDivElement>(null)
  const stickBottom = useRef(true)
  /**
   * Called once, by the first `load()` that comes back with a thread in it.
   *
   * A ref rather than a dependency because `load` is defined here, above the
   * cover it releases, and threading the setter down would mean rebuilding
   * `load` — and therefore the poll effect that depends on it — every time the
   * cover changed. It is installed by that cover's own effect and cleared the
   * moment it fires.
   */
  const onFirstLoad = useRef<null | (() => void)>(null)

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
        // A photo already on screen keeps the copy already decoded in memory.
        // The server's signed URL is the same picture behind a network fetch, so
        // adopting it would blank the bubble for the length of that fetch — the
        // "disappears for a second and comes back" on every refresh after a send.
        // EVERY photo already on screen keeps the URL it is already showing,
        // not only the local ones.
        //
        // Signed links are minted per request, so a refetch hands back a
        // different URL for the same picture every time — and changing an img's
        // src makes the browser drop what it has and fetch again. That is the
        // photo blinking out and back on arrival, on the poll, and on every
        // realtime nudge. The bytes have not changed; only the query string has,
        // so the one already decoded is kept and the new link is discarded.
        const shown = new Map<string, string>()
        for (const m of prev?.messages ?? []) {
          if (m.image_url) shown.set(m.id, m.image_url)
        }
        const merged = fresh.messages.map((m) =>
          shown.has(m.id) ? { ...m, image_url: shown.get(m.id)! } : m,
        )
        return { ...fresh, messages: inFlight.length ? [...merged, ...inFlight] : merged }
      })
      // The thread on screen is now the server's, not a three-minute-old copy
      // out of the router cache. Whatever was covering that gap can go.
      onFirstLoad.current?.()
      onFirstLoad.current = null
    } catch {
      /* transient — the next poll retries */
    }
  }, [id, router])

  // Poll only while the thread is actually on screen. A backgrounded tab cannot
  // show a message that arrives, so asking for it is spend with nothing bought;
  // the catch-up happens in one fetch the moment the reader comes back, which is
  // the first instant the answer could matter to them.
  /** True while Postgres is actually pushing this thread's changes to us. */
  const [live, setLive] = useState(false)

  // Skipped exactly once, when the server already handed us the conversation.
  // Fetching it again on mount would be a second, identical read landing a few
  // hundred milliseconds after the first paint — and with it a re-render of
  // every bubble on screen, which is the flicker that made an already-rendered
  // thread look like it was still loading.
  // Skipped only when the payload is genuinely new. A cached one is refetched
  // immediately, which is the difference between opening a conversation and
  // opening a photograph of one.
  const skipFirstLoad = useRef(initial !== null && Date.now() - (renderedAt ?? 0) < 10_000)
  // Read by the timer rather than closed over, so the socket connecting changes
  // how often this asks WITHOUT rebuilding the effect. Making `live` a real
  // dependency was tempting and wrong: the effect re-runs its `sync()`, which
  // fetches — so the moment realtime came up, the first thing it did was an
  // extra round trip to ask for what it had just been told it would be sent.
  const liveRef = useRef(false)
  liveRef.current = live
  const lastLoadAt = useRef(0)

  useEffect(() => {
    let timer: number | undefined

    const ask = () => {
      // The tick is fixed; whether it acts is not. With the socket up, most
      // ticks do nothing — this is a heartbeat checking that realtime has not
      // silently died, not the way messages arrive.
      const gap = liveRef.current ? POLL_LIVE_MS : POLL_MS
      if (Date.now() - lastLoadAt.current < gap - 500) return
      lastLoadAt.current = Date.now()
      void load()
    }

    const stop = () => {
      if (timer !== undefined) {
        window.clearInterval(timer)
        timer = undefined
      }
    }
    const start = () => {
      if (timer !== undefined) return
      timer = window.setInterval(ask, POLL_MS)
    }

    const sync = () => {
      if (document.visibilityState === "visible") {
        if (skipFirstLoad.current) {
          skipFirstLoad.current = false
          lastLoadAt.current = Date.now()
        } else {
          lastLoadAt.current = Date.now()
          void load()
        }
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

  /**
   * Put the end of the conversation on the bottom edge, and then check again.
   *
   * The check is the important half, and its absence is the empty space under a
   * message you just sent. Sending resets the composer: a draft that had grown
   * to three lines snaps back to one, the composer gets shorter, and the
   * scroller it sits above gets TALLER by the same amount — after we had
   * already scrolled to the bottom of the old, shorter box. The result is the
   * last message sitting a few dozen pixels above the composer with nothing
   * under it, every single time you send more than one line.
   *
   * So it corrects on the next frame, once the composer's new height is in
   * layout, and once more after the arrival animation and any image decode have
   * settled. Three cheap writes beat one that is right only sometimes.
   */
  const scrollToEnd = useCallback(() => {
    const put = () => {
      const el = scrollerRef.current
      if (!el) return
      // Assigning scrollTop, not scrollTo({behavior}). A smooth scroll here was
      // actively harmful: the correction a frame later CANCELS an in-flight
      // smooth scroll and jumps to wherever it had got to, so what you saw was
      // never the glide — it was a truncated one with a snap on the end, twice.
      // The motion people read as smooth in a chat is the bubble arriving, not
      // the viewport travelling; every app worth copying moves the scroller
      // instantly and animates the message.
      el.scrollTop = el.scrollHeight
    }
    put()
    requestAnimationFrame(put)
    // One late correction, after the arrival animation and the composer's own
    // resize have both landed. 420ms because the bubble you sent now takes 380
    // to come to rest — a correction fired at 280 was landing while it was still
    // moving, so the last few pixels of the scroll happened underneath an
    // animation that had not finished, which is a small jolt at the exact moment
    // the send is supposed to feel settled.
    window.setTimeout(put, 420)
  }, [])

  useEffect(() => {
    if (!scrollerRef.current || !stickBottom.current) return
    // The first landing is instant: there is no "movement" from a screen that
    // has not been seen yet, and animating it would be the conversation
    // visibly scrolling itself on arrival.
    landed.current = true
    scrollToEnd()
  }, [thread?.messages.length, scrollToEnd])


  // The keyboard opening shortens the scroller under it, so whatever was at the
  // bottom is suddenly above the fold. Follow it down, for the same reason a new
  // message does: the end of the conversation is where you were looking.
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const follow = () => {
      if (stickBottom.current) scrollToEnd()
    }
    vv.addEventListener("resize", follow)
    return () => vv.removeEventListener("resize", follow)
  }, [scrollToEnd])

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

  // ---- Nothing appears after you arrive --------------------------------------
  //
  // The messages are server-rendered, so the TEXT is there on the first frame.
  // The photographs are not: each is a separate fetch of a signed URL, so they
  // land one at a time over the second after the screen does. Even with a
  // reserved box under each, that reads as a conversation assembling itself
  // while you watch — which is what "messages and photos appear randomly" is
  // describing.
  //
  // So the screen is held. A light cover sits over the exchange until its
  // pictures have actually decoded, then lifts, revealing a finished
  // conversation rather than a loading one. Nothing pops, because nothing is
  // visible until there is nothing left to pop.
  //
  // Capped at 1.2 seconds, past which the cover does more harm than the popping
  // ever did — a slow photo must not hold up a conversation you could already
  // be reading. And it covers on the FIRST paint only: a poll or a new message
  // must never drop a loading screen over a thread you are in the middle of.
  //
  // THE SECOND REASON IT COVERS is the one that was missing, and it is the whole
  // of "I land on the conversation and it is empty, then the messages appear".
  //
  // `experimental.staleTimes.dynamic` holds this route's rendered payload in the
  // client router cache for three minutes. Re-open a thread inside that window
  // and Next hands back the copy from LAST time — a conversation as it stood
  // when you last looked, missing everything said since. `skipFirstLoad` above
  // already knows this and refetches immediately, which is correct and is also
  // exactly what you were watching: the old thread paints, then a few hundred
  // milliseconds later every message that arrived while you were away drops in
  // at once.
  //
  // So a stale payload covers too, and lifts when the real one has landed. The
  // arrival becomes one event instead of two — which is what "it should already
  // be loaded when I land" means. Same 1.2s cap: a slow network uncovers to the
  // cached thread rather than holding a blank screen indefinitely.
  const stalePayload = initial !== null && Date.now() - (renderedAt ?? 0) >= 10_000
  const [imagesPending, setImagesPending] = useState(
    () => (initial?.messages ?? []).some((m) => m.kind === "image"),
  )
  const [awaitingFresh, setAwaitingFresh] = useState(() => stalePayload)
  const covered = imagesPending || awaitingFresh

  // Lifted when the refetch `skipFirstLoad` triggers has actually landed, or at
  // the cap — whichever is first. `load()` sets this; the timer is the floor
  // under a request that never comes back.
  useEffect(() => {
    if (!awaitingFresh) return
    onFirstLoad.current = () => setAwaitingFresh(false)
    const cap = window.setTimeout(() => setAwaitingFresh(false), 1200)
    return () => {
      onFirstLoad.current = null
      window.clearTimeout(cap)
    }
  }, [awaitingFresh])

  useEffect(() => {
    if (!imagesPending) return
    const setCovered = setImagesPending
    const el = scrollerRef.current
    if (!el) {
      setCovered(false)
      return
    }
    let done = false
    const uncover = () => {
      if (done) return
      done = true
      setCovered(false)
    }
    const pending = Array.from(el.querySelectorAll("img")).filter((i) => !i.complete)
    if (!pending.length) {
      // Already decoded. Uncovered on the next frame rather than synchronously,
      // so the lift is a transition rather than a flicker of something that was
      // never really there.
      const raf = requestAnimationFrame(uncover)
      return () => cancelAnimationFrame(raf)
    }
    let left = pending.length
    const tick = () => {
      left -= 1
      if (left <= 0) uncover()
    }
    for (const img of pending) {
      img.addEventListener("load", tick, { once: true })
      img.addEventListener("error", tick, { once: true })
    }
    const cap = window.setTimeout(uncover, 1200)
    return () => {
      window.clearTimeout(cap)
      for (const img of pending) {
        img.removeEventListener("load", tick)
        img.removeEventListener("error", tick)
      }
    }
    // Mount-only: this is about the arrival, not about later changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The scroller was sized for whatever the cover was hiding, so land on the end
  // again the moment it lifts.
  useEffect(() => {
    if (!covered && stickBottom.current) scrollToEnd()
  }, [covered, scrollToEnd])

  // ---- Live, so there is nothing to pull for --------------------------------
  //
  // A conversation had pull-to-refresh, and it was the wrong answer to the right
  // problem. A chat is the one screen where "drag down to see if they replied"
  // makes no sense: you are looking straight at it, and the reply should simply
  // arrive. It also has to fight the scroller, which in a thread is normally
  // pinned to the bottom, so the gesture was only ever available after scrolling
  // all the way up — a refresh control you cannot reach from where you actually
  // sit.
  //
  // So it is gone, and this replaces it: Postgres tells us the moment a row
  // lands. An event triggers a re-read rather than being applied directly,
  // because the row it carries is raw — an image message holds an object path in
  // a private bucket, and the signed link for it is minted server-side. One
  // extra indexed query for a correct thread beats duplicating the enrichment on
  // the client and getting it subtly wrong.
  //
  // Coalesced, because a burst (a message plus the read receipts it triggers) is
  // one thing to look at, not four round trips.
  const meRef = useRef<string | null>(initial?.me ?? null)
  meRef.current = thread?.me ?? meRef.current

  /** The live channel, once it is actually carrying this thread. */
  const channelRef = useRef<any>(null)
  const [peerTyping, setPeerTyping] = useState(false)
  const typingOff = useRef<number | undefined>(undefined)
  const typingSentAt = useRef(0)

  // The dots add a row to the bottom of the conversation, so whatever was there
  // is suddenly above the fold — the same reason a new message scrolls.
  useEffect(() => {
    if (peerTyping && stickBottom.current) scrollToEnd()
  }, [peerTyping, scrollToEnd])

  /**
   * Announce a change on this thread to whoever else has it open.
   *
   * Returns whether it went. It used to return nothing and fail silently, which
   * hid the one case that matters: with the channel not yet SUBSCRIBED there is
   * no `ch` and the call did nothing at all, so whatever depended on it simply
   * did not happen and nothing anywhere said why.
   */
  const announce = useCallback((event: "msg" | "typing"): boolean => {
    const ch = channelRef.current
    if (!ch || !meRef.current) return false
    try {
      void ch.send({ type: "broadcast", event, payload: { from: meRef.current } })
      return true
    } catch {
      /* the poll is the net under this */
      return false
    }
  }, [])

  /**
   * Throttled hard: one ping every two seconds is plenty to keep a dot alive,
   * and a broadcast per keystroke would be a message a second per typist.
   *
   * Two routes, and which one is used is decided by whether the socket is
   * actually up. `announce` is a no-op when the channel has not reached
   * SUBSCRIBED, and it returns false to say so — which used to mean the dots
   * simply never appeared during the first seconds in a conversation, while the
   * channel was still connecting. That is the worst window to lose: it is
   * exactly when the other person is watching to see whether you are replying.
   * So the server rings it instead, over the same channel. One request per two
   * seconds of active typing, and only when the fast path could not be taken.
   */
  const noteTyping = useCallback(() => {
    const now = Date.now()
    if (now - typingSentAt.current < 2000) return
    typingSentAt.current = now
    if (announce("typing")) return
    void fetch(`/api/messages/${id}/typing`, { method: "POST", credentials: "include" }).catch(() => {
      /* a missing typing indicator is not worth reporting to anyone */
    })
  }, [announce, id])

  useEffect(() => {
    const supabase = createClient()
    let timer: number | undefined

    /** The heavy path, for the cases the event alone cannot answer. */
    const refetch = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        lastLoadAt.current = Date.now()
        void load()
      }, 120)
    }

    // Events are APPLIED, not treated as a doorbell.
    //
    // Refetching the whole thread on every event was the flash when you sent a
    // message, and it was self-inflicted twice over. Your own INSERT comes back
    // to you over the same socket, so pressing send fetched the conversation you
    // were already looking at and replaced every bubble in it. And a fetch marks
    // the other side's messages read, which is an UPDATE, which the socket also
    // delivers — so one message could set off a second round trip behind it.
    //
    // So the common cases are handled from the payload and touch nothing else.
    // A refetch is kept for exactly two things it cannot do: a photo, whose
    // signed link only the server can mint, and a row we do not already hold.
    const onInsert = (row: any) => {
      if (!row?.id) return refetch()
      // Ours. We drew it the instant it was typed; the server agreeing is not
      // news, and re-rendering the thread to celebrate is the glitch.
      if (row.sender_id === meRef.current) return
      // An image, or a text row that is really an image filed the fallback way:
      // either needs a signed link, and only the server can mint one.
      if (row.kind === "image" || isEncodedImage(row.body)) return refetch()
      setThread((t) => {
        if (!t || t.messages.some((m) => m.id === row.id)) return t
        return { ...t, messages: [...t.messages, row as Msg] }
      })
    }

    const onUpdate = (row: any) => {
      if (!row?.id) return refetch()
      setThread((t) => {
        if (!t) return t
        const i = t.messages.findIndex((m) => m.id === row.id)
        if (i < 0) return t
        const next = t.messages.slice()
        // Merged rather than replaced: the row on the wire holds an object path
        // where the one on screen holds a signed URL, and overwriting it would
        // turn a visible photo into a broken one.
        next[i] = { ...next[i], ...row, image_url: next[i].image_url ?? row.image_url }
        return { ...t, messages: next }
      })
    }

    const channel = supabase
      .channel(`thread:${id}`, { config: { broadcast: { self: false } } })
      // Told directly, rather than overheard from Postgres.
      //
      // postgres_changes only fires for tables that are IN the `supabase_realtime`
      // publication — and on a database whose migration has not been run, they
      // are not. The channel subscribes, reports itself connected, and no event
      // ever arrives: a conversation that looks live and silently is not.
      //
      // A broadcast needs no publication, no table and no schema at all. Both
      // sides are already on this channel; the sender simply says so. It is the
      // fast path in every case and the ONLY path on a database that has not
      // been migrated, which is why the poll below still exists behind it.
      .on("broadcast", { event: "msg" }, () => refetch())
      .on("broadcast", { event: "typing" }, (p: any) => {
        if (!p?.payload?.from || p.payload.from === meRef.current) return
        setPeerTyping(true)
        window.clearTimeout(typingOff.current)
        // Typing is a claim with a shelf life. Nobody sends "I stopped" 
        // reliably — they close the tab, lose signal, put the phone down — so it
        // expires on its own rather than waiting to be withdrawn.
        typingOff.current = window.setTimeout(() => setPeerTyping(false), 4000)
      })
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${id}` },
        (p: any) => onInsert(p.new),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages", filter: `conversation_id=eq.${id}` },
        (p: any) => onUpdate(p.new),
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "messages", filter: `conversation_id=eq.${id}` },
        (p: any) => {
          // A hard delete — what unsending falls back to where the soft-delete
          // column does not exist. Postgres only carries the primary key on a
          // DELETE, which is all that is needed to drop it from the list.
          const gone = p.old?.id
          if (!gone) return
          setThread((t2) => (t2 ? { ...t2, messages: t2.messages.filter((m) => m.id !== gone) } : t2))
        },
      )
      .subscribe((status: string) => {
        channelRef.current = status === "SUBSCRIBED" ? channel : null
        // Only SUBSCRIBED means the socket is actually carrying this thread.
        // Anything else — the publication not including `messages`, a blocked
        // websocket, a dropped connection — has to fall back to asking, or the
        // screen silently stops updating and looks broken rather than slow.
        setLive(status === "SUBSCRIBED")
      })

    return () => {
      window.clearTimeout(timer)
      window.clearTimeout(typingOff.current)
      channelRef.current = null
      void supabase.removeChannel(channel)
    }
  }, [id, load])

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
        // The other side hears about it now rather than on their next poll.
        announce("msg")
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
  }, [announce, draft, id, sending])

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
      // Starts a little way round rather than at nothing. A ring at zero for the
      // second the resize takes reads as "stuck", and the resize is real work
      // that is genuinely part of sending the photo.
      setProgress((p) => ({ ...p, [tempId]: 0.06 }))
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
        setProgress((p) => ({ ...p, [tempId]: 0.12 }))
        const form = new FormData()
        form.append("file", small)
        // XHR rather than fetch, for one reason: fetch cannot report upload
        // progress. Its request body is not observable, so a `fetch` upload is
        // a promise that resolves and nothing in between. XHR still exposes
        // upload.onprogress, which is the only source of the numbers the ring
        // draws — so the old, larger API is the right one here.
        const r = await new Promise<{ ok: boolean; status: number; text: string }>((resolve, reject) => {
          const xhr = new XMLHttpRequest()
          xhr.open("POST", `/api/messages/${id}/image`)
          xhr.withCredentials = true
          xhr.upload.onprogress = (e) => {
            if (!e.lengthComputable) return
            // Capped below 1: the last stretch is the server storing the file
            // and writing the row, which the browser knows nothing about. A
            // ring that fills completely and then sits there is worse than one
            // that stops just short and finishes when the answer arrives.
            const sent = 0.12 + (e.loaded / e.total) * 0.8
            setProgress((p) => (p[tempId] === undefined ? p : { ...p, [tempId]: Math.min(0.92, sent) }))
          }
          xhr.onload = () => resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, text: xhr.responseText })
          xhr.onerror = () => reject(new Error("network"))
          xhr.onabort = () => reject(new Error("aborted"))
          xhr.send(form)
        })
        if (r.ok) {
          const { message } = JSON.parse(r.text)
          // Closed out before the swap, so the ring completes on the frame the
          // photo sharpens rather than vanishing mid-arc.
          setProgress((p) => ({ ...p, [tempId]: 1 }))
          seen.current?.add(message.id)
          stickBottom.current = true
          // The row is the server's; the PICTURE stays the one already on
          // screen. Swapping in the signed URL means the img element's src
          // changes to something that has to be fetched over the network — so
          // the photo you were looking at vanishes for as long as that takes
          // and then comes back. It is the same image either way, and the blob
          // is already decoded in memory, so the bubble keeps it and the signed
          // link is simply never needed on this device.
          setThread((t) =>
            t
              ? {
                  ...t,
                  messages: t.messages.map((m) =>
                    m.id === tempId ? { ...message, image_url: localUrl } : m,
                  ),
                }
              : t,
          )
          // Held until the screen goes, not revoked here: revoking now would
          // break the src we have just committed to.
          blobs.current.push(localUrl)
          announce("msg")
          return
        } else {
          let error: string | null = null
          try {
            error = JSON.parse(r.text)?.error ?? null
          } catch {
            /* a non-JSON body means the message below is the best we have */
          }
          setThread((t) => (t ? { ...t, messages: t.messages.filter((m) => m.id !== tempId) } : t))
          URL.revokeObjectURL(localUrl)
          setImageError(error || "Fotografia nu a putut fi trimisă")
        }
      } catch {
        setThread((t) => (t ? { ...t, messages: t.messages.filter((m) => m.id !== tempId) } : t))
        URL.revokeObjectURL(localUrl)
        setImageError("Fotografia nu a putut fi trimisă")
      } finally {
        setSending(false)
        // One tick behind the swap so the completed ring is on screen for a
        // frame. Dropping it in the same commit as the finished photo would
        // mean the arc never visibly reaches the end.
        window.setTimeout(() => {
          setProgress((p) => {
            if (p[tempId] === undefined) return p
            const next = { ...p }
            delete next[tempId]
            return next
          })
        }, 220)
      }
    },
    [announce, id, sending],
  )

  // ---- Press and hold ------------------------------------------------------
  //
  // 480ms, and abandoned the moment the finger travels more than a few pixels —
  // otherwise every scroll that happens to start on a bubble ends in a sheet.
  // The haptic fires when the press is RECOGNISED rather than when the sheet
  // appears, because the whole point of a long press is being told you have held
  // it long enough before anything visible happens.
  const press = useRef<{ timer: number; x: number; y: number } | null>(null)

  const cancelPress = useCallback(() => {
    if (press.current) {
      window.clearTimeout(press.current.timer)
      press.current = null
    }
  }, [])

  const beginPress = useCallback(
    (m: Msg, e: React.PointerEvent) => {
      cancelPress()
      const timer = window.setTimeout(() => {
        press.current = null
        void triggerHaptic("light")
        setActing(m)
      }, 480)
      press.current = { timer, x: e.clientX, y: e.clientY }
    },
    [cancelPress],
  )

  const movePress = useCallback(
    (e: React.PointerEvent) => {
      const p = press.current
      if (!p) return
      if (Math.abs(e.clientX - p.x) > 8 || Math.abs(e.clientY - p.y) > 8) cancelPress()
    },
    [cancelPress],
  )

  const deleteMessage = useCallback(
    async (messageId: string) => {
      // Gone from the screen first. The row is already unrecoverable server-side
      // by the time the request returns, so waiting for it would only mean
      // staring at a message you have just decided to unsend.
      setThread((t) =>
        t
          ? {
              ...t,
              messages: t.messages.map((m) =>
                m.id === messageId
                  ? { ...m, deleted_at: new Date().toISOString(), body: null, image_url: null }
                  : m,
              ),
            }
          : t,
      )
      try {
        const r = await fetch(`/api/messages/${id}/message?messageId=${encodeURIComponent(messageId)}`, {
          method: "DELETE",
          credentials: "include",
        })
        if (!r.ok) await load() // the server disagreed; its version wins
      } catch {
        await load()
      }
    },
    [id, load],
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
  const presence = presenceOf(thread?.other?.last_seen_at, thread?.official)
  /** Whether there is anything to send — and therefore whether the button that
   *  sends it exists at all. */
  const canSend = draft.trim().length > 0

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
      className={cn(
        "thread-shell mx-auto flex max-w-2xl flex-col md:rounded-2xl md:border md:border-neutral-200",
        // The push, on the arrivals that never got one.
        //
        // It lives on loading.tsx, which Next only shows when it has nothing
        // cached — so opening a conversation you had opened in the last three
        // minutes skipped the skeleton and therefore skipped the animation
        // entirely, and the thread hard-cut into place. Half the taps eased in
        // and half did not, decided by something invisible; that is the same
        // inconsistency the tab bar had, in the one screen you open most.
        //
        // `stalePayload` IS that case, exactly: a payload older than ten
        // seconds came out of the router cache, which means no skeleton
        // rendered, which means nothing has played this yet. A fresh one was
        // rendered by the server for this navigation, which means the skeleton
        // did show and did play it — and adding it here too would be the same
        // motion twice for one tap.
        stalePayload && "screen-push",
      )}
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
            <InitialAvatar
              name={thread?.other?.display_name || thread?.other?.username}
              url={thread?.other?.avatar_url}
              seed={thread?.other?.id}
              size={34}
            />
          </PartyLink>
          <PartyLink username={thread?.other?.username} official={thread?.official} className="min-w-0 flex-1">
            {/* Two lines, not one row that has to share its width. Presence
                sitting BESIDE the name would compete with it for the same
                truncation budget — a long display name would push "activ acum"
                off the end, or worse, elide the name to make room for it. Under
                it, at a smaller size, each has the whole width and neither can
                ever overlap the other. */}
            <span className="flex min-w-0 flex-col">
              <span className="flex min-w-0 items-center gap-1">
                <span className="truncate text-[15.5px] font-semibold leading-[1.2] text-neutral-900">{name}</span>
                {thread?.official && <BadgeCheck className="h-4 w-4 shrink-0 text-[#1d9bf0]" />}
              </span>
              {presence && (
                <span
                  className={cn(
                    "truncate text-[11.5px] leading-[1.3]",
                    presence.online ? "font-medium text-emerald-600" : "text-neutral-400",
                  )}
                >
                  {presence.label}
                </span>
              )}
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
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {/* Over the exchange, not over the header or the composer: those are
            correct from the first frame, and covering them would turn a screen
            that HAD arrived into one that looks like it had not. */}
        <div
          aria-hidden
          // `.thread-surface`, not `bg-white`: the cover has to be the same
          // surface as the thing underneath it, or lifting it is a change of
          // background as well as a reveal — a flat white panel dissolving into
          // a textured one, which is a flicker of exactly the kind this exists
          // to prevent.
          className="thread-surface pointer-events-none absolute inset-0 z-20 flex items-center justify-center transition-opacity duration-[240ms] ease-[cubic-bezier(0.32,0.06,0.16,1)]"
          style={{ opacity: covered ? 1 : 0, visibility: covered ? "visible" : "hidden" }}
        >
          {/* Held back a quarter of a second. Most covers lift faster than
              that — a stale payload is one round trip, and photos already in
              the browser cache decode in a frame — and a spinner that appears
              and disappears inside 200ms is a blink, which is exactly the kind
              of flicker the cover exists to prevent. `both` keeps it invisible
              during the delay rather than merely un-animated. */}
          <span className="animate-[fade-in_200ms_ease-out_260ms_both]">
            <IosSpinner size={24} />
          </span>
        </div>
      <div
        ref={scrollerRef}
        onScroll={onScroll}
        className="thread-surface absolute inset-0 overflow-y-auto overscroll-y-contain px-4 py-4"
      >
        {/* Bottom-aligned, and this is the empty space.
            A conversation with four messages in it does not fill the screen, and
            a column that starts at the top leaves the rest of the screen blank
            BELOW the last thing anyone said — a gap between the conversation and
            the composer that grows every time the composer shrinks. Every chat
            app stacks the exchange against the bottom instead, so a new message
            pushes the old ones up rather than extending a list downward into
            emptiness. It also makes the skeleton, which is bottom-aligned, the
            same picture as what replaces it.

            No entrance on the column: the two are now the same box, sized from
            the same viewport numbers, so the handover is already invisible and
            an animation over an invisible swap is just a visible animation. */}
        <div className="flex min-h-full flex-col justify-end">
        {/* Above the exchange and inside the bottom-aligned column, so on a
            short thread it sits directly over the first message and on a long
            one it scrolls away with the history — which is where a notice about
            how to behave belongs. Never over the Storelib thread: warning
            somebody about the platform, inside the platform's own thread, reads
            as the app not knowing who it is. */}
        {thread && !thread.official && <SafetyNotice />}
        {thread === null ? (
          // The last resort, and it is now shaped like the conversation it is
          // standing in for rather than like three grey bars: alternating sides,
          // varied widths, the bubbles' own radius and the same 82%/68%
          // ceilings. A skeleton whose geometry disagrees with what replaces it
          // is a layout jump dressed up as a loading state.
          <div className="space-y-2.5">
            {[
              { mine: false, w: "62%" },
              { mine: true, w: "45%" },
              { mine: false, w: "74%" },
              { mine: true, w: "38%" },
              { mine: false, w: "52%" },
            ].map((b, i) => (
              <div key={i} className={cn("flex", b.mine ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "h-[42px] animate-pulse rounded-[20px] bg-neutral-100",
                    b.mine ? "rounded-br-md" : "rounded-bl-md",
                  )}
                  style={{ width: b.w }}
                />
              </div>
            ))}
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
                    {m.deleted_at ? (
                      // The row survives so the day dividers and grouping above
                      // it do not reshuffle; what it said does not.
                      <div
                        className={cn(
                          "max-w-[82%] rounded-[20px] border border-dashed px-4 py-2.5 text-[15px] italic leading-[1.4]",
                          mine
                            ? "rounded-br-md border-[#7c3aed]/30 text-[#7c3aed]/70"
                            : "rounded-bl-md border-neutral-200 text-neutral-400",
                        )}
                      >
                        Mesaj șters
                      </div>
                    ) : m.kind === "offer" ? (
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
                        onPointerDown={(e) => beginPress(m, e)}
                        onPointerMove={movePress}
                        onPointerUp={cancelPress}
                        onPointerCancel={cancelPress}
                        onContextMenu={(e) => e.preventDefault()}
                        className={cn(
                          "msg-bubble relative max-w-[68%] overflow-hidden rounded-[20px] bg-neutral-100",
                          mine ? "rounded-br-md" : "rounded-bl-md",
                        )}
                      >
                        {m.image_url ? (
                          // A plain img, not next/image: the src is a signed URL
                          // that expires, so it is neither cacheable by the
                          // optimizer nor stable enough to be worth optimising.
                          // eslint-disable-next-line @next/next/no-img-element
                          // Fades in over its own placeholder rather than
                          // arriving into a zero-height box. Without a reserved
                          // size the bubble is nothing until the bytes land and
                          // then snaps to full height, which is what makes a
                          // conversation look like it is assembling itself after
                          // you have already arrived — every photo pushing the
                          // ones above it as it loads.
                          <img
                            src={m.image_url}
                            alt={m.body || "Fotografie"}
                            onLoad={(e) => {
                              e.currentTarget.style.opacity = "1"
                            }}
                            onClick={() => {
                              // A pending photo is a local blob mid-upload;
                              // opening it full screen would show a picture that
                              // is about to be replaced.
                              if (!m.pending && m.image_url) setViewing(m.image_url)
                            }}
                            className={cn(
                              "block max-h-[260px] w-full cursor-zoom-in object-cover transition-[filter,opacity] duration-[320ms] ease-[cubic-bezier(0.32,0.06,0.16,1)]",
                              // While it is going up it is softened, and it
                              // resolves to the real thing the moment the server
                              // answers. The photo is never replaced, only
                              // sharpened, so there is nothing to flash. The
                              // dimming lives in the ring's wash, which drains
                              // with the progress instead of switching off — two
                              // separate opacities fighting over the same picture
                              // is what made the finish look like a jump.
                              m.pending && "blur-[1.5px]",
                            )}
                            draggable={false}
                            style={{ opacity: 0, transition: "opacity 220ms ease" }}
                          />
                        ) : (
                          <div className="flex h-40 w-56 items-center justify-center text-neutral-400">
                            <ImageIcon className="h-6 w-6" />
                          </div>
                        )}
                        {m.pending && <UploadRing value={progress[m.id]} />}
                        {m.body && (
                          <div
                            className={cn(
                              "whitespace-pre-wrap break-words px-4 py-2.5 text-[16px] leading-[1.4]",
                              mine ? "bg-[#7c3aed] text-white" : "bg-neutral-100 text-neutral-900",
                            )}
                          >
                            {m.body}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div
                        onPointerDown={(e) => beginPress(m, e)}
                        onPointerMove={movePress}
                        onPointerUp={cancelPress}
                        onPointerCancel={cancelPress}
                        onContextMenu={(e) => e.preventDefault()}
                        className={cn(
                          // 16px over 15, on 82% of the width instead of 78,
                          // with a millimetre more padding around it. A message
                          // is the only thing on this screen anybody came to
                          // read, and it was set smaller than the listing
                          // titles in the feed — which made a conversation feel
                          // like a caption track rather than the content. 16px
                          // is also the size below which iOS zooms a focused
                          // input, so the composer had to be 16 anyway: what
                          // you type and what you sent are now the same size,
                          // which they visibly were not.
                          "msg-bubble max-w-[82%] whitespace-pre-wrap break-words rounded-[20px] px-4 py-2.5 text-[16px] leading-[1.4]",
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

        {/* Someone is writing. Inside the bottom-aligned column, not after it:
            outside, the column's own `min-h-full` pushes this below the fold, so
            the one thing that is supposed to tell you something is happening is
            the one thing you cannot see without scrolling. */}
        {peerTyping && (
          <div className="flex items-center gap-1 px-1 pt-2">
            {/* Arrives the way a message from them does, because that is what it
                is standing in for. It used to appear fully formed on one frame,
                which on a screen where everything else eases in read as a
                glitch rather than as somebody starting to type. */}
            <span className="msg-in-theirs flex items-center gap-1 rounded-2xl rounded-bl-md bg-neutral-100 px-3 py-2.5">
              <span className="typing-dot" />
              <span className="typing-dot" style={{ animationDelay: "160ms" }} />
              <span className="typing-dot" style={{ animationDelay: "320ms" }} />
            </span>
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
          {/* THE FIELD AND THE SEND BUTTON ARE ONE CONTROL.
              The button used to be a third disc outside the input, permanently
              on screen and permanently disabled — a control that is visible
              before it can do anything is a control you have to learn to
              ignore. It lives inside the field now, and only exists once there
              is something to send, which is the moment it starts meaning
              anything. Relative box, textarea padded on the right by exactly
              the room the button occupies, button pinned to the bottom of it so
              it stays with the last line as the field grows. */}
          <div className="relative min-w-0 flex-1">
            <textarea
              ref={fieldRef}
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value)
                if (e.target.value) noteTyping()
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  void send()
                }
              }}
              rows={1}
              placeholder="Scrie un mesaj…"
              className={cn(
                "block max-h-28 min-h-[44px] w-full resize-none overflow-y-auto rounded-3xl border border-neutral-200 bg-neutral-50 py-[11px] pl-4 text-[16px] leading-[1.35] outline-none placeholder:text-neutral-400 focus:border-[#7c3aed]/50",
                // 16px, and this is a functional number rather than a
                // typographic one: iOS Safari zooms the whole page when a field
                // under 16px takes focus, and that zoom is never undone — it is
                // the single most common reason a chat "jumps" the first time
                // you tap the input. It also happens to be the size the bubbles
                // now use, so what you type and what you sent are the same size.
                "transition-[padding,border-color] duration-200 ease-out",
                // The room the button takes, paid only while it is there — so an
                // empty field uses its whole width for the placeholder.
                canSend ? "pr-[46px]" : "pr-4",
              )}
            />
            {canSend && (
              <button
                type="button"
                aria-label="Trimite"
                // THE KEYBOARD DOES NOT CLOSE WHEN YOU SEND.
                //
                // Tapping any button moves focus to it, and focus leaving a
                // textarea is what dismisses a phone keyboard. So every message
                // sent by tapping this collapsed the keyboard, scrolled the
                // whole conversation as the viewport grew back, and left you
                // tapping the field again to write the next line.
                //
                // Preventing the default on pointerdown is what stops the focus
                // transfer before it happens; the click still fires. There is no
                // other way — a `.focus()` after the fact cannot reopen a
                // keyboard on iOS unless it runs inside the gesture that closed
                // it, and by then the viewport has already animated.
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => {
                  void triggerHaptic("light")
                  // Belt to the braces above, for WebViews where preventDefault
                  // on pointerdown is not enough.
                  fieldRef.current?.focus()
                  void send()
                }}
                disabled={sending}
                className={cn(
                  "send-pop absolute bottom-[5px] right-[5px] flex h-[34px] w-[34px] items-center justify-center rounded-full text-white",
                  "transition-transform duration-[200ms] ease-[cubic-bezier(0.32,0.06,0.16,1)] active:scale-[0.86] disabled:opacity-60",
                )}
                style={{
                  background: "linear-gradient(160deg, #8b5cf6 0%, #7c3aed 52%, #6d28d9 100%)",
                  boxShadow: "0 1px 2px rgba(76,29,149,0.3), 0 4px 10px -3px rgba(124,58,237,0.5)",
                }}
              >
                {sending ? <IosSpinner size={15} /> : <Send className="h-[16px] w-[16px]" />}
              </button>
            )}
          </div>
        </div>
      </div>

      <ImageViewer src={viewing} onClose={() => setViewing(null)} />

      <MessageActions
        message={
          acting
            ? {
                id: acting.id,
                body: acting.body,
                kind: acting.kind,
                created_at: acting.created_at,
                read_at: acting.read_at,
                mine: !!thread && acting.sender_id === thread.me,
                pending: acting.pending,
              }
            : null
        }
        onClose={() => setActing(null)}
        onDelete={deleteMessage}
      />

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

/**
 * What a photograph looks like while it is going up.
 *
 * A determinate purple ring on a white disc, over a purple wash that drains
 * off the picture as the upload completes. Three deliberate choices:
 *
 * The ring is DETERMINATE. A spinner says "wait" and keeps saying it; an arc
 * that is three quarters round says how much longer, and on a bad connection
 * that difference is whether you keep waiting or give up on a send that was
 * nearly finished. The numbers behind it are real bytes off the wire.
 *
 * The colour is ours. A black scrim and a grey spinner is the platform's
 * loading state borrowed; #7c3aed on white is Storelib's, and this is the one
 * moment in the conversation where the app is visibly doing work for you.
 *
 * And it is drawn with stroke-dashoffset on a rotated circle, so the whole
 * animation is one compositable property on one element. The transition is
 * linear rather than eased because progress that accelerates into each new
 * number reads as smoothing over a stall — an upload is allowed to look like
 * exactly the speed it is.
 */
function UploadRing({ value }: { value?: number }) {
  const R = 13
  const C = 2 * Math.PI * R
  // Undefined means the send has begun but no progress event has landed yet —
  // the resize is still running. A hair of arc, so the ring reads as started.
  const v = Math.max(0.04, Math.min(1, value ?? 0.06))
  return (
    <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
      {/* The wash, fading out as the ring fills: the picture resolves as the
          upload does, rather than staying dimmed until a state flips. */}
      <span
        className="absolute inset-0 bg-[#7c3aed] transition-opacity duration-300 ease-out"
        style={{ opacity: 0.22 * (1 - v) + 0.06 }}
      />
      <span className="relative flex h-11 w-11 items-center justify-center rounded-full bg-white/92 shadow-[0_2px_10px_rgba(76,29,149,0.28)] backdrop-blur-sm">
        <svg width={32} height={32} viewBox="0 0 32 32" className="-rotate-90">
          <circle cx={16} cy={16} r={R} fill="none" stroke="#ede9fe" strokeWidth={3} />
          <circle
            cx={16}
            cy={16}
            r={R}
            fill="none"
            stroke="#7c3aed"
            strokeWidth={3}
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - v)}
            style={{ transition: "stroke-dashoffset 220ms linear" }}
          />
        </svg>
      </span>
    </span>
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
