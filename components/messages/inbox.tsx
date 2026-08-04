"use client"

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { BadgeCheck, Bell } from "lucide-react"
import { useLocale } from "@/components/locale-provider"
import { MessagesEmptyState } from "@/components/messages/empty-state"
import { IosSpinner } from "@/components/explore/ios-spinner"
import { useFeedPullRefresh } from "@/hooks/use-feed-pull-refresh"
import { consumeNavHint } from "@/lib/screen-transition"
import { triggerHaptic } from "@/lib/native-bridge"
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

function Avatar({ name, url }: { name: string; url: string | null }) {
  if (url) {
    return <Image src={url} alt="" width={48} height={48} className="h-12 w-12 shrink-0 rounded-full object-cover" />
  }
  return (
    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#7c3aed]/10 text-[17px] font-semibold text-[#7c3aed]">
      {(name || "?").slice(0, 1).toUpperCase()}
    </span>
  )
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
export function MessagesInbox({ initialConversations = null }: { initialConversations?: Row[] | null }) {
  const { formatPrice } = useLocale()
  const [tab, setTab] = useState<"messages" | "notifications">("messages")
  // Nothing animates on the first paint — a list that fades in on arrival reads
  // as a slow page, not as a transition. The flag flips on the first switch and
  // stays flipped, so only the swaps a person actually asked for are animated.
  const [switched, setSwitched] = useState(false)
  const [rows, setRows] = useState<Row[] | null>(initialConversations)
  const [signedOut, setSignedOut] = useState(false)
  const [notifs, setNotifs] = useState<Notif[] | null>(null)
  const [notifUnread, setNotifUnread] = useState(0)
  // Read once, at mount, and never again: a later render must not be able to
  // turn "the server already answered" into "fetch now".
  const [servedFromServer] = useState(() => initialConversations !== null)

  useEffect(() => {
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
    let lastLoadedAt = servedFromServer ? Date.now() : 0
    const MIN_INTERVAL_MS = 30_000

    const load = () => {
      lastLoadedAt = Date.now()
      return fetch("/api/messages", { credentials: "include" })
        .then((r) => {
          // Only an outright 401 means signed out. A 503 is the server failing
          // to read the session, and answering it with the signed-out inbox
          // would tell a signed-in person they had been logged out.
          if (r.status === 401) {
            if (alive) setSignedOut(true)
            return null
          }
          return r.ok ? r.json() : null
        })
        .then((data) => {
          if (alive && data) setRows(data.conversations ?? [])
        })
        .catch(() => {})
    }

    if (!servedFromServer) load()
    const onFocus = () => {
      if (Date.now() - lastLoadedAt < MIN_INTERVAL_MS) return
      load()
    }
    window.addEventListener("focus", onFocus)
    return () => {
      alive = false
      window.removeEventListener("focus", onFocus)
    }
  }, [servedFromServer])

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

  // Arriving back from a conversation, the inbox comes forward rather than
  // simply being there. Read once, from the hint the back button left on <html>,
  // so opening the tab fresh does not animate — only an actual return does. The
  // class is dropped on a timer rather than on animationend, because
  // `will-change: transform` asks the compositor to hold a layer and there is no
  // reason to hold one for the rest of the session.
  const [returning, setReturning] = useState(false)
  useLayoutEffect(() => {
    if (consumeNavHint() !== "back") return
    setReturning(true)
    const t = window.setTimeout(() => setReturning(false), 480)
    return () => window.clearTimeout(t)
  }, [])

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
      setSwitched(true)
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
        "mx-auto flex h-full max-w-2xl flex-col px-2 md:px-0 md:py-8",
        returning && "screen-return",
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
                <span className="absolute right-2 top-1/2 flex h-[16px] min-w-[16px] -translate-y-1/2 items-center justify-center rounded-full bg-red-500 px-[3px] text-[10px] font-bold leading-none text-white">
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
            <div
              key={tab}
              className={cn(
                "flex min-h-full flex-col",
                switched && "animate-[fade-in_180ms_ease-out_both] motion-reduce:animate-none",
              )}
            >
              {/* No entrance on the rows.
                  A staggered rise looked considered in isolation and reads, on a
                  screen you open twenty times a day, as the inbox arriving in
                  pieces — every row visibly moving into place before you can use
                  it. The list is simply there. */}
              {tab === "messages" ? (
                <MessagesList rows={rows} formatPrice={formatPrice} />
              ) : (
                <NotificationsList items={notifs} />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function MessagesList({ rows, formatPrice }: { rows: Row[] | null; formatPrice: (cents: number) => string }) {
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
            className={ROW_DIVIDER}
          >
            <Link
              href={`/messages/${r.id}`}
              // The thread route has a loading boundary now, so there is finally
              // a static shell for this to fetch: the tap paints a conversation
              // -shaped screen immediately instead of leaving you on the inbox
              // while the payload travels.
              prefetch
              onClick={() => void triggerHaptic("light")}
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
              <Avatar name={name} url={r.other?.avatar_url ?? null} />
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

function NotificationsList({ items }: { items: Notif[] | null }) {
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

  return (
    <ul className={cn(LIST_CARD, "mb-8 md:mb-10")}>
      {items.map((n) => {
        const name = n.actor?.display_name || n.actor?.username || "Cineva"
        const { verb, accent } = notifText(n.kind)
        const unread = !n.readAt
        const href = notifHref(n)
        const inner = (
          <>
            <Avatar name={name} url={n.actor?.avatar_url ?? null} />
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
        // Same surface rule as the inbox side, so the two lists behind one
        // switcher never read as two different screens.
        const rowClass = cn(
          ROW_INNER,
          unread ? "bg-[#7c3aed]/[0.05] active:bg-[#7c3aed]/[0.1]" : "active:bg-neutral-50",
        )
        return (
          <li
            key={n.id}
            className={ROW_DIVIDER}
          >
            {href ? (
              <Link href={href} className={rowClass}>
                {inner}
              </Link>
            ) : (
              <span className={rowClass}>{inner}</span>
            )}
          </li>
        )
      })}
    </ul>
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
