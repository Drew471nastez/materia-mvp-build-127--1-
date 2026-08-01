"use client"

import { useCallback, useEffect, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { BadgeCheck, Bell, MessageCircle } from "lucide-react"
import { useLocale } from "@/components/locale-provider"
import { triggerHaptic } from "@/lib/native-bridge"
import { cn } from "@/lib/utils"

type Row = {
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
    kind: "text" | "offer"
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
 * The inbox: conversations and notifications behind one segmented control.
 * Messages keep their three states — signed out, empty, rows — and the
 * notifications side loads lazily on the first switch, because most visits
 * here are about replying, not about the feed of who followed whom.
 */
export function MessagesInbox() {
  const { formatPrice } = useLocale()
  const [tab, setTab] = useState<"messages" | "notifications">("messages")
  // Nothing animates on the first paint — a list that fades in on arrival reads
  // as a slow page, not as a transition. The flag flips on the first switch and
  // stays flipped, so only the swaps a person actually asked for are animated.
  const [switched, setSwitched] = useState(false)
  const [rows, setRows] = useState<Row[] | null>(null)
  const [signedOut, setSignedOut] = useState(false)
  const [notifs, setNotifs] = useState<Notif[] | null>(null)
  const [notifUnread, setNotifUnread] = useState(0)

  useEffect(() => {
    let alive = true
    // Coming back to the tab is the moment new replies are most likely waiting,
    // but focus fires far more often than replies arrive — every alt-tab, every
    // dismissed dialog. The same thirty-second freshness window the bottom nav
    // keeps applies here, so a burst of focus events costs one fetch rather than
    // one each.
    let lastLoadedAt = 0
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

    load()
    const onFocus = () => {
      if (Date.now() - lastLoadedAt < MIN_INTERVAL_MS) return
      load()
    }
    window.addEventListener("focus", onFocus)
    return () => {
      alive = false
      window.removeEventListener("focus", onFocus)
    }
  }, [])

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

  if (signedOut) {
    return (
      <Empty
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
    <div className="mx-auto flex min-h-full max-w-2xl flex-col px-2">
      <h1 className="px-2 pb-1 pt-4 text-[21px] font-bold text-neutral-900">
        {tab === "messages" ? "Mesaje" : "Notificări"}
      </h1>
      <div className="px-2 pb-2 pt-1">
        {/* One pill that slides, rather than two that blink. It is absolutely
            positioned and moved on a transform, so the browser composites it
            instead of relaying out the control on every frame — and the
            buttons above it keep their exact geometry. */}
        <div className="relative flex h-10 items-center rounded-full bg-neutral-100 p-1">
          <span
            aria-hidden
            className="absolute left-1 top-1 h-8 w-[calc(50%-4px)] rounded-full bg-white shadow-sm transition-transform duration-[280ms] ease-[cubic-bezier(0.32,0.72,0,1)] will-change-transform motion-reduce:transition-none"
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
                "relative z-10 flex h-8 flex-1 items-center justify-center rounded-full text-[14px] font-semibold transition-colors duration-200",
                tab === s.key ? "text-neutral-900" : "text-neutral-500",
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

      {/* Remounted per tab so the incoming list fades up instead of appearing
          mid-slide. Opacity only, and the box it happens in is the same flex
          child either way, so nothing under it moves. */}
      <div
        key={tab}
        className={cn(
          "flex min-h-0 flex-1 flex-col",
          switched && "animate-[fade-in_180ms_ease-out_both] motion-reduce:animate-none",
        )}
      >
        {tab === "messages" ? (
          <MessagesList rows={rows} formatPrice={formatPrice} />
        ) : (
          <NotificationsList items={notifs} />
        )}
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
      <Empty
        className="min-h-[40svh] flex-1"
        title="Niciun mesaj încă"
        body="Scrie-i unui vânzător sau fă o ofertă la un articol — conversația apare aici."
        cta={{ href: "/", label: "Descoperă anunțuri" }}
      />
    )
  }

  return (
    <ul className="divide-y divide-neutral-100 pb-8 md:pb-10">
      {rows.map((r) => {
        const name = r.other?.display_name || r.other?.username || "Utilizator"
        const preview =
          r.lastMessage?.kind === "offer"
            ? `Ofertă: ${formatPrice(r.lastMessage.offer_cents ?? 0)}${
                r.lastMessage.offer_status === "accepted"
                  ? " · acceptată"
                  : r.lastMessage.offer_status === "declined"
                    ? " · refuzată"
                    : ""
              }`
            : r.lastMessage?.body || ""
        return (
          <li key={r.id}>
            <Link href={`/messages/${r.id}`} className="flex items-center gap-3 rounded-xl px-2 py-3.5 transition-colors active:bg-neutral-50">
              <Avatar name={name} url={r.other?.avatar_url ?? null} />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1">
                    <span className={cn("truncate text-[15px] text-neutral-900", r.unread > 0 ? "font-bold" : "font-semibold")}>
                      {name}
                    </span>
                    {r.official && <BadgeCheck className="h-4 w-4 shrink-0 text-[#1d9bf0]" />}
                  </span>
                  <span className="shrink-0 text-[12px] text-neutral-400">{ago(r.lastMessageAt)}</span>
                </span>
                <span className="mt-0.5 flex items-center gap-2">
                  <span className={cn("truncate text-[13.5px]", r.unread > 0 ? "font-medium text-neutral-800" : "text-neutral-500")}>
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
                <Image
                  src={r.listing.thumbnail_url}
                  alt=""
                  width={48}
                  height={48}
                  className="h-12 w-12 shrink-0 rounded-lg object-cover"
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
    <ul className="divide-y divide-neutral-100 pb-8 md:pb-10">
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
                className="h-12 w-12 shrink-0 rounded-lg object-cover"
              />
            )}
          </>
        )
        const rowClass = "flex items-center gap-3 rounded-xl px-2 py-3.5 transition-colors active:bg-neutral-50"
        return (
          <li key={n.id}>
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

function ListSkeleton() {
  return (
    <div className="px-2 pb-8 pt-1 md:pb-10">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-3 py-3.5">
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

/**
 * The empty state, sized by its caller.
 *
 * It used to be a flat `min-h-[60svh]` wherever it appeared, and inside the
 * inbox that was the bug: 60svh plus the heading, the segmented control, the
 * page's own bottom padding and the strip the mobile nav already reserves came
 * to more than one screen, so a page with nothing on it still scrolled — over
 * nothing, which is exactly the feeling being fixed. In the inbox it now takes
 * `flex-1` and fills whatever is actually left; standing alone under <main> it
 * still asks for a fixed slice, because there is no column above it to measure
 * against. The svh floors are what keep it centred rather than clinging to the
 * top in the layouts where a percentage height cannot resolve.
 */
function Empty({
  title,
  body,
  cta,
  className,
}: {
  title: string
  body: string
  cta: { href: string; label: string }
  className?: string
}) {
  return (
    <div
      className={cn(
        "mx-auto flex w-full max-w-xl flex-col items-center justify-center px-6 py-10 text-center",
        className,
      )}
    >
      <span className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-neutral-100 text-neutral-400">
        <MessageCircle className="h-7 w-7" />
      </span>
      <h1 className="text-xl font-semibold text-neutral-900">{title}</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-neutral-500">{body}</p>
      <Link
        href={cta.href}
        className="mt-7 inline-flex h-11 items-center justify-center rounded-full bg-[#7c3aed] px-6 text-[15px] font-semibold text-white transition-transform active:scale-[0.97]"
      >
        {cta.label}
      </Link>
    </div>
  )
}
