"use client"

import { Fragment, useCallback, useEffect, useRef, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { BadgeCheck, Bell } from "lucide-react"
import { useLocale } from "@/components/locale-provider"
import { ConversationRow } from "@/components/messages/conversation-row"
import { MessagesEmptyState } from "@/components/messages/empty-state"
import { IosSpinner } from "@/components/explore/ios-spinner"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { InitialAvatar } from "@/components/ui/initial-avatar"
import { useFeedPullRefresh } from "@/hooks/use-feed-pull-refresh"
import {
  hiddenConversations,
  hideConversation,
  unhideConversation,
} from "@/lib/messages/hidden-conversations"
import { wasServedFromCache } from "@/lib/render-key"
import { createClient } from "@/lib/supabase/client"
import { triggerHaptic } from "@/lib/native-bridge"
import { beginTabLeave } from "@/lib/tab-leave"
import { useWideViewport } from "@/lib/use-wide-viewport"
import { cn } from "@/lib/utils"

export type Row = {
  id: string
  lastMessageAt: string
  youAre: "buyer" | "seller"
  listing: { id: string; title: string; slug: string; thumbnail_url: string | null; price_cents: number } | null
  other: { id: string; display_name: string | null; username: string | null; avatar_url: string | null } | null
  // Storelib itself writing to you: a verified check, no item, always on top.
  // The server decides this; the row only has to render it.
  official?: boolean
  lastMessage: {
    sender_id: string
    kind: "text" | "offer" | "image"
    body: string | null
    offer_cents: number | null
    offer_status: "pending" | "accepted" | "declined" | null
  } | null
  unread: number
}

type Notif = {
  id: string
  kind: "follow" | "offer_received" | "offer_accepted" | "offer_declined" | "message"
  createdAt: string
  readAt: string | null
  conversationId: string | null
  actor: { id: string; display_name: string | null; username: string | null; avatar_url: string | null } | null
  listing: { id: string; title: string; slug: string; thumbnail_url: string | null } | null
}

function ago(iso: string): string {
  const mins = Math.max(1, Math.round((Date.now() - Date.parse(iso)) / 60000))
  if (mins < 60) return `${mins} min`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} h`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days} z`
  return `${Math.round(days / 7)} săpt`
}

/** One avatar treatment for both lists. The "?" this used to fall back to is
 *  gone — see components/ui/initial-avatar.tsx. */
function Avatar({ name, url, seed }: { name: string; url: string | null; seed?: string | null }) {
  return <InitialAvatar name={name} url={url} seed={seed} size={48} />
}

/**
 * The hairline between two rows, inset to where the text column begins: 8px of
 * row padding, a 48px avatar and the 12px gap between them. Written once so the
 * two lists cannot drift into two different treatments, and dropped on the last
 * row because a rule under the final row promises another one below it.
 */
const ROW_DIVIDER =
  "relative after:pointer-events-none after:absolute after:bottom-0 after:left-[68px] after:right-2 after:h-px after:bg-neutral-100 after:content-[''] last:after:hidden"

/**
 * Both lists are one card rather than a run of loose rows.
 *
 * The rows themselves were already right — the frame is what was missing, and
 * without it the screen was a stack of divs on a white page with nothing to say
 * where the list began or ended. It is the same card the rest of the app uses
 * (rounded-2xl, a neutral-200/70 hairline), and `overflow-hidden` is what lets
 * a row paint edge to edge: the unread wash and the pressed state reach the
 * card's corners instead of stopping short of them.
 *
 * The row padding stays at 8px so that, with the card's own hairline, the
 * avatars land within a pixel of where the title above them starts. A list that
 * is indented from its own heading reads as a nested thing rather than as the
 * content of the screen.
 */
const LIST_CARD = "overflow-hidden rounded-2xl border border-neutral-200/70 bg-white"

/** Every row in both lists is the same object: 48px of avatar with 14px of air
 *  above and below it, which is the 76px the loading skeleton also draws. */
const ROW_INNER = "flex items-center gap-3 px-2 py-3.5 transition-colors"

/**
 * The inbox: conversations and notifications behind one segmented control.
 * Messages keep their three states — signed out, empty, rows — and the
 * notifications side loads lazily on the first switch, because most visits
 * here are about replying, not about the feed of who followed whom.
 *
 * `initialConversations` is the whole point of the server component above: with
 * rows in hand from the first frame there is no skeleton to paint here and no
 * fetch to wait on, so the inbox arrives once instead of three times. Null
 * means the server could not answer — a signed-in session whose read failed —
 * and only then does the old client-first path run.
 */
export function MessagesInbox({
  initialConversations = null,
  renderKey,
  viewerId,
  dormantWhenWide = false,
}: {
  initialConversations?: Row[] | null
  /**
   * True when a wider screen draws the split view instead of this one.
   *
   * Both are in the DOM on /messages and CSS picks which is visible — see
   * components/messages/split-shell.tsx. A hidden component still runs its
   * effects, so without this the desktop inbox would have TWO lists polling the
   * same endpoint and two subscriptions to the same channel, one of them for a
   * screen nobody can see. Rendering costs nothing; asking the server does.
   */
  dormantWhenWide?: boolean
  /**
   * Proof of whether the server produced these rows for THIS navigation.
   *
   * This exists because of a bug that took several rounds to find: the inbox is
   * a dynamic route held in the CLIENT ROUTER CACHE for three minutes, so
   * tapping the Messages tab can serve a payload rendered minutes ago — from
   * before the conversation you started on a listing page existed. The client
   * assumed anything the server handed it was new, started its thirty-second
   * freshness clock at mount, and refused to refetch for half a minute on rows
   * that were already stale when they arrived. That is the conversation missing
   * until you reload the page.
   *
   * The first attempt at this stamped the server's `Date.now()` here and
   * compared it against the client's. Those are two different machines, and a
   * phone whose clock runs behind the server measures a three-minute-old
   * payload as brand new — reintroducing the exact bug the stamp was added to
   * fix, on precisely the devices least likely to be noticed. A nonce answers
   * the same question with no clock in it. See lib/render-key.ts.
   */
  renderKey?: string
  /** Whose inbox this is. Only used to key the local record of conversations
   *  removed on this device — see lib/messages/hidden-conversations.ts. */
  viewerId?: string | null
}) {
  const { formatPrice } = useLocale()
  const [tab, setTab] = useState<"messages" | "notifications">("messages")
  // No entrance on the lists behind this switcher, in either direction.
  //
  // There used to be a 180ms fade on the incoming one. The intent was to soften
  // the swap; the effect was that the notifications you had just asked to see
  // arrived slightly translucent and then settled, which reads as the tab
  // loading rather than as the tab changing. The pill already slides — that IS
  // the transition, it is continuous, and it tracks the finger. A second
  // animation on the content underneath it is one more thing happening than was
  // asked for, on a control you press constantly.
  const [rows, setRows] = useState<Row[] | null>(initialConversations)
  // Read once. A set rebuilt on every render would make the memo below useless
  // and, worse, would let a row flicker back in between a delete and its write.
  /**
   * STATE, not a value read once at mount — and this is the delete bug.
   *
   * `hideConversation` writes to localStorage, and this Map was read from it
   * exactly once, in the initialiser. So for the rest of the session the Map did
   * not know about anything you had deleted: the row vanished only because
   * `setRows` filtered it, and the moment `rows` was replaced by a fresh read —
   * a poll, a focus, and now the live inbox channel, which fires far more often
   * than either — the conversation came straight back. The local record was
   * correct on disk and ignored in memory.
   */
  const [hidden, setHidden] = useState(() => hiddenConversations(viewerId))
  /** The row a swipe has proposed deleting, held until it is confirmed. */
  const [pendingDelete, setPendingDelete] = useState<Row | null>(null)
  /**
   * A conversation you removed stays removed until somebody says something new.
   *
   * This used to be `!hidden.has(r.id)` and that was a message-losing bug, not
   * a cosmetic one: the id was hidden on this device with no rule that could
   * ever put it back, so when the other person replied their message arrived,
   * counted towards the unread badge, and was invisible. Comparing against WHEN
   * it was hidden is the same rule the server's `buyer_deleted_at` column
   * follows — you removed the conversation as it stood then, and anything said
   * afterwards brings it back.
   *
   * The local record is tidied as a side effect rather than in an effect,
   * deliberately: it is idempotent, it touches only rows that have already
   * earned their way back, and doing it here means the storage cannot disagree
   * with what is on screen even for one render.
   */
  const visibleRows = rows
    ? rows.filter((r) => {
        const hiddenAt = hidden.get(r.id)
        if (hiddenAt === undefined) return true
        // `Date.parse`, not a string comparison. Postgres hands back
        // `2026-08-05T21:15:00.123456+00:00` while the delete was written as
        // `…123Z`, and comparing those as text compares "4" against "Z" at the
        // fourth decimal — an answer that depends on the shape of the string
        // rather than on the times it represents. Two numbers cannot disagree.
        const spokeSince = Date.parse(r.lastMessageAt) > hiddenAt
        if (!spokeSince) return false
        unhideConversation(viewerId, r.id)
        return true
      })
    : rows
  const [signedOut, setSignedOut] = useState(false)
  const [notifs, setNotifs] = useState<Notif[] | null>(null)
  const [notifUnread, setNotifUnread] = useState(0)
  // Read once, at mount, and never again: a later render must not be able to
  // turn "the server already answered" into "fetch now".
  const [servedFromServer] = useState(() => initialConversations !== null)
  /**
   * Whether those rows came out of the router cache. Decided once, on the first
   * render, and never re-decided — the answer is a property of this mount, and
   * a later render must not be able to change it.
   */
  const fromCacheRef = useRef<boolean | null>(null)
  if (fromCacheRef.current === null) {
    fromCacheRef.current = initialConversations !== null && wasServedFromCache(renderKey)
  }
  const fromCache = fromCacheRef.current

  // Whether this instance is the one on screen. See `dormantWhenWide` above.
  const wide = useWideViewport()
  const dormant = dormantWhenWide && wide

  useEffect(() => {
    if (dormant) return
    let alive = true
    // Coming back to the tab is the moment new replies are most likely waiting,
    // but focus fires far more often than replies arrive — every alt-tab, every
    // dismissed dialog. The same thirty-second freshness window the bottom nav
    // keeps applies here, so a burst of focus events costs one fetch rather than
    // one each.
    //
    // Rows rendered by the server are milliseconds old, so the clock starts as
    // if they had just been fetched — the freshness window the component
    // already keeps is what suppresses the duplicate mount request, rather than
    // a second rule that could drift out of step with it.
    // Rows the server rendered for this navigation start the clock as if they
    // had just been fetched; anything out of the router cache starts at zero, so
    // the very next line refetches it. Both branches use the SAME clock — this
    // one — which is the whole point of deciding it with a nonce instead of by
    // subtracting the server's time from ours.
    let lastLoadedAt = servedFromServer && !fromCache ? Date.now() : 0
    const MIN_INTERVAL_MS = 30_000

    /**
     * A failed load used to be silent, and silence here is a skeleton forever.
     *
     * `load` swallowed everything and the only things that could ask again were
     * a focus, a visibility change, a bfcache restore or the live channel. So an
     * inbox whose first read failed — which is now a real outcome rather than a
     * theoretical one, because lib/messages/list.ts raises the case where the
     * caller's read comes back unauthorised-but-empty instead of rendering it as
     * "no messages" — sat on its skeleton until the person backgrounded the app
     * and came back.
     *
     * Three tries over about six seconds, which is sized for what actually
     * fails: a session token refreshing underneath a request in flight. Reset on
     * any success, so a later failure gets the full ladder again rather than
     * inheriting an exhausted one. A 401 is deliberately NOT retried — it is an
     * answer, not a failure, and the screen it produces is correct.
     */
    const RETRY_MS = [600, 1500, 4000]
    let failures = 0
    let retryTimer = 0

    const scheduleRetry = () => {
      if (!alive || failures >= RETRY_MS.length) return
      const wait = RETRY_MS[failures]
      failures++
      window.clearTimeout(retryTimer)
      retryTimer = window.setTimeout(() => {
        // Past the freshness window: this is a repair, not a poll.
        lastLoadedAt = 0
        void load()
      }, wait)
    }

    const load = (): Promise<void> => {
      lastLoadedAt = Date.now()
      return fetch("/api/messages", { credentials: "include" })
        .then((r) => {
          // Only an outright 401 means signed out. A 503 is the server failing
          // to read the session, and answering it with the signed-out inbox
          // would tell a signed-in person they had been logged out.
          if (r.status === 401) {
            if (alive) setSignedOut(true)
            return "signed-out" as const
          }
          return r.ok ? r.json() : null
        })
        .then((data) => {
          if (data === "signed-out") return
          if (data) {
            failures = 0
            if (alive) setRows(data.conversations ?? [])
            return
          }
          scheduleRetry()
        })
        .catch(() => scheduleRetry())
    }

    const maybeLoad = () => {
      if (Date.now() - lastLoadedAt < MIN_INTERVAL_MS) return
      load()
    }

    // On mount too, and gated by the same clock. Arriving on a payload the
    // router cached minutes ago is indistinguishable from arriving on a fresh
    // one, so the check has to be about AGE rather than about which path got
    // here.
    maybeLoad()

    // `focus` does not fire when you tap a tab — the window never lost focus.
    // `visibilitychange` covers coming back to the app; `pageshow` covers a
    // back-forward-cache restore, where nothing else fires at all.
    const onVisible = () => {
      if (document.visibilityState === "visible") maybeLoad()
    }
    window.addEventListener("focus", maybeLoad)
    document.addEventListener("visibilitychange", onVisible)
    window.addEventListener("pageshow", maybeLoad)

    // LIVE, not on a thirty-second floor.
    //
    // This was the one screen in the app with no live path at all: it refreshed
    // on focus, on visibility, and otherwise no sooner than every half minute.
    // So you could sit looking at your messages while a reply landed and see
    // nothing — on the exact screen where anybody decides whether an app is
    // realtime.
    //
    // The channel is keyed to the PERSON rather than to a conversation, because
    // that is the question this screen asks: has anything anywhere changed for
    // me. One subscription covers every thread they have, including ones that
    // did not exist when the screen was opened — which a per-conversation
    // subscription structurally cannot, and which is exactly "somebody messaged
    // me about a listing for the first time". The server rings it; see
    // announceInbox in lib/messages/announce.ts.
    //
    // The polling above stays exactly as it was. This is a doorbell, not a
    // replacement for asking: a socket that never connects, or connects and
    // goes quiet, leaves the screen no worse than it was yesterday.
    let channel: ReturnType<ReturnType<typeof createClient>["channel"]> | null = null
    if (viewerId) {
      channel = createClient()
        .channel(`inbox:${viewerId}`, { config: { broadcast: { self: false } } })
        .on("broadcast", { event: "changed" }, () => {
          // Straight past the freshness window: something has definitely
          // changed, which is the one case the window exists to guess at.
          lastLoadedAt = 0
          maybeLoad()
        })
        .subscribe()
    }

    return () => {
      alive = false
      window.clearTimeout(retryTimer)
      window.removeEventListener("focus", maybeLoad)
      document.removeEventListener("visibilitychange", onVisible)
      window.removeEventListener("pageshow", maybeLoad)
      if (channel) void createClient().removeChannel(channel)
    }
  }, [servedFromServer, fromCache, viewerId])

  // The red dot on the Notificări segment costs one head count on mount.
  useEffect(() => {
    let alive = true
    fetch("/api/notifications/unread", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive && d) setNotifUnread(d.count ?? 0)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  // First switch to the segment fetches the feed; once it is on screen, the
  // whole batch is marked read server-side and the badge clears optimistically.
  // The rows keep their fetched unread styling so this viewing still shows
  // what was new — only the next visit renders them quiet.
  useEffect(() => {
    if (tab !== "notifications" || notifs !== null) return
    let alive = true
    fetch("/api/notifications", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive) return
        const items: Notif[] = d?.notifications ?? []
        setNotifs(items)
        setNotifUnread(0)
        if (items.some((n) => !n.readAt)) {
          fetch("/api/notifications", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ action: "read-all" }),
          }).catch(() => {})
        }
      })
      .catch(() => {
        if (alive) setNotifs([])
      })
    return () => {
      alive = false
    }
  }, [tab, notifs])

  // Pull down to see what has arrived.
  //
  // The inbox refreshes on focus and nothing else, which is right for the case
  // where you leave and come back — and no use at all for the one where you are
  // sitting on it wondering whether they have answered. The grid has answered
  // that with a pull since day one; there is no reason a list of conversations
  // should be the one list on the phone you cannot ask.
  //
  // Same hook, so it is the same gesture: armed at the top, resisted like
  // rubber, spinner held long enough that a fast answer does not flash.
  const scrollRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const spinnerRef = useRef<HTMLDivElement>(null)

  // Removing a conversation from this list, from the list itself.
  //
  // Optimistic, and deliberately so: the row is already off the side of the
  // screen by the time this runs, and putting it back for the length of a round
  // trip would be the one animation nobody wants to see reversed.
  /** Rows on their way out, collapsing. Removed from `rows` when they finish. */
  const [leaving, setLeaving] = useState<Set<string>>(new Set())

  const removeConversation = useCallback(
    async (conversationId: string) => {
      // IT COLLAPSES, it does not vanish.
      //
      // The row was removed from the array on the frame the button was pressed,
      // so everything below it jumped up by its full height in one step —
      // which, on a list where you have just confirmed something in a sheet
      // that is itself sliding away, reads as the screen glitching rather than
      // as a row being deleted. It folds now: height to zero, contents fading,
      // over 260ms, and only then does it leave the array.
      //
      // The server call goes out IMMEDIATELY rather than after the animation.
      // The two are unrelated, and making the request wait on a transition
      // would be a quarter of a second added to the thing that actually
      // matters for no reason at all.
      setLeaving((prev) => new Set(prev).add(conversationId))
      window.setTimeout(() => {
        setRows((prev) => (prev ? prev.filter((r) => r.id !== conversationId) : prev))
        setLeaving((prev) => {
          const next = new Set(prev)
          next.delete(conversationId)
          return next
        })
      }, 280)
      // Recorded locally FIRST, and unconditionally. Whether the server can
      // remember this is a question about someone else's database; whether the
      // row comes back on this screen is a promise already made to the person
      // who pressed the button.
      hideConversation(viewerId, conversationId)
      // …and in memory, or the next refresh of `rows` puts it straight back.
      setHidden((prev) => {
        const next = new Map(prev)
        next.set(conversationId, Date.now())
        return next
      })
      try {
        await fetch(`/api/messages/${conversationId}/actions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ action: "delete" }),
        })
      } catch {
        /* the local record still holds */
      }
    },
    [viewerId],
  )

  /**
   * Read, not deleted — which is both what the platforms do and what actually
   * works here.
   *
   * The old behaviour was a swipe on each row that called DELETE, and it never
   * persisted: `public.notifications` has RLS enabled with a select policy and
   * an update policy and NO delete policy, so the statement matched zero rows,
   * returned no error, and the API answered `{ ok: true }` over a row that was
   * still there. The list emptied optimistically and refilled on the next load.
   * A delete that silently does nothing is worse than no delete at all.
   *
   * But the fix is not "add a delete policy". Look at what a notification is:
   * a nudge about something that already happened, which is still on its own
   * screen — the follow is on your profile, the offer is in the thread. Neither
   * Depop nor Vinted lets you delete them one by one, because there is nothing
   * to curate; you read them and they stop being new. So tapping one marks it
   * read, "mark all read" clears the badge in one go, and the thirty-day horizon
   * in the API drops the old ones on its own. Nothing to swipe, nothing that can
   * fail silently, and the same behaviour as every app this one is measured
   * against.
   */
  const readNotif = useCallback(async (notifId: string) => {
    let wasUnread = false
    setNotifs((prev) => {
      if (!prev) return prev
      return prev.map((n) => {
        if (n.id !== notifId || n.readAt) return n
        wasUnread = true
        return { ...n, readAt: new Date().toISOString() }
      })
    })
    if (!wasUnread) return
    setNotifUnread((u) => Math.max(0, u - 1))
    try {
      await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "read", id: notifId }),
      })
    } catch {
      /* the next load reconciles */
    }
  }, [])

  const readAllNotifs = useCallback(async () => {
    void triggerHaptic("light")
    const now = new Date().toISOString()
    setNotifs((prev) => (prev ? prev.map((n) => (n.readAt ? n : { ...n, readAt: now })) : prev))
    setNotifUnread(0)
    try {
      await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "read-all" }),
      })
    } catch {
      /* the next load reconciles */
    }
  }, [])

  const onRefresh = useCallback(async () => {
    // Whichever list is actually on screen. Refreshing the other one would be
    // work nobody asked for and, on the notifications side, would mark a batch
    // read that has not been looked at.
    try {
      if (tab === "messages") {
        const r = await fetch("/api/messages", { credentials: "include" })
        if (r.ok) setRows((await r.json()).conversations ?? [])
      } else {
        const r = await fetch("/api/notifications", { credentials: "include" })
        if (r.ok) {
          setNotifs((await r.json()).notifications ?? [])
          setNotifUnread(0)
        }
      }
    } catch {
      /* the list stays as it was, which is the honest outcome of a failed pull */
    }
  }, [tab])

  useFeedPullRefresh({
    scrollRef,
    contentRef: listRef,
    spinnerRef,
    onRefresh,
    enabled: true,
  })

  // A switch is a deliberate, physical act on a phone, so it answers like one:
  // a tick of haptic on the way, and never on a re-tap of the segment you are
  // already reading.
  const switchTo = useCallback(
    (next: "messages" | "notifications") => {
      if (next === tab) return
      void triggerHaptic("light")
      setTab(next)
    },
    [tab],
  )

  // The page renders this same screen for a visitor who was never signed in.
  // What is left here is the session that expired while the tab sat open: the
  // 401 lands on a client that is already mounted, and it has to say so.
  if (signedOut) {
    return (
      <MessagesEmptyState
        className="min-h-[60svh]"
        title="Conectează-te pentru mesaje"
        body="Conversațiile cu vânzătorii și cumpărătorii apar aici după ce te conectezi."
        cta={{ href: "/login?next=/messages", label: "Conectează-te" }}
      />
    )
  }

  return (
    // The column fills the space the marketing layout gives it and no more.
    // Bottom padding lives on the lists rather than here, because the layout's
    // mobile nav already reserves its own strip below <main>: paying for it
    // twice was most of the empty space this page used to scroll through.
    <div
      className={cn(
        // `h-full`, not `min-h-full`: the list below owns the scrolling, and a
        // scroll container needs a definite height to scroll INSIDE rather than
        // pushing the page taller. Both at once is a contradiction the browser
        // resolves in whichever direction the layout happens to fall.
        // `flex-1` with `min-h-0`, not `h-full`.
        //
        // A percentage height resolves against the parent's height PROPERTY,
        // and every ancestor up to the shell is either `flex-1` or carries a
        // minimum — none of them states a height — so `h-full` resolved to auto
        // and this column shrank to the height of its own header. Which is the
        // bug where the conversations did not load: the list underneath was
        // handed zero pixels to scroll inside. Flex gives a real, measurable
        // height at every step, and `min-h-0` is what lets this be SHORTER than
        // its content instead of being pushed open by it. See
        // `.marketing-flex-wrapper:has([data-app-screen])` in app/globals.css.
        "mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col px-2 md:px-0 md:py-8",
      )}
    >
      <h1 className="shrink-0 px-2 pb-1 pt-4 text-[21px] font-bold text-neutral-900">
        {tab === "messages" ? "Mesaje" : "Notificări"}
      </h1>
      <div className="shrink-0 px-2 pb-2.5 pt-1">
        {/* One pill that slides, rather than two that blink. It is absolutely
            positioned and moved on a transform, so the browser composites it
            instead of relaying out the control on every frame — and the
            buttons above it keep their exact geometry.

            The proportions are what the control lives or dies on. The track is
            44px, the pill 36px inside a 4px inset, and because an absolutely
            positioned box resolves its percentage width against the padding box
            the pill is exactly one button wide — so translateX(100%) lands it on
            the second label to the pixel rather than near it. The shadow is a
            hairline plus a short drop, the amount a real key sitting on a
            surface casts; a flat `shadow-sm` is what made it read as a coloured
            rectangle. And the inactive label steps to neutral-400, far enough
            below the active one to be legible as "not this one" at a glance. */}
        <div className="relative flex h-11 items-center rounded-full bg-neutral-100 p-1">
          <span
            aria-hidden
            className="pointer-events-none absolute left-1 top-1 h-9 w-[calc(50%-4px)] rounded-full bg-white shadow-[0_1px_1px_rgba(15,15,15,0.04),0_2px_6px_-1px_rgba(15,15,15,0.12)] ring-1 ring-black/[0.03] transition-transform duration-[320ms] ease-[cubic-bezier(0.32,0.72,0,1)] will-change-transform motion-reduce:transition-none"
            style={{ transform: tab === "messages" ? "translateX(0%)" : "translateX(100%)" }}
          />
          {(
            [
              { key: "messages", label: "Mesaje" },
              { key: "notifications", label: "Notificări" },
            ] as const
          ).map((s) => (
            <button
              key={s.key}
              type="button"
              aria-pressed={tab === s.key}
              onClick={() => switchTo(s.key)}
              className={cn(
                "relative z-10 flex h-9 flex-1 items-center justify-center rounded-full text-[14.5px] tracking-[-0.01em] transition-colors duration-200",
                tab === s.key ? "font-semibold text-neutral-900" : "font-medium text-neutral-400",
              )}
            >
              {s.label}
              {s.key === "notifications" && notifUnread > 0 && (
                // Brand purple, not red. Red is the colour of something having
                // gone wrong, and unread notifications are the ordinary state
                // of an app somebody uses. A count IS right here — this is a
                // list header, where the number is about to become rows you can
                // act on — it just does not need to be an alarm.
                <span className="absolute right-2 top-1/2 flex h-[15px] min-w-[15px] -translate-y-1/2 items-center justify-center rounded-full bg-[#7c3aed] px-[4px] text-[9.5px] font-bold leading-none text-white">
                  {notifUnread > 9 ? "9+" : notifUnread}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* The list owns the scrolling, not the page.
          A pull has to be a gesture on a scroll container that is already at its
          top, and the page's scroller is the app shell — shared with the header
          and the tab bar, and not something a list may commandeer. Giving the
          list its own means the pull belongs to it, the title and the switcher
          stay put while it moves, and a short list still cannot scroll. */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {/* Parked above the frame and clipped BY THE BOX ABOVE — without the
            clip those 40px are drawn over the segmented control, so a spinner
            sits on the switcher permanently. */}
        <div
          ref={spinnerRef}
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center"
          style={{ transform: "translate3d(0, -40px, 0)", opacity: 0 }}
        >
          <IosSpinner size={22} />
        </div>

        <div ref={scrollRef} className="absolute inset-0 overflow-y-auto overscroll-y-contain scrollbar-hide">
          {/* Remounted per tab so the incoming list fades up instead of
              appearing mid-slide. Opacity only, and the box it happens in is the
              same flex child either way, so nothing under it moves.
              translate3d puts the pull on its own compositor layer — the hook
              writes the transform straight to this node, so a drag never goes
              through React. */}
          <div ref={listRef} className="min-h-full" style={{ transform: "translate3d(0, 0, 0)" }}>
            <div key={tab} className="flex min-h-full flex-col">
              {/* No entrance on the rows.
                  A staggered rise looked considered in isolation and reads, on a
                  screen you open twenty times a day, as the inbox arriving in
                  pieces — every row visibly moving into place before you can use
                  it. The list is simply there. */}
              {tab === "messages" ? (
                <MessagesList
                  rows={visibleRows}
                  leaving={leaving}
                  formatPrice={formatPrice}
                  onDelete={(id) => setPendingDelete(rows?.find((r) => r.id === id) ?? null)}
                />
              ) : (
                <NotificationsList items={notifs} onRead={readNotif} onReadAll={readAllNotifs} />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Asked, not assumed.
          A swipe is easy to do by accident on a list you scroll with your thumb,
          and until the migration lands a delete is remembered on this device
          only — so it is worth one deliberate tap, and worth saying plainly what
          will happen to the other person's copy. */}
      <BottomSheet
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        label="Șterge conversația"
        header={
          <div className="px-5 pb-2 pt-4">
            <p className="text-[17px] font-semibold text-neutral-900">Ștergi conversația?</p>
            <p className="mt-1 text-[13.5px] leading-snug text-neutral-500">
              {pendingDelete
                ? `Conversația cu ${pendingDelete.other?.display_name || pendingDelete.other?.username || "acest utilizator"} dispare din lista ta. Cealaltă persoană își păstrează conversația.`
                : ""}
            </p>
          </div>
        }
      >
        <div className="flex flex-col gap-2 px-3 pb-1 pt-2">
          <button
            type="button"
            onClick={() => {
              const target = pendingDelete
              setPendingDelete(null)
              if (target) void removeConversation(target.id)
            }}
            className="h-12 w-full rounded-full bg-neutral-900 text-[15.5px] font-semibold text-white transition-transform active:scale-[0.98]"
          >
            Șterge conversația
          </button>
          <button
            type="button"
            onClick={() => setPendingDelete(null)}
            className="h-12 w-full rounded-full border border-neutral-200 text-[15.5px] font-semibold text-neutral-700 transition-transform active:scale-[0.98]"
          >
            Renunță
          </button>
        </div>
      </BottomSheet>
    </div>
  )
}

function MessagesList({
  rows,
  leaving,
  formatPrice,
  onDelete,
}: {
  rows: Row[] | null
  /** Ids mid-collapse. They stay in the list until the fold finishes. */
  leaving: Set<string>
  formatPrice: (cents: number) => string
  onDelete: (id: string) => void
}) {
  if (rows === null) return <ListSkeleton />
  // Rare now: everyone gets the Storelib thread on their first visit here, so
  // this only shows where the official account isn't configured at all. The
  // copy stays as it was, because that state still reads as "no messages yet".
  if (rows.length === 0) {
    return (
      <MessagesEmptyState
        className="min-h-[40svh] flex-1"
        title="Niciun mesaj încă"
        body="Scrie-i unui vânzător sau fă o ofertă la un articol — conversația apare aici."
        cta={{ href: "/", label: "Descoperă anunțuri" }}
      />
    )
  }

  return (
    // The rule starts where the text starts, not at the edge of the screen: a
    // full-bleed `divide-y` cuts straight through the avatar column and reads as
    // a table, while a line that begins under the name reads as one row ending
    // and the next beginning. It is drawn per row rather than by `divide-y` so
    // the last one can be dropped — a line under the final row is a promise of
    // another row that isn't there.
    <ul className={cn(LIST_CARD, "mb-8 md:mb-10")}>
      {rows.map((r) => {
        const name = r.other?.display_name || r.other?.username || "Utilizator"
        const preview =
          r.lastMessage?.kind === "image"
            ? r.lastMessage.body || "📷 Fotografie"
            : r.lastMessage?.kind === "offer"
            ? `Ofertă: ${formatPrice(r.lastMessage.offer_cents ?? 0)}${
                r.lastMessage.offer_status === "accepted"
                  ? " · acceptată"
                  : r.lastMessage.offer_status === "declined"
                    ? " · refuzată"
                    : ""
              }`
            : r.lastMessage?.body || ""
        return (
          <li
            key={r.id}
            // `grid-template-rows: 1fr → 0fr` is what makes a row of UNKNOWN
            // height animate to nothing. Height cannot be transitioned from
            // `auto`, and measuring each row to set a pixel height would mean a
            // layout read per delete on a list that is already scrolling. The
            // grid track can be transitioned, and the child clips to it.
            className={cn(ROW_DIVIDER, "group/row row-leave", leaving.has(r.id) && "is-leaving")}
          >
            <div className="row-leave-inner">
            <ConversationRow onDelete={() => onDelete(r.id)}>
            <Link
              href={`/messages/${r.id}`}
              // The thread route has a loading boundary now, so there is finally
              // a static shell for this to fetch: the tap paints a conversation
              // -shaped screen immediately instead of leaving you on the inbox
              // while the payload travels.
              prefetch
              // The screen starts leaving with the finger, and the conversation
              // carries on from where it left it.
              //
              // Opening a thread used to be a fade that began at half strength
              // the moment the new route committed, with nothing at all
              // happening in the wait before it. A screen that appears at 0.5
              // and climbs is not a transition, it is an arrival with a number
              // attached — and the number is the part you see. What makes a
              // push read as a push is that the thing you were looking at
              // started to go first. See lib/tab-leave.ts.
              onClick={() => {
                void triggerHaptic("light")
                beginTabLeave()
              }}
              className={cn(
                ROW_INNER,
                // An unread thread is a different kind of row, so it is a
                // different surface. The wash is faint on purpose — it has to
                // survive being seen next to six read rows without turning the
                // list into stripes — and it is what the bold name, the purple
                // hour and the count were previously being asked to do alone,
                // all of them inside the text column where the eye is already
                // busy reading.
                r.unread > 0 ? "bg-[#7c3aed]/[0.05] active:bg-[#7c3aed]/[0.1]" : "active:bg-neutral-50",
              )}
            >
              <Avatar name={name} url={r.other?.avatar_url ?? null} seed={r.other?.id} />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1">
                    {/* Unread is said three times over — the name goes bold and
                        near-black, the hour turns purple, and the count sits at
                        the end in the same purple. One of those alone is a
                        difference you have to look for. */}
                    <span
                      className={cn(
                        "truncate text-[15px]",
                        r.unread > 0 ? "font-bold text-neutral-950" : "font-semibold text-neutral-900",
                      )}
                    >
                      {name}
                    </span>
                    {r.official && <BadgeCheck className="h-4 w-4 shrink-0 text-[#1d9bf0]" />}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 text-[12px]",
                      r.unread > 0 ? "font-semibold text-[#7c3aed]" : "text-neutral-400",
                    )}
                  >
                    {ago(r.lastMessageAt)}
                  </span>
                </span>
                <span className="mt-0.5 flex items-center gap-2">
                  <span
                    className={cn(
                      "truncate text-[13.5px]",
                      // An offer keeps the darker weight whether or not the
                      // thread has been read: it is about money, and
                      // "Ofertă: 120 lei" is the line a seller scans the list
                      // for long after they have opened it once.
                      r.unread > 0 || r.lastMessage?.kind === "offer"
                        ? "font-medium text-neutral-800"
                        : "text-neutral-500",
                    )}
                  >
                    {preview}
                  </span>
                  {r.unread > 0 && (
                    <span className="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-[#7c3aed] px-1 text-[11px] font-bold text-white">
                      {r.unread}
                    </span>
                  )}
                </span>
              </span>
              {/* The grey square is a placeholder for a listing whose photo
                  hasn't loaded. Storelib's thread is about no listing at all,
                  so it gets nothing there rather than an empty promise. */}
              {r.listing?.thumbnail_url ? (
                // The hairline is what stops a photo with pale edges from
                // dissolving into the card behind it — inside a bordered
                // surface an unframed thumbnail loses its own shape.
                <Image
                  src={r.listing.thumbnail_url}
                  alt=""
                  width={48}
                  height={48}
                  className="h-12 w-12 shrink-0 rounded-lg object-cover ring-1 ring-black/[0.06]"
                />
              ) : r.official ? null : (
                <span className="h-12 w-12 shrink-0 rounded-lg bg-neutral-100" />
              )}
            </Link>
            </ConversationRow>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

/**
 * One sentence per event. The accepted offer gets the emerald because it is
 * the only notification that means money is about to move.
 */
function notifText(kind: Notif["kind"]): { verb: string; accent?: string } {
  switch (kind) {
    case "follow":
      return { verb: "a început să te urmărească" }
    case "offer_received":
      return { verb: "ți-a trimis o ofertă" }
    case "offer_accepted":
      return { verb: "ți-a acceptat oferta", accent: "text-emerald-600" }
    case "offer_declined":
      return { verb: "ți-a refuzat oferta" }
    case "message":
      return { verb: "ți-a trimis un mesaj" }
  }
}

function notifHref(n: Notif): string | null {
  if (n.kind === "follow") return n.actor?.username ? `/member/${n.actor.username}` : null
  if (n.conversationId) return `/messages/${n.conversationId}`
  return n.listing?.slug ? `/products/${n.listing.slug}` : null
}

/** "Astăzi" / "Săptămâna aceasta" / "Mai demult" — the three buckets people
 *  actually think in. Anything older than a month never arrives here; the API
 *  cuts it, because a follow from March is an archive rather than a notice. */
function bucketOf(iso: string): "today" | "week" | "older" {
  const age = Date.now() - Date.parse(iso)
  if (age < 24 * 60 * 60 * 1000) return "today"
  if (age < 7 * 24 * 60 * 60 * 1000) return "week"
  return "older"
}

const BUCKET_LABEL: Record<string, string> = {
  today: "Astăzi",
  week: "Săptămâna aceasta",
  older: "Mai demult",
}

function NotificationsList({
  items,
  onRead,
  onReadAll,
}: {
  items: Notif[] | null
  onRead: (id: string) => void
  onReadAll: () => void
}) {
  if (items === null) return <ListSkeleton />
  if (items.length === 0) {
    // Same bargain as the messages side: fill what is left of the screen, put
    // a floor under it for the layouts where a percentage height cannot
    // resolve, and never ask for more room than the viewport has.
    return (
      <div className="flex min-h-[40svh] flex-1 flex-col items-center justify-center px-6 py-10 text-center">
        <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-neutral-100 text-neutral-400">
          <Bell className="h-6 w-6" />
        </span>
        <p className="text-[15px] text-neutral-500">Nicio notificare încă.</p>
      </div>
    )
  }

  // Grouped, and the header is drawn only when the bucket changes — the same
  // shape a conversation's day dividers have, so the two lists behind one
  // switcher stay recognisably one design.
  let lastBucket: string | null = null

  return (
    <>
      {/* Shown only when there is something to mark. A permanently visible
          action over a list that is entirely read is a button that does
          nothing — and "Șterge tot", which this replaces, was worse than that:
          it did nothing while appearing to work. */}
      {items.some((n) => !n.readAt) && (
        <div className="flex justify-end px-2 pb-2">
          <button
            type="button"
            onClick={onReadAll}
            className="rounded-full px-2.5 py-1 text-[13px] font-semibold text-[#7c3aed] transition-colors active:bg-[#7c3aed]/10"
          >
            Marchează toate ca citite
          </button>
        </div>
      )}

      <ul className={cn(LIST_CARD, "mb-8 md:mb-10")}>
        {items.map((n) => {
        const name = n.actor?.display_name || n.actor?.username || "Cineva"
        const { verb, accent } = notifText(n.kind)
        const unread = !n.readAt
        const href = notifHref(n)
        const bucket = bucketOf(n.createdAt)
        const opensBucket = bucket !== lastBucket
        lastBucket = bucket
        const inner = (
          <>
            <Avatar name={name} url={n.actor?.avatar_url ?? null} seed={n.actor?.id} />
            <span className="min-w-0 flex-1">
              <span className={cn("block text-[14.5px] leading-snug text-neutral-900", unread ? "font-bold" : "font-normal")}>
                <span className="font-semibold">{name}</span> <span className={accent}>{verb}</span>
              </span>
              <span className="mt-0.5 flex items-center gap-1.5">
                <span className="text-[12px] text-neutral-400">{ago(n.createdAt)}</span>
                {unread && <span className="h-2 w-2 shrink-0 rounded-full bg-[#7c3aed]" />}
              </span>
            </span>
            {n.listing?.thumbnail_url && (
              <Image
                src={n.listing.thumbnail_url}
                alt=""
                width={48}
                height={48}
                className="h-12 w-12 shrink-0 rounded-lg object-cover ring-1 ring-black/[0.06]"
              />
            )}
          </>
        )
        // A READ NOTIFICATION IS NOT A FADED ONE.
        //
        // This dimmed the whole row to 72% once you had seen it, and that is the
        // fade in this list — the avatar, the name, the thumbnail and the time
        // all going grey together, which reads as the row being disabled or
        // half-loaded rather than as "you have seen this". It is also the one
        // thing neither Depop nor Vinted does: open either of their activity
        // feeds and a read row is at exactly the same strength as an unread one.
        //
        // Unread is marked by the two things that cost nothing to read at a
        // glance and nothing in legibility: a tinted background behind the row
        // and a bold first line. Read is the plain surface. Every pixel of
        // content stays at full strength in both, because a notification you
        // have already seen is still one you might be trying to find again.
        const rowClass = cn(ROW_INNER, unread ? "bg-[#7c3aed]/[0.06] active:bg-[#7c3aed]/[0.11]" : "active:bg-neutral-50")
        return (
          <Fragment key={n.id}>
            {opensBucket && (
              <li className="bg-neutral-50/70 px-3 py-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-neutral-400">
                {BUCKET_LABEL[bucket]}
              </li>
            )}
            {/* No swipe wrapper. There is nothing to delete — see readNotif
                above — and a row that slides open onto an action that cannot
                persist is an invitation to discover that it does not. Tapping
                marks it read on the way to wherever it points. */}
            <li className={ROW_DIVIDER}>
              {href ? (
                <Link href={href} className={rowClass} onClick={() => onRead(n.id)}>
                  {inner}
                </Link>
              ) : (
                <button type="button" className={cn(rowClass, "w-full text-left")} onClick={() => onRead(n.id)}>
                  {inner}
                </button>
              )}
            </li>
          </Fragment>
        )
      })}
      </ul>
    </>
  )
}

/**
 * The last resort, not the normal path.
 *
 * /messages is server-rendered now, so somebody opening the inbox never sees
 * this — loading.tsx covers the wait and the conversations are in the first
 * paint. It survives for the two cases that genuinely have nothing to draw yet:
 * the notifications feed on its first switch, and a server read that failed and
 * left the client to retry. Its geometry is the card's, to the pixel, so even
 * those swaps move nothing.
 */
function ListSkeleton() {
  return (
    <div className={cn(LIST_CARD, "mb-8 md:mb-10")}>
      {[0, 1, 2].map((i) => (
        <div key={i} className={cn(ROW_INNER, ROW_DIVIDER)}>
          <div className="h-12 w-12 animate-pulse rounded-full bg-neutral-100" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-36 animate-pulse rounded bg-neutral-100" />
            <div className="h-3 w-52 animate-pulse rounded bg-neutral-100" />
          </div>
          <div className="h-12 w-12 animate-pulse rounded-lg bg-neutral-100" />
        </div>
      ))}
    </div>
  )
}
