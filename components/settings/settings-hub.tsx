"use client"

import { useCallback, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  Heart,
  Loader2,
  LogOut,
  MessageCircle,
  Package,
  Pencil,
  ShoppingBag,
  Star,
  Tag,
} from "lucide-react"

import { createClient } from "@/lib/supabase/client"
import { triggerHaptic } from "@/lib/native-bridge"
import { cn } from "@/lib/utils"

/**
 * ===========================================================================
 *  SETTINGS, AS A HUB
 * ===========================================================================
 *
 * /settings used to mount the seller dashboard's 1,700-line account form and
 * everything it dragged in, and it crashed client-side for anyone whose data
 * did not fit its assumptions — which is why the page greeted people with
 * "Application error" instead of their own account.
 *
 * A settings screen on a marketplace is a TABLE OF CONTENTS, the way every app
 * in this category draws it: who you are at the top, then grouped rows that
 * each go somewhere that already exists. Nothing here edits in place, so
 * nothing here can crash on somebody's data — the destinations do the work.
 */

type Row = {
  icon: React.ReactNode
  label: string
  hint?: string
  href: string
}

const SELLING: Row[] = [
  { icon: <Tag className="h-[19px] w-[19px]" />, label: "Anunțurile mele", hint: "Active și arhivate", href: "/profile" },
  { icon: <FileText className="h-[19px] w-[19px]" />, label: "Ciorne", hint: "Nepublicate încă", href: "/products/drafts" },
  { icon: <Package className="h-[19px] w-[19px]" />, label: "Vânzări", hint: "Comenzi și expediere", href: "/sales" },
]

const BUYING: Row[] = [
  { icon: <ShoppingBag className="h-[19px] w-[19px]" />, label: "Achiziții", hint: "Ce ai cumpărat", href: "/purchases" },
  { icon: <Heart className="h-[19px] w-[19px]" />, label: "Favorite", hint: "Articole salvate", href: "/wishlist" },
  { icon: <Star className="h-[19px] w-[19px]" />, label: "Evaluări", hint: "Ce spun cumpărătorii", href: "/profile" },
]

const ACCOUNT: Row[] = [
  { icon: <MessageCircle className="h-[19px] w-[19px]" />, label: "Mesaje", hint: "Conversații și oferte", href: "/messages" },
]

export function SettingsHub({
  displayName,
  username,
  avatarUrl,
  email,
}: {
  displayName: string | null
  username: string | null
  avatarUrl: string | null
  email: string | null
}) {
  const router = useRouter()
  const [signingOut, setSigningOut] = useState(false)

  const signOut = useCallback(async () => {
    if (signingOut) return
    void triggerHaptic("light")
    setSigningOut(true)
    try {
      await createClient().auth.signOut({ scope: "local" })
    } catch {
      /* the redirect below still leaves the signed-out UI */
    }
    // A full document load on purpose: half the header state lives in server
    // components, and a client-side push would keep painting the signed-in
    // chrome around a signed-out session.
    window.location.assign("/")
  }, [signingOut])

  const name = displayName || username || "Contul tău"

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-16 pt-2">
      <div className="flex h-14 items-center">
        <button
          type="button"
          onClick={() => {
            void triggerHaptic("light")
            if (window.history.length > 1) router.back()
            else router.push("/profile")
          }}
          aria-label="Înapoi"
          className="-ml-2 flex h-11 w-11 items-center justify-center rounded-full text-neutral-900 transition-colors duration-150 active:bg-neutral-100"
        >
          <ChevronLeft className="h-[24px] w-[24px]" strokeWidth={2.3} />
        </button>
        <h1 className="text-[20px] font-bold tracking-[-0.02em] text-neutral-900">Setări</h1>
      </div>

      {/* Who you are, and the one edit that lives here. */}
      <Link
        href="/profile/edit"
        className="mt-2 flex items-center gap-3.5 rounded-2xl border border-neutral-200/70 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-colors duration-150 active:bg-neutral-50"
      >
        <span className="h-14 w-14 shrink-0 overflow-hidden rounded-full bg-neutral-100">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-[20px] font-semibold text-neutral-400">
              {name.charAt(0).toUpperCase()}
            </span>
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[16.5px] font-semibold tracking-[-0.01em] text-neutral-900">{name}</span>
          <span className="mt-0.5 block truncate text-[13.5px] font-medium text-neutral-500">
            {username ? `@${username}` : email}
          </span>
          <span className="mt-1 flex items-center gap-1 text-[13px] font-semibold text-[#7c3aed]">
            <Pencil className="h-3.5 w-3.5" />
            Editează profilul
          </span>
        </span>
        <ChevronRight className="h-[18px] w-[18px] shrink-0 text-neutral-300" strokeWidth={2.4} />
      </Link>

      <Group title="Vânzare" rows={SELLING} />
      <Group title="Cumpărături" rows={BUYING} />
      <Group title="Cont" rows={ACCOUNT} />

      {/* Leaving is its own block, at the end, in its own colour — not a row in
          a group where a thumb aiming at Mesaje can land on it. */}
      <button
        type="button"
        onClick={() => void signOut({ scope: "local" })}
        disabled={signingOut}
        className="mt-6 flex h-[52px] w-full items-center justify-center gap-2.5 rounded-2xl border border-neutral-200/70 bg-white text-[15.5px] font-semibold text-rose-600 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-colors duration-150 active:bg-rose-50 disabled:opacity-60"
      >
        {signingOut ? <Loader2 className="h-[18px] w-[18px] animate-spin" /> : <LogOut className="h-[18px] w-[18px]" />}
        Deconectare
      </button>

      {email && (
        <p className="mt-4 text-center text-[12.5px] font-medium text-neutral-400">Conectat ca {email}</p>
      )}
    </div>
  )
}

function Group({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <section className="mt-6">
      <h2 className="px-1 text-[13px] font-semibold uppercase tracking-[0.05em] text-neutral-400">{title}</h2>
      <div className="mt-2 overflow-hidden rounded-2xl border border-neutral-200/70 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        {rows.map((row, i) => (
          <Link
            key={row.label}
            href={row.href}
            className={cn(
              "relative flex min-h-[56px] items-center gap-3.5 px-4 py-3 transition-colors duration-150 active:bg-neutral-100",
            )}
          >
            <span className="shrink-0 text-neutral-400">{row.icon}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15.5px] font-medium text-neutral-900">{row.label}</span>
              {row.hint && <span className="mt-0.5 block truncate text-[12.5px] font-medium text-neutral-400">{row.hint}</span>}
            </span>
            <ChevronRight className="h-[18px] w-[18px] shrink-0 text-neutral-300" strokeWidth={2.4} />
            {i < rows.length - 1 && (
              <span aria-hidden className="absolute bottom-0 left-[52px] right-0 h-px bg-neutral-100" />
            )}
          </Link>
        ))}
      </div>
    </section>
  )
}
