"use client"

import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, BadgeCheck, Check, CheckCheck, ImageIcon, Info, ImagePlus, RotateCw, Send, X } from "lucide-react"
import { useLocale } from "@/components/locale-provider"
import { IosSpinner } from "@/components/explore/ios-spinner"
import { SafetyNotice } from "@/components/messages/safety-notice"
import { wasServedFromCache } from "@/lib/render-key"
import { readDraft, saveDraft } from "@/lib/messages/drafts"
import { InitialAvatar } from "@/components/ui/initial-avatar"
import { MessageActions } from "@/components/messages/message-actions"
import { ImageViewer } from "@/components/messages/image-viewer"
import { ThreadDetails } from "@/components/messages/thread-details"
import { isEncodedImage } from "@/lib/messages/image-fallback"
import { shrinkImage } from "@/lib/messages/shrink-image"
import { createClient } from "@/lib/supabase/client"
import { navigateBlended } from "@/lib/nav-blend"
import { dropPopShot, releasePopShot, takePopShot } from "@/lib/messages/pop-shot"

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
  /**
   * The React key this bubble keeps for its whole life on screen.
   *
   * This exists because of the one bug that made sending look janky no matter
   * how the animation was tuned. A message you send is drawn immediately with a
   * temporary id, and 150-400ms later the server's row replaces it — with a
   * REAL id. Keyed by id, that is a different key, so React unmounts the bubble
   * and mounts a new one in its place. Which lands, on a typical connection,
   * squarely in the middle of the 380ms arrival: the element carrying the
   * animation is destroyed and its replacement has no animation on it at all,
   * so the bubble stops dead wherever it had got to and snaps to its final
   * position. Every send, invisible in code, obvious on screen.
   *
   * Carried across the swap, the DOM node survives and the animation runs to
   * completion. Local only — the server has never heard of it.
   */
  localKey?: string
  /**
   * The picture's width÷height, on a photo that is still going up.
   *
   * Without it the bubble has NO HEIGHT until the browser has decoded the file:
   * the img is `w-full` with a max height and no intrinsic size yet, so the
   * bubble is a few pixels tall on the frame it appears and then snaps to two
   * hundred and sixty. Which is a layout jump inside the one animation that
   * exists to make sending look continuous — and now that the thread glides to
   * the bottom over half a second, it is a jump that happens mid-glide and
   * moves the target underneath it.
   *
   * Read off the blob as soon as the browser can say, which is a frame or two,
   * and applied as an `aspect-ratio` so the box is right before the pixels are.
   */
  aspect?: number
  /** The request behind this bubble did not make it. Local only; it stays on
   *  screen, in place, with a tap to try again. */
  failed?: boolean
}

/**
 * A picture's width÷height, as cheaply as the browser will give it.
 *
 * `createImageBitmap` decodes off the main thread where it exists, which is
 * what keeps this from costing a frame on the very interaction it is meant to
 * smooth. The <img> path is the fallback for the formats it refuses — HEIC,
 * mainly — and is still only a decode, not a render.
 *
 * Returns null rather than throwing: a photo whose shape we could not work out
 * still sends, it just reserves the default box.
 */
async function measureAspect(url: string): Promise<number | null> {
  try {
    if (typeof createImageBitmap === "function") {
      const res = await fetch(url)
      const bmp = await createImageBitmap(await res.blob())
      const ratio = bmp.width / bmp.height
      bmp.close()
      return Number.isFinite(ratio) && ratio > 0 ? ratio : null
    }
  } catch {
    /* fall through */
  }
  try {
    // `document.createElement`, not `new Image()`: this file imports next/image
    // as `Image`, which shadows the DOM constructor — and the resulting error is
    // about construct signatures rather than about the name collision, which
    // makes it a genuinely confusing thing to hit.
    const img = document.createElement("img")
    img.decoding = "async"
    img.src = url
    await img.decode()
    const ratio = img.naturalWidth / img.naturalHeight
    return Number.isFinite(ratio) && ratio > 0 ? ratio : null
  } catch {
    return null
  }
}

/**
 * Who "me" is, for the purposes of a broadcast, without saying who I am.
 *
 * One random value per tab, generated once. It exists so a typing ping can be
 * ignored by the tab that sent it without that ping containing an account id —
 * see `announce`. A page reload picks a new one, which is fine: nothing
 * remembers it across a session and nothing needs to.
 */
const sessionTag =
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `t${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`

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
  /** True when there is at least one message older than the oldest one held. */
  hasMore?: boolean
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
 * seconds behind.
 *
 * Twelve seconds, down from thirty. A socket does not only die loudly: it can
 * report SUBSCRIBED and then silently route nothing, in which case this
 * interval IS the delivery time, and thirty seconds of it is the difference
 * between a chat and an email client. Twelve is a heartbeat you would not
 * notice paying for and a worst case you would not notice waiting out.
 */
const POLL_LIVE_MS = 12000

/** How long the thread takes to make room for a message you sent. Matches
 *  `.msg-in-mine` in app/globals.css — the bubble and the scroller are one
 *  movement, so they have to be one duration. */
const GLIDE_MS = 420

/** What the server accepts (`slice(0, 2000)` in app/api/messages/[id]/route.ts).
 *  Enforced in the field as well, or the end of a long message is deleted on
 *  the way out with nothing saying so. */
const MAX_MESSAGE_CHARS = 2000

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
  renderKey,
}: {
  id: string
  initial?: Thread | null
  /** A value the server generates fresh on every render of this route. Seeing
   *  the same one twice is proof the second was a cache hit — see the note in
   *  app/(marketing)/messages/[id]/page.tsx for why this replaced a timestamp. */
  renderKey?: string
}) {
  const { formatPrice } = useLocale()
  const router = useRouter()
  /**
   * Whether the conversation we were handed came out of the router cache.
   *
   * Decided once, during the first render, and never re-decided: the answer is
   * a property of this mount, and a later render must not be able to change it
   * — that would mean the cover could re-arm over a thread somebody is reading.
   */
  const fromCacheRef = useRef<boolean | null>(null)
  if (fromCacheRef.current === null) {
    fromCacheRef.current = initial !== null && wasServedFromCache(renderKey)
  }
  const fromCache = fromCacheRef.current
  // Born with the conversation in it. The server read it in the same request
  // that rendered this page, so there is no skeleton, no fetch-on-mount and no
  // second arrival — see app/(marketing)/messages/[id]/page.tsx.
  const [thread, setThread] = useState<Thread | null>(initial)
  const [failed, setFailed] = useState(false)
  /**
   * Restored from the last time you were in this conversation, if there was
   * anything to restore. Read in the initialiser rather than in an effect: an
   * effect would paint an empty field first and then fill it, which is the
   * text appearing to type itself on every arrival.
   */
  const [draft, setDraft] = useState(() => readDraft(id))
  /**
   * An upload in progress. There is deliberately no equivalent for text.
   *
   * A `sending` flag used to gate both, and it did two unhelpful things: it
   * dimmed the photo button for the length of every TEXT round trip — a control
   * unrelated to what you had just done, blinking in the corner of the composer
   * — and it REFUSED a second message until the first came back, which on a
   * slow connection is a composer that ignores you. Text is queued instead (see
   * `enqueue`), so you can send as many as you like and they still arrive in
   * order. A photo keeps its flag, because two uploads at once from one phone
   * is a genuinely bad idea for the connection they share.
   */
  const [uploading, setUploading] = useState(false)
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
    // Whatever happens below — a thread, a 503, a dead socket — the screen must
    // not still be covered when this returns. A cover exists to hide a handover,
    // and there is no handover to hide once the attempt is over; leaving it up
    // would turn a failed request into a blank conversation.
    const release = () => {
      onFirstLoad.current?.()
      onFirstLoad.current = null
    }
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
      if (r.status === 503) return release()
      // 404 is the only answer that means this conversation is not yours or is
      // not there — a permanent fact, and the one thing worth showing a dead end
      // for. Everything else in the 4xx/5xx range is the server having a bad
      // moment, and treating those the same way was a real way to lose a
      // conversation: one 500 on one poll and the thread was replaced by
      // "Conversația nu a fost găsită" for good, with the messages still sitting
      // in the database and the next poll never getting a chance to prove it.
      // Now a transient failure changes nothing on screen and the poll retries.
      if (r.status === 404) {
        setFailed(true)
        return release()
      }
      if (!r.ok) {
        console.error("[thread] load failed:", r.status)
        return release()
      }
      const fresh: Thread = await r.json()
      // A poll must never eat a message that is still in flight. The server's
      // copy of the thread does not contain it yet by definition, so replacing
      // wholesale would make what you just sent vanish for the rest of the round
      // trip and then reappear — which looks exactly like a message failing.
      setThread((prev) => {
        // PENDING **AND FAILED**, and leaving the second one out was a bug that
        // undid the whole point of having a failed state.
        //
        // A message that did not send exists only here — the server has never
        // heard of it, so it is not in `fresh` and never will be. Keeping only
        // the pending ones meant the next poll dropped it, which on a 2.5s
        // interval is two and a half seconds after it failed: the bubble, the
        // text, and the "Reîncearcă" that was supposed to save it, all gone
        // before you could reach for it. Exactly the loss the failed state was
        // added to prevent, arriving by a different route.
        const inFlight = prev?.messages.filter((m) => m.pending || m.failed) ?? []
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

        // READ-AFTER-WRITE. A message that has just been accepted — it has a
        // real id, it is no longer pending — can still be missing from a read
        // that started before the insert committed, or that hit a replica a
        // moment behind. Replacing wholesale would make it vanish and come back
        // one poll later, which looks exactly like a message failing and then
        // un-failing. So anything we hold that is younger than fifteen seconds
        // and is not in this answer is kept; after that the server is right and
        // we are wrong, and holding it any longer would resurrect a message
        // somebody deleted.
        // A SOCKET IS JUDGED BY WHAT IT DELIVERS, not by what it says.
        //
        // `live` comes from the subscribe callback, and a channel that reports
        // SUBSCRIBED and then quietly stops routing keeps that status forever —
        // so the poll stays on its twelve-second heartbeat and the thread runs
        // twelve seconds behind while insisting it is realtime. There is no
        // event for "this socket has gone deaf".
        //
        // But there is evidence: if this poll turns up a message from the other
        // side that the socket never handed us, it is not carrying this thread
        // whatever it claims. Demote it and the interval drops straight back to
        // 2.5s; a real event arriving later promotes it again, because that is
        // evidence too. Done inside the updater because `prev` is the only
        // reliably current value here — `load` is memoised and a `thread` read
        // from its closure would be whatever it was when the callback was made.
        if (liveRef.current) {
          const held = new Set((prev?.messages ?? []).map((m) => m.id))
          const missed = fresh.messages.some((m) => m.sender_id !== fresh.me && !held.has(m.id))
          if (missed) queueMicrotask(() => setLive(false))
        }

        const known = new Set(merged.map((m) => m.id))
        const cutoff = Date.now() - 15_000
        const settling = (prev?.messages ?? []).filter(
          (m) =>
            !m.pending &&
            !m.failed &&
            !known.has(m.id) &&
            !String(m.id).startsWith("tmp-") &&
            Date.parse(m.created_at) > cutoff,
        )

        // HISTORY YOU SCROLLED BACK TO SURVIVES THE POLL.
        //
        // A read returns one page — the newest sixty — so replacing the list
        // with it would throw away every older page the reader had just walked
        // back through, 2.5 seconds after they got there. The screen would
        // silently snap forward to the present while they were reading last
        // week, which is worse than never having been able to scroll back.
        //
        // Anything held that is OLDER than the oldest row in this answer is
        // outside the window this read describes, so the read says nothing
        // about it either way and it is kept. Everything inside the window is
        // the server's to state.
        const oldestFresh = fresh.messages.length ? Date.parse(fresh.messages[0].created_at) : null
        const history =
          oldestFresh === null
            ? []
            : (prev?.messages ?? []).filter(
                (m) => !m.pending && !m.failed && Date.parse(m.created_at) < oldestFresh,
              )

        const all = [...history, ...merged, ...settling, ...inFlight]
        return { ...fresh, messages: all, hasMore: prev?.hasMore ?? fresh.hasMore }
      })
      // The thread on screen is now the server's, not a three-minute-old copy
      // out of the router cache. Whatever was covering that gap can go.
      release()
    } catch {
      /* transient — the next poll retries, but the screen comes back now */
      release()
    }
  }, [id, router])

  // Poll only while the thread is actually on screen. A backgrounded tab cannot
  // show a message that arrives, so asking for it is spend with nothing bought;
  // the catch-up happens in one fetch the moment the reader comes back, which is
  // the first instant the answer could matter to them.
  /** True while Postgres is actually pushing this thread's changes to us. */
  const [live, setLive] = useState(false)

  // Skipped exactly once, and only when the server produced this payload for
  // THIS navigation. Fetching it again then would be a second identical read
  // landing a few hundred milliseconds after the first paint, re-rendering every
  // bubble on screen for no new information.
  //
  // A payload out of the router cache is the opposite case and gets no such
  // benefit of the doubt: it is refetched immediately, and the screen is held
  // until that lands. `fromCache` is what tells the two apart, and it is a
  // nonce comparison rather than a clock difference — see above.
  const skipFirstLoad = useRef(!fromCache && initial !== null)
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
      // Nothing to ask when there is nothing to ask over. A phone in a lift
      // polls every 2.5 seconds into a network that is not there, which costs
      // battery and radio for a request that cannot succeed — and, worse, means
      // the moment signal returns is up to 2.5 seconds before anyone notices.
      // The `online` event below is what actually brings the thread back, so
      // this is a saving with no latency traded for it.
      if (typeof navigator !== "undefined" && navigator.onLine === false) return
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

    // Signal coming back is the single most likely moment for there to be
    // something waiting, so it is read immediately rather than on the next tick.
    const onOnline = () => {
      lastLoadAt.current = 0
      ask()
    }

    sync()
    document.addEventListener("visibilitychange", sync)
    window.addEventListener("online", onOnline)
    return () => {
      document.removeEventListener("visibilitychange", sync)
      window.removeEventListener("online", onOnline)
      stop()
    }
  }, [load])

  /**
   * The page before this one.
   *
   * A conversation used to hand back its newest five hundred messages and stop
   * — everything older was simply unreachable, with a floor you could scroll to
   * and no way through. Now a read is sixty rows and `before` walks backwards.
   *
   * The hard part is not the fetch, it is that PREPENDING TO A SCROLLER MOVES
   * WHAT YOU ARE READING. Adding sixty messages above the viewport pushes the
   * message you were looking at down by their combined height, so without an
   * anchor the screen jumps a thousand pixels the moment older history arrives —
   * which is worse than not having the feature. So the scroll height is measured
   * before and after, and the difference is added to scrollTop in the same frame
   * the rows land. The page grows upward and nothing under your eyes moves.
   */
  const [olderPending, setOlderPending] = useState(false)
  const noMoreOlder = useRef(false)
  /** Mirrors the loading cover, for the guards that run above its declaration. */
  const coveredRef = useRef(true)
  const loadOlder = useCallback(async () => {
    const el = scrollerRef.current
    if (!el || olderPending || noMoreOlder.current) return
    const oldest = thread?.messages.find((m) => !m.pending && !m.failed)
    if (!oldest) return
    setOlderPending(true)
    try {
      const r = await fetch(`/api/messages/${id}?before=${encodeURIComponent(oldest.created_at)}`, {
        credentials: "include",
      })
      if (!r.ok) return
      const page: Thread = await r.json()
      if (!page.messages.length) {
        noMoreOlder.current = true
        return
      }
      if (!page.hasMore) noMoreOlder.current = true
      // Measured immediately before the commit that inserts them.
      const beforeHeight = el.scrollHeight
      const beforeTop = el.scrollTop
      // Everything already on screen is history as far as the entrance
      // animation is concerned — a page of old messages must not play sixty
      // arrivals up the screen.
      for (const m of page.messages) seen.current?.add(m.id)
      setThread((t) => {
        if (!t) return t
        const have = new Set(t.messages.map((m) => m.id))
        const fresh = page.messages.filter((m) => !have.has(m.id))
        if (!fresh.length) return t
        return { ...t, messages: [...fresh, ...t.messages] }
      })
      // Restored on the next frame, once the new rows are in layout. This is
      // the anchor: whatever the page grew by is added back, so the viewport
      // stays exactly where the reader left it.
      requestAnimationFrame(() => {
        const node = scrollerRef.current
        if (!node) return
        node.scrollTop = beforeTop + (node.scrollHeight - beforeHeight)
      })
    } catch {
      /* the reader can pull again */
    } finally {
      setOlderPending(false)
    }
  }, [id, olderPending, thread?.messages])

  // Near the top is the ask. 240px rather than zero, so the page is already
  // arriving by the time the reader gets to the end of what they have — the
  // difference between history that is there and history that has to be waited
  // for. `covered` guards the arrival: the scroller is at the bottom and its
  // height is still settling, and asking then would fetch a page nobody wants.
  const onScrollTop = useCallback(() => {
    const el = scrollerRef.current
    // `coveredRef`, not the state: this is declared above the cover (the cover
    // needs `scrollToEnd`, which needs to be above this), and reading the state
    // here would be a use-before-declaration. A ref is the same value with no
    // ordering constraint — and it is a guard, not something to re-render on.
    if (!el || coveredRef.current) return
    if (el.scrollTop < 240) void loadOlder()
  }, [loadOlder])

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

  /** The rAF handle of an in-flight glide, so nothing can ever run two. */
  const gliding = useRef<number | undefined>(undefined)
  /** Set by a send, consumed by the effect below. Only a send glides. */
  const glideNext = useRef(false)

  /**
   * Put the end of the conversation on the bottom edge.
   *
   * ---------------------------------------------------------------------------
   * Why sending GLIDES and everything else jumps
   * ---------------------------------------------------------------------------
   * The bubble easing in over half a second was competing with the largest
   * movement on the screen, which was instantaneous: adding a message makes the
   * column taller, so staying at the bottom means the scroller jumps by the full
   * height of that bubble — forty-odd pixels of everything else on screen
   * teleporting upward on ONE frame while the new bubble travels twenty-two over
   * five hundred milliseconds. The eye follows the big movement. Tuning the
   * bubble could never fix that, because the bubble was not the thing that
   * looked wrong.
   *
   * So on a send the scroller travels too, on the same easeOutExpo the bubble
   * uses, over the same duration. The two are one movement: the thread makes
   * room while the message settles into it.
   *
   * Every other reason to be at the bottom is still instant, and deliberately.
   * The first landing is not a movement — there is no previous position to have
   * come from, and animating it is the conversation visibly scrolling itself on
   * arrival. The keyboard opening, the cover lifting and a message arriving from
   * the other side are corrections, not events you caused.
   *
   * ---------------------------------------------------------------------------
   * Why this is safe where `behavior: "smooth"` was not
   * ---------------------------------------------------------------------------
   * A native smooth scroll cannot be corrected mid-flight: the follow-up write
   * this function has always needed CANCELS it and jumps to wherever it had got
   * to, which is what made the earlier attempt worse than no animation. This
   * glide re-reads the target on EVERY frame instead, so the correction is not a
   * separate write that fights it — it is the animation itself noticing that the
   * composer has shrunk back to one line and adjusting where it is heading. One
   * mechanism, no fight, and it cannot end anywhere but the bottom.
   */
  const scrollToEnd = useCallback((glide = false) => {
    const el = scrollerRef.current
    if (!el) return
    if (gliding.current !== undefined) {
      cancelAnimationFrame(gliding.current)
      gliding.current = undefined
    }
    const bottom = () => el.scrollHeight - el.clientHeight

    if (!glide) {
      const put = () => {
        const node = scrollerRef.current
        if (node) node.scrollTop = node.scrollHeight
      }
      put()
      requestAnimationFrame(put)
      // A late correction for anything whose height is not settled yet — a
      // photograph decoding, mainly. Comfortably past the 420ms the bubble and
      // the glide share, so it can never land underneath either of them.
      window.setTimeout(put, 480)
      return
    }

    const from = el.scrollTop
    // Under a pixel of travel is not a movement, and animating it would only
    // delay the correction by half a second.
    if (bottom() - from <= 1) {
      el.scrollTop = bottom()
      return
    }
    const t0 = performance.now()
    const step = () => {
      const node = scrollerRef.current
      if (!node) {
        gliding.current = undefined
        return
      }
      const p = Math.min(1, (performance.now() - t0) / GLIDE_MS)
      // The curve `.msg-in-mine` uses, in numbers: a long decelerating tail that
      // has covered most of its distance early and spends the rest arriving.
      const eased = p === 1 ? 1 : 1 - Math.pow(2, -10 * p)
      node.scrollTop = from + (node.scrollHeight - node.clientHeight - from) * eased
      if (p < 1) {
        gliding.current = requestAnimationFrame(step)
      } else {
        gliding.current = undefined
      }
    }
    gliding.current = requestAnimationFrame(step)
  }, [])

  // A finger on the scroller outranks anything this component wanted. Without
  // this, starting to scroll during the glide means fighting it for half a
  // second — the one way a smooth scroll is worse than a jump.
  const stopGlide = useCallback(() => {
    if (gliding.current === undefined) return
    cancelAnimationFrame(gliding.current)
    gliding.current = undefined
  }, [])

  useEffect(() => () => stopGlide(), [stopGlide])

  // Written down, so leaving the screen does not lose it.
  //
  // Debounced rather than saved per keystroke: this is localStorage, which is
  // synchronous and on the main thread, and writing on every character means a
  // JSON serialise between one letter and the next. Half a second of idle is
  // far below the time it takes to leave a screen and far above the gap between
  // two keystrokes.
  //
  // The cleanup saves too, and that is the case that actually matters —
  // navigating away unmounts this before any debounce could fire.
  useEffect(() => {
    const t = window.setTimeout(() => saveDraft(id, draft), 500)
    return () => {
      window.clearTimeout(t)
      saveDraft(id, draft)
    }
  }, [draft, id])

  // The field grows with what you write, up to four lines, then scrolls.
  //
  // `rows={1}` with a max height is a box that never changes size: type a
  // paragraph and it scrolls inside 44px, so you can see one line of your own
  // message while writing it. Height is reset to auto before it is read, because
  // scrollHeight of an element with an explicit height is that height — without
  // the reset the field can only ever grow, never shrink back when you delete.
  //
  // A LAYOUT EFFECT, AND DECLARED BEFORE THE SCROLL BELOW. Both fire in the same
  // commit as a send — the draft clears and the message is added together — and
  // effects run in declaration order, so with this one second the glide measured
  // where it was heading against a composer that was still three lines tall, and
  // then the field collapsed underneath it. The scroller grows by exactly that
  // much, its bottom moves, and a glide already in flight has to re-aim
  // mid-movement: forty pixels backwards on one frame, halfway through the very
  // animation that exists to stop the list jumping.
  //
  // Measured first, moved second. The composer is its final height before
  // anything works out where the bottom is.
  const fieldRef = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const el = fieldRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, 112)}px`
  }, [draft])

  /**
   * THE BOTTOM, BEFORE THE FIRST PAINT.
   *
   * The effect below already ends at the bottom, and it was still wrong on
   * arrival, because a passive effect runs AFTER the browser has painted. So
   * entering a conversation drew it at scrollTop 0 — the oldest message in the
   * thread, the top of a screen nobody asked for — and only then jumped to the
   * end. One frame, but it is the first frame of the screen and the jump after
   * it is the whole of "it loads and then moves". On a long conversation the
   * distance travelled is the entire scroll height.
   *
   * A layout effect runs before paint, so the very first frame of the
   * conversation is already at the end of it and nothing moves afterwards.
   *
   * Once, and only on the render where there are finally messages to be at the
   * bottom of — `scrollHeight` is meaningless before that, and re-pinning later
   * would be this fighting the glide, the keyboard and the read-position
   * restore for control of a scroller they own after arrival.
   *
   * Photographs still decode after this and grow the list underneath it; the
   * rAF and the 480ms correction in `scrollToEnd` are what handle that, and
   * they are unchanged. This only removes the frame at the wrong position.
   */
  const pinnedOnce = useRef(false)
  useLayoutEffect(() => {
    if (pinnedOnce.current) return
    const el = scrollerRef.current
    if (!el || !thread?.messages.length || !stickBottom.current) return
    pinnedOnce.current = true
    el.scrollTop = el.scrollHeight
  }, [thread?.messages.length])

  useEffect(() => {
    if (!scrollerRef.current || !stickBottom.current) return
    // The first landing is instant: there is no "movement" from a screen that
    // has not been seen yet, and animating it would be the conversation
    // visibly scrolling itself on arrival.
    landed.current = true
    const glide = glideNext.current
    glideNext.current = false
    scrollToEnd(glide)
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

  // Which bubbles are new enough to be worth animating.
  //
  // Everything that was on screen when the thread arrived is history and must
  // simply be there; only what turns up afterwards — what you just sent, what
  // just came in — gets an entrance. Ids are recorded after each commit, so a
  // message animates exactly once and a re-render for any other reason cannot
  // replay the whole conversation.
  const seen = useRef<Set<string> | null>(null)
  /**
   * Decided ONCE per bubble, and then never revisited.
   *
   * The memo is the point, and without it the send animation could not finish
   * however long it was given. `seen` is filled from the messages after every
   * commit, so asking "is this fresh" a second time about the same bubble
   * answers no — and the second time comes 150-400ms after the first, when the
   * server's row replaces the optimistic one, which is the middle of the
   * animation. The class was removed from an element that was still moving, so
   * the bubble stopped dead and snapped into place. Every send.
   *
   * Keyed on `localKey` where there is one, so the optimistic bubble and the
   * real row it becomes are the same bubble to this map, exactly as they are to
   * React's reconciler.
   */
  const settled = useRef(new Map<string, boolean>())
  const isFresh = useCallback((key: string) => {
    const already = settled.current.get(key)
    if (already !== undefined) return already
    const fresh = seen.current !== null && !seen.current.has(key)
    settled.current.set(key, fresh)
    return fresh
  }, [])
  useEffect(() => {
    if (seen.current === null) seen.current = new Set()
    for (const m of thread?.messages ?? []) {
      seen.current.add(m.id)
      if (m.localKey) seen.current.add(m.localKey)
    }
  }, [thread?.messages])
  const onScroll = useCallback(() => {
    const el = scrollerRef.current
    if (!el) return
    stickBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    onScrollTop()
  }, [onScrollTop])

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
  // of "it shows the first message and updates the messages later".
  //
  // `experimental.staleTimes.dynamic` holds this route's rendered payload in the
  // client router cache for three minutes. Re-open a thread inside that window
  // and Next hands back the copy from LAST time — a conversation as it stood
  // when you last looked, missing everything said since. So a cached payload is
  // refetched immediately AND the screen is held until that lands. The arrival
  // becomes one event instead of two.
  //
  // The two waits happen IN ORDER, and that ordering is the fix that was
  // missing before. It used to wait for the fresh data and for images to decode
  // as two independent races, with the image pass reading the DOM once at
  // mount — so it inspected the pictures in the STALE thread, finished, and had
  // nothing to say about the ones that arrived with the fresh payload. Those
  // then loaded in afterwards, one at a time, over a conversation that had
  // already been revealed. Waiting for the data first and only then for its
  // pictures means what is uncovered is finished.
  const [dataReady, setDataReady] = useState(!fromCache)
  const [pixelsReady, setPixelsReady] = useState(false)
  const covered = !dataReady || !pixelsReady
  coveredRef.current = covered

  // Wait one: the server's copy of this conversation.
  //
  // Four seconds, not the 1.2 this used to allow. The cap exists so a dead
  // network cannot hold a blank screen forever — but at 1.2s a merely slow one
  // hit it routinely, and what happens then is precisely the reported bug: the
  // cover lifts on the stale thread and the real messages drop in behind it a
  // moment later. Past four seconds the request has effectively failed and
  // showing the cached conversation is the better of two bad options; under it,
  // waiting is always right.
  useEffect(() => {
    if (dataReady) return
    onFirstLoad.current = () => setDataReady(true)
    const cap = window.setTimeout(() => setDataReady(true), 4000)
    return () => {
      onFirstLoad.current = null
      window.clearTimeout(cap)
    }
  }, [dataReady])

  // Wait two: the pictures in whatever that turned out to be.
  //
  // Runs when the data is settled, not at mount, so it measures the thread that
  // is actually going to be revealed. A conversation with no photographs in it
  // finds nothing pending and clears on the next frame, so text threads pay a
  // single frame for this and nothing more.
  useEffect(() => {
    if (!dataReady || pixelsReady) return
    const el = scrollerRef.current
    if (!el) {
      setPixelsReady(true)
      return
    }
    let done = false
    const ready = () => {
      if (done) return
      done = true
      setPixelsReady(true)
    }
    const pending = Array.from(el.querySelectorAll("img")).filter((i) => !i.complete)
    if (!pending.length) {
      // Already decoded. Cleared on the next frame rather than synchronously, so
      // the lift is a transition rather than a flicker of something that was
      // never really there.
      const raf = requestAnimationFrame(ready)
      return () => cancelAnimationFrame(raf)
    }
    let left = pending.length
    const tick = () => {
      left -= 1
      if (left <= 0) ready()
    }
    for (const img of pending) {
      img.addEventListener("load", tick, { once: true })
      img.addEventListener("error", tick, { once: true })
    }
    // A slow photo must not hold up a conversation you could already be reading;
    // past this it is uncovered and the last picture fades in on its own.
    const cap = window.setTimeout(ready, 1800)
    return () => {
      window.clearTimeout(cap)
      for (const img of pending) {
        img.removeEventListener("load", tick)
        img.removeEventListener("error", tick)
      }
    }
  }, [dataReady, pixelsReady])

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
  /**
   * CLOSING — and the conversation does nothing at all on the way out.
   *
   * Three things have been tried on this screen and all three were wrong in the
   * same way. Fading it to zero left a blank frame held until the route
   * committed, because there is nothing behind a conversation to be revealed.
   * Dipping it to 0.88 in one frame replaced the blank with a grey flash, and
   * on a cold route you sat looking at a dimmed conversation for the whole
   * wait. Dipping it gradually did nothing at all: the 120ms ease needs the
   * 80-150ms a finger spends resting on a control before a tap resolves, and a
   * back press is over before anything can respond to it, so the screen moved
   * about 3% and the destination arrived.
   *
   * What they have in common is that they all animate the screen that is about
   * to stop existing, during a wait whose length nothing here knows. Any state
   * it is left in is a state you might sit and look at.
   *
   * So the leaving screen is left alone, and the whole transition is on the
   * arriving one — the inbox, which fades up from 0.9 over 260ms and cannot
   * uncover anything because it IS the thing behind. It plays for a fixed
   * length starting from the frame it first paints, so it is the same
   * transition whether the pop took one frame or four hundred milliseconds.
   * See `pop-return` in components/messages/inbox.tsx.
   *
   * `navigateBlended("back", …)` is what leaves the hint on <html> that the
   * inbox reads to know it was returned to rather than opened.
   *
   * Guarded against a second press: two overlapping `router.back()` calls pop
   * two history entries and land you two screens away.
   */
  /** Whether a finger is on the back arrow. See `.tap-fade`. */
  const [backPressed, setBackPressed] = useState(false)
  const closing = useRef(false)
  const closeThread = useCallback(() => {
    if (closing.current) return
    closing.current = true
    // The copy starts travelling on the same frame the route is asked for, so
    // the inbox mounts and paints BEHIND it and is uncovered rather than cut
    // to. Before the navigation, not after: a slide that begins once the route
    // has committed is a second event, which is the thing this replaces.
    releasePopShot()
    navigateBlended("back", () =>
      window.history.length > 1 ? router.back() : router.push("/messages"),
    )
  }, [router])

  // A conversation that unmounts for any other reason — a push notification
  // opening a different one, the split view taking over on a rotate — must not
  // leave a picture of itself over whatever replaced it.
  useEffect(() => () => dropPopShot(), [])

  /**
   * Keep the inbox warm for the whole time you are in here.
   *
   * `staleTimes.dynamic` is 180 seconds. Spend longer than that in a
   * conversation — which is most conversations worth having — and /messages has
   * aged out of the client router cache, so pressing back is not a pop at all:
   * it re-fetches the payload, shows the inbox's loading skeleton, and then
   * swaps it for the list. That is two arrivals for one press and no entry
   * animation can cover it, because the skeleton is a whole screen appearing
   * first.
   *
   * Re-prefetched every two minutes, inside the three-minute window, so there
   * is always a fresh entry there to go back to. One RSC payload for a list you
   * are guaranteed to return to is a trade worth making; it is the same request
   * the back press would have made anyway, moved off the critical path.
   */
  useEffect(() => {
    const warm = () => router.prefetch("/messages")
    warm()
    const t = window.setInterval(warm, 120_000)
    return () => window.clearInterval(t)
  }, [router])


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
    if (!ch) return false
    try {
      // `sessionTag`, NOT the user id.
      //
      // A broadcast channel is not access-controlled the way a postgres_changes
      // subscription is — it carries no RLS, so anybody who can guess a
      // conversation id can listen to `thread:<id>`. Nothing here has ever
      // carried message content for exactly that reason, but the typing ping
      // was sending the sender's real uuid, which handed a listener a
      // participant's account id and a live feed of when they were at the
      // keyboard. The only thing the receiver actually needs from this field is
      // "was this me", and a random per-tab value answers that identically
      // while identifying nobody.
      void ch.send({ type: "broadcast", event, payload: { from: sessionTag } })
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
    /** Anything actually arriving over the socket proves it is carrying this
     *  thread — which is the only thing that can undo the demotion above. */
    const heard = () => {
      if (!liveRef.current) setLive(true)
      // They have stopped typing, because they have said the thing. Waiting out
      // the four-second expiry leaves the dots up underneath the message they
      // describe, which is the one place they are obviously wrong.
      window.clearTimeout(typingOff.current)
      setPeerTyping(false)
    }

    const onInsert = (row: any) => {
      heard()
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
      .on("broadcast", { event: "msg" }, () => {
        heard()
        refetch()
      })
      // Somebody read what you sent. Nothing about the messages changed, only
      // their receipts — but that is the whole point of the event, and it is
      // why it is worth a round trip that usually returns the same rows.
      .on("broadcast", { event: "read" }, () => {
        if (!liveRef.current) setLive(true)
        refetch()
      })
      .on("broadcast", { event: "typing" }, (p: any) => {
        // Anything not from this tab is the other party — including this tab's
        // own user signed in somewhere else, which is correct: their other
        // device typing IS somebody typing.
        if (!p?.payload?.from || p.payload.from === sessionTag) return
        if (!liveRef.current) setLive(true)
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

  /**
   * Sends go out ONE AT A TIME, in the order you wrote them.
   *
   * They used to be gated on `sending`, which meant a second message was simply
   * refused until the first came back — on a slow connection, a composer that
   * ignores you. Firing them all in parallel instead is worse: whichever
   * request wins the race is inserted first, so on a bad connection your
   * messages arrive out of order for the person reading them, which is the one
   * failure in a chat that cannot be shrugged off.
   *
   * A chain gives both. The bubble is drawn the instant you press send, always;
   * the REQUEST joins a queue and leaves when the one before it has finished.
   * Type five lines quickly and all five appear at once and arrive in order.
   *
   * `.then(job, job)` rather than `.then(job)`: a rejected link must not break
   * the chain, or one failed send would silently stop every message after it.
   */
  const queue = useRef<Promise<unknown>>(Promise.resolve())
  const enqueue = useCallback((job: () => Promise<unknown>) => {
    queue.current = queue.current.then(job, job)
  }, [])

  /** The text of a message that has not made it, kept for the retry. */
  const outbox = useRef(new Map<string, { body: string } | { file: File }>())

  /** Mark a bubble as having failed, in place. */
  const markFailed = useCallback((tempId: string) => {
    setThread((t) =>
      t
        ? {
            ...t,
            messages: t.messages.map((m) =>
              m.id === tempId ? { ...m, pending: false, failed: true } : m,
            ),
          }
        : t,
    )
  }, [])

  /**
   * The request behind a text bubble that is already on screen.
   *
   * Split out from `send` so a retry is the same code path as the first
   * attempt, rather than a second implementation that can drift from it.
   */
  const deliverText = useCallback(
    async (tempId: string, body: string) => {
      try {
        const r = await fetch(`/api/messages/${id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ body }),
        })
        if (!r.ok) return markFailed(tempId)
        const { message } = await r.json()
        // The real id is recorded as already-seen in the same breath as the
        // swap, or the bubble would count as new and play its entrance a second
        // time — the same message animating twice for one send.
        seen.current?.add(message.id)
        outbox.current.delete(tempId)
        stickBottom.current = true
        setThread((t) =>
          t
            ? {
                ...t,
                // `localKey` rides along so React sees the same element rather
                // than a new one — see the note on the field.
                messages: t.messages.map((m) =>
                  m.id === tempId ? { ...message, localKey: tempId } : m,
                ),
              }
            : t,
        )
        // The other side hears about it now rather than on their next poll.
        announce("msg")
      } catch {
        markFailed(tempId)
      }
    },
    [announce, id, markFailed],
  )

  // Sending puts the message on screen NOW.
  //
  // It used to wait for the round trip: you tapped send, the field emptied, and
  // for as long as the request took there was no message anywhere — the thing
  // you had just written had simply vanished. On anything less than perfect
  // signal that is several seconds of wondering whether it worked. The bubble
  // is drawn immediately and marked pending, and the server's real row replaces
  // it when it lands.
  //
  // A FAILURE NOW LEAVES THE MESSAGE WHERE IT IS, marked, with a tap to try
  // again. It used to delete the bubble and put the text back in the field,
  // which is worse in three separate ways: it overwrites whatever you had
  // started typing since, it loses the message's place in the conversation, and
  // it makes a failure look like the app forgot. Every chat worth copying keeps
  // the bubble and puts a retry on it.
  const send = useCallback(() => {
    const body = draft.trim()
    if (!body) return
    const tempId = nextTempId()
    setDraft("")
    saveDraft(id, "")
    stickBottom.current = true
    // This one movement is yours, so the thread travels with the bubble.
    glideNext.current = true
    outbox.current.set(tempId, { body })
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
                localKey: tempId,
              },
            ],
          }
        : t,
    )
    enqueue(() => deliverText(tempId, body))
  }, [deliverText, draft, enqueue])

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
      if (!file || uploading) return
      const tempId = nextTempId()
      const localUrl = URL.createObjectURL(file)
      // Kicked off now and NOT awaited. Decoding enough of a four-megapixel JPEG
      // to know its dimensions takes a frame or two, and the whole point of an
      // optimistic bubble is that it is there before anything has been decoded,
      // uploaded or agreed. So the bubble goes up immediately with a portrait
      // reservation — what a phone camera produces most of the time — and the
      // exact ratio replaces it the moment it is known, which is almost always
      // before the first paint has settled.
      outbox.current.set(tempId, { file })
      void measureAspect(localUrl).then((aspect) => {
        if (!aspect) return
        setThread((t) =>
          t ? { ...t, messages: t.messages.map((m) => (m.id === tempId ? { ...m, aspect } : m)) } : t,
        )
      })
      setUploading(true)
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
                  localKey: tempId,
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
                    m.id === tempId
                      ? { ...message, image_url: localUrl, localKey: tempId, aspect: m.aspect }
                      : m,
                  ),
                }
              : t,
          )
          // Held until the screen goes, not revoked here: revoking now would
          // break the src we have just committed to.
          blobs.current.push(localUrl)
          outbox.current.delete(tempId)
          announce("msg")
          return
        } else {
          let error: string | null = null
          try {
            error = JSON.parse(r.text)?.error ?? null
          } catch {
            /* a non-JSON body means the message below is the best we have */
          }
          // The bubble stays, with the picture still in it, marked and
          // retryable. Deleting it meant a photo that took ten seconds to
          // upload vanished on a hiccup and had to be found in the camera roll
          // again. The blob is kept alive for the same reason.
          markFailed(tempId)
          blobs.current.push(localUrl)
          setImageError(error || "Fotografia nu a putut fi trimisă")
        }
      } catch {
        markFailed(tempId)
        blobs.current.push(localUrl)
        setImageError("Fotografia nu a putut fi trimisă")
      } finally {
        setUploading(false)
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
    [announce, id, markFailed, uploading],
  )

  /**
   * Try again, from the bubble that failed.
   *
   * The same code path as the first attempt — `deliverText` / `sendImage` — so
   * a retry cannot drift from a send. The bubble goes back to pending in place;
   * it never leaves the conversation and never has to be retyped.
   */
  const retrySend = useCallback(
    (m: Msg) => {
      const held = outbox.current.get(m.id)
      if (!held) return
      void triggerHaptic("light")
      setThread((t) =>
        t
          ? {
              ...t,
              messages: t.messages.map((x) =>
                x.id === m.id ? { ...x, failed: false, pending: true } : x,
              ),
            }
          : t,
      )
      if ("body" in held) {
        enqueue(() => deliverText(m.id, held.body))
      } else {
        // A photo takes its bubble with it: the failed one is dropped and
        // sendImage draws a fresh optimistic bubble from the same file, so the
        // upload ring and the progress start again from zero rather than
        // resuming a number that means nothing.
        //
        // CHECKED FIRST, because `sendImage` refuses while another upload is in
        // flight — and this had already deleted the bubble by then. Tapping
        // retry at the wrong moment destroyed the photo outright: removed from
        // the conversation, nothing sent, and the file only recoverable from
        // the camera roll. The guard has to be on this side of the delete.
        if (uploading) {
          setThread((t) =>
            t
              ? {
                  ...t,
                  messages: t.messages.map((x) =>
                    x.id === m.id ? { ...x, pending: false, failed: true } : x,
                  ),
                }
              : t,
          )
          return
        }
        outbox.current.delete(m.id)
        setThread((t) => (t ? { ...t, messages: t.messages.filter((x) => x.id !== m.id) } : t))
        void sendImage(held.file)
      }
    },
    [deliverText, enqueue, sendImage, uploading],
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
  // A minute hand for the presence line.
  //
  // `presenceOf` turns a timestamp into "activ acum 3 min" at RENDER time, and
  // a thread you are reading rather than typing in can go a long while without
  // rendering — so the line quietly became a lie about how long ago that was.
  // The cheapest possible correction: a tick that changes a number nothing else
  // reads, once a minute, only while the tab is visible.
  const [, setMinute] = useState(0)
  useEffect(() => {
    const tick = window.setInterval(() => {
      if (document.visibilityState === "visible") setMinute((n) => n + 1)
    }, 60_000)
    return () => window.clearInterval(tick)
  }, [])
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
        // Settling in, once. Not a loading state and not an arrival number —
        // the difference between the conversation appearing and the
        // conversation being cut to. See `.thread-enter` in app/globals.css.
        "thread-enter",
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
            // Two things happen while the finger is down.
            //
            // The disc fades in rather than blinking on: `active:` is a class
            // the browser applies and drops, with nothing in between to animate
            // along, and on the control this whole transition hangs off an
            // instant grey circle is the first thing you see of it.
            //
            // And the copy of the conversation is taken — the one that lets it
            // still be on screen after the route has changed, which is what
            // makes this a pop rather than a swap. It is done here because
            // painting a full extra screen has to happen on SOME frame, and the
            // 80-150ms between a finger landing and a tap resolving is the only
            // one going spare. See lib/messages/pop-shot.ts.
            onPointerDown={() => {
              setBackPressed(true)
              takePopShot()
            }}
            // A press is not a promise of a tap. If no click follows this, the
            // copy is covering a live screen — dropped after a beat rather than
            // immediately, because the click comes a frame or two after the
            // lift and dropping first would take the picture down in front of
            // the navigation it belongs to.
            onPointerUp={() => {
              setBackPressed(false)
              window.setTimeout(dropPopShot, 260)
            }}
            // The system took the gesture. No click is coming at all.
            onPointerCancel={() => {
              setBackPressed(false)
              dropPopShot()
            }}
            data-pressed={backPressed ? "true" : undefined}
            onClick={() => {
              void triggerHaptic("light")
              closeThread()
            }}
            className="tap-fade flex h-10 w-10 items-center justify-center rounded-full"
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
          <div className="flex items-center gap-3 border-t border-neutral-100 px-4 py-2.5">
            <Link
              href={`/products/${encodeURIComponent(thread.listing.slug)}?origin=messages`}
              className="-my-1 flex min-w-0 flex-1 items-center gap-3 rounded-xl py-1 transition-colors active:bg-neutral-50 md:hover:bg-neutral-50"
            >
              {thread.listing.thumbnail_url ? (
                <Image src={thread.listing.thumbnail_url} alt="" width={40} height={40} className="h-10 w-10 shrink-0 rounded-lg object-cover" />
              ) : (
                <span className="h-10 w-10 shrink-0 rounded-lg bg-neutral-100" />
              )}
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[13.5px] font-medium leading-tight text-neutral-700">
                  {thread.listing.title}
                </span>
                {/* THE ID, and only where there is room for it.
                    
                    A marketplace listing needs a short handle somebody can
                    quote — in a report, in a dispute, on the phone to support —
                    and a uuid is not one: thirty-six characters nobody can read
                    back. The leading eight are unique enough to identify one
                    listing among millions and short enough to say out loud,
                    which is the same trade a git short hash makes.
                    
                    Hidden on a phone, where the header has three lines of
                    chrome above the conversation already and this is the least
                    of them. It is a desktop affordance because a desktop has
                    the width for it. */}
                <span className="hidden truncate text-[11px] leading-tight tracking-[0.02em] text-neutral-400 tabular-nums md:block">
                  #{thread.listing.id.replace(/-/g, "").slice(0, 8).toUpperCase()}
                </span>
              </span>
            </Link>
            <span className="shrink-0 text-[14px] font-bold text-neutral-900">{formatPrice(thread.listing.price_cents)}</span>
            {/* Buy the thing you are talking about, from where you are talking
                about it.
                
                Half of every negotiation on a marketplace ends with somebody
                agreeing and then having to go and FIND the listing again — back
                out of the conversation, into the inbox, into the item, down to
                the button. The item is pinned at the top of this thread the
                whole time; the action that finishes the conversation belongs
                next to it.
                
                Only for the buyer, and only while the listing can still be
                bought. A seller does not buy their own item, and an offer to
                purchase something already sold is a dead end dressed up as a
                call to action. Desktop only for the same reason the id is: on a
                phone this row is a strip you glance at, and a button in it
                would be the fourth tappable thing in a header that is 44px
                tall. */}
            {thread.youAre === "buyer" && thread.listing.status === "published" && thread.listing.price_cents > 0 && (
              <Link
                href={`/checkout?productId=${encodeURIComponent(thread.listing.id)}`}
                onClick={() => void triggerHaptic("light")}
                className="hidden h-9 shrink-0 items-center justify-center rounded-full bg-[#7c3aed] px-4 text-[13px] font-semibold text-white shadow-[0_3px_12px_-4px_rgba(124,58,237,0.6)] transition-transform duration-200 hover:bg-[#6d2fd6] active:scale-[0.97] md:inline-flex"
              >
                Cumpără
              </Link>
            )}
          </div>
        )}
      </div>

      {/* The exchange.
          `overscroll-y-contain` is what stops a two-message conversation from
          bouncing: without it the scroller chains its overscroll to the
          document, so dragging on a thread that does not scroll drags the whole
          page and reveals empty space under the composer. Contained, the drag
          simply does nothing, which is the honest answer when there is nothing
          above or below to reach. */}
      {/* Below the header, above the conversation — chrome rather than content.
          The exchange begins under it and is never overlapped by it, and it does
          not move when you scroll, because it is not in the scroller. Never on
          the Storelib thread: warning somebody about the platform, inside the
          platform's own thread, reads as the app not knowing who it is. */}
      {thread && !thread.official && <SafetyNotice />}

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
        // A finger on the list outranks anything this component wanted. Without
        // this, starting to scroll while the thread is making room means
        // fighting it for half a second — which is the one way an animated
        // scroll is genuinely worse than a jump.
        onPointerDown={stopGlide}
        onWheel={stopGlide}
        // A conversation is a log that updates on its own, and a screen reader
        // was told nothing when a message arrived — the one thing on this
        // screen that changes without the reader doing anything. `polite`
        // rather than `assertive` so it waits for a gap instead of interrupting
        // whatever is being read out, which is what an incoming message should
        // do to a sighted reader too.
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-label="Conversație"
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
                <Fragment key={m.localKey ?? m.id}>
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
                      isFresh(m.localKey ?? m.id) && (mine ? "msg-in-mine" : "msg-in-theirs"),
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
                            decoding="async"
                            style={{
                              opacity: 0,
                              transition: "opacity 220ms ease",
                              // THE BOX BEFORE THE PIXELS.
                              //
                              // `w-full` with a max height and no intrinsic size
                              // means the img is zero pixels tall until the file
                              // has decoded — so the bubble appeared as a sliver
                              // and snapped to its real height a moment later,
                              // shoving the whole conversation up with it. Now
                              // that a send glides the scroller over half a
                              // second, that snap lands mid-glide and moves the
                              // target underneath the animation.
                              //
                              // 3/4 until the real ratio is known, because a
                              // phone camera in someone's hand produces portrait
                              // far more often than not, and being right most of
                              // the time costs nothing when the correction
                              // arrives within a frame or two. Only ever applied
                              // to a photo still going up: one that came from
                              // the server is fetched with its dimensions in the
                              // file, and forcing a ratio on it would crop it.
                              ...(m.pending ? { aspectRatio: String(m.aspect ?? 0.75) } : null),
                            }}
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
                          // NO DIMMING WHILE IT IS IN FLIGHT, and removing it is
                          // the last discontinuity in a send.
                          //
                          // The entry animation lives on the WRAPPER around this
                          // bubble and ramps opacity 0 → 1. A 0.7 here multiplies
                          // with it, so the message arrived at seven tenths
                          // strength — and then, whenever the server happened to
                          // answer, `opacity-70` was dropped and a second 200ms
                          // ramp ran 0.7 → 1 ON TOP of the first one, which was
                          // often still going. Two overlapping opacity curves on
                          // nested elements, the second one triggered by a
                          // network response: the brightness of your own message,
                          // and when it changed, depended on the connection.
                          //
                          // A message you sent is full strength from its first
                          // frame. That it has not landed yet is said by the
                          // receipt underneath it — "Se trimite…" with a single
                          // check — which is where every chat worth copying says
                          // it, and which costs the message itself nothing.
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
                    {(endsRun || m.failed) && (
                      <div className="mt-1 flex items-center gap-1 px-1 text-[11px] leading-none text-neutral-400">
                        <span className="tabular-nums">{timeLabel(at)}</span>
                        {mine && (i === lastMineIndex || m.failed) && (
                          <>
                            <span aria-hidden>·</span>
                            {/* Keyed on the state itself, so going from sent to
                                seen replaces the element and plays the receipt
                                animation. Without the key React would edit the
                                text in place and "Trimis" would become "Văzut"
                                by silently swapping four letters — the one
                                moment in a conversation worth noticing, and the
                                one it was doing invisibly. */}
                            {m.failed ? (
                              // The retry lives HERE, on the receipt line, not
                              // on the bubble. A bubble that is also a button is
                              // a bubble you cannot long-press for the actions
                              // sheet without wondering what a tap will do — and
                              // a failed message is exactly when you want to be
                              // able to copy the text out of it.
                              <button
                                type="button"
                                onClick={() => retrySend(m)}
                                className="receipt flex items-center gap-1 font-semibold text-red-600 transition-opacity active:opacity-60"
                              >
                                <RotateCw className="h-3 w-3" strokeWidth={2.6} />
                                Reîncearcă
                              </button>
                            ) : (
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
                            )}
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
            disabled={uploading}
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
              // The server trims to 2000 and the database refuses past 4000, so
              // without this the field happily accepted three thousand
              // characters and then silently sent two — the end of your message
              // deleted, with nothing anywhere saying so. A maxLength stops the
              // typing instead, which is the only honest place to stop it.
              maxLength={MAX_MESSAGE_CHARS}
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
            {/* ALWAYS RENDERED, never conditionally mounted.
                It used to appear and disappear with `canSend`, which meant the
                purple disc you had just pressed VANISHED on the frame the field
                cleared — the one control in the send that is under your finger,
                and the only part of the interaction with no animation on it at
                all. A mounted element can transition in both directions; an
                unmounted one can only pop. Inert and untabbable while there is
                nothing to send, so it is invisible to a finger and to a
                keyboard exactly when it is invisible to the eye. */}
            {/* Shown only in the last tenth, because a counter on an empty
                field is a limit nobody was near being told about. */}
            {draft.length > MAX_MESSAGE_CHARS * 0.9 && (
              <span className="pointer-events-none absolute -top-5 right-1 text-[11px] font-medium tabular-nums text-neutral-400">
                {MAX_MESSAGE_CHARS - draft.length}
              </span>
            )}
            <button
                type="button"
                aria-label="Trimite"
                data-ready={canSend ? "1" : undefined}
                tabIndex={canSend ? 0 : -1}
                aria-hidden={!canSend}
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
                // Not disabled by `sending`. The button is already on its way
                // out by then — `canSend` went false the moment the field
                // cleared — and disabling it as it leaves only dims a control
                // nobody can see. The guard that matters is inside `send`.
                disabled={!canSend}
                className="send-fab absolute bottom-[5px] right-[5px] flex h-[34px] w-[34px] items-center justify-center rounded-full text-white"
                style={{
                  background: "linear-gradient(160deg, #8b5cf6 0%, #7c3aed 52%, #6d28d9 100%)",
                  boxShadow: "0 1px 2px rgba(76,29,149,0.3), 0 4px 10px -3px rgba(124,58,237,0.5)",
                }}
              >
                {/* Always the arrow. A spinner here would be shown inside a
                    34px disc that is shrinking to nothing over 180ms — nobody
                    ever saw it, and the thing it was reporting is reported
                    where it belongs: on the bubble, which is already on screen
                    saying "Se trimite…". */}
                <Send className="h-[16px] w-[16px]" />
              </button>
          </div>
        </div>
      </div>

      {/* MOUNTED ONLY WHILE A PHOTO IS OPEN.
          It used to be mounted permanently with `src` going null when nothing
          was showing, and the viewer renders null in that state — so it looked
          equivalent. It is not: the component instance survives, and with it
          every ref and every inline style written straight to the DOM. Which
          photographs had decoded, the pan-and-zoom transform on the <img>, the
          rail's overflow, the latch that stops the close running twice — all of
          it carried into the NEXT photo you opened. The listing gallery and the
          profile avatar have always mounted this conditionally and have never
          had any of those faults. */}
      {viewing && <ImageViewer src={viewing} onClose={() => setViewing(null)} />}

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
