"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { Bookmark, MessageSquare, Search } from "lucide-react"

import { useLocale } from "@/components/locale-provider"
import { hiddenConversations } from "@/lib/messages/hidden-conversations"
import { useWideViewport } from "@/lib/use-wide-viewport"
import type { InboxConversation } from "@/lib/messages/list"
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

function initials(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "?"
}

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
          {language === "ro" ? "Mesaje" : "Messages"}
        </h1>
        {/* A filter, not a search endpoint. With the whole list already in
            memory there is nothing to ask the server, and a column of forty
            conversations is exactly the length at which scanning stops working
            and typing three letters starts. */}
        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={language === "ro" ? "Caută în mesaje" : "Search messages"}
            aria-label={language === "ro" ? "Caută în mesaje" : "Search messages"}
            className="h-9 w-full rounded-full border border-neutral-200 bg-neutral-50 pl-9 pr-3 text-[13.5px] text-neutral-900 outline-none transition-colors placeholder:text-neutral-400 focus:border-[#7c3aed]/40 focus:bg-white"
          />
        </div>
      </div>

      {/* Its own scroll area. The pane beside it has another, and neither may
          move the other — that is the whole of what a split view is for: the
          list stays where you left it while you read down a conversation. */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {visible.length === 0 ? (
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
                          className="h-12 w-12 rounded-xl object-cover"
                        />
                      ) : (
                        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-neutral-100 text-[15px] font-semibold text-neutral-400">
                          {initials(who)}
                        </span>
                      )}
                      {r.listing?.thumbnail_url && (
                        <span className="absolute -bottom-0.5 -right-0.5 flex h-[19px] w-[19px] items-center justify-center overflow-hidden rounded-full bg-neutral-200 text-[9px] font-bold text-neutral-600 ring-2 ring-white">
                          {r.other?.avatar_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={r.other.avatar_url} alt="" className="h-full w-full object-cover" />
                          ) : (
                            initials(who)
                          )}
                        </span>
                      )}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        <span
                          className={cn(
                            "min-w-0 flex-1 truncate text-[13.5px] leading-tight",
                            unread ? "font-bold text-neutral-900" : "font-semibold text-neutral-800",
                          )}
                        >
                          {who}
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
      </div>
    </div>
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
