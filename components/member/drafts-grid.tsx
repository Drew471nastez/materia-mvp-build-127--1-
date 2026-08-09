"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { FileText, Plus, Trash2 } from "lucide-react"

import { useLocale } from "@/components/locale-provider"
import { triggerHaptic } from "@/lib/native-bridge"
import { cn } from "@/lib/utils"

/**
 * The "Ciorne" tab: drafts drawn the way the listings are drawn.
 *
 * They were rows — thumbnail, title, price, a bin — in a grid page where
 * everything else is cards. A draft IS a listing that is not finished, so it
 * wears the same clothes: same two-across grid, same cover-first card, and the
 * one thing that distinguishes it said once, in a corner badge, instead of by
 * being a different species of list.
 *
 * Tapping a card opens the sell form filled in from that draft — same as the
 * standalone drafts page. The bin asks before it acts, in place on the card,
 * because a draft has no undo.
 */

type Draft = {
  id: string
  title: string | null
  slug: string
  price_cents: number | null
  thumbnail_url: string | null
  created_at: string
}

export function DraftsGrid() {
  const { formatPrice } = useLocale()
  const router = useRouter()
  const [drafts, setDrafts] = useState<Draft[] | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    fetch("/api/listings/drafts", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { drafts: [] }))
      .then((d) => {
        if (alive) setDrafts(Array.isArray(d?.drafts) ? d.drafts : [])
      })
      .catch(() => {
        if (alive) setDrafts([])
      })
    return () => {
      alive = false
    }
  }, [])

  const open = useCallback(
    (id: string) => {
      void triggerHaptic("light")
      router.push(`/products/new?draft=${encodeURIComponent(id)}`)
    },
    [router],
  )

  const remove = useCallback(async (id: string) => {
    setDeleting(id)
    try {
      const res = await fetch(`/api/listings/drafts/${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "include",
      })
      if (!res.ok) return
      void triggerHaptic("light")
      // The row goes when the server confirms, not before.
      setDrafts((list) => (list ?? []).filter((d) => d.id !== id))
      setConfirming(null)
    } catch {
      /* the card stays; nothing was lost */
    } finally {
      setDeleting(null)
    }
  }, [])

  if (drafts === null) {
    return (
      <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-6 pb-10 md:grid-cols-3 md:gap-x-5 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="animate-pulse">
            <div className="aspect-[4/5] rounded-xl bg-neutral-100" />
            <div className="mt-2 h-3 w-2/3 rounded bg-neutral-100" />
            <div className="mt-1.5 h-3 w-1/3 rounded bg-neutral-100" />
          </div>
        ))}
      </div>
    )
  }

  if (drafts.length === 0) {
    return (
      <div className="flex flex-col items-center px-6 py-14 text-center">
        <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-neutral-100 text-neutral-400">
          <FileText className="h-6 w-6" />
        </span>
        <p className="text-[16px] font-semibold text-neutral-900">Nicio ciornă</p>
        <p className="mt-1.5 max-w-[280px] text-[14px] font-medium leading-relaxed text-neutral-500">
          Anunțurile începute, dar nepublicate încă, apar aici.
        </p>
        <Link
          href="/products/new"
          className="mt-6 inline-flex h-11 items-center gap-1.5 rounded-full bg-[#7c3aed] px-6 text-[15px] font-semibold text-white transition-transform active:scale-[0.97]"
        >
          <Plus className="h-4 w-4" strokeWidth={3} />
          Începe un anunț
        </Link>
      </div>
    )
  }

  return (
    <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-6 pb-10 md:grid-cols-3 md:gap-x-5 md:gap-y-8 lg:grid-cols-4">
      {drafts.map((d) => (
        <div key={d.id} className="relative">
          <button type="button" onClick={() => open(d.id)} className="block w-full text-left">
            <span className="block aspect-[4/5] overflow-hidden rounded-xl bg-neutral-100">
              {d.thumbnail_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={d.thumbnail_url} alt="" className="h-full w-full object-cover" loading="lazy" />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-neutral-300">
                  <FileText className="h-8 w-8" />
                </span>
              )}
            </span>
            <span className="mt-2 block truncate text-[14px] font-medium text-neutral-900">
              {d.title || "Fără titlu"}
            </span>
            <span className="mt-0.5 block text-[13.5px] font-semibold text-neutral-900">
              {d.price_cents ? formatPrice(d.price_cents) : "Fără preț"}
            </span>
          </button>

          <span className="pointer-events-none absolute left-2 top-2 rounded-full bg-neutral-900/85 px-2 py-[3px] text-[10.5px] font-bold uppercase tracking-[0.04em] text-white">
            Ciornă
          </span>

          {/* Two taps, and the second names its consequence by colour. The
              confirm replaces the bin IN PLACE, so the finger that armed it is
              already on top of the answer. */}
          <button
            type="button"
            disabled={deleting === d.id}
            onClick={() => {
              void triggerHaptic("light")
              if (confirming === d.id) void remove(d.id)
              else setConfirming(d.id)
            }}
            onBlur={() => setConfirming((c) => (c === d.id ? null : c))}
            aria-label={confirming === d.id ? "Confirmă ștergerea" : `Șterge ${d.title || "ciorna"}`}
            className={cn(
              "absolute right-2 top-2 flex h-9 items-center justify-center rounded-full text-white transition-all duration-150 active:scale-90 disabled:opacity-60",
              confirming === d.id ? "w-auto bg-rose-600 px-3 text-[12px] font-bold" : "w-9 bg-black/45",
            )}
          >
            {confirming === d.id ? "Șterg?" : <Trash2 className="h-[17px] w-[17px]" />}
          </button>
        </div>
      ))}
    </div>
  )
}
