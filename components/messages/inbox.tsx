"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { Bell, MessageCircle } from "lucide-react"
import { useLocale } from "@/components/locale-provider"
import { cn } from "@/lib/utils"

type Row = {
  id: string
  lastMessageAt: string
  youAre: "buyer" | "seller"
  listing: { id: string; title: string; slug: string; thumbnail_url: string | null; price_cents: number } | null
  other: { id: string; display_name: string | null; username: string | null; avatar_url: string | null } | null
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
  const [rows, setRows] = useState<Row[] | null>(null)
  const [signedOut, setSignedOut] = useState(false)
  const [notifs, setNotifs] = useState<Notif[] | null>(null)
  const [notifUnread, setNotifUnread] = useState(0)

  useEffect(() => {
    let alive = true
    const load = () =>
      fetch("/api/messages", { credentials: "include" })
        .then((r) => {
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
    load()
    // Coming back to the tab is the moment new replies are most likely waiting.
    const onFocus = () => load()
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

  if (signedOut) {
    return (
      <Empty
        title="Conectează-te pentru mesaje"
        body="Conversațiile cu vânzătorii și cumpărătorii apar aici după ce te conectezi."
        cta={{ href: "/login?next=/messages", label: "Conectează-te" }}
      />
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-2 pb-24 md:pb-10">
      <h1 className="px-2 pb-1 pt-4 text-[21px] font-bold text-neutral-900">
        {tab === "messages" ? "Mesaje" : "Notificări"}
      </h1>
      <div className="px-2 pb-2 pt-1">
        <div className="flex h-10 items-center rounded-full bg-neutral-100 p-1">
          {(
            [
              { key: "messages", label: "Mesaje" },
              { key: "notifications", label: "Notificări" },
            ] as const
          ).map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setTab(s.key)}
              className={cn(
                "relative flex h-8 flex-1 items-center justify-center rounded-full text-[14px] font-semibold transition-colors",
                tab === s.key ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500",
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

      {tab === "messages" ? (
        <MessagesList rows={rows} formatPrice={formatPrice} />
      ) : (
        <NotificationsList items={notifs} />
      )}
    </div>
  )
}

function MessagesList({ rows, formatPrice }: { rows: Row[] | null; formatPrice: (cents: number) => string }) {
  if (rows === null) return <ListSkeleton />
  if (rows.length === 0) {
    return (
      <Empty
        title="Niciun mesaj încă"
        body="Scrie-i unui vânzător sau fă o ofertă la un articol — conversația apare aici."
        cta={{ href: "/", label: "Descoperă anunțuri" }}
      />
    )
  }

  return (
    <ul className="divide-y divide-neutral-100">
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
                  <span className={cn("truncate text-[15px] text-neutral-900", r.unread > 0 ? "font-bold" : "font-semibold")}>
                    {name}
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
              {r.listing?.thumbnail_url ? (
                <Image
                  src={r.listing.thumbnail_url}
                  alt=""
                  width={48}
                  height={48}
                  className="h-12 w-12 shrink-0 rounded-lg object-cover"
                />
              ) : (
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
    return (
      <div className="flex flex-col items-center px-6 py-20 text-center">
        <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-neutral-100 text-neutral-400">
          <Bell className="h-6 w-6" />
        </span>
        <p className="text-[15px] text-neutral-500">Nicio notificare încă.</p>
      </div>
    )
  }

  return (
    <ul className="divide-y divide-neutral-100">
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
    <div className="px-2 py-1">
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

function Empty({ title, body, cta }: { title: string; body: string; cta: { href: string; label: string } }) {
  return (
    <div className="mx-auto flex min-h-[60svh] max-w-xl flex-col items-center justify-center px-6 py-16 text-center">
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
