"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { MessageCircle } from "lucide-react"
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
 * The conversations list. Three states — signed out, empty, and rows — and the
 * rows carry everything needed to pick a thread without opening it: who, which
 * item, the last line said, and how much of it is unanswered.
 */
export function MessagesInbox() {
  const { formatPrice } = useLocale()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [signedOut, setSignedOut] = useState(false)

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

  if (signedOut) {
    return (
      <Empty
        title="Conectează-te pentru mesaje"
        body="Conversațiile cu vânzătorii și cumpărătorii apar aici după ce te conectezi."
        cta={{ href: "/login?next=/messages", label: "Conectează-te" }}
      />
    )
  }
  if (rows === null) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-4">
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
    <div className="mx-auto max-w-2xl px-2 pb-24 md:pb-10">
      <h1 className="px-2 pb-1 pt-4 text-[21px] font-bold text-neutral-900">Mesaje</h1>
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
