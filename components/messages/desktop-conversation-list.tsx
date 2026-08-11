"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { BadgeCheck, Bell, Bookmark, MessageSquare, Search } from "lucide-react"

import { useLocale } from "@/components/locale-provider"
import { InitialAvatar } from "@/components/ui/initial-avatar"
import { hiddenConversations } from "@/lib/messages/hidden-conversations"
import { useWideViewport } from "@/lib/use-wide-viewport"
import type { InboxConversation } from "@/lib/messages/list"
import {
  ago,
  bucketOf,
  BUCKET_LABEL,
  notifHref,
  notifText,
  type Notif,
} from "@/lib/messages/notification-view"
import { cn } from "@/lib/utils"

/**
 * The left column of the desktop inbox: every conversation, with the open one
 * marked.
 *
 * ---------------------------------------------------------------------------
 * Why this is not the phone's inbox in a narrower box
 * ---------------------------------------------------------------------------
 * On a phone the list and the conversation are two screens, so a row's job is
 * to be worth TAPPING — it gets a big avatar, a generous preview, and a swipe
 * gesture, because it is the whole screen and there is nothing else on it. In a
 * split view the row's job is different: it is one item in a column you scan
 * while reading something else, and the thing you are reading is the point. So
 * a row here is denser, it says which listing it is about (the thumbnail is the
 * ITEM, not the person — on a marketplace you remember "the black Nike jacket"
 * long before you remember who was selling it), and it carries the one piece of
 * state a seller acts on: whether the listing is still up.
 *
 * It also cannot swipe, because there is no finger. Deleting from here would be
 * a hover affordance duplicating the one already in the conversation's own
 * details sheet, so it is simply not offered twice.
 *
 * ---------------------------------------------------------------------------
 * Why it does its own refreshing
 * ---------------------------------------------------------------------------
 * Both this and the phone inbox are in the DOM on the messages routes, and CSS
 * decides which is drawn — see lib/use-wide-viewport.ts for why that split
 * exists. A hidden component still runs its effects, so each of them asks
 * whether it is the one on screen before making a single request. On a phone
 * this list renders from the rows the server already sent and then does
 * nothing at all.
 */

type Row = InboxConversation

/**
 * "14:32" today, "ieri", "11 iul." this year, "11.07.24" before that.
 *
 * The rule every inbox converges on, and for a good reason: within a day the
 * hour is what distinguishes two messages, and past a day it is meaningless —
 * nobody has ever needed to know that something arrived at 14:32 in March.
 */
function stamp(iso: string, locale: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const now = new Date()
  const loc = locale === "ro" ? "ro-RO" : "en-GB"
  const sameDay =
    d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  if (sameDay) return d.toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" })
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (
    d.getDate() === yesterday.getDate() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getFullYear() === yesterday.getFullYear()
  ) {
    return locale === "ro" ? "ieri" : "yesterday"
  }
  if (d.getFullYear() === now.getFullYear()) return d.toLocaleDateString(loc, { day: "numeric", month: "short" })
  return d.toLocaleDateString(loc, { day: "2-digit", month: "2-digit", year: "2-digit" })
}

export function DesktopConversationList({
  initialConversations,
  activeId = null,
  viewerId,
}: {
  initialConversations: Row[] | null
  /** The conversation open in the pane beside this, so its row can say so. */
  activeId?: string | null
  viewerId?: string | null
}) {
  const { formatPrice, language } = useLocale()
  const wide = useWideViewport()
  const [rows, setRows] = useState<Row[] | null>(initialConversations)
  const [query, setQuery] = useState("")
  const hidden = useMemo(() => hiddenConversations(viewerId), [viewerId])
  const activeRef = useRef<HTMLLIElement>(null)

  /**
   * MESSAGES AND NOTIFICATIONS, in the column that has room for both.
   *
   * On a phone these are two halves of one screen behind a segmented control,
   * and on a wide screen they were one half and nowhere: the desktop split view
   * had a conversation list and no way to reach the activity feed at all, so
   * every like, follow and accepted offer was a thing you could only see by
   * making the window narrow. The switch is the phone's, in the phone's shape,
   * because the two screens should not be teaching different controls.
   *
   * `notifs === null` means "not asked for yet". The feed is fetched on the
   * FIRST switch rather than on mount — most visits to a desktop inbox are
   * about replying to somebody, and a request for a list nobody has asked to
   * see is a request per page load.
   */
  const [tab, setTab] = useState<"messages" | "notifications">("messages")
  const [notifs, setNotifs] = useState<Notif[] | null>(null)
  const [notifUnread, setNotifUnread] = useState(0)

  // The rows the server sent are milliseconds old, so the clock starts as if
  // they had just been fetched rather than at zero — the same rule the phone
  // inbox keeps, so the two cannot disagree about what "stale" means.
  const lastLoadedAt = useRef(initialConversations !== null ? Date.now() : 0)

  useEffect(() => {
    // Not the view on screen. Rendering from the props it was born with costs
    // nothing; asking the server for rows nobody can see costs a request per
    // page and a socket that has no reader.
    if (!wide) return
    let alive = true
    const MIN_INTERVAL_MS = 20_000

    const load = () => {
      lastLoadedAt.current = Date.now()
      fetch("/api/messages", { credentials: "include" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (alive && d) setRows(d.conversations ?? [])
        })
        .catch(() => {})
    }
    const maybeLoad = () => {
      if (Date.now() - lastLoadedAt.current < MIN_INTERVAL_MS) return
      load()
    }

    maybeLoad()
    const onVisible = () => {
      if (document.visibilityState === "visible") maybeLoad()
    }
    // A desktop inbox is a window somebody leaves open, which is the one case
    // the phone's focus-and-visibility rules do not cover: nothing fires while
    // you sit reading a conversation for ten minutes. The interval is the floor
    // under that, not the mechanism — every other path still refreshes sooner.
    const tick = window.setInterval(maybeLoad, MIN_INTERVAL_MS)
    window.addEventListener("focus", maybeLoad)
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      alive = false
      window.clearInterval(tick)
      window.removeEventListener("focus", maybeLoad)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [wide])

  // The dot on the Notificări segment. One head count, on the screen that is
  // actually drawn — the phone's inbox is mounted at the same time and would
  // otherwise make the same request twice per page.
  useEffect(() => {
    if (!wide) return
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
  }, [wide])

  // The first switch fetches the feed, and seeing it IS reading it: the batch
  // is marked read server-side and the badge clears. The rows keep the unread
  // styling they arrived with, so this viewing still shows what was new and
  // only the next one renders them quiet — the same bargain the phone makes.
  useEffect(() => {
    if (!wide || tab !== "notifications" || notifs !== null) return
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
        // An empty feed and a failed read look the same from here, and that is
        // the right failure: "Nicio notificare" is recoverable by switching
        // away and back, an error state in a 340px column is not.
        if (alive) setNotifs([])
      })
    return () => {
      alive = false
    }
  }, [wide, tab, notifs])

  const readNotif = useCallback((id: string) => {
    let wasUnread = false
    setNotifs((prev) =>
      prev
        ? prev.map((n) => {
            if (n.id !== id || n.readAt) return n
            wasUnread = true
            return { ...n, readAt: new Date().toISOString() }
          })
        : prev,
    )
    if (!wasUnread) return
    setNotifUnread((u) => Math.max(0, u - 1))
    fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ action: "read", id }),
    }).catch(() => {
      /* the next load reconciles */
    })
  }, [])

  // Opening a conversation from somewhere else — a notification, a listing, a
  // reload straight onto its URL — can land on a thread whose row is fifty
  // deep. Scrolled into view it is where the eye already is; left where it was,
  // the column looks like it is showing an unrelated list.
  useEffect(() => {
    if (!activeId || !wide) return
    activeRef.current?.scrollIntoView({ block: "nearest" })
  }, [activeId, wide, rows])

  const visible = useMemo(() => {
    const base = (rows ?? []).filter((r) => {
      const at = hidden.get(r.id)
      // Removed here, and nothing said since. Same rule as the phone inbox, and
      // compared as numbers for the same reason — see lib/messages/list.ts.
      return at === undefined || Date.parse(r.lastMessageAt) > at
    })
    const q = query.trim().toLowerCase()
    if (!q) return base
    return base.filter((r) => {
      const who = `${r.other?.display_name ?? ""} ${r.other?.username ?? ""}`.toLowerCase()
      const what = (r.listing?.title ?? "").toLowerCase()
      return who.includes(q) || what.includes(q)
    })
  }, [rows, hidden, query])

  const previewOf = useCallback(
    (r: Row): string => {
      const m = r.lastMessage
      if (!m) return language === "ro" ? "Conversație nouă" : "New conversation"
      if (m.kind === "image") return m.body || "📷 Fotografie"
      if (m.kind === "offer") {
        const price = formatPrice(m.offer_cents ?? 0)
        const suffix =
          m.offer_status === "accepted"
            ? " · acceptată"
            : m.offer_status === "declined"
              ? " · refuzată"
              : ""
        return `Ofertă: ${price}${suffix}`
      }
      return m.body || ""
    },
    [formatPrice, language],
  )

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="shrink-0 border-b border-neutral-100 px-4 pb-3 pt-5">
        <h1 className="text-[19px] font-bold tracking-[-0.01em] text-neutral-900">
          {tab === "messages"
            ? language === "ro"
              ? "Mesaje"
              : "Messages"
            : language === "ro"
              ? "Notificări"
              : "Notifications"}
        </h1>

        {/* THE SWITCH.

            A track with one pill sliding across it, not two buttons that light
            up: the pill is a continuous thing that MOVES from where you were to
            where you are going, which is what makes the change read as one
            control rather than as the column being replaced. Transform only —
            no width, no left, nothing that costs a layout — so it stays on the
            compositor at whatever refresh rate the screen runs.

            The labels sit above the pill (z-10) and are never re-mounted, so
            the text does not fade or jump; only the surface underneath them
            travels. */}
        <div className="relative mt-3 flex h-9 rounded-full bg-neutral-100 p-[3px]">
          <span
            aria-hidden
            className="absolute inset-y-[3px] left-[3px] w-[calc(50%-3px)] rounded-full bg-white shadow-[0_1px_3px_rgba(15,15,15,0.10)] transition-transform duration-[420ms] ease-[cubic-bezier(0.32,0.72,0,1)] will-change-transform"
            style={{ transform: tab === "messages" ? "translateX(0%)" : "translateX(100%)" }}
          />
          {(
            [
              { key: "messages", ro: "Mesaje", en: "Messages" },
              { key: "notifications", ro: "Notificări", en: "Notifications" },
            ] as const
          ).map((s) => (
            <button
              key={s.key}
              type="button"
              aria-pressed={tab === s.key}
              onClick={() => setTab(s.key)}
              className={cn(
                "relative z-10 flex flex-1 items-center justify-center gap-1.5 rounded-full text-[13px] transition-colors duration-200",
                tab === s.key ? "font-semibold text-neutral-900" : "font-medium text-neutral-500",
              )}
            >
              {language === "ro" ? s.ro : s.en}
              {/* A dot, not a count. The number is a fact about a list you are
                  one click away from reading. */}
              {s.key === "notifications" && notifUnread > 0 && (
                <span className="h-[6px] w-[6px] rounded-full bg-[#7c3aed]" />
              )}
            </button>
          ))}
        </div>

        {/* A filter, not a search endpoint. With the whole list already in
            memory there is nothing to ask the server, and a column of forty
            conversations is exactly the length at which scanning stops working
            and typing three letters starts.

            Only over the conversations. A search box above a list it does not
            filter is a control that appears broken. */}
        {tab === "messages" && (
          <div className="relative mt-2.5">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={language === "ro" ? "Caută în mesaje" : "Search messages"}
              aria-label={language === "ro" ? "Caută în mesaje" : "Search messages"}
              className="h-9 w-full rounded-full border border-neutral-200 bg-neutral-50 pl-9 pr-3 text-[13.5px] text-neutral-900 outline-none transition-colors placeholder:text-neutral-400 focus:border-[#7c3aed]/40 focus:bg-white"
            />
          </div>
        )}
      </div>

      {/* Its own scroll area. The pane beside it has another, and neither may
          move the other — that is the whole of what a split view is for: the
          list stays where you left it while you read down a conversation. */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {tab === "notifications" ? (
          <DesktopNotifications items={notifs} onRead={readNotif} />
        ) : (
        <>
        {/* NULL IS NOT EMPTY, and this column had been treating it as both.
            `visible` starts from `rows ?? []`, so an inbox that has not answered
            yet — or one whose read failed, which the server now reports as a
            failure rather than as an empty list (see lib/messages/list.ts) —
            rendered "Nicio conversație încă" with complete confidence. The
            phone inbox has always drawn a skeleton for this case; the desktop
            column was written later and did not. */}
        {rows === null ? (
          <ul className="animate-pulse">
            {[0, 1, 2, 3, 4].map((i) => (
              <li key={i} className="flex items-center gap-3 px-4 py-3">
                <span className="h-10 w-10 shrink-0 rounded-full bg-neutral-100" />
                <span className="min-w-0 flex-1 space-y-2">
                  <span className="block h-3 w-28 rounded bg-neutral-100" />
                  <span className="block h-2.5 w-40 rounded bg-neutral-100" />
                </span>
              </li>
            ))}
          </ul>
        ) : visible.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-16 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100 text-neutral-400">
              <MessageSquare className="h-5 w-5" />
            </span>
            <p className="text-[13.5px] leading-relaxed text-neutral-500">
              {query
                ? language === "ro"
                  ? "Nicio conversație care să se potrivească."
                  : "No conversation matches that."
                : language === "ro"
                  ? "Nicio conversație încă."
                  : "No conversations yet."}
            </p>
          </div>
        ) : (
          <ul>
            {visible.map((r) => {
              const who = r.other?.display_name || r.other?.username || "Utilizator"
              const isActive = r.id === activeId
              const unread = r.unread > 0
              return (
                <li key={r.id} ref={isActive ? activeRef : undefined}>
                  <Link
                    href={`/messages/${r.id}`}
                    prefetch
                    aria-current={isActive ? "true" : undefined}
                    className={cn(
                      "relative flex gap-3 px-4 py-3 transition-colors",
                      // The selected row is a SURFACE, not a tint on the text.
                      // In a column you scan while reading something else, the
                      // one thing that has to be answerable without looking is
                      // "which of these am I in" — and a bar down the leading
                      // edge answers it from the corner of the eye, which is
                      // where this column lives while you are reading the pane.
                      isActive
                        ? "bg-[#7c3aed]/[0.07]"
                        : unread
                          ? "bg-[#7c3aed]/[0.035] hover:bg-neutral-50"
                          : "hover:bg-neutral-50",
                    )}
                  >
                    {isActive && (
                      <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] rounded-r-full bg-[#7c3aed]" />
                    )}

                    {/* THE ITEM, not the person. Every one of these
                        conversations is about something you are buying or
                        selling, and the photograph of it is how anybody
                        actually recognises which thread this is. The seller's
                        avatar rides on the corner of it, small, because their
                        name is already on the line beside it. */}
                    <span className="relative h-12 w-12 shrink-0">
                      {r.listing?.thumbnail_url ? (
                        <Image
                          src={r.listing.thumbnail_url}
                          alt=""
                          width={48}
                          height={48}
                          quality={68}
                          className="h-12 w-12 rounded-xl object-cover"
                        />
                      ) : (
                        /* NO LISTING MEANS THE PERSON, NOT THEIR INITIAL.

                           This fell straight from "no item photograph" to a grey
                           letter, skipping the avatar entirely — so the Storelib
                           thread, which is about no listing at all, showed a
                           grey "S" while the same account wore its mark on the
                           screen that row opens. The letter is the third answer
                           here, not the second, and InitialAvatar already knows
                           the order: photograph, then coloured initial, then a
                           person glyph. */
                        <InitialAvatar
                          name={who}
                          url={r.other?.avatar_url}
                          seed={r.other?.id}
                          size={48}
                          className="rounded-xl"
                        />
                      )}
                      {r.listing?.thumbnail_url && (
                        <span className="absolute -bottom-0.5 -right-0.5 overflow-hidden rounded-full ring-2 ring-white">
                          {/* Nineteen pixels, and this was pulling the seller's
                              full-resolution upload for each one — twenty rows
                              of camera photograph to fill a corner badge. */}
                          <InitialAvatar
                            name={who}
                            url={r.other?.avatar_url}
                            seed={r.other?.id}
                            size={19}
                          />
                        </span>
                      )}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        <span className="flex min-w-0 flex-1 items-center gap-1">
                          <span
                            className={cn(
                              "min-w-0 truncate text-[13.5px] leading-tight",
                              unread ? "font-bold text-neutral-900" : "font-semibold text-neutral-800",
                            )}
                          >
                            {who}
                          </span>
                          {/* The same mark the conversation itself carries, and
                              the same one the phone's inbox has always drawn. A
                              list that leaves it off is quietly disagreeing with
                              the screen it opens — and this is the one account
                              somebody impersonating it would want that
                              disagreement for. */}
                          {r.official && (
                            <BadgeCheck className="h-[15px] w-[15px] shrink-0 text-[#1d9bf0]" />
                          )}
                        </span>
                        <span
                          className={cn(
                            "shrink-0 text-[11px] tabular-nums",
                            unread ? "font-semibold text-[#7c3aed]" : "text-neutral-400",
                          )}
                        >
                          {stamp(r.lastMessageAt, language)}
                        </span>
                      </span>

                      {r.listing && (
                        <span className="mt-0.5 flex items-baseline gap-1.5">
                          <span className="min-w-0 flex-1 truncate text-[12px] leading-tight text-neutral-500">
                            {r.listing.title}
                          </span>
                          <span className="shrink-0 text-[12px] font-semibold tabular-nums text-neutral-700">
                            {formatPrice(r.listing.price_cents)}
                          </span>
                        </span>
                      )}

                      <span className="mt-1 flex items-center gap-1.5">
                        <span
                          className={cn(
                            "min-w-0 flex-1 truncate text-[12.5px] leading-tight",
                            unread ? "font-medium text-neutral-700" : "text-neutral-400",
                          )}
                        >
                          {previewOf(r)}
                        </span>
                        {/* A dot, for the same reason the tab bar carries one:
                            the number is a fact about a list, and you are
                            looking at the list. */}
                        {unread && <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-[#7c3aed]" />}
                      </span>

                      {/* The one piece of state a marketplace inbox has to
                          show, because it changes what the conversation is
                          for: an item that is no longer up cannot be bought,
                          and every message under it is about a sale that is
                          not going to happen. Neutral, not alarming — a sold
                          item is a success, and a withdrawn one is nobody's
                          fault. */}
                      {r.listing && r.listing.status && r.listing.status !== "published" && (
                        <span className="mt-1.5 inline-flex items-center rounded-md bg-neutral-100 px-1.5 py-[3px] text-[9.5px] font-bold uppercase tracking-[0.05em] text-neutral-500">
                          {language === "ro" ? "Inactiv" : "Inactive"}
                        </span>
                      )}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
        </>
        )}
      </div>
    </div>
  )
}

/**
 * The activity feed, in a 340px column.
 *
 * Deliberately NOT the phone's list at a different width. That one is a card of
 * 76px rows built for a thumb: a 48px avatar, the listing photograph on the
 * right, generous air. Here the column sits beside an open conversation and is
 * scanned rather than tapped, so it is a 36px avatar, one line of sentence and
 * a time — the same information at the density everything else in this column
 * uses. The MEANING is shared (lib/messages/notification-view.ts); only the
 * geometry is local.
 *
 * Grouped by day bucket with the header drawn only when the bucket changes,
 * which is the shape a conversation's day dividers have — so the two lists
 * behind one switch stay recognisably one design.
 */
function DesktopNotifications({
  items,
  onRead,
}: {
  items: Notif[] | null
  onRead: (id: string) => void
}) {
  const { language } = useLocale()

  if (items === null) {
    return (
      <ul className="animate-pulse">
        {[0, 1, 2, 3, 4].map((i) => (
          <li key={i} className="flex items-center gap-3 px-4 py-3">
            <span className="h-9 w-9 shrink-0 rounded-full bg-neutral-100" />
            <span className="min-w-0 flex-1 space-y-2">
              <span className="block h-3 w-32 rounded bg-neutral-100" />
              <span className="block h-2.5 w-20 rounded bg-neutral-100" />
            </span>
          </li>
        ))}
      </ul>
    )
  }

  if (items.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-16 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100 text-neutral-400">
          <Bell className="h-5 w-5" />
        </span>
        <p className="text-[13.5px] leading-relaxed text-neutral-500">
          {language === "ro" ? "Nicio notificare încă." : "No notifications yet."}
        </p>
      </div>
    )
  }

  let lastBucket: string | null = null

  return (
    <ul>
      {items.map((n) => {
        const name = n.actor?.display_name || n.actor?.username || "Storelib"
        const { verb, accent } = notifText(n.kind)
        const unread = !n.readAt
        const href = notifHref(n)
        const bucket = bucketOf(n.createdAt)
        const opensBucket = bucket !== lastBucket
        lastBucket = bucket

        const inner = (
          <>
            <InitialAvatar name={name} url={n.actor?.avatar_url} seed={n.actor?.id} size={36} />
            <span className="min-w-0 flex-1">
              <span
                className={cn(
                  "block text-[13px] leading-snug text-neutral-900",
                  unread ? "font-medium" : "font-normal",
                )}
              >
                <span className="font-semibold">{name}</span> <span className={accent}>{verb}</span>
              </span>
              <span className="mt-0.5 block text-[11.5px] text-neutral-400">{ago(n.createdAt)}</span>
            </span>
            {n.listing?.thumbnail_url && (
              <Image
                src={n.listing.thumbnail_url}
                alt=""
                width={36}
                height={36}
                quality={68}
                className="h-9 w-9 shrink-0 rounded-lg object-cover ring-1 ring-black/[0.06]"
              />
            )}
            {unread && <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-[#7c3aed]" />}
          </>
        )

        const rowClass = cn(
          "flex items-center gap-3 px-4 py-3 text-left transition-colors",
          unread ? "bg-[#7c3aed]/[0.045] hover:bg-[#7c3aed]/[0.075]" : "hover:bg-neutral-50",
        )

        return (
          <li key={n.id}>
            {opensBucket && (
              <p className="bg-neutral-50/70 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                {BUCKET_LABEL[bucket]}
              </p>
            )}
            {href ? (
              <Link href={href} prefetch={false} className={rowClass} onClick={() => onRead(n.id)}>
                {inner}
              </Link>
            ) : (
              <button type="button" className={cn(rowClass, "w-full")} onClick={() => onRead(n.id)}>
                {inner}
              </button>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/** The pane before you have picked anything. */
export function NoConversationSelected() {
  const { language } = useLocale()
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-neutral-100 text-neutral-400">
        <Bookmark className="h-7 w-7" />
      </span>
      <p className="text-[17px] font-semibold text-neutral-900">
        {language === "ro" ? "Alege o conversație" : "Pick a conversation"}
      </p>
      <p className="max-w-[300px] text-[14px] leading-relaxed text-neutral-500">
        {language === "ro"
          ? "Conversațiile tale cu cumpărători și vânzători apar în stânga. Alege una ca să o citești aici."
          : "Your conversations appear on the left. Pick one to read it here."}
      </p>
    </div>
  )
}
